"""Chatbot router — BA companion chatbot (BATD-R)."""

import json
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.llm_client import call_llm, call_llm_chat
from app.models import (
    User, MoodRecord, PlannedActivity, DailyMood,
    Activity, Value, LifeDomain,
    TriggerLog, CompanionSettings,
    ChatSession, ChatMessageRecord,
    TreatmentProgress, PhaseConfig,
)
from app.prompts import chatbot_system_prompt

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
    "values_quality_guidance",
    "difficulty_adjustment_down",
    "busy_but_depressed",
    "desynchrony_explanation",
    "life_area_balance",
    "values_review",
    "difficulty_adjustment_up",
    "maintenance_planning",
]

TRIGGER_COOLDOWNS = {
    "monitoring_troubleshoot": 7,
    "values_quality_guidance": 7,
    "busy_but_depressed": 14,
    "desynchrony_explanation": 14,
    "life_area_balance": 14,
    "values_review": 21,
    "difficulty_adjustment_up": 14,
    "difficulty_adjustment_down": 7,
    "maintenance_planning": 30,
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


def _check_and_advance_phase(db: Session, user_id: str, user_state: dict, progress: TreatmentProgress):
    """Check unlock criteria and auto-advance to the next phase if met. Mutates progress in DB."""
    cfg = _get_or_create_config(db)
    now = datetime.now()
    phase = progress.phase
    phase_age_days = (now - progress.phase_unlocked_at).days

    if phase == "intro":
        time_ok = (not cfg.intro_time_limit) or (phase_age_days >= cfg.intro_days)
        total_records = db.query(MoodRecord).filter(MoodRecord.user_id == user_id).count()
        if time_ok and total_records >= cfg.intro_records_target:
            progress.phase = "setup"
            progress.phase_unlocked_at = now
            progress.updated_at = now
            db.commit()

    elif phase == "setup":
        time_ok = (not cfg.setup_time_limit) or (phase_age_days >= cfg.setup_days)
        values_count = db.query(Value).filter(Value.user_id == user_id).count()
        activity_count = db.query(Activity).filter(Activity.user_id == user_id).count()
        planned_ever = db.query(PlannedActivity).filter(PlannedActivity.user_id == user_id).count()
        if (time_ok and values_count >= cfg.setup_values_target
                and activity_count >= cfg.setup_activities_target
                and planned_ever >= cfg.setup_plans_target):
            progress.phase = "first_review"
            progress.phase_unlocked_at = now
            progress.updated_at = now
            db.commit()

    elif phase == "first_review":
        time_ok = (not cfg.first_review_time_limit) or (phase_age_days >= cfg.first_review_days)
        any_completed = db.query(PlannedActivity).filter(
            PlannedActivity.user_id == user_id,
            PlannedActivity.completed == True,
        ).count()
        if time_ok and any_completed >= cfg.first_review_completed_target:
            progress.phase = "review_cycle"
            progress.review_cycle_count = 1
            progress.phase_unlocked_at = now
            progress.updated_at = now
            db.commit()

    elif phase == "review_cycle":
        cycle_days = max(1, cfg.review_cycle_days)
        days_in_phase = (now - progress.phase_unlocked_at).days
        expected_count = max(1, days_in_phase // cycle_days + 1)
        if expected_count > progress.review_cycle_count:
            progress.review_cycle_count = expected_count
            progress.updated_at = now
            db.commit()


# ── User state computation ────────────────────────────────────────────────────

def _compute_user_state(db: Session, user_id: str) -> dict:
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")

    user = db.query(User).filter(User.id == user_id).first()
    days_since_registration = (now - user.created_at).days if user and user.created_at else 0

    cs = db.query(CompanionSettings).filter(CompanionSettings.user_id == user_id).first()
    companion_name = cs.companion_name if cs else "小暖"
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

    recent_activity_records = [
        {"activity": r.activity, "pleasure": r.pleasure_score, "importance": r.importance_score}
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

    all_domains = db.query(LifeDomain).filter(LifeDomain.user_id == user_id).all()
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

    domain_id_to_name = {d.id: d.name for d in all_domains}
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

    active_triggers = []

    if (days_since_registration > 2 and consecutive_days_no_record >= 3
            and _cooldown_ok("monitoring_troubleshoot")):
        active_triggers.append("monitoring_troubleshoot")

    if _cooldown_ok("busy_but_depressed") and avg_daily_records >= 5:
        if avg_enjoyment_score is not None and avg_enjoyment_score < 4:
            active_triggers.append("busy_but_depressed")
        elif high_importance_low_enjoyment_ratio > 0.70:
            active_triggers.append("busy_but_depressed")

    if (completion_rate_this_week >= 0.70 and completion_rate_last_week >= 0.70
            and mood_trend != "improving" and _cooldown_ok("desynchrony_explanation")):
        active_triggers.append("desynchrony_explanation")

    if _cooldown_ok("life_area_balance") and total_acts > 0:
        if dominant_ratio > 0.70 or len(life_areas_without) >= 2:
            active_triggers.append("life_area_balance")

    if (activities_quality_issue is not None or values_quality_issue is not None) \
            and _cooldown_ok("values_quality_guidance"):
        active_triggers.append("values_quality_guidance")

    if days_since_registration >= 28 and _cooldown_ok("values_review"):
        active_triggers.append("values_review")

    if (consecutive_high >= 2 and mood_trend == "improving"
            and _cooldown_ok("difficulty_adjustment_up")):
        active_triggers.append("difficulty_adjustment_up")

    if consecutive_low >= 2 and _cooldown_ok("difficulty_adjustment_down"):
        active_triggers.append("difficulty_adjustment_down")

    if (consecutive_good_mood >= 4 and completion_rate_this_week >= 0.70
            and _cooldown_ok("maintenance_planning")):
        active_triggers.append("maintenance_planning")

    active_triggers.sort(key=lambda t: TRIGGER_PRIORITY.index(t) if t in TRIGGER_PRIORITY else 99)
    top_trigger = active_triggers[:1]

    total_records_count = db.query(MoodRecord).filter(MoodRecord.user_id == user_id).count()
    activity_count_total = db.query(Activity).filter(Activity.user_id == user_id).count()
    planned_count_ever = db.query(PlannedActivity).filter(PlannedActivity.user_id == user_id).count()

    return {
        "companion_name": companion_name,
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


# ── Session title background task ─────────────────────────────────────────────

async def _generate_session_title(session_id: int, context_messages: list[dict]):
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


class CompanionNameRequest(BaseModel):
    user_id: str = "default_user"
    companion_name: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/state")
async def get_chatbot_state(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Return computed user state for the chatbot session."""
    return _compute_user_state(db, user_id)


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
    db: Session = Depends(get_db),
):
    """Return the most recent session for this user, or null if none."""
    session = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.created_at.desc())
        .first()
    )
    if not session:
        return None
    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at.isoformat(),
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
):
    """Process a chat turn. Client sends session_id + single message; history is loaded from DB."""
    # Crisis detection before any LLM call
    if req.message.strip() and _is_crisis(req.message):
        return {
            "reply": (
                "你说的这些让我很担心你。我很希望你能跟现实中的人聊聊。\n\n"
                "你可以拨打**全国心理援助热线 400-161-9995**，或者联系你身边信任的人。\n\n"
                "如果你现在觉得不安全，请联系 120 或去最近的医院急诊。\n\n"
                "我会一直在这里，随时告诉我你的情况。"
            ),
            "is_crisis": True,
            "detected_activity": None,
        }

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
    companion_name = state["companion_name"]

    # Treatment module: get progress, check advancement, inject into state
    progress = _get_or_create_progress(db, req.user_id)
    _check_and_advance_phase(db, req.user_id, state, progress)
    state["treatment_phase"] = progress.phase
    state["review_cycle_count"] = progress.review_cycle_count
    state["treatment_phase_days"] = (datetime.now() - progress.phase_unlocked_at).days

    system = chatbot_system_prompt(state, companion_name, db=db, session_intent=req.session_intent)

    # yunwu.ai (and most OpenAI-compatible APIs) reject requests with zero user
    # messages. Inject a sentinel when session-start trigger fires on empty history.
    if not llm_messages:
        llm_messages = [{"role": "user", "content": "请开始对话"}]

    # Call LLM
    reply = await call_llm_chat(system, llm_messages)

    # Record trigger/phase session usage (for cooldowns and phase_session_done tracking)
    if req.session_intent and req.session_intent.startswith("trigger:"):
        trigger_key = req.session_intent.removeprefix("trigger:")
        _record_trigger(db, req.user_id, trigger_key)
    elif req.session_intent and req.session_intent.startswith("phase:"):
        _record_trigger(db, req.user_id, f"phase_session:{progress.phase}")

    # Strip hidden [ACT:...] tag
    reply, detected = _extract_activity_tag(reply)

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
        background_tasks.add_task(_generate_session_title, req.session_id, title_ctx)

    return {
        "reply": reply,
        "is_crisis": False,
        "detected_activity": detected,
    }


@router.get("/treatment/progress")
async def get_treatment_progress(
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """Return the user's current treatment phase with detailed criteria status."""
    progress = _get_or_create_progress(db, user_id)
    cfg = _get_or_create_config(db)
    now = datetime.now()
    phase_days = (now - progress.phase_unlocked_at).days

    phase = progress.phase
    cycle = progress.review_cycle_count

    PHASE_LABELS = {
        "intro":        "阶段1 · 启动监测",
        "setup":        "阶段2 · 价值观 × 活动 × 计划",
        "first_review": "阶段3 · 首次回顾",
        "review_cycle": f"执行循环 · 第 {cycle} 轮",
    }

    # Compute time eligibility using config
    if phase == "intro":
        days_required = cfg.intro_days if cfg.intro_time_limit else None
    elif phase == "setup":
        days_required = cfg.setup_days if cfg.setup_time_limit else None
    elif phase == "first_review":
        days_required = cfg.first_review_days if cfg.first_review_time_limit else None
    else:
        days_required = None

    days_until_eligible = max(0, days_required - phase_days) if days_required is not None else 0

    # Build criteria list for each phase
    criteria = []
    if phase == "intro":
        total_records = db.query(MoodRecord).filter(MoodRecord.user_id == user_id).count()
        t = cfg.intro_records_target
        criteria = [{"key": "records", "label": f"提交至少{t}条活动记录",
                     "done": total_records >= t, "current": total_records, "target": t}]

    elif phase == "setup":
        values_count = db.query(Value).filter(Value.user_id == user_id).count()
        activity_count = db.query(Activity).filter(Activity.user_id == user_id).count()
        planned_ever = db.query(PlannedActivity).filter(PlannedActivity.user_id == user_id).count()
        vt = cfg.setup_values_target
        at = cfg.setup_activities_target
        pt = cfg.setup_plans_target
        criteria = [
            {"key": "values",     "label": f"填写至少{vt}条价值观",       "done": values_count >= vt,    "current": values_count,           "target": vt},
            {"key": "activities", "label": f"在活动库中添加至少{at}个活动", "done": activity_count >= at,  "current": activity_count,          "target": at},
            {"key": "planned",    "label": f"安排至少{pt}个计划活动",      "done": planned_ever >= pt,    "current": min(planned_ever, pt),   "target": pt},
        ]

    elif phase == "first_review":
        any_completed = db.query(PlannedActivity).filter(
            PlannedActivity.user_id == user_id,
            PlannedActivity.completed == True,
        ).count()
        ct = cfg.first_review_completed_target
        criteria = [
            {"key": "completed", "label": f"完成至少{ct}个计划活动", "done": any_completed >= ct,
             "current": min(any_completed, ct), "target": ct},
        ]

    elif phase == "review_cycle":
        cycle_days = max(1, cfg.review_cycle_days)
        days_into_cycle = phase_days % cycle_days
        days_until_eligible = max(0, cycle_days - days_into_cycle)
        criteria = []

    criteria_met = all(c["done"] for c in criteria) if criteria else True
    can_advance = criteria_met and days_until_eligible == 0 and phase != "review_cycle"

    # Compute active trigger for display (reuse state computation)
    state = _compute_user_state(db, user_id)
    active_trigger = state["active_triggers"][0] if state["active_triggers"] else None
    # Also surface any dev-injected trigger
    if user_id in _debug_triggers:
        active_trigger = _debug_triggers[user_id]

    # Triggers fired in the last 24 hours (show as "recently completed")
    cutoff = datetime.now() - timedelta(hours=24)
    recent_logs = db.query(TriggerLog).filter(
        TriggerLog.user_id == user_id,
        TriggerLog.last_executed >= cutoff,
    ).all()
    recently_triggered = [t.trigger_type for t in recent_logs]

    # Phase session done = started at least once since phase unlocked
    phase_session_log = db.query(TriggerLog).filter(
        TriggerLog.user_id == user_id,
        TriggerLog.trigger_type == f"phase_session:{phase}",
        TriggerLog.last_executed >= progress.phase_unlocked_at,
    ).first()
    phase_session_done = phase_session_log is not None

    return {
        "phase": phase,
        "phase_label": PHASE_LABELS.get(phase, phase),
        "review_cycle_count": cycle,
        "phase_days": phase_days,
        "days_required": days_required,
        "days_until_eligible": days_until_eligible,
        "criteria": criteria,
        "criteria_met": criteria_met,
        "can_advance": can_advance,
        "active_trigger": active_trigger,
        "recently_triggered": recently_triggered,
        "phase_session_done": phase_session_done,
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
    """[开发用] 注入一个触发对话，下次发送消息时生效（忽略条件和冷却期）。trigger=null 清除。"""
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
    db.commit()
    return {"ok": True, "phase": progress.phase, "phase_days": req.phase_days}


class AdvancePhaseRequest(BaseModel):
    user_id: str = "default_user"


@router.post("/treatment/advance")
async def advance_phase(req: AdvancePhaseRequest, db: Session = Depends(get_db)):
    """手动进入下一阶段：只检查任务标准，忽略时间限制。"""
    progress = _get_or_create_progress(db, req.user_id)
    cfg = _get_or_create_config(db)
    user_state = _compute_user_state(db, req.user_id)
    phase = progress.phase
    now = datetime.now()

    if phase == "intro":
        total_records = db.query(MoodRecord).filter(MoodRecord.user_id == req.user_id).count()
        if total_records >= cfg.intro_records_target:
            progress.phase = "setup"
            progress.phase_unlocked_at = now
            progress.updated_at = now
            db.commit()
            return {"ok": True, "new_phase": "setup"}
        return {"ok": False, "reason": "criteria_not_met"}

    elif phase == "setup":
        values_count = db.query(Value).filter(Value.user_id == req.user_id).count()
        activity_count = db.query(Activity).filter(Activity.user_id == req.user_id).count()
        planned_ever = db.query(PlannedActivity).filter(PlannedActivity.user_id == req.user_id).count()
        if (values_count >= cfg.setup_values_target
                and activity_count >= cfg.setup_activities_target
                and planned_ever >= cfg.setup_plans_target):
            progress.phase = "first_review"
            progress.phase_unlocked_at = now
            progress.updated_at = now
            db.commit()
            return {"ok": True, "new_phase": "first_review"}
        return {"ok": False, "reason": "criteria_not_met"}

    elif phase == "first_review":
        any_completed = db.query(PlannedActivity).filter(
            PlannedActivity.user_id == req.user_id,
            PlannedActivity.completed == True,
        ).count()
        if any_completed >= cfg.first_review_completed_target:
            progress.phase = "review_cycle"
            progress.review_cycle_count = 1
            progress.phase_unlocked_at = now
            progress.updated_at = now
            db.commit()
            return {"ok": True, "new_phase": "review_cycle"}
        return {"ok": False, "reason": "criteria_not_met"}

    return {"ok": False, "reason": "no_next_phase"}


@router.put("/companion-name")
async def set_companion_name(req: CompanionNameRequest, db: Session = Depends(get_db)):
    """Save or update the companion's name."""
    cs = db.query(CompanionSettings).filter(CompanionSettings.user_id == req.user_id).first()
    if cs:
        cs.companion_name = req.companion_name
        cs.updated_at = datetime.now()
    else:
        db.add(CompanionSettings(user_id=req.user_id, companion_name=req.companion_name))
    db.commit()
    return {"ok": True, "companion_name": req.companion_name}
