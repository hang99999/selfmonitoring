import json
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MoodRecord, InsightReport
from app.schemas import InsightReportResponse
from app.llm_client import call_llm
from app.prompts import daily_summary_prompt, weekly_summary_prompt

router = APIRouter(prefix="/api/insight", tags=["insights"])


def _records_to_json(records) -> str:
    """Convert records to a JSON string for prompts (BA-focused)."""
    items = []
    for r in records:
        items.append({
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "activity": r.activity,
            "thought": r.thought,
            "pleasure_score": r.pleasure_score,
            "importance_score": r.importance_score,
            "emotion_type": r.emotion_type,
        })
    return json.dumps(items, ensure_ascii=False, indent=2)


def _compute_emotion_frequency(records) -> dict:
    """Count occurrences of each emotion type."""
    freq = {}
    for r in records:
        if r.emotion_type:
            for etype in r.emotion_type.split("、"):
                etype = etype.strip()
                if etype:
                    freq[etype] = freq.get(etype, 0) + 1
    return freq


def _compute_avg_intensity(records) -> float:
    """Compute average emotion intensity."""
    intensities = [r.emotion_intensity for r in records if r.emotion_intensity is not None]
    if not intensities:
        return 0.0
    return sum(intensities) / len(intensities)


def _compute_intensity_trend(records) -> str:
    """Determine if intensity is trending up, down, or stable over the period."""
    intensities = [
        r.emotion_intensity for r in sorted(records, key=lambda x: x.timestamp)
        if r.emotion_intensity is not None
    ]
    if len(intensities) < 2:
        return "数据不足"
    first_half = sum(intensities[: len(intensities) // 2]) / max(len(intensities) // 2, 1)
    second_half = sum(intensities[len(intensities) // 2:]) / max(len(intensities) - len(intensities) // 2, 1)
    diff = second_half - first_half
    if diff > 0.5:
        return "上升"
    elif diff < -0.5:
        return "下降"
    return "平稳"


@router.get("/daily", response_model=InsightReportResponse)
async def daily_insight(
    user_id: str = Query(default="default_user"),
    date: Optional[str] = Query(default=None, description="Date YYYY-MM-DD, default today"),
    db: Session = Depends(get_db),
):
    """Generate or retrieve a daily insight report."""
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Invalid date format")
    else:
        target_date = datetime.now().date()

    # Check if already generated today
    day_start = datetime(target_date.year, target_date.month, target_date.day)
    day_end = day_start + timedelta(days=1)

    existing = (
        db.query(InsightReport)
        .filter(
            InsightReport.user_id == user_id,
            InsightReport.report_type == "daily",
            InsightReport.generated_at >= day_start,
            InsightReport.generated_at < day_end,
        )
        .first()
    )
    if existing and not existing.content.startswith("[LLM Error]"):
        return existing

    # Get today's records
    records = (
        db.query(MoodRecord)
        .filter(
            MoodRecord.user_id == user_id,
            MoodRecord.timestamp >= day_start,
            MoodRecord.timestamp < day_end,
        )
        .order_by(MoodRecord.timestamp.asc())
        .all()
    )

    if not records:
        content = "今天还没有记录哦，记得随时记录你的心情~"
    else:
        records_json = _records_to_json(records)
        sys_prompt, user_msg = daily_summary_prompt(records_json, db=db)
        content = await call_llm(sys_prompt, user_msg)

    if existing:
        # Update the bad cached record in place
        existing.content = content
        existing.generated_at = datetime.now()
        db.commit()
        db.refresh(existing)
        return existing

    report = InsightReport(
        id=str(uuid.uuid4()),
        user_id=user_id,
        report_type="daily",
        generated_at=datetime.now(),
        content=content,
        patterns="[]",
        cbt_suggestions="[]",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/weekly", response_model=InsightReportResponse)
async def weekly_insight(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Generate a weekly insight report for the last 7 days."""
    now = datetime.now()
    week_start = now - timedelta(days=7)

    records = (
        db.query(MoodRecord)
        .filter(
            MoodRecord.user_id == user_id,
            MoodRecord.timestamp >= week_start,
        )
        .order_by(MoodRecord.timestamp.asc())
        .all()
    )

    if not records:
        report = InsightReport(
            id=str(uuid.uuid4()),
            user_id=user_id,
            report_type="weekly",
            generated_at=now,
            content="这一周还没有足够的记录来生成洞察报告，继续加油记录吧~",
            patterns="[]",
            cbt_suggestions="[]",
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        return report

    # Compute stats
    total_count = len(records)
    intensity_trend = _compute_intensity_trend(records)

    pleasure_scores = [r.pleasure_score for r in records if r.pleasure_score is not None]
    importance_scores = [r.importance_score for r in records if r.importance_score is not None]
    avg_pleasure = sum(pleasure_scores) / len(pleasure_scores) if pleasure_scores else 5.0
    avg_importance = sum(importance_scores) / len(importance_scores) if importance_scores else 5.0

    records_json = _records_to_json(records)
    sys_prompt, user_msg = weekly_summary_prompt(
        week_records_json=records_json,
        total_count=total_count,
        avg_pleasure=avg_pleasure,
        avg_importance=avg_importance,
        intensity_trend=intensity_trend,
        db=db,
    )
    weekly_response = await call_llm(sys_prompt, user_msg)

    # Try to parse structured JSON from the response
    patterns_str = "[]"
    cbt_suggestions_str = "[]"
    content = weekly_response

    # Attempt to extract JSON block from the response
    try:
        # Look for JSON block in the response
        json_start = weekly_response.find("{")
        json_end = weekly_response.rfind("}") + 1
        if json_start != -1 and json_end > json_start:
            candidate = weekly_response[json_start:json_end]
            parsed = json.loads(candidate)
            if "patterns" in parsed:
                patterns_str = json.dumps(parsed["patterns"], ensure_ascii=False)
            if "cbt_suggestions" in parsed:
                cbt_suggestions_str = json.dumps(parsed["cbt_suggestions"], ensure_ascii=False)
            if "summary" in parsed:
                content = parsed["summary"]
                if "progress_note" in parsed:
                    content += "\n\n" + parsed["progress_note"]
    except (json.JSONDecodeError, KeyError):
        pass

    report = InsightReport(
        id=str(uuid.uuid4()),
        user_id=user_id,
        report_type="weekly",
        generated_at=now,
        content=content,
        patterns=patterns_str,
        cbt_suggestions=cbt_suggestions_str,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
