"""Chatbot router — BA companion chatbot (BATD-R)."""

import json
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.access import require_ai_access
from app.database import SessionLocal, get_db
from app.i18n import get_user_language, localized_text, output_language_rule
from app.llm_client import call_llm, call_llm_chat, get_llm_stats
from app.models import (
    User, MoodRecord, PlannedActivity, DailyMood,
    Activity, Value, LifeDomain,
    TriggerLog, CompanionSettings,
    ChatSession, ChatMessageRecord,
    TreatmentProgress, PhaseConfig,
)
from app.prompts import chatbot_system_prompt, classify_free_chat_mode

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])

# ── Dev: debug trigger injection ──────────────────────────────────────────────
# Maps user_id → trigger name. Consumed once on next /chat call.
_debug_triggers: dict[str, str] = {}

# ── Safety ───────────────────────────────────────────────────────────────────

CRISIS_KEYWORDS = [
    "不想活", "想死", "去死", "自杀", "轻生", "结束生命",
    "想消失", "活着没意思", "活着没有意义", "不如死了",
    "割腕", "跳楼", "跳桥", "跳河", "自残", "伤害自己",
    "想杀", "想伤害",
]


def _is_crisis(text: str) -> bool:
    return any(kw in text for kw in CRISIS_KEYWORDS)


# ── Trigger priority order ────────────────────────────────────────────────────

TRIGGER_PRIORITY = [
    "monitoring_troubleshoot",
    "life_area_balance",
    "support_contract_review",
    "values_review",
    "first_plan_completed_celebration",
    "plan_completed_7_celebration",
]

CONVERSATION_TRIGGERS = {"monitoring_troubleshoot"}
MESSAGE_ONLY_TRIGGERS = set(TRIGGER_PRIORITY) - CONVERSATION_TRIGGERS

TRIGGER_COOLDOWNS = {
    "monitoring_troubleshoot": 7,
    "life_area_balance": 14,
    "support_contract_review": 21,
    "values_review": 21,
    "first_plan_completed_celebration": 9999,
    "plan_completed_7_celebration": 9999,
}

PHASE_SESSION_COMPLETION_STEPS = {
    "intro": 4,
    "setup": 3,
    "first_review": 4,
    "review_cycle": 4,
}


# ── Treatment progress helpers ────────────────────────────────────────────────

def _get_or_create_progress(db: Session, user_id: str) -> TreatmentProgress:
    progress = db.query(TreatmentProgress).filter(TreatmentProgress.user_id == user_id).first()
    if not progress:
        progress = TreatmentProgress(user_id=user_id, phase="intro")
        db.add(progress)
        db.commit()
        db.refresh(progress)
    return progress


def _get_or_create_config(db: Session) -> PhaseConfig:
    cfg = db.query(PhaseConfig).filter(PhaseConfig.config_key == "global").first()
    if not cfg:
        cfg = PhaseConfig(config_key="global")
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _sync_review_cycle_count(db: Session, cfg: PhaseConfig, progress: TreatmentProgress):
    if progress.phase == "review_cycle":
        cycle_days = max(1, cfg.review_cycle_days)
        now = datetime.now()
        days_in_phase = (now - progress.phase_unlocked_at).days
        expected_count = max(1, days_in_phase // cycle_days + 1)
        if expected_count > progress.review_cycle_count:
            progress.review_cycle_count = expected_count
            progress.updated_at = now
            db.commit()


def _phase_time_status(cfg: PhaseConfig, phase: str, phase_days: int) -> tuple[int | None, int, bool]:
    if phase == "intro":
        days_required = cfg.intro_days if cfg.intro_time_limit else None
    elif phase == "setup":
        days_required = cfg.setup_days if cfg.setup_time_limit else None
    elif phase == "first_review":
        days_required = cfg.first_review_days if cfg.first_review_time_limit else None
    else:
        days_required = None

    days_until_eligible = max(0, days_required - phase_days) if days_required is not None else 0
    return days_required, days_until_eligible, days_until_eligible == 0


def _phase_tasks_required(cfg: PhaseConfig, phase: str) -> bool:
    if phase == "intro":
        return cfg.intro_require_tasks is not False
    if phase == "setup":
        return cfg.setup_require_tasks is not False
    if phase == "first_review":
        return cfg.first_review_require_tasks is not False
    return False


def _phase_task_criteria(db: Session, user_id: str, cfg: PhaseConfig, phase: str) -> list[dict]:
    if phase == "intro":
        total_records = db.query(MoodRecord).filter(MoodRecord.user_id == user_id).count()
        t = cfg.intro_records_target
        return [{"key": "records", "label": f"提交至少{t}条活动记录",
                 "done": total_records >= t, "current": total_records, "target": t}]

    if phase == "setup":
        values_count = db.query(Value).filter(Value.user_id == user_id).count()
        activity_count = db.query(Activity).filter(Activity.user_id == user_id).count()
        planned_ever = db.query(PlannedActivity).filter(PlannedActivity.user_id == user_id).count()
        vt = cfg.setup_values_target
        at = cfg.setup_activities_target
        pt = cfg.setup_plans_target
        return [
            {"key": "values", "label": f"填写至少{vt}条价值观",
             "done": values_count >= vt, "current": values_count, "target": vt},
            {"key": "activities", "label": f"在活动库中添加至少{at}个活动",
             "done": activity_count >= at, "current": activity_count, "target": at},
            {"key": "planned", "label": f"安排至少{pt}个计划活动",
             "done": planned_ever >= pt, "current": min(planned_ever, pt), "target": pt},
        ]

    if phase == "first_review":
        any_completed = db.query(PlannedActivity).filter(
            PlannedActivity.user_id == user_id,
            PlannedActivity.completed == True,
        ).count()
        ct = cfg.first_review_completed_target
        return [
            {"key": "completed", "label": f"完成至少{ct}个计划活动",
             "done": any_completed >= ct, "current": min(any_completed, ct), "target": ct},
        ]

    return []


def _phase_can_advance(db: Session, user_id: str, cfg: PhaseConfig, progress: TreatmentProgress) -> dict:
    phase = progress.phase
    phase_days = (datetime.now() - progress.phase_unlocked_at).days
    days_required, days_until_eligible, time_met = _phase_time_status(cfg, phase, phase_days)
    tasks_required = _phase_tasks_required(cfg, phase)
    criteria = _phase_task_criteria(db, user_id, cfg, phase)
    criteria_met = all(c["done"] for c in criteria) if tasks_required and criteria else True
    phase_session_done = _phase_session_completed_since(db, user_id, phase, progress.phase_unlocked_at)
    return {
        "days_required": days_required,
        "days_until_eligible": days_until_eligible,
        "time_met": time_met,
        "tasks_required": tasks_required,
        "criteria": criteria,
        "criteria_met": criteria_met,
        "phase_session_done": phase_session_done,
        "can_advance": (
            phase != "review_cycle"
            and phase_session_done
            and criteria_met
            and time_met
        ),
    }


# ── User state computation ────────────────────────────────────────────────────

def _compute_user_state(db: Session, user_id: str) -> dict:
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")

    user = db.query(User).filter(User.id == user_id).first()
    days_since_registration = (now - user.created_at).days if user and user.created_at else 0

    cs = db.query(CompanionSettings).filter(CompanionSettings.user_id == user_id).first()
    user_summary = cs.user_summary if cs else None

    first_trigger = db.query(TriggerLog).filter(
        TriggerLog.user_id == user_id,
        TriggerLog.trigger_type == "first_conversation",
    ).first()
    is_first_conversation = first_trigger is None

    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)
    week_start_str = (now - timedelta(days=6)).strftime("%Y-%m-%d")
    last_week_start_str = (now - timedelta(days=13)).strftime("%Y-%m-%d")
    two_weeks_start_str = (now - timedelta(days=20)).strftime("%Y-%m-%d")
    day_start = datetime(now.year, now.month, now.day)

    records_14d = (
        db.query(MoodRecord)
        .filter(MoodRecord.user_id == user_id, MoodRecord.timestamp >= two_weeks_ago)
        .all()
    )
    records_7d = [r for r in records_14d if r.timestamp >= week_ago]
    today_records = [r for r in records_7d if r.timestamp >= day_start]

    total_records_this_week = len(records_7d)
    avg_daily_records = round(len(records_7d) / 7, 1)

    consecutive_days_no_record = 0
    for i in range(7):
        d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        if not any(r.timestamp.strftime("%Y-%m-%d") == d for r in records_7d):
            consecutive_days_no_record += 1
        else:
            break

    pleasures_7d = [r.pleasure_score for r in records_7d if r.pleasure_score is not None]
    importances_7d = [r.importance_score for r in records_7d if r.importance_score is not None]
    avg_enjoyment_score = round(sum(pleasures_7d) / len(pleasures_7d), 1) if pleasures_7d else None
    avg_importance_score = round(sum(importances_7d) / len(importances_7d), 1) if importances_7d else None

    hi_lo = sum(
        1 for r in records_7d
        if r.importance_score is not None and r.pleasure_score is not None
        and r.importance_score >= 7 and r.pleasure_score < 4
    )
    high_importance_low_enjoyment_ratio = round(hi_lo / len(records_7d), 2) if records_7d else 0.0

    all_domains = db.query(LifeDomain).filter(LifeDomain.user_id.is_(None)).all()
    domain_id_to_name = {d.id: d.name for d in all_domains}

    recent_activity_records = [
        {
            "activity": r.activity,
            "pleasure": r.pleasure_score,
            "importance": r.importance_score,
            "life_domain": domain_id_to_name.get(r.life_domain_id, "其他"),
        }
        for r in sorted(records_7d, key=lambda x: x.timestamp, reverse=True)
        if r.activity
    ][:8]

    def _planned_in_range(start_str: str, end_str: str):
        return (
            db.query(PlannedActivity)
            .filter(
                PlannedActivity.user_id == user_id,
                PlannedActivity.scheduled_date >= start_str,
                PlannedActivity.scheduled_date <= end_str,
            )
            .all()
        )

    this_week_planned = _planned_in_range(week_start_str, today_str)
    last_week_planned = _planned_in_range(last_week_start_str, week_start_str)
    two_weeks_planned = _planned_in_range(two_weeks_start_str, last_week_start_str)
    all_planned_14d = _planned_in_range(two_weeks_start_str, today_str)

    def _rate(items):
        if not items:
            return 0.0
        return round(sum(1 for p in items if p.completed) / len(items), 2)

    completion_rate_this_week = _rate(this_week_planned)
    completion_rate_last_week = _rate(last_week_planned)
    completion_rate_two_weeks = _rate(two_weeks_planned)

    consecutive_high = 0
    for r in [completion_rate_this_week, completion_rate_last_week, completion_rate_two_weeks]:
        if r >= 0.90:
            consecutive_high += 1
        else:
            break

    consecutive_low = 0
    for r in [completion_rate_this_week, completion_rate_last_week, completion_rate_two_weeks]:
        if r < 0.40:
            consecutive_low += 1
        else:
            break

    incomplete_counts: Counter = Counter()
    for p in all_planned_14d:
        if not p.completed:
            incomplete_counts[p.activity_name] += 1
    repeatedly_incomplete = [name for name, cnt in incomplete_counts.items() if cnt >= 2]
    total_incomplete_14d = sum(1 for p in all_planned_14d if not p.completed)

    has_values = db.query(Value).filter(Value.user_id == user_id).count() > 0
    has_activities = db.query(Activity).filter(Activity.user_id == user_id).count() > 0

    all_activities = db.query(Activity).filter(Activity.user_id == user_id).all()
    all_values = db.query(Value).filter(Value.user_id == user_id).all()

    # Detect activity quality issues (heuristic: all ranked activities are high difficulty)
    if all_activities:
        ranked = [a for a in all_activities if a.difficulty_rank is not None]
        if ranked and all(a.difficulty_rank >= 3 for a in ranked):
            activities_quality_issue = "all_hard"
        else:
            activities_quality_issue = None
    else:
        activities_quality_issue = None
    values_quality_issue = None  # requires LLM analysis; left for future implementation

    domain_with_activity: set = set()
    domain_act_counts: Counter = Counter()
    for a in all_activities:
        if a.life_domain_id and a.life_domain_id in domain_id_to_name:
            name = domain_id_to_name[a.life_domain_id]
            domain_with_activity.add(name)
            domain_act_counts[name] += 1

    life_areas_with = list(domain_with_activity)
    life_areas_without = [d.name for d in all_domains if d.name not in domain_with_activity]
    total_acts = len(all_activities)
    dominant_ratio = (
        round(domain_act_counts.most_common(1)[0][1] / total_acts, 2)
        if total_acts > 0 else 0.0
    )

    values_by_domain: dict = {}
    for v in all_values:
        d_name = domain_id_to_name.get(v.life_domain_id, "其他")
        values_by_domain.setdefault(d_name, []).append(v.content)

    top_activities = [
        a.name for a in sorted(all_activities, key=lambda x: x.difficulty_rank or 99)[:10]
    ]

    daily_moods_7d = (
        db.query(DailyMood)
        .filter(DailyMood.user_id == user_id, DailyMood.date >= week_start_str)
        .all()
    )
    daily_moods_last = (
        db.query(DailyMood)
        .filter(
            DailyMood.user_id == user_id,
            DailyMood.date >= last_week_start_str,
            DailyMood.date < week_start_str,
        )
        .all()
    )

    moods_7d = [m.mood_score for m in daily_moods_7d]
    moods_last = [m.mood_score for m in daily_moods_last]
    avg_mood_this_week = round(sum(moods_7d) / len(moods_7d), 1) if moods_7d else None
    avg_mood_last_week = round(sum(moods_last) / len(moods_last), 1) if moods_last else None

    if avg_mood_this_week is not None and avg_mood_last_week is not None:
        diff = avg_mood_this_week - avg_mood_last_week
        mood_trend = "improving" if diff > 0.5 else ("declining" if diff < -0.5 else "stable")
    else:
        mood_trend = "stable"

    consecutive_good_mood = 0
    for m in [avg_mood_this_week, avg_mood_last_week]:
        if m is not None and m >= 7:
            consecutive_good_mood += 1
        else:
            break

    today_daily_mood = next((m.mood_score for m in daily_moods_7d if m.date == today_str), None)

    today_planned_all = (
        db.query(PlannedActivity)
        .filter(PlannedActivity.user_id == user_id, PlannedActivity.scheduled_date == today_str)
        .all()
    )
    today_planned_names = [p.activity_name for p in today_planned_all]
    today_completed_names = [p.activity_name for p in today_planned_all if p.completed]
    today_recorded_names = [r.activity for r in today_records if r.activity]

    trigger_logs_all = (
        db.query(TriggerLog).filter(TriggerLog.user_id == user_id).all()
    )
    last_trigger_dates = {t.trigger_type: t.last_executed for t in trigger_logs_all}

    def _cooldown_ok(trigger_type: str) -> bool:
        days = TRIGGER_COOLDOWNS.get(trigger_type, 7)
        last = last_trigger_dates.get(trigger_type)
        if last is None:
            return True
        return (now - last).days >= days

    def _days_since_log(trigger_type: str) -> Optional[int]:
        last = last_trigger_dates.get(trigger_type)
        return (now - last).days if last is not None else None

    active_triggers = []

    if (days_since_registration > 2 and consecutive_days_no_record >= 3
            and _cooldown_ok("monitoring_troubleshoot")):
        active_triggers.append("monitoring_troubleshoot")

    if _cooldown_ok("life_area_balance") and total_acts > 0:
        if dominant_ratio > 0.70 or len(life_areas_without) >= 2:
            active_triggers.append("life_area_balance")

    days_since_first_review = _days_since_log("phase_session:first_review")
    if (days_since_first_review is not None and days_since_first_review >= 21
            and _cooldown_ok("support_contract_review")):
        active_triggers.append("support_contract_review")

    days_since_setup = _days_since_log("phase_session:setup")
    if (days_since_setup is not None and days_since_setup >= 21
            and _cooldown_ok("values_review")):
        active_triggers.append("values_review")

    completed_planned_activities_ever = db.query(PlannedActivity).filter(
        PlannedActivity.user_id == user_id,
        PlannedActivity.completed == True,
    ).count()

    if (completed_planned_activities_ever >= 1
            and _cooldown_ok("first_plan_completed_celebration")):
        active_triggers.append("first_plan_completed_celebration")

    if (completed_planned_activities_ever >= 7
            and _cooldown_ok("plan_completed_7_celebration")):
        active_triggers.append("plan_completed_7_celebration")

    active_triggers.sort(key=lambda t: TRIGGER_PRIORITY.index(t) if t in TRIGGER_PRIORITY else 99)
    top_trigger = active_triggers[:1]

    total_records_count = db.query(MoodRecord).filter(MoodRecord.user_id == user_id).count()
    activity_count_total = db.query(Activity).filter(Activity.user_id == user_id).count()
    planned_count_ever = db.query(PlannedActivity).filter(PlannedActivity.user_id == user_id).count()

    return {
        "user_summary": user_summary,
        "days_since_registration": days_since_registration,
        "total_records_count": total_records_count,
        "activity_count": activity_count_total,
        "planned_count_ever": planned_count_ever,
        "is_first_conversation": is_first_conversation,
        "total_records_this_week": total_records_this_week,
        "consecutive_days_no_record": consecutive_days_no_record,
        "avg_daily_records": avg_daily_records,
        "avg_enjoyment_score": avg_enjoyment_score,
        "avg_importance_score": avg_importance_score,
        "high_importance_low_enjoyment_ratio": high_importance_low_enjoyment_ratio,
        "planned_activities_this_week": len(this_week_planned),
        "completed_planned_activities": sum(1 for p in this_week_planned if p.completed),
        "this_week_activity_plan": [
            {"name": p.activity_name, "date": p.scheduled_date, "completed": p.completed}
            for p in sorted(this_week_planned, key=lambda x: x.scheduled_date)
        ],
        "completion_rate_this_week": completion_rate_this_week,
        "completion_rate_last_week": completion_rate_last_week,
        "completion_rate_two_weeks_ago": completion_rate_two_weeks,
        "consecutive_weeks_high_completion": consecutive_high,
        "consecutive_weeks_low_completion": consecutive_low,
        "repeatedly_incomplete_activities": repeatedly_incomplete,
        "total_incomplete_two_weeks": total_incomplete_14d,
        "has_values": has_values,
        "has_activities": has_activities,
        "values_quality_issue": values_quality_issue,
        "activities_quality_issue": activities_quality_issue,
        "life_areas_with_activities": life_areas_with,
        "life_areas_without_activities": life_areas_without,
        "dominant_life_area_ratio": dominant_ratio,
        "avg_mood_this_week": avg_mood_this_week,
        "avg_mood_last_week": avg_mood_last_week,
        "mood_trend": mood_trend,
        "consecutive_weeks_good_mood": consecutive_good_mood,
        "today_planned_activities": today_planned_names,
        "today_completed_activities": today_completed_names,
        "today_recorded_activities": today_recorded_names,
        "today_mood": today_daily_mood,
        "user_values_summary": values_by_domain,
        "user_top_activities": top_activities,
        "active_triggers": top_trigger,
        "recent_activity_records": recent_activity_records,
    }


def _phase_session_start(
    db: Session,
    user_id: str,
    intent: str,
    before: datetime,
    fallback: datetime,
    min_phase_step: Optional[int] = None,
) -> datetime:
    query = db.query(ChatSession).filter(
        ChatSession.user_id == user_id,
        ChatSession.session_intent == intent,
        ChatSession.created_at < before,
    )
    if min_phase_step is not None:
        query = query.filter(ChatSession.phase_step >= min_phase_step)
    previous = query.order_by(ChatSession.created_at.desc()).first()
    return previous.created_at if previous else fallback


def _apply_phase_review_window(
    db: Session,
    state: dict,
    user_id: str,
    start: datetime,
    end: datetime,
) -> None:
    start_date = start.strftime("%Y-%m-%d")
    end_date = end.strftime("%Y-%m-%d")
    all_domains = db.query(LifeDomain).filter(LifeDomain.user_id.is_(None)).all()
    domain_id_to_name = {d.id: d.name for d in all_domains}

    records = (
        db.query(MoodRecord)
        .filter(
            MoodRecord.user_id == user_id,
            MoodRecord.timestamp >= start,
            MoodRecord.timestamp <= end,
        )
        .order_by(MoodRecord.timestamp.desc())
        .all()
    )
    plans = (
        db.query(PlannedActivity)
        .filter(
            PlannedActivity.user_id == user_id,
            PlannedActivity.scheduled_date >= start_date,
            PlannedActivity.scheduled_date <= end_date,
        )
        .order_by(PlannedActivity.scheduled_date.asc(), PlannedActivity.scheduled_time.asc().nulls_last())
        .all()
    )
    completed_plan_ids = {p.id for p in plans if p.completed}

    def _quadrant(record: MoodRecord) -> Optional[str]:
        if record.pleasure_score is None or record.importance_score is None:
            return None
        if record.pleasure_score >= 5 and record.importance_score >= 5:
            return "高愉悦高重要"
        if record.pleasure_score < 5 and record.importance_score >= 5:
            return "低愉悦高重要"
        if record.pleasure_score >= 5 and record.importance_score < 5:
            return "高愉悦低重要"
        return "低愉悦低重要"

    quadrant_items: dict[str, list[str]] = {
        "高愉悦高重要": [],
        "低愉悦高重要": [],
        "高愉悦低重要": [],
        "低愉悦低重要": [],
    }
    for record in records:
        q = _quadrant(record)
        if q and record.activity and len(quadrant_items[q]) < 3:
            quadrant_items[q].append(record.activity)

    recent_activity_records = [
        {
            "date": r.timestamp.strftime("%Y-%m-%d"),
            "activity": r.activity,
            "pleasure": r.pleasure_score,
            "importance": r.importance_score,
            "life_domain": domain_id_to_name.get(r.life_domain_id, "其他"),
            "planned_activity_id": r.planned_activity_id,
            "is_completed_plan": bool(r.planned_activity_id and r.planned_activity_id in completed_plan_ids),
        }
        for r in records
        if r.activity
    ][:8]

    records_by_id = {r.id: r for r in records}
    records_by_plan_id = {r.planned_activity_id: r for r in records if r.planned_activity_id}
    completed_plans_with_records = []
    for p in plans:
        if not p.completed:
            continue
        record = records_by_id.get(p.completion_record_id) if p.completion_record_id else records_by_plan_id.get(p.id)
        completed_plans_with_records.append({
            "id": p.id,
            "name": p.activity_name,
            "date": p.scheduled_date,
            "life_domain": domain_id_to_name.get(p.life_domain_id, "其他"),
            "completion_record_id": p.completion_record_id,
            "pleasure": record.pleasure_score if record else None,
            "importance": record.importance_score if record else None,
        })

    incomplete_counts = Counter(
        p.activity_name for p in plans if not p.completed
    )
    incomplete_plans = [
        {
            "id": p.id,
            "name": p.activity_name,
            "date": p.scheduled_date,
            "life_domain": domain_id_to_name.get(p.life_domain_id, "其他"),
            "repeatedly_incomplete": incomplete_counts[p.activity_name] >= 2
                or p.activity_name in state.get("repeatedly_incomplete_activities", []),
        }
        for p in plans
        if not p.completed
    ]

    planned_count = len(plans)
    completed_count = sum(1 for p in plans if p.completed)
    state.update({
        "review_window_start": start_date,
        "review_window_end": end_date,
        "total_records_this_week": len(records),
        "recent_activity_records": recent_activity_records,
        "planned_activities_this_week": planned_count,
        "completed_planned_activities": completed_count,
        "completion_rate_this_week": round(completed_count / planned_count, 2) if planned_count else 0.0,
        "this_week_activity_plan": [
            {
                "id": p.id,
                "name": p.activity_name,
                "date": p.scheduled_date,
                "completed": p.completed,
                "completion_record_id": p.completion_record_id,
                "life_domain": domain_id_to_name.get(p.life_domain_id, "其他"),
            }
            for p in plans
        ],
        "quadrant_summary": [
            {"name": name, "count": sum(1 for r in records if _quadrant(r) == name), "examples": examples}
            for name, examples in quadrant_items.items()
        ],
        "completed_plans_with_records": completed_plans_with_records,
        "incomplete_plans": incomplete_plans,
    })


# ── Activity tag parsing ──────────────────────────────────────────────────────

_ACT_TAG = re.compile(r'\[ACT:(done|plan):([^\]]{1,30})\]\s*$', re.MULTILINE)


def _extract_activity_tag(reply: str) -> tuple[str, Optional[dict]]:
    m = _ACT_TAG.search(reply)
    if not m:
        return reply, None
    act_type = "completed" if m.group(1) == "done" else "planned"
    act_name = m.group(2).strip()
    clean = reply[:m.start()].rstrip()
    return clean, {"type": act_type, "name": act_name}


# ── Trigger log helpers ───────────────────────────────────────────────────────

def _record_trigger(db: Session, user_id: str, trigger_type: str):
    log = db.query(TriggerLog).filter(
        TriggerLog.user_id == user_id,
        TriggerLog.trigger_type == trigger_type,
    ).first()
    if log:
        log.last_executed = datetime.now()
    else:
        db.add(TriggerLog(user_id=user_id, trigger_type=trigger_type))
    db.commit()


def _phase_completion_step(phase: str) -> int:
    return PHASE_SESSION_COMPLETION_STEPS.get(phase, 1)


def _phase_session_completed_since(
    db: Session,
    user_id: str,
    phase: str,
    since: datetime,
) -> bool:
    return db.query(ChatSession).join(
        ChatMessageRecord,
        ChatMessageRecord.session_id == ChatSession.id,
    ).filter(
        ChatSession.user_id == user_id,
        ChatSession.session_intent == f"phase:{phase}",
        ChatSession.phase_step >= _phase_completion_step(phase),
        ChatSession.created_at >= since,
        ChatMessageRecord.user_id == user_id,
        ChatMessageRecord.role == "user",
    ).first() is not None


# ── Session title background task ─────────────────────────────────────────────

async def _generate_session_title(session_id: int, context_messages: list[dict], language: str = "zh"):
    """Background task: ask LLM for a short session title, then save it."""
    db = SessionLocal()
    try:
        session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if not session or session.title:
            return  # Already titled or session gone

        lines = "\n".join(
            f"{'用户' if m['role'] == 'user' else '小暖'}: {m['content'][:120]}"
            for m in context_messages[:8]
        )
        if language == "en":
            system = "你是一个对话标题生成器。根据给定对话内容，输出一个3-8词的英文短语作为标题，不含标点，直接输出短语本身，例如：Work Stress Check In"
        else:
            system = "你是一个对话标题生成器。根据给定对话内容，输出一个5-10字的中文短语作为标题，不含标点，直接输出短语本身，例如：关于职场压力的讨论"
        title = await call_llm(system, lines)
        title = title.strip().strip("。，！？")[:60]

        session.title = title
        db.commit()
    except Exception:
        pass
    finally:
        db.close()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    user_id: str = "default_user"
    session_id: int
    message: str   # empty string = session-start trigger (no user message saved)
    session_intent: str | None = None  # e.g. "phase:intro" or "trigger:life_area_balance"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/state")
async def get_chatbot_state(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Return computed user state for the chatbot session."""
    return _compute_user_state(db, user_id)


@router.get("/debug/llm-stats")
async def get_debug_llm_stats():
    """Return process-local LLM retry counters. Does not include user content."""
    return get_llm_stats()


# ── Session endpoints (must be before /{session_id} style routes) ─────────────

@router.post("/session")
async def create_session(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Create a new chat session."""
    session = ChatSession(user_id=user_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at.isoformat(),
    }


@router.get("/session/current")
async def get_current_session(
    user_id: str = Query(default="default_user"),
    intent: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Return the most recent session, or the latest unfinished session for an intent."""
    query = db.query(ChatSession).filter(ChatSession.user_id == user_id)
    if intent:
        query = query.filter(ChatSession.session_intent == intent)
        if intent.startswith("phase:"):
            progress = _get_or_create_progress(db, user_id)
            phase = intent.removeprefix("phase:")
            query = query.filter(
                ChatSession.created_at >= progress.phase_unlocked_at,
                ChatSession.phase_step < _phase_completion_step(phase),
            )
    session = query.order_by(ChatSession.created_at.desc()).first()
    if not session:
        return None
    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at.isoformat(),
        "phase_step": session.phase_step,
        "session_intent": session.session_intent,
    }


@router.get("/sessions")
async def list_sessions(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Return all sessions for this user, newest first, with preview text."""
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.created_at.desc())
        .all()
    )
    result = []
    for s in sessions:
        first_user_msg = (
            db.query(ChatMessageRecord)
            .filter(
                ChatMessageRecord.session_id == s.id,
                ChatMessageRecord.role == "user",
            )
            .order_by(ChatMessageRecord.created_at.asc())
            .first()
        )
        result.append({
            "id": s.id,
            "title": s.title,
            "created_at": s.created_at.isoformat(),
            "preview": first_user_msg.content[:50] if first_user_msg else None,
        })
    return result


@router.get("/session/{session_id}/messages")
async def get_session_messages(
    session_id: int,
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Return all messages in a session, oldest first."""
    messages = (
        db.query(ChatMessageRecord)
        .filter(
            ChatMessageRecord.session_id == session_id,
            ChatMessageRecord.user_id == user_id,
        )
        .order_by(ChatMessageRecord.created_at.asc())
        .all()
    )
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]


@router.post("/chat")
async def chat(
    req: ChatRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    app_language: str | None = Header(default=None, alias="X-App-Language"),
):
    """Process a chat turn. Client sends session_id + single message; history is loaded from DB."""
    language = get_user_language(db, req.user_id, app_language)

    # Crisis detection before any LLM call
    if req.message.strip() and _is_crisis(req.message):
        return {
            "reply": localized_text("crisis_reply", language),
            "is_crisis": True,
            "detected_activity": None,
            "phase_step": None,
        }

    require_ai_access(db, req.user_id)

    # Load existing history from DB
    db_messages = (
        db.query(ChatMessageRecord)
        .filter(ChatMessageRecord.session_id == req.session_id)
        .order_by(ChatMessageRecord.created_at.asc())
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in db_messages]

    # Save the incoming user message (if non-empty)
    if req.message.strip():
        db.add(ChatMessageRecord(
            session_id=req.session_id,
            user_id=req.user_id,
            role="user",
            content=req.message.strip(),
        ))
        db.commit()

    # Build LLM payload: last 20 messages + new user message
    llm_messages = history[-20:]
    if req.message.strip():
        llm_messages = llm_messages + [{"role": "user", "content": req.message.strip()}]

    # Compute user state
    state = _compute_user_state(db, req.user_id)
    companion_name = "小暖"

    # Treatment module: manual advancement only. Chat no longer changes phases.
    progress = _get_or_create_progress(db, req.user_id)
    cfg = _get_or_create_config(db)
    _sync_review_cycle_count(db, cfg, progress)
    state["treatment_phase"] = progress.phase
    state["review_cycle_count"] = progress.review_cycle_count
    state["treatment_phase_days"] = (datetime.now() - progress.phase_unlocked_at).days

    # Resolve session intent: use request value if provided, else fall back to stored value
    phase_session_obj = db.query(ChatSession).filter(ChatSession.id == req.session_id).first()
    effective_intent = req.session_intent
    if phase_session_obj:
        if req.session_intent and not phase_session_obj.session_intent:
            phase_session_obj.session_intent = req.session_intent
            db.commit()
        elif not req.session_intent:
            effective_intent = phase_session_obj.session_intent

    response_phase_step = None

    if effective_intent and effective_intent.startswith("phase:") and phase_session_obj:
        now = datetime.now()
        if progress.phase == "first_review":
            fallback = progress.phase_unlocked_at - timedelta(days=7)
            start = _phase_session_start(db, req.user_id, "phase:setup", phase_session_obj.created_at, fallback)
            _apply_phase_review_window(db, state, req.user_id, start, now)
        elif progress.phase == "review_cycle":
            start = _phase_session_start(db, req.user_id, "phase:review_cycle", phase_session_obj.created_at, progress.phase_unlocked_at)
            _apply_phase_review_window(db, state, req.user_id, start, now)

    free_chat_route = None
    manual_context = ""
    if effective_intent is None:
        free_chat_route = await classify_free_chat_mode(req.message, history, state)
        if free_chat_route and (
            free_chat_route.get("primary_mode") == "D_principle_qa"
            or "D_principle_qa" in free_chat_route.get("secondary_modes", [])
        ):
            from app.rag import retrieve_manual_context
            manual_context = await retrieve_manual_context(req.message)

    system = chatbot_system_prompt(
        state,
        companion_name,
        db=db,
        session_intent=effective_intent,
        free_chat_route=free_chat_route,
        manual_context=manual_context,
    )

    # Inject step tracking for phase sessions
    if effective_intent and effective_intent.startswith("phase:"):
        current_step = phase_session_obj.phase_step if phase_session_obj else 0
        response_phase_step = current_step
        system += (
            f"\n\n---\n"
            f"[步骤追踪] 当前必须执行：Part {current_step}。"
            f"请严格按照 Part {current_step} 的内容作答。"
            f"如果当前 Part 内容较长，不要压缩成一条消息讲完；每轮只讲一个内容点，控制在 120-250 个中文字符。"
            f"如果本条回复只交付了 Part {current_step} 的一部分，或只是在回应用户追问，不要追加 [STEP_DONE]。"
            f"下一轮仍在同一个 Part 时，请根据历史继续讲尚未完成的下一个小内容点，不要重复前文。"
            f"只有当 Part {current_step} 的必要内容已经完整交付，且用户基本理解或愿意继续时，才在回复最末尾追加 [STEP_DONE]（用户看不到此标记）。"
        )

    system += output_language_rule(language)

    # yunwu.ai (and most OpenAI-compatible APIs) reject requests with zero user
    # messages. Inject a sentinel when session-start trigger fires on empty history.
    if not llm_messages:
        llm_messages = [{"role": "user", "content": "Please start the conversation" if language == "en" else "请开始对话"}]

    # Call LLM
    reply = await call_llm_chat(system, llm_messages)

    # Record trigger usage for cooldowns. Phase sessions are recorded only after
    # the final step is completed, so opening/leaving the page does not count.
    if req.session_intent and req.session_intent.startswith("trigger:"):
        trigger_key = req.session_intent.removeprefix("trigger:")
        _record_trigger(db, req.user_id, trigger_key)

    # Strip hidden [ACT:...] tag
    reply, detected = _extract_activity_tag(reply)

    # Strip [STEP_DONE] marker and advance phase_step
    if "[STEP_DONE]" in reply:
        reply = reply.replace("[STEP_DONE]", "").strip()
        if phase_session_obj:
            phase_session_obj.phase_step = (phase_session_obj.phase_step or 0) + 1
            response_phase_step = phase_session_obj.phase_step
            if (effective_intent and effective_intent.startswith("phase:")
                    and phase_session_obj.phase_step >= _phase_completion_step(progress.phase)):
                _record_trigger(db, req.user_id, f"phase_session:{progress.phase}")
            db.commit()

    # Save assistant reply to DB
    db.add(ChatMessageRecord(
        session_id=req.session_id,
        user_id=req.user_id,
        role="assistant",
        content=reply,
    ))
    db.commit()

    # Schedule title generation after first real user message in the session
    session = db.query(ChatSession).filter(ChatSession.id == req.session_id).first()
    if session and not session.title and req.message.strip():
        title_ctx = (llm_messages + [{"role": "assistant", "content": reply}])[-8:]
        background_tasks.add_task(_generate_session_title, req.session_id, title_ctx, language)

    return {
        "reply": reply,
        "is_crisis": False,
        "detected_activity": detected,
        "phase_step": response_phase_step,
        "free_chat_route": free_chat_route,
    }


@router.get("/treatment/progress")
async def get_treatment_progress(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Return the user's current treatment phase with detailed criteria status."""
    progress = _get_or_create_progress(db, user_id)
    cfg = _get_or_create_config(db)
    _sync_review_cycle_count(db, cfg, progress)
    now = datetime.now()
    phase_days = (now - progress.phase_unlocked_at).days

    phase = progress.phase
    cycle = progress.review_cycle_count
    phase_scatter_start = None
    phase_scatter_end = None
    if phase == "setup":
        phase_scatter_start = (
            progress.phase_unlocked_at - timedelta(days=max(1, cfg.intro_days))
        ).strftime("%Y-%m-%d")
        phase_scatter_end = now.strftime("%Y-%m-%d")
    elif phase == "first_review":
        phase_scatter_start = (
            _phase_session_start(
                db,
                user_id,
                "phase:setup",
                now,
                progress.phase_unlocked_at - timedelta(days=max(1, cfg.setup_days)),
                min_phase_step=2,
            )
        ).strftime("%Y-%m-%d")
        phase_scatter_end = now.strftime("%Y-%m-%d")
    elif phase == "review_cycle":
        phase_scatter_start = _phase_session_start(
            db,
            user_id,
            "phase:review_cycle",
            now,
            progress.phase_unlocked_at,
            min_phase_step=4,
        ).strftime("%Y-%m-%d")
        phase_scatter_end = now.strftime("%Y-%m-%d")

    PHASE_LABELS = {
        "intro":        "阶段1 · 启动监测",
        "setup":        "阶段2 · 价值观 × 活动 × 计划",
        "first_review": "阶段3 · 首次回顾",
        "review_cycle": f"执行循环 · 第 {cycle} 轮",
    }

    eligibility = _phase_can_advance(db, user_id, cfg, progress)
    days_required = eligibility["days_required"]
    days_until_eligible = eligibility["days_until_eligible"]
    criteria = eligibility["criteria"]
    criteria_met = eligibility["criteria_met"]
    phase_session_done = eligibility["phase_session_done"]
    can_advance = eligibility["can_advance"]
    tasks_required = eligibility["tasks_required"]

    if phase == "review_cycle":
        cycle_days = max(1, cfg.review_cycle_days)
        days_into_cycle = phase_days % cycle_days
        days_until_eligible = max(0, cycle_days - days_into_cycle)
    manual_advance_enabled = cfg.manual_advance_enabled is not False

    # Compute active trigger for display (reuse state computation)
    state = _compute_user_state(db, user_id)
    active_trigger = state["active_triggers"][0] if state["active_triggers"] else None
    # Also surface any dev-injected trigger
    is_debug_trigger = False
    if user_id in _debug_triggers:
        active_trigger = _debug_triggers[user_id]
        is_debug_trigger = True

    if (active_trigger in MESSAGE_ONLY_TRIGGERS
            and not is_debug_trigger):
        _record_trigger(db, user_id, active_trigger)

    # Message-only triggers stay visible as a same-day reminder after first display.
    cutoff = datetime.now() - timedelta(hours=24)
    recent_logs = db.query(TriggerLog).filter(
        TriggerLog.user_id == user_id,
        TriggerLog.last_executed >= cutoff,
    ).all()
    recently_triggered = [t.trigger_type for t in recent_logs]
    if active_trigger is None:
        recent_message_triggers = [
            t.trigger_type
            for t in recent_logs
            if t.trigger_type in MESSAGE_ONLY_TRIGGERS
        ]
        recent_message_triggers.sort(
            key=lambda t: TRIGGER_PRIORITY.index(t) if t in TRIGGER_PRIORITY else 99
        )
        active_trigger = recent_message_triggers[0] if recent_message_triggers else None

    return {
        "phase": phase,
        "phase_label": PHASE_LABELS.get(phase, phase),
        "review_cycle_count": cycle,
        "phase_days": phase_days,
        "days_required": days_required,
        "days_until_eligible": days_until_eligible,
        "criteria": criteria,
        "criteria_met": criteria_met,
        "tasks_required": tasks_required,
        "can_advance": can_advance,
        "manual_advance_enabled": manual_advance_enabled,
        "active_trigger": active_trigger,
        "recently_triggered": recently_triggered,
        "phase_session_done": phase_session_done,
        "phase_scatter_start_date": phase_scatter_start,
        "phase_scatter_end_date": phase_scatter_end,
    }


class TreatmentDebugRequest(BaseModel):
    user_id: str = "default_user"
    phase: str                    # intro | setup | first_review | review_cycle
    phase_days: int = 7           # 模拟已在该阶段过了多少天（>=7 可触发解锁检查）
    review_cycle_count: int = 1   # review_cycle 阶段用


class TriggerDebugRequest(BaseModel):
    user_id: str = "default_user"
    trigger: str | None = None    # None = clear pending trigger


@router.put("/treatment/debug-trigger")
async def debug_set_trigger(req: TriggerDebugRequest):
    """[开发用] 注入一个触发消息/对话（忽略条件和冷却期）。trigger=null 清除。"""
    valid = set(TRIGGER_PRIORITY)
    if req.trigger is not None and req.trigger not in valid:
        return {"ok": False, "error": f"trigger must be one of {valid}"}
    if req.trigger is None:
        _debug_triggers.pop(req.user_id, None)
    else:
        _debug_triggers[req.user_id] = req.trigger
    return {"ok": True, "pending_trigger": req.trigger}


@router.put("/treatment/debug")
async def debug_set_treatment_phase(req: TreatmentDebugRequest, db: Session = Depends(get_db)):
    """[开发用] 直接设置治疗阶段，跳过时间门槛。"""
    valid_phases = {"intro", "setup", "first_review", "review_cycle"}
    if req.phase not in valid_phases:
        return {"ok": False, "error": f"phase must be one of {valid_phases}"}

    progress = _get_or_create_progress(db, req.user_id)
    progress.phase = req.phase
    progress.review_cycle_count = req.review_cycle_count if req.phase == "review_cycle" else 0
    # 把 phase_unlocked_at 设为 req.phase_days 天前，这样 phase_age_days 就等于 req.phase_days
    progress.phase_unlocked_at = datetime.now() - timedelta(days=req.phase_days)
    progress.updated_at = datetime.now()
    # 清除该阶段的 phase_session 日志，确保"本阶段会话"按钮重新显示
    db.query(TriggerLog).filter(
        TriggerLog.user_id == req.user_id,
        TriggerLog.trigger_type == f"phase_session:{req.phase}",
    ).delete()
    db.query(ChatSession).filter(
        ChatSession.user_id == req.user_id,
        ChatSession.session_intent == f"phase:{req.phase}",
    ).update(
        {
            ChatSession.phase_step: 0,
            ChatSession.session_intent: None,
        },
        synchronize_session=False,
    )
    db.commit()
    return {"ok": True, "phase": progress.phase, "phase_days": req.phase_days}


class AdvancePhaseRequest(BaseModel):
    user_id: str = "default_user"


@router.post("/treatment/advance")
async def advance_phase(req: AdvancePhaseRequest, db: Session = Depends(get_db)):
    """Manually enter the next phase after session, task, and time requirements pass."""
    progress = _get_or_create_progress(db, req.user_id)
    cfg = _get_or_create_config(db)
    phase = progress.phase
    now = datetime.now()

    if cfg.manual_advance_enabled is False:
        return {"ok": False, "reason": "manual_advance_disabled"}

    eligibility = _phase_can_advance(db, req.user_id, cfg, progress)
    if not eligibility["phase_session_done"]:
        return {"ok": False, "reason": "phase_session_not_completed"}
    if not eligibility["criteria_met"]:
        return {"ok": False, "reason": "criteria_not_met"}
    if not eligibility["time_met"]:
        return {"ok": False, "reason": "time_not_met"}
    if not eligibility["can_advance"]:
        return {"ok": False, "reason": "no_next_phase"}

    if phase == "intro":
        progress.phase = "setup"
        progress.phase_unlocked_at = now
        progress.updated_at = now
        db.commit()
        return {"ok": True, "new_phase": "setup"}

    elif phase == "setup":
        progress.phase = "first_review"
        progress.phase_unlocked_at = now
        progress.updated_at = now
        db.commit()
        return {"ok": True, "new_phase": "first_review"}

    elif phase == "first_review":
        progress.phase = "review_cycle"
        progress.review_cycle_count = 1
        progress.phase_unlocked_at = now
        progress.updated_at = now
        db.commit()
        return {"ok": True, "new_phase": "review_cycle"}

    return {"ok": False, "reason": "no_next_phase"}


