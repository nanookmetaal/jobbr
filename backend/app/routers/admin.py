from datetime import datetime, timezone

import resend
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_admin
from app.models import ConnectionRequest, Profile, WaitlistEntry
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


@router.get("/suggested-introductions")
async def get_suggested_introductions(
    _: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    profiles_result = await db.execute(
        select(Profile).where(Profile.offer_embedding.is_not(None))
    )
    profiles = profiles_result.scalars().all()

    connections_result = await db.execute(select(ConnectionRequest))
    connected_pairs: set[tuple[str, str]] = set()
    for c in connections_result.scalars().all():
        a, b = str(c.from_profile_id), str(c.to_profile_id)
        connected_pairs.add((a, b))
        connected_pairs.add((b, a))

    compatible: dict[str, list[str]] = {
        "job_seeker": ["employer", "mentor"],
        "mentee": ["mentor"],
        "employer": ["job_seeker", "mentee"],
        "mentor": ["job_seeker", "mentee"],
    }

    def cosine_sim(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

    suggestions = []
    seen: set[tuple[str, str]] = set()

    for p1 in profiles:
        p1_compatible: set[str] = set(compatible.get(p1.profile_type, []))
        if p1.secondary_role:
            p1_compatible.update(compatible.get(p1.secondary_role, []))
        for p2 in profiles:
            if p1.id == p2.id:
                continue
            if p2.profile_type not in p1_compatible and p2.secondary_role not in p1_compatible:
                continue
            pair_key = tuple(sorted([str(p1.id), str(p2.id)]))
            if pair_key in seen:
                continue
            seen.add(pair_key)
            if (str(p1.id), str(p2.id)) in connected_pairs:
                continue
            if p2.seek_embedding is None:
                continue
            score = (
                cosine_sim(p1.offer_embedding, p2.seek_embedding)
                + cosine_sim(p1.seek_embedding, p2.offer_embedding)
            )
            suggestions.append({
                "profile_a": ProfileResponse.model_validate(p1).model_dump(),
                "profile_b": ProfileResponse.model_validate(p2).model_dump(),
                "score": round(float(score), 3),
            })

    suggestions.sort(key=lambda x: x["score"], reverse=True)
    return suggestions[:15]


@router.post("/introductions")
async def send_introduction(
    body: dict,
    _: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    profile_a = await db.get(Profile, body["profile_id_a"])
    profile_b = await db.get(Profile, body["profile_id_b"])
    if not profile_a or not profile_b:
        raise HTTPException(status_code=404, detail="Profile not found")

    resend.api_key = settings.RESEND_API_KEY

    def intro_email(to: Profile, other: Profile) -> None:
        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to.email],
            "subject": f"Introduction: meet {other.name} on Jobbr",
            "html": (
                f"<p>Hi {to.name},</p>"
                f"<p>We think you and <strong>{other.name}</strong> ({other.title}) would be a great connection.</p>"
                f"<p>Feel free to reach out to {other.name} directly at "
                f"<a href='mailto:{other.email}'>{other.email}</a>.</p>"
                f"<p style='color:#888;font-size:12px;margin-top:24px;'>This introduction was made by the Jobbr community organizer.</p>"
            ),
        })

    errors = []
    try:
        intro_email(profile_a, profile_b)
    except Exception as e:
        errors.append(str(e))
    try:
        intro_email(profile_b, profile_a)
    except Exception as e:
        errors.append(str(e))

    if errors:
        raise HTTPException(status_code=500, detail=f"Email send failed: {'; '.join(errors)}")

    return {"message": f"Introduction sent between {profile_a.name} and {profile_b.name}"}


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
