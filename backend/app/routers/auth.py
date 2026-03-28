import secrets
from datetime import datetime, timedelta, timezone

import jwt
import resend
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Admin, MagicLinkToken, Profile, WaitlistEntry

router = APIRouter(prefix="/auth", tags=["auth"])


def _send_email(to: str, subject: str, html: str) -> None:
    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send({"from": settings.EMAIL_FROM, "to": [to], "subject": subject, "html": html})


class MagicLinkRequest(BaseModel):
    email: str


@router.post("/magic-link")
async def request_magic_link(body: MagicLinkRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.lower().strip()

    # Admins always get a magic link
    admin_result = await db.execute(select(Admin).where(Admin.email == email))
    is_admin = admin_result.scalar_one_or_none() is not None

    # Existing users (already have a profile) always get a magic link
    profile_result = await db.execute(select(Profile).where(Profile.email == email))
    existing_profile = profile_result.scalar_one_or_none()

    if not is_admin and not existing_profile:
        # Check waitlist status
        waitlist_result = await db.execute(
            select(WaitlistEntry).where(WaitlistEntry.email == email)
        )
        entry = waitlist_result.scalar_one_or_none()

        if entry is None:
            # New signup - add to waitlist and notify admin
            db.add(WaitlistEntry(email=email))
            await db.commit()

            approve_url = (
                f"{settings.FRONTEND_URL}/auth/approve"
                f"?email={email}&secret={settings.ADMIN_SECRET}"
            )
            try:
                _send_email(
                    to=settings.ADMIN_EMAIL,
                    subject=f"Jobbr access request from {email}",
                    html=(
                        f"<p><strong>{email}</strong> has requested access to Jobbr.</p>"
                        f'<p><a href="{approve_url}" style="background:#2563eb;color:#fff;'
                        f'padding:10px 20px;border-radius:6px;text-decoration:none;">'
                        f"Approve access</a></p>"
                    ),
                )
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Email send failed: {e}")

            return {"message": "request_pending"}

        if entry.status == "pending":
            return {"message": "request_pending"}

        # status == "approved" - fall through to send magic link

    # Send magic link
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    db.add(MagicLinkToken(email=email, token=token, expires_at=expires_at))
    await db.commit()

    verify_url = f"{settings.FRONTEND_URL}/auth/verify?token={token}"
    try:
        _send_email(
            to=email,
            subject="Your Jobbr sign-in link",
            html=(
                f"<p>Click below to sign in to Jobbr. This link expires in 15 minutes.</p>"
                f'<p><a href="{verify_url}">Sign in to Jobbr</a></p>'
                f"<p>Or paste this URL: {verify_url}</p>"
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email send failed: {e}")

    return {"message": "Magic link sent"}


@router.get("/approve")
async def approve_user(email: str, secret: str, db: AsyncSession = Depends(get_db)):
    if not settings.ADMIN_SECRET or secret != settings.ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid secret")

    result = await db.execute(select(WaitlistEntry).where(WaitlistEntry.email == email))
    entry = result.scalar_one_or_none()

    if not entry:
        return HTMLResponse("<h2>Not found - this email is not on the waitlist.</h2>")

    if entry.status == "approved":
        return HTMLResponse(f"<h2>{email} is already approved.</h2>")

    entry.status = "approved"
    entry.approved_at = datetime.now(timezone.utc)
    await db.commit()

    invite_url = settings.FRONTEND_URL
    try:
        _send_email(
            to=email,
            subject="You're in - sign in to Jobbr",
            html=(
                f"<p>Great news - your Jobbr access request has been approved!</p>"
                f'<p><a href="{invite_url}" style="background:#2563eb;color:#fff;'
                f'padding:10px 20px;border-radius:6px;text-decoration:none;">'
                f"Sign in to Jobbr</a></p>"
                f"<p>Just enter your email address and we'll send you a sign-in link.</p>"
            ),
        )
    except Exception as e:
        return HTMLResponse(f"<h2>Approved, but failed to send invitation email: {e}</h2>")

    return HTMLResponse(
        f"<h2>Approved!</h2><p>An invitation email has been sent to {email}.</p>"
    )


@router.get("/verify")
async def verify_magic_link(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MagicLinkToken).where(
            MagicLinkToken.token == token,
            MagicLinkToken.used == False,  # noqa: E712
        )
    )
    magic_link = result.scalar_one_or_none()

    if not magic_link:
        raise HTTPException(status_code=400, detail="Invalid or already used link")

    if magic_link.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Link has expired")

    magic_link.used = True
    await db.commit()

    profile_result = await db.execute(
        select(Profile).where(Profile.email == magic_link.email)
    )
    profile = profile_result.scalar_one_or_none()

    admin_check = await db.execute(select(Admin).where(Admin.email == magic_link.email))
    user_is_admin = admin_check.scalar_one_or_none() is not None

    session_token = jwt.encode(
        {
            "email": magic_link.email,
            "is_admin": user_is_admin,
            "exp": datetime.now(timezone.utc) + timedelta(days=30),
        },
        settings.JWT_SECRET,
        algorithm="HS256",
    )

    return {
        "token": session_token,
        "email": magic_link.email,
        "is_admin": user_is_admin,
        "profile_id": str(profile.id) if profile else None,
    }
