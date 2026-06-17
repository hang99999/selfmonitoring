import json
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AssessmentResult, User
from app.schemas import AssessmentResultCreate, AssessmentResultResponse

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


def _ensure_user(db: Session, user_id: str) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        db.add(User(id=user_id))
        db.commit()


def _to_response(result: AssessmentResult) -> AssessmentResultResponse:
    try:
        answers = json.loads(result.answers_json)
    except Exception:
        answers = []
    return AssessmentResultResponse(
        id=result.id,
        user_id=result.user_id,
        scale_type=result.scale_type,
        score=result.score,
        display_score=result.display_score,
        severity_level=result.severity_level,
        answers=answers,
        created_at=result.created_at,
    )


@router.post("", response_model=AssessmentResultResponse)
def create_assessment_result(body: AssessmentResultCreate, db: Session = Depends(get_db)):
    _ensure_user(db, body.user_id)
    result = AssessmentResult(
        id=str(uuid.uuid4()),
        user_id=body.user_id,
        scale_type=body.scale_type,
        score=body.score,
        display_score=body.display_score,
        severity_level=body.severity_level,
        answers_json=json.dumps(body.answers, ensure_ascii=False),
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return _to_response(result)


@router.get("", response_model=List[AssessmentResultResponse])
def list_assessment_results(
    user_id: str = Query(default="default_user"),
    scale_type: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(AssessmentResult).filter(AssessmentResult.user_id == user_id)
    if scale_type:
        query = query.filter(AssessmentResult.scale_type == scale_type)
    results = query.order_by(AssessmentResult.created_at.desc()).limit(limit).all()
    return [_to_response(result) for result in results]
