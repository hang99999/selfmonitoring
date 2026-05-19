"""Auth router — access code validation and user unlock."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, AccessCode
from app.schemas import UnlockRequest, UnlockResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/unlock", response_model=UnlockResponse)
async def unlock(req: UnlockRequest, db: Session = Depends(get_db)):
    """Validate invite code and unlock AI features for the user."""
    invite_code = req.invite_code.strip().upper()
    # Validate invite code
    code = db.query(AccessCode).filter(
        AccessCode.code == invite_code,
        AccessCode.is_active == True,
    ).first()
    if not code:
        raise HTTPException(status_code=400, detail="邀请码无效或已停用")

    if code.expires_at and code.expires_at < datetime.now():
        raise HTTPException(status_code=400, detail="邀请码已过期")

    # Ensure user exists
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        user = User(id=req.user_id)
        db.add(user)

    max_uses = code.max_uses or 1
    used_count = code.used_count or 0
    is_same_user_reuse = code.used_by_user_id == req.user_id
    if not is_same_user_reuse and used_count >= max_uses:
        raise HTTPException(status_code=400, detail="邀请码已被使用")

    # Save participant code and unlock
    user.participant_code = req.participant_code.strip()
    user.is_unlocked = True
    user.plan_type = code.plan_type or "invite"
    user.entitlement_source = "invite_code"
    if not is_same_user_reuse:
        code.used_count = used_count + 1
        if not code.used_by_user_id:
            code.used_by_user_id = req.user_id
        if not code.used_at:
            code.used_at = datetime.now()
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
        return {
            "is_unlocked": False,
            "participant_code": None,
            "plan_type": "free",
            "premium_until": None,
            "entitlement_source": None,
        }
    return {
        "is_unlocked": user.is_unlocked or False,
        "participant_code": user.participant_code,
        "plan_type": user.plan_type or "free",
        "premium_until": user.premium_until.isoformat() if user.premium_until else None,
        "entitlement_source": user.entitlement_source,
    }
