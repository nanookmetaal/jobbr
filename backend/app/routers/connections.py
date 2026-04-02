import resend
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_email
from app.models import ConnectionRequest, Profile
from app.schemas import ConnectionRequestCreate, ConnectionRequestResponse

router = APIRouter(prefix="/connections", tags=["connections"])


@router.post("", response_model=ConnectionRequestResponse, status_code=201)
async def send_connection_request(
    body: ConnectionRequestCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_email),
):
    from_profile = await db.get(Profile, body.from_profile_id)
    to_profile = await db.get(Profile, body.to_profile_id)

    if not from_profile or not to_profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    req = ConnectionRequest(
        from_profile_id=body.from_profile_id,
        to_profile_id=body.to_profile_id,
        message=body.message,
    )
    db.add(req)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Connection request already sent")
    await db.refresh(req)

    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to_profile.email],
            "reply_to": [from_profile.email],
            "subject": f"{from_profile.name} wants to connect with you on Jobbr",
            "html": (
                f"<p>Hi {to_profile.name},</p>"
                f"<p><strong>{from_profile.name}</strong> ({from_profile.title}) wants to connect with you on Jobbr.</p>"
                f"<blockquote style='border-left:3px solid #2563eb;padding-left:12px;margin:16px 0;color:#555;font-style:italic;'>"
                f"{body.message}"
                f"</blockquote>"
                f"<p>Hit <strong>Reply</strong> to respond directly to {from_profile.name} "
                f"at <a href='mailto:{from_profile.email}'>{from_profile.email}</a>.</p>"
                f"<p style='color:#888;font-size:12px;margin-top:24px;'>"
                f"This message was sent through Jobbr. Your email address was not shared with the sender.</p>"
            ),
        })
    except Exception:
        pass  # Request saved; email failure is non-fatal

    return req


@router.get("/sent/{profile_id}", response_model=list[ConnectionRequestResponse])
async def get_sent_requests(
    profile_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ConnectionRequest).where(ConnectionRequest.from_profile_id == profile_id)
    )
    return result.scalars().all()
