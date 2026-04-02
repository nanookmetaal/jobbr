import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm import generate_embeddings
from app.database import get_db
from app.dependencies import get_current_email
from app.models import Profile
from app.schemas import ProfileCreate, ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.post("", response_model=ProfileResponse, status_code=201)
async def create_profile(
    body: ProfileCreate,
    db: AsyncSession = Depends(get_db),
    current_email: str = Depends(get_current_email),
):
    if body.email.lower() != current_email.lower():
        raise HTTPException(status_code=403, detail="Email does not match your session")
    profile = Profile(**body.model_dump())
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    offer_emb, seek_emb = await generate_embeddings(body.model_dump())
    profile.offer_embedding = offer_emb
    profile.seek_embedding = seek_emb
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("", response_model=list[ProfileResponse])
async def list_profiles(email: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Profile).order_by(Profile.created_at.desc())
    if email:
        query = query.where(Profile.email == email)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{profile_id}", response_model=ProfileResponse)
async def get_profile(profile_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/{profile_id}", response_model=ProfileResponse)
async def update_profile(
    profile_id: uuid.UUID,
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_email),
):
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    updates = body.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)

    offer_emb, seek_emb = await generate_embeddings({
        "title": profile.title,
        "bio": profile.bio,
        "skills": profile.skills,
        "experience_years": profile.experience_years,
        "looking_for": profile.looking_for,
        "profile_type": profile.profile_type,
        "secondary_role": profile.secondary_role,
    })
    profile.offer_embedding = offer_emb
    profile.seek_embedding = seek_emb
    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_email),
):
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    await db.delete(profile)
    await db.commit()
