import os
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/billing", tags=["billing"])

PREMIUM_ENTITLEMENT_ID = os.getenv("REVENUECAT_PREMIUM_ENTITLEMENT_ID", "premium")
REVENUECAT_WEBHOOK_AUTH = os.getenv("REVENUECAT_WEBHOOK_AUTH", "")


def _ms_to_datetime(value: Any) -> Optional[datetime]:
    try:
        if value is None:
            return None
        return datetime.fromtimestamp(int(value) / 1000)
    except (TypeError, ValueError, OSError):
        return None


def _is_authorized(auth_header: Optional[str]) -> bool:
    if not REVENUECAT_WEBHOOK_AUTH:
        return False
    if auth_header == REVENUECAT_WEBHOOK_AUTH:
        return True
    return auth_header == f"Bearer {REVENUECAT_WEBHOOK_AUTH}"


@router.post("/revenuecat/webhook")
async def revenuecat_webhook(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    if not REVENUECAT_WEBHOOK_AUTH:
        raise HTTPException(status_code=503, detail="RevenueCat webhook auth is not configured")
    if not _is_authorized(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    payload = await request.json()
    event = payload.get("event") or {}
    app_user_id = event.get("app_user_id")
    if not app_user_id:
        raise HTTPException(status_code=400, detail="Missing RevenueCat app_user_id")

    event_type = event.get("type")
    entitlement_ids = event.get("entitlement_ids") or []
    expiration = _ms_to_datetime(event.get("expiration_at_ms"))
    is_premium_event = PREMIUM_ENTITLEMENT_ID in entitlement_ids
    is_expired_event = event_type in {"EXPIRATION", "REFUND", "PRODUCT_CHANGE"}

    user = db.query(User).filter(User.id == app_user_id).first()
    if not user:
        user = User(id=app_user_id)
        db.add(user)

    user.revenuecat_app_user_id = app_user_id
    user.entitlement_source = "revenuecat"

    if is_premium_event and expiration and expiration > datetime.now():
        user.plan_type = "premium"
        user.premium_until = expiration
    elif is_expired_event:
        user.plan_type = "free"
        user.premium_until = None

    db.commit()

    return {
        "ok": True,
        "event_type": event_type,
        "user_id": app_user_id,
        "plan_type": user.plan_type,
        "premium_until": user.premium_until.isoformat() if user.premium_until else None,
    }
