"""Activity library and planned activities router (BATD-R Form 2, 3, 4)."""

import json
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.access import require_ai_access
from app.database import get_db
from app.life_domains import ensure_global_life_domains
from app.models import User, LifeDomain, Value, Activity, PlannedActivity, DailyMood
from app.schemas import (
    LifeDomainCreate, LifeDomainResponse,
    ValueCreate, ValueResponse,
    ActivityCreate, ActivityResponse,
    PlannedActivityCreate, PlannedActivityResponse, PlannedActivityComplete,
    PlannedActivityReschedule,
    DailyMoodCreate, DailyMoodResponse,
)
from app.llm_client import call_llm

router = APIRouter(prefix="/api/activity", tags=["activities"])


def _ensure_user(db: Session, user_id: str):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id)
        db.add(user)
        db.commit()
    return user


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except Exception:
        return {}


# --- Life Domains ---

@router.get("/domains", response_model=List[LifeDomainResponse])
def list_domains(user_id: str = Query(default="default_user"), db: Session = Depends(get_db)):
    _ensure_user(db, user_id)
    return ensure_global_life_domains(db)


@router.post("/domains", response_model=LifeDomainResponse)
def create_domain(body: LifeDomainCreate, db: Session = Depends(get_db)):
    if body.user_id:
        _ensure_user(db, body.user_id)
    domain = LifeDomain(
        id=str(uuid.uuid4()),
        user_id=None,
        name=body.name,
        description=body.description,
    )
    db.add(domain)
    db.commit()
    db.refresh(domain)
    return domain


# --- Values ---

@router.get("/values", response_model=List[ValueResponse])
def list_values(
    user_id: str = Query(default="default_user"),
    life_domain_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Value).filter(Value.user_id == user_id)
    if life_domain_id:
        query = query.filter(Value.life_domain_id == life_domain_id)
    return query.all()


@router.post("/values", response_model=ValueResponse)
def create_value(body: ValueCreate, db: Session = Depends(get_db)):
    _ensure_user(db, body.user_id)
    domain = db.query(LifeDomain).filter(LifeDomain.id == body.life_domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Life domain not found")
    value = Value(
        id=str(uuid.uuid4()),
        user_id=body.user_id,
        life_domain_id=body.life_domain_id,
        content=body.content,
    )
    db.add(value)
    db.commit()
    db.refresh(value)
    return value


@router.delete("/values/{value_id}")
def delete_value(value_id: str, db: Session = Depends(get_db)):
    value = db.query(Value).filter(Value.id == value_id).first()
    if not value:
        raise HTTPException(status_code=404, detail="Value not found")
    db.delete(value)
    db.commit()
    return {"ok": True}


# --- Activities ---

@router.get("/list", response_model=List[ActivityResponse])
def list_activities(
    user_id: str = Query(default="default_user"),
    life_domain_id: Optional[str] = Query(default=None),
    value_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Activity).filter(Activity.user_id == user_id)
    if life_domain_id:
        query = query.filter(Activity.life_domain_id == life_domain_id)
    if value_id:
        query = query.filter(Activity.value_id == value_id)
    return query.order_by(Activity.difficulty_rank.asc().nulls_last()).all()


@router.post("/create", response_model=ActivityResponse)
def create_activity(body: ActivityCreate, db: Session = Depends(get_db)):
    _ensure_user(db, body.user_id)
    activity = Activity(
        id=str(uuid.uuid4()),
        user_id=body.user_id,
        value_id=body.value_id,
        life_domain_id=body.life_domain_id,
        name=body.name,
        difficulty_rank=body.difficulty_rank,
        is_in_library=True,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


@router.put("/{activity_id}/rank")
def update_activity_rank(
    activity_id: str,
    difficulty_rank: int = Query(..., ge=1, le=15),
    db: Session = Depends(get_db),
):
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    activity.difficulty_rank = difficulty_rank
    db.commit()
    return {"ok": True}


@router.delete("/{activity_id}")
def delete_activity(activity_id: str, db: Session = Depends(get_db)):
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    db.delete(activity)
    db.commit()
    return {"ok": True}


# --- Planned Activities ---

@router.get("/planned", response_model=List[PlannedActivityResponse])
def list_planned(
    user_id: str = Query(default="default_user"),
    date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    start_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    query = db.query(PlannedActivity).filter(PlannedActivity.user_id == user_id)
    if date:
        query = query.filter(PlannedActivity.scheduled_date == date)
    else:
        if start_date:
            query = query.filter(PlannedActivity.scheduled_date >= start_date)
        if end_date:
            query = query.filter(PlannedActivity.scheduled_date <= end_date)
    return query.order_by(PlannedActivity.scheduled_date.asc(), PlannedActivity.scheduled_time.asc().nulls_last()).all()


@router.post("/planned", response_model=PlannedActivityResponse)
def create_planned(body: PlannedActivityCreate, db: Session = Depends(get_db)):
    _ensure_user(db, body.user_id)
    planned = PlannedActivity(
        id=str(uuid.uuid4()),
        user_id=body.user_id,
        activity_id=body.activity_id,
        activity_name=body.activity_name,
        life_domain_id=body.life_domain_id,
        value_id=body.value_id,
        scheduled_date=body.scheduled_date,
        scheduled_time=body.scheduled_time,
        completed=False,
    )
    db.add(planned)
    db.commit()
    db.refresh(planned)
    return planned


@router.put("/planned/{planned_id}/complete", response_model=PlannedActivityResponse)
def complete_planned(
    planned_id: str,
    body: PlannedActivityComplete,
    db: Session = Depends(get_db),
):
    planned = db.query(PlannedActivity).filter(PlannedActivity.id == planned_id).first()
    if not planned:
        raise HTTPException(status_code=404, detail="Planned activity not found")
    planned.completed = True
    if body.completion_record_id:
        planned.completion_record_id = body.completion_record_id
    db.commit()
    db.refresh(planned)
    return planned


@router.put("/planned/{planned_id}/reschedule", response_model=PlannedActivityResponse)
def reschedule_planned(
    planned_id: str,
    body: PlannedActivityReschedule,
    db: Session = Depends(get_db),
):
    planned = db.query(PlannedActivity).filter(PlannedActivity.id == planned_id).first()
    if not planned:
        raise HTTPException(status_code=404, detail="Planned activity not found")
    planned.scheduled_date = body.scheduled_date
    planned.scheduled_time = body.scheduled_time
    db.commit()
    db.refresh(planned)
    return planned


@router.post("/planned/{planned_id}/breakdown")
async def breakdown_planned(planned_id: str, db: Session = Depends(get_db)):
    """Call LLM to break down a planned activity into smaller steps (BATD-R shaping principle)."""
    planned = db.query(PlannedActivity).filter(PlannedActivity.id == planned_id).first()
    if not planned:
        raise HTTPException(status_code=404, detail="Planned activity not found")
    require_ai_access(db, planned.user_id)

    sys_prompt = (
        "你是一个行为激活治疗助手，帮助用户将困难的活动拆解成更小、更容易执行的步骤。"
        "你的回复必须是简体中文，鼓励但不强迫。"
    )
    user_msg = (
        f"用户计划要做「{planned.activity_name}」，但感到有些困难、难以开始。\n"
        "请将这个活动拆解成3-5个更小、可立即执行的最小步骤。"
        "每个步骤应该足够小，不需要额外准备就能立刻开始做。"
        '请用JSON格式返回：{"steps": ["步骤1", "步骤2", ...]}'
    )
    result = await call_llm(sys_prompt, user_msg)
    data = _parse_json(result)
    steps = data.get("steps", [])
    if not isinstance(steps, list) or not steps:
        steps = [
            "先找一个安静舒适的地方，做3次深呼吸",
            f"把「{planned.activity_name}」想象成只需要做1分钟的事情",
            "先开始那1分钟，完成后再决定要不要继续",
            "完成任何一小步都值得给自己一个认可",
        ]
    return {"steps": steps}


@router.delete("/planned/{planned_id}")
def delete_planned(planned_id: str, db: Session = Depends(get_db)):
    planned = db.query(PlannedActivity).filter(PlannedActivity.id == planned_id).first()
    if not planned:
        raise HTTPException(status_code=404, detail="Planned activity not found")
    db.delete(planned)
    db.commit()
    return {"ok": True}


# --- Daily Mood ---

@router.post("/daily-mood", response_model=DailyMoodResponse)
def set_daily_mood(body: DailyMoodCreate, db: Session = Depends(get_db)):
    _ensure_user(db, body.user_id)
    existing = db.query(DailyMood).filter(
        DailyMood.user_id == body.user_id,
        DailyMood.date == body.date,
    ).first()
    if existing:
        existing.mood_score = body.mood_score
        db.commit()
        db.refresh(existing)
        return existing
    mood = DailyMood(
        id=str(uuid.uuid4()),
        user_id=body.user_id,
        date=body.date,
        mood_score=body.mood_score,
    )
    db.add(mood)
    db.commit()
    db.refresh(mood)
    return mood


@router.get("/daily-mood", response_model=Optional[DailyMoodResponse])
def get_daily_mood(
    user_id: str = Query(default="default_user"),
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    mood = db.query(DailyMood).filter(
        DailyMood.user_id == user_id,
        DailyMood.date == date,
    ).first()
    return mood
