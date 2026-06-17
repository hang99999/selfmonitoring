import asyncio
import json
import logging
import time
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.access import has_ai_access, require_ai_access
from app.database import get_db, SessionLocal
from app.models import AudioRecord, MoodRecord, User, PlannedActivity, LifeDomain, RecordSubmission
from app.schemas import (
    ManualRecordCreateRequest,
    MoodRecordResponse,
    RecordSubmissionStatusResponse,
    RecordSubmitRequest,
    RecordConfirmRequest,
)
from app.llm_client import call_llm
from app.i18n import get_user_language, localized_text, output_language_rule
from app.prompts import safety_check_prompt, structured_extraction_prompt, empathic_feedback_prompt

router = APIRouter(prefix="/api/record", tags=["records"])
logger = logging.getLogger(__name__)

SUBMISSION_WAIT_SECONDS = 25.0
SUBMISSION_POLL_INTERVAL_SECONDS = 1.0


def _parse_json_response(text: str) -> dict:
    """Try to parse JSON from LLM response, handling markdown code blocks."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


def _get_recent_records_summary(db: Session, user_id: str, limit: int = 3) -> str:
    """Get a text summary of the user's most recent records (BA-focused)."""
    records = (
        db.query(MoodRecord)
        .filter(MoodRecord.user_id == user_id)
        .order_by(MoodRecord.timestamp.desc())
        .limit(limit)
        .all()
    )
    if not records:
        return "No recent records"

    summaries = []
    for r in records:
        ts = r.timestamp.strftime("%m-%d %H:%M") if r.timestamp else "unknown time"
        pleasure = f"{r.pleasure_score:.0f}" if r.pleasure_score is not None else "?"
        importance = f"{r.importance_score:.0f}" if r.importance_score is not None else "?"
        summaries.append(
            f"[{ts}] activity={r.activity or 'unknown'}, "
            f"pleasure={pleasure}/10, importance={importance}/10"
        )
    return "\n".join(summaries)


def _clamp_score(value: Optional[float], default: float = 5.0) -> float:
    try:
        return max(0.0, min(10.0, float(value)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _now() -> datetime:
    return datetime.now()


def _get_submission(
    db: Session,
    user_id: str,
    client_submission_id: str,
) -> Optional[RecordSubmission]:
    return db.query(RecordSubmission).filter(
        RecordSubmission.user_id == user_id,
        RecordSubmission.client_submission_id == client_submission_id,
    ).first()


def _get_record_by_id(db: Session, record_id: Optional[str]) -> Optional[MoodRecord]:
    if not record_id:
        return None
    return db.query(MoodRecord).filter(MoodRecord.id == record_id).first()


def _begin_submission(
    db: Session,
    user_id: str,
    client_submission_id: Optional[str],
) -> tuple[Optional[RecordSubmission], bool]:
    if not client_submission_id:
        return None, True

    existing = _get_submission(db, user_id, client_submission_id)
    if existing:
        if existing.status == "failed":
            existing.status = "processing"
            existing.record_id = None
            existing.error = None
            existing.updated_at = _now()
            db.commit()
            db.refresh(existing)
            return existing, True
        return existing, False

    submission = RecordSubmission(
        id=str(uuid.uuid4()),
        user_id=user_id,
        client_submission_id=client_submission_id,
        status="processing",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(submission)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _get_submission(db, user_id, client_submission_id)
        if existing:
            return existing, False
        raise
    db.refresh(submission)
    return submission, True


def _complete_submission(
    submission: Optional[RecordSubmission],
    record_id: str,
) -> None:
    if not submission:
        return
    submission.status = "succeeded"
    submission.record_id = record_id
    submission.error = None
    submission.updated_at = _now()


def _fail_submission(db: Session, submission: Optional[RecordSubmission], error: Exception) -> None:
    if not submission:
        return
    try:
        submission.status = "failed"
        submission.error = f"{type(error).__name__}: {str(error)}"[:1000]
        submission.updated_at = _now()
        db.commit()
    except Exception:
        db.rollback()


async def _wait_for_submission_record(
    db: Session,
    user_id: str,
    client_submission_id: str,
    wait_seconds: float = SUBMISSION_WAIT_SECONDS,
) -> MoodRecord:
    deadline = time.monotonic() + wait_seconds
    while time.monotonic() < deadline:
        db.expire_all()
        submission = _get_submission(db, user_id, client_submission_id)
        if submission and submission.record_id:
            record = _get_record_by_id(db, submission.record_id)
            if record:
                return record
        if submission and submission.status == "failed":
            raise HTTPException(
                status_code=409,
                detail={"code": "SUBMISSION_FAILED", "message": "Record submission failed"},
            )
        await asyncio.sleep(SUBMISSION_POLL_INTERVAL_SECONDS)

    raise HTTPException(
        status_code=409,
        detail={"code": "SUBMISSION_PROCESSING", "message": "Record submission is still processing"},
    )


def _get_audio_bound_record(
    db: Session,
    user_id: str,
    audio_record_id: Optional[str],
) -> Optional[MoodRecord]:
    if not audio_record_id:
        return None
    audio_rec = db.query(AudioRecord).filter(
        AudioRecord.id == audio_record_id,
        AudioRecord.user_id == user_id,
    ).first()
    if not audio_rec or not audio_rec.mood_record_id:
        return None
    return _get_record_by_id(db, audio_rec.mood_record_id)


def _log_submit(
    status: str,
    user_id: str,
    client_submission_id: Optional[str],
    audio_record_id: Optional[str],
    record_id: Optional[str],
    started_at: float,
) -> None:
    logger.info(
        "record_submit status=%s user_id=%s client_submission_id=%s audio_record_id=%s record_id=%s duration_ms=%d",
        status,
        user_id,
        client_submission_id,
        audio_record_id,
        record_id,
        int((time.monotonic() - started_at) * 1000),
    )


def _mark_planned_completed(
    db: Session,
    planned_activity_id: Optional[str],
    user_id: str,
    record_id: str,
) -> Optional[PlannedActivity]:
    if not planned_activity_id:
        return None
    planned = db.query(PlannedActivity).filter(
        PlannedActivity.id == planned_activity_id,
        PlannedActivity.user_id == user_id,
    ).first()
    if planned:
        planned.completed = True
        planned.completion_record_id = record_id
    return planned


async def _run_ai_background(
    record_id: str,
    text: str,
    user_id: str,
    activity: str,
    thought: str,
    pleasure_score: float,
    importance_score: float,
    language: str,
    run_safety_check: bool = False,
):
    """Background task: optionally re-run safety check, then generate empathic feedback."""
    db = SessionLocal()
    try:
        new_risk_level = None

        if run_safety_check:
            sys_prompt, user_msg = safety_check_prompt(text, db=db)
            safety_response = await call_llm(sys_prompt, user_msg)
            if not safety_response.startswith("[LLM Error]"):
                safety_data = _parse_json_response(safety_response)
                level = safety_data.get("risk_level", "safe")
                if level in ("safe", "mild", "high", "crisis"):
                    new_risk_level = level

        recent_summary = _get_recent_records_summary(db, user_id)
        sys_prompt, user_msg = empathic_feedback_prompt(
            raw_text=text,
            activity=activity,
            thought=thought,
            pleasure_score=pleasure_score,
            importance_score=importance_score,
            recent_records_summary=recent_summary,
            db=db,
        )
        sys_prompt += output_language_rule(language)
        feedback = await call_llm(sys_prompt, user_msg)

        record = db.query(MoodRecord).filter(MoodRecord.id == record_id).first()
        if record:
            if feedback and not feedback.startswith("[LLM Error]"):
                record.ai_immediate_feedback = feedback
            else:
                record.ai_immediate_feedback = localized_text("record_feedback_fallback", language)
            if new_risk_level is not None:
                record.risk_level = new_risk_level
            db.commit()
    except Exception:
        # Best-effort: write fallback so frontend polling can stop
        try:
            record = db.query(MoodRecord).filter(MoodRecord.id == record_id).first()
            if record and not record.ai_immediate_feedback:
                record.ai_immediate_feedback = localized_text("record_feedback_fallback", language)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/submit", response_model=MoodRecordResponse)
async def submit_record(
    req: RecordSubmitRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    app_language: str | None = Header(default=None, alias="X-App-Language"),
):
    started_at = time.monotonic()
    user_id = req.user_id
    require_ai_access(db, user_id)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id)
        db.add(user)
        db.commit()
    language = get_user_language(db, user_id, app_language)

    def _resolve_domain_id(domain_name: str) -> Optional[str]:
        if not domain_name or domain_name in ("其他", "Other"):
            return None
        domain = db.query(LifeDomain).filter(
            LifeDomain.user_id.is_(None),
            LifeDomain.name == domain_name,
        ).first()
        return domain.id if domain else None

    audio_bound_record = _get_audio_bound_record(db, user_id, req.audio_record_id)
    if audio_bound_record:
        _log_submit("idempotent_audio", user_id, req.client_submission_id, req.audio_record_id, audio_bound_record.id, started_at)
        return audio_bound_record

    submission, owns_submission = _begin_submission(db, user_id, req.client_submission_id)
    if not owns_submission and submission:
        existing_record = _get_record_by_id(db, submission.record_id)
        if existing_record:
            _log_submit("idempotent_submission", user_id, req.client_submission_id, req.audio_record_id, existing_record.id, started_at)
            return existing_record
        if submission.status == "processing" and req.client_submission_id:
            record = await _wait_for_submission_record(db, user_id, req.client_submission_id)
            _log_submit("idempotent_wait", user_id, req.client_submission_id, req.audio_record_id, record.id, started_at)
            return record

    try:
        if req.activity is not None:
            activity = req.activity
            pleasure_score = _clamp_score(req.pleasure_score)
            importance_score = _clamp_score(req.importance_score)

            life_domain_id = req.life_domain_id
            planned_for_quick: Optional[PlannedActivity] = None
            if req.planned_activity_id:
                planned_for_quick = db.query(PlannedActivity).filter(
                    PlannedActivity.id == req.planned_activity_id,
                    PlannedActivity.user_id == user_id,
                ).first()
                if planned_for_quick and planned_for_quick.life_domain_id:
                    life_domain_id = planned_for_quick.life_domain_id

            record = MoodRecord(
                id=str(uuid.uuid4()),
                user_id=user_id,
                timestamp=datetime.now(),
                raw_text=req.text,
                activity=activity,
                thought="",
                pleasure_score=pleasure_score,
                importance_score=importance_score,
                planned_activity_id=req.planned_activity_id,
                life_domain_id=life_domain_id,
                ai_immediate_feedback=None,
                risk_level="safe",
                confirmed=True,
            )
            db.add(record)

            if planned_for_quick:
                planned_for_quick.completed = True
                planned_for_quick.completion_record_id = record.id
            else:
                _mark_planned_completed(db, req.planned_activity_id, user_id, record.id)

            if req.audio_record_id:
                audio_rec = db.query(AudioRecord).filter(
                    AudioRecord.id == req.audio_record_id,
                    AudioRecord.user_id == user_id,
                ).first()
                if audio_rec and audio_rec.mood_record_id is None:
                    audio_rec.mood_record_id = record.id
                    record.raw_audio_path = audio_rec.file_path

            _complete_submission(submission, record.id)
            db.commit()
            db.refresh(record)

            background_tasks.add_task(
                _run_ai_background,
                record.id, req.text, user_id,
                activity, "", pleasure_score, importance_score,
                language,
                True,
            )
            _log_submit("created_quick", user_id, req.client_submission_id, req.audio_record_id, record.id, started_at)
            return record

        sys_prompt, user_msg = safety_check_prompt(req.text, db=db)
        safety_response = await call_llm(sys_prompt, user_msg)
        safety_data = _parse_json_response(safety_response)
        risk_level = safety_data.get("risk_level", "safe")
        if risk_level not in ("safe", "mild", "high", "crisis"):
            risk_level = "mild"

        sys_prompt, user_msg = structured_extraction_prompt(req.text, db=db)
        extraction_response = await call_llm(sys_prompt, user_msg)
        extraction_data = _parse_json_response(extraction_response)

        activity = extraction_data.get("activity", "")
        thought = extraction_data.get("thought", "")
        pleasure_score = _clamp_score(extraction_data.get("pleasure_score", 5))
        importance_score = _clamp_score(extraction_data.get("importance_score", 5))
        suggested_domain_name = extraction_data.get("life_domain", "其他")

        life_domain_id: Optional[str] = None
        planned_std: Optional[PlannedActivity] = None
        if req.planned_activity_id:
            planned_std = db.query(PlannedActivity).filter(
                PlannedActivity.id == req.planned_activity_id,
                PlannedActivity.user_id == user_id,
            ).first()
            if planned_std and planned_std.life_domain_id:
                life_domain_id = planned_std.life_domain_id
        if life_domain_id is None:
            life_domain_id = _resolve_domain_id(suggested_domain_name)

        record = MoodRecord(
            id=str(uuid.uuid4()),
            user_id=user_id,
            timestamp=datetime.now(),
            raw_text=req.text,
            activity=activity,
            thought=thought,
            pleasure_score=pleasure_score,
            importance_score=importance_score,
            planned_activity_id=req.planned_activity_id,
            life_domain_id=life_domain_id,
            ai_immediate_feedback=None,
            risk_level=risk_level,
            confirmed=False,
        )
        db.add(record)

        if planned_std:
            planned_std.completed = True
            planned_std.completion_record_id = record.id
        else:
            _mark_planned_completed(db, req.planned_activity_id, user_id, record.id)

        if req.audio_record_id:
            audio_rec = db.query(AudioRecord).filter(
                AudioRecord.id == req.audio_record_id,
                AudioRecord.user_id == user_id,
            ).first()
            if audio_rec and audio_rec.mood_record_id is None:
                audio_rec.mood_record_id = record.id
                record.raw_audio_path = audio_rec.file_path

        _complete_submission(submission, record.id)
        db.commit()
        db.refresh(record)

        background_tasks.add_task(
            _run_ai_background,
            record.id, req.text, user_id,
            activity, thought, pleasure_score, importance_score,
            language,
            False,
        )
        _log_submit("created_standard", user_id, req.client_submission_id, req.audio_record_id, record.id, started_at)
        return record
    except Exception as exc:
        db.rollback()
        _fail_submission(db, submission, exc)
        _log_submit("failed", user_id, req.client_submission_id, req.audio_record_id, None, started_at)
        raise


@router.post("/manual", response_model=MoodRecordResponse)
async def create_manual_record(
    req: ManualRecordCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    app_language: str | None = Header(default=None, alias="X-App-Language"),
):
    """Save a structured activity record without any LLM/ASR usage."""
    user_id = req.user_id
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id)
        db.add(user)
        db.commit()
    language = get_user_language(db, user_id, app_language)

    activity = req.activity.strip()
    if not activity:
        raise HTTPException(status_code=400, detail="Activity is required")

    pleasure_score = _clamp_score(req.pleasure_score)
    importance_score = _clamp_score(req.importance_score)
    thought = (req.thought or "").strip()
    raw_text = activity if not thought else f"{activity}\n{thought}"

    record = MoodRecord(
        id=str(uuid.uuid4()),
        user_id=user_id,
        timestamp=datetime.now(),
        raw_text=raw_text,
        activity=activity,
        thought=thought,
        pleasure_score=pleasure_score,
        importance_score=importance_score,
        planned_activity_id=req.planned_activity_id,
        life_domain_id=req.life_domain_id,
        ai_immediate_feedback=None,
        risk_level="safe",
        confirmed=True,
    )
    db.add(record)
    _mark_planned_completed(db, req.planned_activity_id, user_id, record.id)
    db.commit()
    db.refresh(record)
    if has_ai_access(user):
        background_tasks.add_task(
            _run_ai_background,
            record.id, raw_text, user_id,
            activity, thought, pleasure_score, importance_score,
            language,
            False,
        )
    return record



@router.put("/{record_id}/confirm", response_model=MoodRecordResponse)
async def confirm_record(
    record_id: str,
    body: Optional[RecordConfirmRequest] = None,
    db: Session = Depends(get_db),
):
    """Confirm a record, optionally updating extracted fields."""
    record = db.query(MoodRecord).filter(MoodRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if body:
        if body.activity is not None:
            record.activity = body.activity
        if body.thought is not None:
            record.thought = body.thought
        if body.pleasure_score is not None:
            record.pleasure_score = max(0.0, min(10.0, body.pleasure_score))
        if body.importance_score is not None:
            record.importance_score = max(0.0, min(10.0, body.importance_score))
        # life_domain_id: update only when explicitly sent (None = "鍏朵粬" is a valid value)
        if "life_domain_id" in body.model_fields_set:
            record.life_domain_id = body.life_domain_id

    record.confirmed = True
    db.commit()
    db.refresh(record)
    return record


@router.get("/list", response_model=list[MoodRecordResponse])
async def list_records(
    user_id: str = Query(default="default_user"),
    date: Optional[str] = Query(default=None, description="Filter by date YYYY-MM-DD"),
    start_date: Optional[str] = Query(default=None, description="Filter from date YYYY-MM-DD"),
    end_date: Optional[str] = Query(default=None, description="Filter through date YYYY-MM-DD"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List records ordered by timestamp desc."""
    query = db.query(MoodRecord).filter(MoodRecord.user_id == user_id)

    if date:
        try:
            from datetime import timedelta
            filter_date = datetime.strptime(date, "%Y-%m-%d").date()
            start = datetime(filter_date.year, filter_date.month, filter_date.day)
            end = start + timedelta(days=1)
            query = query.filter(
                MoodRecord.timestamp >= start,
                MoodRecord.timestamp < end,
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
    else:
        if start_date:
            try:
                start = datetime.strptime(start_date, "%Y-%m-%d")
                query = query.filter(MoodRecord.timestamp >= start)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format, use YYYY-MM-DD")

        if end_date:
            try:
                from datetime import timedelta
                end_day = datetime.strptime(end_date, "%Y-%m-%d")
                end = end_day + timedelta(days=1)
                query = query.filter(MoodRecord.timestamp < end)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format, use YYYY-MM-DD")

    records = query.order_by(MoodRecord.timestamp.desc()).limit(limit).all()
    return records


@router.get("/submission/{client_submission_id}", response_model=RecordSubmissionStatusResponse)
async def get_record_submission(
    client_submission_id: str,
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    submission = _get_submission(db, user_id, client_submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    record = _get_record_by_id(db, submission.record_id)
    return RecordSubmissionStatusResponse(status=submission.status, record=record)


@router.get("/{record_id}", response_model=MoodRecordResponse)
async def get_record(record_id: str, db: Session = Depends(get_db)):
    """Get a single record by ID."""
    record = db.query(MoodRecord).filter(MoodRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record
