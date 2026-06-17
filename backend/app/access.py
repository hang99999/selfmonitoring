from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.i18n import localized_text
from app.models import User


def has_ai_access(user: Optional[User]) -> bool:
    if not user:
        return False
    if bool(user.is_unlocked):
        return True
    premium_until = getattr(user, "premium_until", None)
    if isinstance(premium_until, str):
        try:
            premium_until = datetime.fromisoformat(premium_until)
        except ValueError:
            premium_until = None
    if premium_until and premium_until > datetime.now():
        return True
    return False


def require_ai_access(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if has_ai_access(user):
        return user
    raise HTTPException(
        status_code=402,
        detail={
            "code": "AI_ACCESS_REQUIRED",
            "message": localized_text("ai_access_required", getattr(user, "language", None)),
        },
    )
