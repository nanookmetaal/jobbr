import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_email
from app.models import Notification, Profile, Swipe
from app.schemas import SwipeCreate, SwipeResponse

router = APIRouter(prefix="/swipes", tags=["swipes"])


@router.post("", response_model=SwipeResponse, status_code=201)
async def create_swipe(
    body: SwipeCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_email),
):
    # Upsert: check if a swipe already exists for this pair
    result = await db.execute(
        select(Swipe).where(
            Swipe.swiper_id == body.swiper_id,
            Swipe.swiped_id == body.swiped_id,
        )
    )
    swipe = result.scalar_one_or_none()

    if swipe:
        swipe.direction = body.direction
    else:
        swipe = Swipe(
            swiper_id=body.swiper_id,
            swiped_id=body.swiped_id,
            direction=body.direction,
        )
        db.add(swipe)

    await db.commit()
    await db.refresh(swipe)

    is_mutual = False

    if body.direction == "right":
        # Check for a reciprocal right swipe
        reciprocal_result = await db.execute(
            select(Swipe).where(
                Swipe.swiper_id == body.swiped_id,
                Swipe.swiped_id == body.swiper_id,
                Swipe.direction == "right",
            )
        )
        reciprocal = reciprocal_result.scalar_one_or_none()

        if reciprocal:
            is_mutual = True

            # Fetch both profiles for notification messages
            swiper = await db.get(Profile, body.swiper_id)
            swiped = await db.get(Profile, body.swiped_id)

            swiper_name = swiper.name if swiper else "Someone"
            swiped_name = swiped.name if swiped else "Someone"

            # Check if notifications already exist for this match pair to avoid duplicates
            existing_notif_swiper = await db.execute(
                select(Notification).where(
                    Notification.profile_id == body.swiper_id,
                    Notification.related_profile_id == body.swiped_id,
                    Notification.type == "mutual_match",
                )
            )
            if not existing_notif_swiper.scalar_one_or_none():
                notif_for_swiper = Notification(
                    profile_id=body.swiper_id,
                    type="mutual_match",
                    related_profile_id=body.swiped_id,
                    message=f"You and {swiped_name} both liked each other! Time for a coffee?",
                )
                db.add(notif_for_swiper)

            existing_notif_swiped = await db.execute(
                select(Notification).where(
                    Notification.profile_id == body.swiped_id,
                    Notification.related_profile_id == body.swiper_id,
                    Notification.type == "mutual_match",
                )
            )
            if not existing_notif_swiped.scalar_one_or_none():
                notif_for_swiped = Notification(
                    profile_id=body.swiped_id,
                    type="mutual_match",
                    related_profile_id=body.swiper_id,
                    message=f"You and {swiper_name} both liked each other! Time for a coffee?",
                )
                db.add(notif_for_swiped)

            await db.commit()

    return SwipeResponse(
        id=swipe.id,
        swiper_id=swipe.swiper_id,
        swiped_id=swipe.swiped_id,
        direction=swipe.direction,
        created_at=swipe.created_at,
        is_mutual=is_mutual,
    )


@router.get("/{profile_id}", response_model=list[SwipeResponse])
async def list_swipes(profile_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Swipe).where(Swipe.swiper_id == profile_id).order_by(Swipe.created_at.desc())
    )
    swipes = result.scalars().all()
    return [
        SwipeResponse(
            id=s.id,
            swiper_id=s.swiper_id,
            swiped_id=s.swiped_id,
            direction=s.direction,
            created_at=s.created_at,
            is_mutual=False,
        )
        for s in swipes
    ]
