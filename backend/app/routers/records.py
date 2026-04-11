import json
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import MoodRecord, User, PlannedActivity
from app.schemas import MoodRecordResponse, RecordSubmitRequest, RecordConfirmRequest
from app.llm_client import call_llm
from app.prompts import safety_check_prompt, structured_extraction_prompt, empathic_feedback_prompt

router = APIRouter(prefix="/api/record", tags=["records"])


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
        return "暂无历史记录"

    summaries = []
    for r in records:
        ts = r.timestamp.strftime("%m-%d %H:%M") if r.timestamp else "未知时间"
        pleasure = f"{r.pleasure_score:.0f}" if r.pleasure_score is not None else "?"
        importance = f"{r.importance_score:.0f}" if r.importance_score is not None else "?"
        summaries.append(
            f"[{ts}] 活动={r.activity or '未知'}，"
            f"愉悦度={pleasure}/10，重要性={importance}/10"
        )
    return "\n".join(summaries)


async def _run_ai_background(
    record_id: str,
    text: str,
    user_id: str,
    activity: str,
    thought: str,
    pleasure_score: float,
    importance_score: float,
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
        feedback = await call_llm(sys_prompt, user_msg)

        record = db.query(MoodRecord).filter(MoodRecord.id == record_id).first()
        if record:
            if feedback and not feedback.startswith("[LLM Error]"):
                record.ai_immediate_feedback = feedback
            else:
                record.ai_immediate_feedback = "你做到了，记录本身就是一种行动，小暖为你感到高兴～"
            if new_risk_level is not None:
                record.risk_level = new_risk_level
            db.commit()
    except Exception:
        # Best-effort: write fallback so frontend polling can stop
        try:
            record = db.query(MoodRecord).filter(MoodRecord.id == record_id).first()
            if record and not record.ai_immediate_feedback:
                record.ai_immediate_feedback = "你做到了，记录本身就是一种行动，小暖为你感到高兴～"
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
):
    user_id = req.user_id

    # Ensure user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id)
        db.add(user)
        db.commit()

    if req.activity is not None:
        # ── Quick-save path ──────────────────────────────────────────────────
        # User already supplied activity + scores; save immediately,
        # run safety check + AI feedback as a background task.
        def _clamp(v: Optional[float], default: float) -> float:
            try:
                return max(0.0, min(10.0, float(v)))  # type: ignore[arg-type]
            except (TypeError, ValueError):
                return default

        activity = req.activity
        pleasure_score = _clamp(req.pleasure_score, 5.0)
        importance_score = _clamp(req.importance_score, 5.0)

        record = MoodRecord(
            id=str(uuid.uuid4()),
            user_id=user_id,
            timestamp=datetime.now(),
            raw_text=req.text,
            activity=activity,
            thought="",
            emotion_type="",
            pleasure_score=pleasure_score,
            importance_score=importance_score,
            planned_activity_id=req.planned_activity_id,
            ai_immediate_feedback=None,  # filled by background task
            risk_level="safe",           # updated by background task
            confirmed=True,
        )
        db.add(record)

        if req.planned_activity_id:
            planned = db.query(PlannedActivity).filter(
                PlannedActivity.id == req.planned_activity_id,
                PlannedActivity.user_id == user_id,
            ).first()
            if planned:
                planned.completed = True
                planned.completion_record_id = record.id

        db.commit()
        db.refresh(record)

        background_tasks.add_task(
            _run_ai_background,
            record.id, req.text, user_id,
            activity, "", pleasure_score, importance_score,
            True,  # quick-save path: safety check not yet done
        )

        return record

    # ── Standard pipeline: sync extraction, async feedback ──────────────────
    # Step 1: Safety check (sync)
    sys_prompt, user_msg = safety_check_prompt(req.text, db=db)
    safety_response = await call_llm(sys_prompt, user_msg)
    safety_data = _parse_json_response(safety_response)
    risk_level = safety_data.get("risk_level", "safe")
    if risk_level not in ("safe", "mild", "high", "crisis"):
        risk_level = "mild"

    # Step 2: BA Structured extraction (sync — user reviews result in modal)
    sys_prompt, user_msg = structured_extraction_prompt(req.text, db=db)
    extraction_response = await call_llm(sys_prompt, user_msg)
    extraction_data = _parse_json_response(extraction_response)

    activity = extraction_data.get("activity", "")
    thought = extraction_data.get("thought", "")
    emotion_type = extraction_data.get("emotion_type", "")
    pleasure_score = extraction_data.get("pleasure_score", 5)
    importance_score = extraction_data.get("importance_score", 5)

    def _to_float(val, default: float) -> float:
        try:
            return float(val)
        except (TypeError, ValueError):
            return default

    pleasure_score = _to_float(pleasure_score, 5.0)
    importance_score = _to_float(importance_score, 5.0)
    pleasure_score = max(0.0, min(10.0, pleasure_score))
    importance_score = max(0.0, min(10.0, importance_score))

    # Step 3: Save to DB immediately (feedback will be filled by background task)
    record = MoodRecord(
        id=str(uuid.uuid4()),
        user_id=user_id,
        timestamp=datetime.now(),
        raw_text=req.text,
        activity=activity,
        thought=thought,
        emotion_type=emotion_type,
        pleasure_score=pleasure_score,
        importance_score=importance_score,
        planned_activity_id=req.planned_activity_id,
        ai_immediate_feedback=None,  # filled async
        risk_level=risk_level,
        confirmed=False,
    )
    db.add(record)

    if req.planned_activity_id:
        planned = db.query(PlannedActivity).filter(
            PlannedActivity.id == req.planned_activity_id,
            PlannedActivity.user_id == user_id,
        ).first()
        if planned:
            planned.completed = True
            planned.completion_record_id = record.id

    db.commit()
    db.refresh(record)

    # Step 4: Empathic feedback runs in background — does not block modal
    background_tasks.add_task(
        _run_ai_background,
        record.id, req.text, user_id,
        activity, thought, pleasure_score, importance_score,
        False,  # standard path: safety check already done synchronously above
    )

    return record


@router.post("/submit-voice")
async def submit_voice():
    """Placeholder for voice input."""
    raise HTTPException(status_code=501, detail="Voice input coming soon")


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
        if body.emotion_type is not None:
            record.emotion_type = body.emotion_type
        if body.emotion_intensity is not None:
            record.emotion_intensity = body.emotion_intensity
        if body.pleasure_score is not None:
            record.pleasure_score = max(0.0, min(10.0, body.pleasure_score))
        if body.importance_score is not None:
            record.importance_score = max(0.0, min(10.0, body.importance_score))

    record.confirmed = True
    db.commit()
    db.refresh(record)
    return record


@router.get("/list", response_model=list[MoodRecordResponse])
async def list_records(
    user_id: str = Query(default="default_user"),
    date: Optional[str] = Query(default=None, description="Filter by date YYYY-MM-DD"),
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

    records = query.order_by(MoodRecord.timestamp.desc()).limit(limit).all()
    return records


@router.get("/{record_id}", response_model=MoodRecordResponse)
async def get_record(record_id: str, db: Session = Depends(get_db)):
    """Get a single record by ID."""
    record = db.query(MoodRecord).filter(MoodRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record
