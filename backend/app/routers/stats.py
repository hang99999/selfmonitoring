from collections import Counter
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MoodRecord
from app.schemas import (
    TodayStatsRecord,
    TodayStatsResponse,
    DailyData,
    WeekStatsResponse,
    MonthStatsResponse,
)

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _compute_daily_data(records, start_date, num_days: int) -> list[dict]:
    """Group records by date and compute per-day stats."""
    daily = {}
    for i in range(num_days):
        d = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        daily[d] = {"count": 0, "intensities": [], "emotions": [], "pleasures": [], "importances": []}

    for r in records:
        if r.timestamp:
            d = r.timestamp.strftime("%Y-%m-%d")
            if d in daily:
                daily[d]["count"] += 1
                if r.emotion_intensity is not None:
                    daily[d]["intensities"].append(r.emotion_intensity)
                if r.emotion_type:
                    daily[d]["emotions"].append(r.emotion_type)
                if r.pleasure_score is not None:
                    daily[d]["pleasures"].append(r.pleasure_score)
                if r.importance_score is not None:
                    daily[d]["importances"].append(r.importance_score)

    result = []
    for d in sorted(daily.keys()):
        info = daily[d]
        avg = sum(info["intensities"]) / len(info["intensities"]) if info["intensities"] else None
        avg_pleasure = sum(info["pleasures"]) / len(info["pleasures"]) if info["pleasures"] else None
        avg_importance = sum(info["importances"]) / len(info["importances"]) if info["importances"] else None
        dominant = None
        if info["emotions"]:
            counter = Counter(info["emotions"])
            dominant = counter.most_common(1)[0][0]
        result.append(DailyData(
            date=d,
            avg_intensity=round(avg, 1) if avg is not None else None,
            avg_pleasure=round(avg_pleasure, 1) if avg_pleasure is not None else None,
            avg_importance=round(avg_importance, 1) if avg_importance is not None else None,
            count=info["count"],
            dominant_emotion=dominant,
        ))
    return result


def _compute_emotion_distribution(records) -> dict[str, int]:
    """Count emotion types across records."""
    dist: dict[str, int] = {}
    for r in records:
        if r.emotion_type:
            for etype in r.emotion_type.split("、"):
                etype = etype.strip()
                if etype:
                    dist[etype] = dist.get(etype, 0) + 1
    return dist


def _compute_avg_intensity(records) -> Optional[float]:
    """Compute average intensity across records."""
    vals = [r.emotion_intensity for r in records if r.emotion_intensity is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 1)


def _compute_avg_pleasure(records) -> Optional[float]:
    vals = [r.pleasure_score for r in records if r.pleasure_score is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 1)


def _compute_avg_importance(records) -> Optional[float]:
    vals = [r.importance_score for r in records if r.importance_score is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 1)


@router.get("/today", response_model=TodayStatsResponse)
async def today_stats(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Get today's stats."""
    now = datetime.now()
    day_start = datetime(now.year, now.month, now.day)
    day_end = day_start + timedelta(days=1)

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

    stats_records = [
        TodayStatsRecord(
            timestamp=r.timestamp,
            emotion_type=r.emotion_type,
            emotion_intensity=r.emotion_intensity,
            pleasure_score=r.pleasure_score,
            importance_score=r.importance_score,
            activity=r.activity,
        )
        for r in records
    ]

    return TodayStatsResponse(
        records=stats_records,
        count=len(records),
        avg_intensity=_compute_avg_intensity(records),
        avg_pleasure=_compute_avg_pleasure(records),
        avg_importance=_compute_avg_importance(records),
    )


@router.get("/week", response_model=WeekStatsResponse)
async def week_stats(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Get last 7 days stats."""
    now = datetime.now()
    start_date = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)

    records = (
        db.query(MoodRecord)
        .filter(
            MoodRecord.user_id == user_id,
            MoodRecord.timestamp >= start_date,
        )
        .order_by(MoodRecord.timestamp.asc())
        .all()
    )

    daily_data = _compute_daily_data(records, start_date.date(), 7)

    return WeekStatsResponse(
        daily_data=daily_data,
        total_count=len(records),
        emotion_distribution=_compute_emotion_distribution(records),
        avg_intensity=_compute_avg_intensity(records),
        avg_pleasure=_compute_avg_pleasure(records),
        avg_importance=_compute_avg_importance(records),
    )


@router.get("/month", response_model=MonthStatsResponse)
async def month_stats(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Get last 30 days stats."""
    now = datetime.now()
    start_date = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)

    records = (
        db.query(MoodRecord)
        .filter(
            MoodRecord.user_id == user_id,
            MoodRecord.timestamp >= start_date,
        )
        .order_by(MoodRecord.timestamp.asc())
        .all()
    )

    daily_data = _compute_daily_data(records, start_date.date(), 30)

    return MonthStatsResponse(
        daily_data=daily_data,
        total_count=len(records),
        emotion_distribution=_compute_emotion_distribution(records),
        avg_intensity=_compute_avg_intensity(records),
        avg_pleasure=_compute_avg_pleasure(records),
        avg_importance=_compute_avg_importance(records),
    )
