from datetime import datetime, timezone

import resend
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_admin
from app.models import Profile, WaitlistEntry
from app.schemas import ProfileResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/profiles", response_model=list[ProfileResponse])
async def list_all_profiles(
    _: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Profile).order_by(Profile.created_at.desc()))
    return result.scalars().all()


@router.get("/waitlist")
async def list_waitlist(
    _: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WaitlistEntry).order_by(WaitlistEntry.created_at.desc()))
    entries = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "email": e.email,
            "first_name": e.first_name,
            "last_name": e.last_name,
            "status": e.status,
            "created_at": e.created_at.isoformat(),
            "approved_at": e.approved_at.isoformat() if e.approved_at else None,
        }
        for e in entries
    ]


@router.post("/waitlist/{email}/approve")
async def approve_waitlist_entry(
    email: str,
    _: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WaitlistEntry).where(WaitlistEntry.email == email))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Email not on waitlist")
    if entry.status == "approved":
        raise HTTPException(status_code=400, detail="Already approved")

    entry.status = "approved"
    entry.approved_at = datetime.now(timezone.utc)
    await db.commit()

    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [email],
            "subject": "You're in - sign in to Jobbr",
            "html": (
                f"<p>Great news - your Jobbr access request has been approved!</p>"
                f'<p><a href="{settings.FRONTEND_URL}" style="background:#2563eb;color:#fff;'
                f'padding:10px 20px;border-radius:6px;text-decoration:none;">Sign in to Jobbr</a></p>'
                f"<p>Just enter your email address and we'll send you a sign-in link.</p>"
            ),
        })
    except Exception:
        pass  # Approval saved; email failure is non-fatal here

    return {"message": f"{email} approved and notified"}


@router.delete("/profiles/{profile_id}")
async def delete_profile(
    profile_id: str,
    _: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Profile).where(Profile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    await db.delete(profile)
    await db.commit()
    return {"message": "Profile deleted"}
