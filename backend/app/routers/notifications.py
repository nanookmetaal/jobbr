import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_email
from app.models import Notification, Profile
from app.schemas import CoffeeInviteCreate, NotificationResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/{profile_id}", response_model=list[NotificationResponse])
async def list_notifications(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_email: str = Depends(get_current_email),
):
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if profile.email.lower() != current_email.lower():
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(Notification)
        .where(Notification.profile_id == profile_id)
        .options(selectinload(Notification.related_profile))
        .order_by(Notification.created_at.desc())
    )
    notifications = result.scalars().all()
    return notifications


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_email: str = Depends(get_current_email),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.id == notification_id)
        .options(selectinload(Notification.related_profile))
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    owner = await db.get(Profile, notification.profile_id)
    if not owner or owner.email.lower() != current_email.lower():
        raise HTTPException(status_code=403, detail="Access denied")

    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification


@router.post("/coffee-invite", response_model=NotificationResponse, status_code=201)
async def send_coffee_invite(
    body: CoffeeInviteCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_email),
):
    from_profile = await db.get(Profile, body.from_profile_id)
    if not from_profile:
        raise HTTPException(status_code=404, detail="Sender profile not found")

    to_profile = await db.get(Profile, body.to_profile_id)
    if not to_profile:
        raise HTTPException(status_code=404, detail="Recipient profile not found")

    notification = Notification(
        profile_id=body.to_profile_id,
        type="coffee_invite",
        related_profile_id=body.from_profile_id,
        message=f"{from_profile.name} wants to grab a coffee with you!",
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    result = await db.execute(
        select(Notification)
        .where(Notification.id == notification.id)
        .options(selectinload(Notification.related_profile))
    )
    return result.scalar_one()
