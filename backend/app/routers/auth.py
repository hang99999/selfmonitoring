"""Auth router — access code validation and user unlock."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, AccessCode
from app.schemas import UnlockRequest, UnlockResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/unlock", response_model=UnlockResponse)
async def unlock(req: UnlockRequest, db: Session = Depends(get_db)):
    """Validate invite code and unlock AI features for the user."""
    # Validate invite code
    code = db.query(AccessCode).filter(
        AccessCode.code == req.invite_code,
        AccessCode.is_active == True,
    ).first()
    if not code:
        raise HTTPException(status_code=400, detail="邀请码无效或已停用")

    # Ensure user exists
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        user = User(id=req.user_id)
        db.add(user)

    # Save participant code and unlock
    user.participant_code = req.participant_code.strip()
    user.is_unlocked = True
    db.commit()
    db.refresh(user)

    return UnlockResponse(
        ok=True,
        message="解锁成功",
        participant_code=user.participant_code,
        is_unlocked=True,
    )


@router.get("/status")
async def unlock_status(user_id: str = "default_user", db: Session = Depends(get_db)):
    """Check unlock status for a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"is_unlocked": False, "participant_code": None}
    return {
        "is_unlocked": user.is_unlocked or False,
        "participant_code": user.participant_code,
    }
