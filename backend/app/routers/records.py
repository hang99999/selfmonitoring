import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MoodRecord, User
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
    """Get a text summary of the user's most recent records."""
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
        summaries.append(
            f"[{ts}] 情绪={r.emotion_type or '未知'}(强度{r.emotion_intensity or '?'})，"
            f"活动={r.activity or '未知'}，想法={r.thought or '未知'}"
        )
    return "\n".join(summaries)


@router.post("/submit", response_model=MoodRecordResponse)
async def submit_record(req: RecordSubmitRequest, db: Session = Depends(get_db)):
    """Full pipeline: safety check -> extraction -> empathic feedback -> save."""
    user_id = req.user_id

    # Ensure user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id)
        db.add(user)
        db.commit()

    # Step 1: Safety check
    sys_prompt, user_msg = safety_check_prompt(req.text)
    safety_response = await call_llm(sys_prompt, user_msg)
    safety_data = _parse_json_response(safety_response)
    risk_level = safety_data.get("risk_level", "safe")
    if risk_level not in ("safe", "mild", "high", "crisis"):
        risk_level = "mild"

    # Step 2: Structured extraction
    sys_prompt, user_msg = structured_extraction_prompt(req.text)
    extraction_response = await call_llm(sys_prompt, user_msg)
    extraction_data = _parse_json_response(extraction_response)

    activity = extraction_data.get("activity", "信息不足")
    thought = extraction_data.get("thought", "信息不足")
    emotion_type = extraction_data.get("emotion_type", "信息不足")
    emotion_intensity = extraction_data.get("emotion_intensity", 5)
    cognitive_distortion = extraction_data.get("cognitive_distortion")

    if not isinstance(emotion_intensity, int):
        try:
            emotion_intensity = int(emotion_intensity)
        except (ValueError, TypeError):
            emotion_intensity = 5

    # Step 3: Empathic feedback
    recent_summary = _get_recent_records_summary(db, user_id)
    sys_prompt, user_msg = empathic_feedback_prompt(
        raw_text=req.text,
        activity=activity,
        thought=thought,
        emotion_type=emotion_type,
        emotion_intensity=emotion_intensity,
        cognitive_distortion=cognitive_distortion or "无明显认知歪曲",
        recent_records_summary=recent_summary,
    )
    feedback = await call_llm(sys_prompt, user_msg)

    # Step 4: Save to DB
    record = MoodRecord(
        id=str(uuid.uuid4()),
        user_id=user_id,
        timestamp=datetime.now(timezone.utc),
        raw_text=req.text,
        activity=activity,
        thought=thought,
        emotion_type=emotion_type,
        emotion_intensity=emotion_intensity,
        cognitive_distortion=cognitive_distortion,
        ai_immediate_feedback=feedback,
        risk_level=risk_level,
        confirmed=False,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

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
            start = datetime(filter_date.year, filter_date.month, filter_date.day, tzinfo=timezone.utc)
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
