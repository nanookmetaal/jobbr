import secrets
from datetime import datetime, timedelta, timezone

import jwt
import resend
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_email
from app.models import Admin, MagicLinkToken, Profile, WaitlistEntry

router = APIRouter(prefix="/auth", tags=["auth"])


def _send_email(to: str, subject: str, html: str) -> None:
    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send({"from": settings.EMAIL_FROM, "to": [to], "subject": subject, "html": html})


class MagicLinkRequest(BaseModel):
    email: str
    first_name: str | None = None
    last_name: str | None = None


class ChangeEmailRequest(BaseModel):
    new_email: str


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
            # New signup - ask for name first if not provided
            if not body.first_name or not body.last_name:
                return {"message": "need_name"}

            # Add to waitlist and notify admin
            db.add(WaitlistEntry(
                email=email,
                first_name=body.first_name.strip(),
                last_name=body.last_name.strip(),
            ))
            await db.commit()

            full_name = f"{body.first_name.strip()} {body.last_name.strip()}"
            admin_url = f"{settings.FRONTEND_URL}/admin"
            try:
                _send_email(
                    to=settings.ADMIN_EMAIL,
                    subject=f"Jobbr access request from {full_name}",
                    html=(
                        f"<p><strong>{full_name}</strong> ({email}) has requested access to Jobbr.</p>"
                        f'<p><a href="{admin_url}" style="background:#2563eb;color:#fff;'
                        f'padding:10px 20px;border-radius:6px;text-decoration:none;">'
                        f"Review in admin dashboard</a></p>"
                    ),
                )
            except Exception:
                pass  # User is on waitlist regardless - admin notification is non-fatal

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


@router.post("/change-email")
async def request_email_change(
    body: ChangeEmailRequest,
    current_email: str = Depends(get_current_email),
    db: AsyncSession = Depends(get_db),
):
    current_email = current_email.lower().strip()
    new_email = body.new_email.lower().strip()

    if current_email == new_email:
        raise HTTPException(status_code=400, detail="New email is the same as current email")

    admin_check = await db.execute(select(Admin).where(Admin.email == current_email))
    if admin_check.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Admin account emails cannot be changed here - update the admins table directly")

    profile_result = await db.execute(select(Profile).where(Profile.email == current_email))
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    taken = await db.execute(select(Profile).where(Profile.email == new_email))
    if taken.scalar_one_or_none():
        # Silently succeed - don't reveal whether the address is registered
        return {"message": "If that address is available, a verification email has been sent."}

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    db.add(MagicLinkToken(email=current_email, token=token, expires_at=expires_at, pending_email=new_email))
    await db.commit()

    verify_url = f"{settings.FRONTEND_URL}/auth/verify?token={token}"
    try:
        _send_email(
            to=new_email,
            subject="Confirm your new Jobbr email address",
            html=(
                f"<p>Click below to confirm <strong>{new_email}</strong> as your new Jobbr email. "
                f"This link expires in 15 minutes.</p>"
                f'<p><a href="{verify_url}">Confirm new email</a></p>'
                f"<p>If you didn't request this, ignore this email - your address won't change.</p>"
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email send failed: {e}")

    return {"message": "If that address is available, a verification email has been sent."}



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

    # Email change flow - update profile email before issuing JWT
    resolved_email = magic_link.email
    if magic_link.pending_email:
        new_email = magic_link.pending_email
        profile_result = await db.execute(select(Profile).where(Profile.email == magic_link.email))
        profile_to_update = profile_result.scalar_one_or_none()
        if profile_to_update:
            profile_to_update.email = new_email
        resolved_email = new_email

    await db.commit()

    profile_result = await db.execute(
        select(Profile).where(Profile.email == resolved_email)
    )
    profile = profile_result.scalar_one_or_none()

    admin_check = await db.execute(select(Admin).where(Admin.email == resolved_email))
    user_is_admin = admin_check.scalar_one_or_none() is not None

    session_token = jwt.encode(
        {
            "email": resolved_email,
            "is_admin": user_is_admin,
            "exp": datetime.now(timezone.utc) + timedelta(days=30),
        },
        settings.JWT_SECRET,
        algorithm="HS256",
    )

    return {
        "token": session_token,
        "email": resolved_email,
        "is_admin": user_is_admin,
        "profile_id": str(profile.id) if profile else None,
    }
