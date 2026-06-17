"""Supporters router - social support network for behavioral activation."""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Supporter, PlannedActivitySupporter, PlannedActivity
from app.schemas import (
    SupporterCreate, SupporterUpdate, SupporterResponse,
    PlannedActivitySupporterCreate, PlannedActivitySupporterResponse,
)

router = APIRouter(prefix="/api/supporters", tags=["supporters"])


def _assoc_with_name(assoc: PlannedActivitySupporter, db: Session) -> PlannedActivitySupporterResponse:
    supporter = db.query(Supporter).filter(Supporter.id == assoc.supporter_id).first()
    return PlannedActivitySupporterResponse(
        id=assoc.id,
        planned_activity_id=assoc.planned_activity_id,
        supporter_id=assoc.supporter_id,
        help_description=assoc.help_description,
        created_at=assoc.created_at,
        supporter_name=supporter.name if supporter else None,
        supporter_relationship=supporter.relationship if supporter else None,
    )


# --- Supporter CRUD ---

@router.get("", response_model=List[SupporterResponse])
def list_supporters(user_id: str = Query(default="default_user"), db: Session = Depends(get_db)):
    return db.query(Supporter).filter(Supporter.user_id == user_id).order_by(Supporter.created_at).all()


@router.post("", response_model=SupporterResponse)
def create_supporter(body: SupporterCreate, db: Session = Depends(get_db)):
    supporter = Supporter(
        id=str(uuid.uuid4()),
        user_id=body.user_id,
        name=body.name,
        relationship=body.relationship,
        notes=body.notes,
    )
    db.add(supporter)
    db.commit()
    db.refresh(supporter)
    return supporter


@router.put("/{supporter_id}", response_model=SupporterResponse)
def update_supporter(supporter_id: str, body: SupporterUpdate, db: Session = Depends(get_db)):
    supporter = db.query(Supporter).filter(Supporter.id == supporter_id).first()
    if not supporter:
        raise HTTPException(status_code=404, detail="Supporter not found")
    if body.name is not None:
        supporter.name = body.name
    if body.relationship is not None:
        supporter.relationship = body.relationship
    if body.notes is not None:
        supporter.notes = body.notes
    db.commit()
    db.refresh(supporter)
    return supporter


@router.delete("/{supporter_id}")
def delete_supporter(supporter_id: str, db: Session = Depends(get_db)):
    supporter = db.query(Supporter).filter(Supporter.id == supporter_id).first()
    if not supporter:
        raise HTTPException(status_code=404, detail="Supporter not found")
    db.query(PlannedActivitySupporter).filter(
        PlannedActivitySupporter.supporter_id == supporter_id
    ).delete()
    db.delete(supporter)
    db.commit()
    return {"ok": True}


# --- Activity-Supporter Associations ---

@router.get("/planned/{planned_activity_id}", response_model=List[PlannedActivitySupporterResponse])
def list_activity_supporters(planned_activity_id: str, db: Session = Depends(get_db)):
    assocs = db.query(PlannedActivitySupporter).filter(
        PlannedActivitySupporter.planned_activity_id == planned_activity_id
    ).all()
    return [_assoc_with_name(a, db) for a in assocs]


@router.post("/planned/{planned_activity_id}", response_model=PlannedActivitySupporterResponse)
def add_activity_supporter(
    planned_activity_id: str,
    body: PlannedActivitySupporterCreate,
    db: Session = Depends(get_db),
):
    if not db.query(PlannedActivity).filter(PlannedActivity.id == planned_activity_id).first():
        raise HTTPException(status_code=404, detail="Planned activity not found")

    count = db.query(PlannedActivitySupporter).filter(
        PlannedActivitySupporter.planned_activity_id == planned_activity_id
    ).count()
    if count >= 3:
        raise HTTPException(status_code=400, detail="Maximum 3 supporters per activity")

    existing = db.query(PlannedActivitySupporter).filter(
        PlannedActivitySupporter.planned_activity_id == planned_activity_id,
        PlannedActivitySupporter.supporter_id == body.supporter_id,
    ).first()
    if existing:
        existing.help_description = body.help_description
        db.commit()
        db.refresh(existing)
        return _assoc_with_name(existing, db)

    assoc = PlannedActivitySupporter(
        id=str(uuid.uuid4()),
        planned_activity_id=planned_activity_id,
        supporter_id=body.supporter_id,
        help_description=body.help_description,
    )
    db.add(assoc)
    db.commit()
    db.refresh(assoc)
    return _assoc_with_name(assoc, db)


@router.delete("/planned/{planned_activity_id}/{supporter_id}")
def remove_activity_supporter(
    planned_activity_id: str,
    supporter_id: str,
    db: Session = Depends(get_db),
):
    assoc = db.query(PlannedActivitySupporter).filter(
        PlannedActivitySupporter.planned_activity_id == planned_activity_id,
        PlannedActivitySupporter.supporter_id == supporter_id,
    ).first()
    if not assoc:
        raise HTTPException(status_code=404, detail="Association not found")
    db.delete(assoc)
    db.commit()
    return {"ok": True}
