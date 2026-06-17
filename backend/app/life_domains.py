"""Helpers for the global BATD-R life domain reference data."""

import uuid
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import Activity, LifeDomain, MoodRecord, PlannedActivity, Value


DEFAULT_LIFE_DOMAINS = [
    {"name": "亲密关系", "description": "家人、伴侣、朋友等亲近关系"},
    {"name": "教育与职业", "description": "学习、工作、职业发展"},
    {"name": "休闲兴趣", "description": "爱好、娱乐、创意活动"},
    {"name": "自我关怀", "description": "身体健康、心理健康、精神成长"},
    {"name": "日常责任", "description": "家务、生活管理、社会责任"},
]


def ensure_global_life_domains(db: Session) -> list[LifeDomain]:
    """Ensure the fixed global life domains exist and return them in canonical order."""
    domains: list[LifeDomain] = []
    for item in DEFAULT_LIFE_DOMAINS:
        domain = (
            db.query(LifeDomain)
            .filter(LifeDomain.user_id.is_(None), LifeDomain.name == item["name"])
            .first()
        )
        if not domain:
            domain = LifeDomain(
                id=str(uuid.uuid4()),
                user_id=None,
                name=item["name"],
                description=item["description"],
            )
            db.add(domain)
            db.flush()
        domains.append(domain)
    db.commit()
    for domain in domains:
        db.refresh(domain)
    return domains


def _update_domain_refs(db: Session, old_ids: Iterable[str], new_id: str) -> None:
    old_ids = list(old_ids)
    if not old_ids:
        return
    for model in (Value, Activity, PlannedActivity, MoodRecord):
        (
            db.query(model)
            .filter(model.life_domain_id.in_(old_ids))
            .update({model.life_domain_id: new_id}, synchronize_session=False)
        )


def migrate_life_domains_to_global(db: Session) -> None:
    """Collapse per-user life domain duplicates into the fixed global domain rows."""
    for item in DEFAULT_LIFE_DOMAINS:
        matching = (
            db.query(LifeDomain)
            .filter(LifeDomain.name == item["name"])
            .order_by(LifeDomain.created_at.asc())
            .all()
        )
        if matching:
            canonical = next((d for d in matching if d.user_id is None), matching[0])
            canonical.user_id = None
            canonical.description = canonical.description or item["description"]
            duplicate_ids = [d.id for d in matching if d.id != canonical.id]
            _update_domain_refs(db, duplicate_ids, canonical.id)
            for duplicate in matching:
                if duplicate.id != canonical.id:
                    db.delete(duplicate)
        else:
            db.add(
                LifeDomain(
                    id=str(uuid.uuid4()),
                    user_id=None,
                    name=item["name"],
                    description=item["description"],
                )
            )
    db.commit()
    ensure_global_life_domains(db)
