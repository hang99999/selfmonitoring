from collections import Counter
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MoodRecord, PlannedActivity, LifeDomain, DailyMood
from app.schemas import (
    TodayStatsRecord,
    TodayStatsResponse,
    DailyData,
    WeekStatsResponse,
    MonthStatsResponse,
    DomainRadarItem,
)

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _start_of_current_week(now: datetime) -> datetime:
    """Return Monday 00:00 for the current natural week."""
    start = now - timedelta(days=now.weekday())
    return start.replace(hour=0, minute=0, second=0, microsecond=0)


def _compute_daily_data(records, start_date, num_days: int, daily_moods=None) -> list[dict]:
    """Group records by date and compute per-day stats."""
    daily_moods = daily_moods or {}
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
            daily_mood_score=daily_moods.get(d),
        ))
    return result


def _get_daily_mood_map(db: Session, user_id: str, start_date: str, end_date: str) -> dict[str, float]:
    moods = (
        db.query(DailyMood)
        .filter(
            DailyMood.user_id == user_id,
            DailyMood.date >= start_date,
            DailyMood.date <= end_date,
        )
        .all()
    )
    return {m.date: m.mood_score for m in moods}


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
    today_key = day_start.strftime("%Y-%m-%d")
    daily_mood = db.query(DailyMood).filter(
        DailyMood.user_id == user_id,
        DailyMood.date == today_key,
    ).first()

    return TodayStatsResponse(
        records=stats_records,
        count=len(records),
        avg_intensity=_compute_avg_intensity(records),
        avg_pleasure=_compute_avg_pleasure(records),
        avg_importance=_compute_avg_importance(records),
        daily_mood_score=daily_mood.mood_score if daily_mood else None,
    )


@router.get("/week", response_model=WeekStatsResponse)
async def week_stats(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Get current natural week stats (Monday through today)."""
    now = datetime.now()
    start_date = _start_of_current_week(now)
    num_days = (now.date() - start_date.date()).days + 1

    records = (
        db.query(MoodRecord)
        .filter(
            MoodRecord.user_id == user_id,
            MoodRecord.timestamp >= start_date,
        )
        .order_by(MoodRecord.timestamp.asc())
        .all()
    )

    start_key = start_date.strftime("%Y-%m-%d")
    end_key = now.strftime("%Y-%m-%d")
    daily_moods = _get_daily_mood_map(db, user_id, start_key, end_key)
    daily_data = _compute_daily_data(records, start_date.date(), num_days, daily_moods)

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

    start_key = start_date.strftime("%Y-%m-%d")
    end_key = now.strftime("%Y-%m-%d")
    daily_moods = _get_daily_mood_map(db, user_id, start_key, end_key)
    daily_data = _compute_daily_data(records, start_date.date(), 30, daily_moods)

    return MonthStatsResponse(
        daily_data=daily_data,
        total_count=len(records),
        emotion_distribution=_compute_emotion_distribution(records),
        avg_intensity=_compute_avg_intensity(records),
        avg_pleasure=_compute_avg_pleasure(records),
        avg_importance=_compute_avg_importance(records),
    )


@router.get("/domain-radar", response_model=list[DomainRadarItem])
async def domain_radar(
    user_id: str = Query(default="default_user"),
    period: str = Query(default="week"),  # "day" | "week" | "month"
    db: Session = Depends(get_db),
):
    """Return activity counts per life domain for the given period.

    Counts two sources to avoid double-counting:
    - confirmed MoodRecords (with life_domain_id)
    - PlannedActivities completed WITHOUT a linked MoodRecord (direct tick-off)
    """
    now = datetime.now()
    if period == "day":
        start_dt = datetime(now.year, now.month, now.day)
        end_dt = start_dt + timedelta(days=1)
        start_date_str = start_dt.strftime("%Y-%m-%d")
        end_date_str = start_dt.strftime("%Y-%m-%d")
    elif period == "month":
        start_dt = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now + timedelta(days=1)
        start_date_str = start_dt.strftime("%Y-%m-%d")
        end_date_str = now.strftime("%Y-%m-%d")
    else:  # week (default)
        start_dt = _start_of_current_week(now)
        end_dt = now + timedelta(days=1)
        start_date_str = start_dt.strftime("%Y-%m-%d")
        end_date_str = now.strftime("%Y-%m-%d")

    counts: dict[Optional[str], int] = {}

    # Source 1: confirmed MoodRecords
    mood_records = (
        db.query(MoodRecord)
        .filter(
            MoodRecord.user_id == user_id,
            MoodRecord.confirmed == True,
            MoodRecord.timestamp >= start_dt,
            MoodRecord.timestamp < end_dt,
        )
        .all()
    )
    for r in mood_records:
        key = r.life_domain_id  # None means "其他"
        counts[key] = counts.get(key, 0) + 1

    # Source 2: PlannedActivities completed directly (no linked MoodRecord)
    planned = (
        db.query(PlannedActivity)
        .filter(
            PlannedActivity.user_id == user_id,
            PlannedActivity.completed == True,
            PlannedActivity.completion_record_id == None,
            PlannedActivity.scheduled_date >= start_date_str,
            PlannedActivity.scheduled_date <= end_date_str,
        )
        .all()
    )
    for p in planned:
        key = p.life_domain_id
        counts[key] = counts.get(key, 0) + 1

    # Build result: 5 named domains + "其他"
    domains = db.query(LifeDomain).filter(LifeDomain.user_id == user_id).order_by(LifeDomain.created_at).all()
    result: list[DomainRadarItem] = []
    for d in domains:
        result.append(DomainRadarItem(domain_id=d.id, domain_name=d.name, count=counts.get(d.id, 0)))
    result.append(DomainRadarItem(domain_id=None, domain_name="其他", count=counts.get(None, 0)))
    return result
