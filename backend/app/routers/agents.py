import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm import analyze_profile
from app.database import get_db
from app.dependencies import get_current_email
from app.models import AgentAnalysis, Match, Profile, Swipe
from app.schemas import (
    AgentAnalysisResponse,
    FindMatchesRequest,
    MatchResponse,
    ProfileResponse,
    RunAgentsRequest,
)


router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/analyses/{profile_id}", response_model=list[AgentAnalysisResponse])
async def get_analyses(profile_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentAnalysis)
        .where(AgentAnalysis.profile_id == profile_id)
        .order_by(AgentAnalysis.created_at.desc())
    )
    all_rows = result.scalars().all()

    # Return only the latest run per agent type
    seen: set[str] = set()
    latest: list[AgentAnalysis] = []
    for row in all_rows:
        if row.agent_type not in seen:
            seen.add(row.agent_type)
            latest.append(row)
    return latest


@router.post("/analyze", response_model=list[AgentAnalysisResponse])
async def run_analysis(
    body: RunAgentsRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_email),
):
    profile = await db.get(Profile, body.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile_dict = {
        "id": str(profile.id),
        "name": profile.name,
        "email": profile.email,
        "profile_type": profile.profile_type,
        "title": profile.title,
        "bio": profile.bio,
        "skills": profile.skills,
        "experience_years": profile.experience_years,
        "location": profile.location,
        "looking_for": profile.looking_for,
    }

    results = await analyze_profile(profile_dict)

    saved = []
    for agent_type, result in results.items():
        analysis = AgentAnalysis(
            profile_id=profile.id,
            agent_type=agent_type,
            result=result,
        )
        db.add(analysis)
        saved.append(analysis)

    await db.commit()
    for a in saved:
        await db.refresh(a)

    return saved


@router.get("/matches/{profile_id}", response_model=list[MatchResponse])
async def get_matches(profile_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return saved matches that the user hasn't swiped on yet."""
    swiped_ids_result = await db.execute(
        select(Swipe.swiped_id).where(Swipe.swiper_id == profile_id)
    )
    swiped_ids = {row[0] for row in swiped_ids_result.fetchall()}

    result = await db.execute(
        select(Match).where(
            Match.profile_id_a == profile_id,
        ).order_by(Match.created_at.desc())
    )
    matches = result.scalars().all()

    response = []
    for match in matches:
        if match.profile_id_b in swiped_ids:
            continue
        candidate = await db.get(Profile, match.profile_id_b)
        if not candidate:
            continue
        response.append(
            MatchResponse(
                id=match.id,
                profile_id_a=match.profile_id_a,
                profile_id_b=match.profile_id_b,
                compatibility_score=match.compatibility_score,
                analysis=match.analysis,
                conversation_starter=match.conversation_starter,
                created_at=match.created_at,
                matched_profile=ProfileResponse.model_validate(candidate),
            )
        )
    return response


@router.post("/matches", response_model=list[MatchResponse])
async def run_matches(
    body: FindMatchesRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_email),
):
    profile = await db.get(Profile, body.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if profile.offer_embedding is None or profile.seek_embedding is None:
        raise HTTPException(status_code=400, detail="Profile embeddings not yet generated")

    # Clear previous matches so we always have a fresh ranked list
    await db.execute(delete(Match).where(Match.profile_id_a == body.profile_id))
    await db.commit()

    compatible: dict[str, list[str]] = {
        "job_seeker": ["employer", "mentor"],
        "mentee": ["mentor"],
        "employer": ["job_seeker", "mentee"],
        "mentor": ["job_seeker", "mentee"],
    }
    compatible_types = compatible.get(profile.profile_type, [])

    if not compatible_types:
        return []

    # Fetch all compatible candidates that have embeddings
    candidates_result = await db.execute(
        select(Profile).where(
            Profile.id != profile.id,
            Profile.profile_type.in_(compatible_types),
            Profile.offer_embedding.is_not(None),
        )
    )
    candidates = candidates_result.scalars().all()

    def cosine_sim(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

    scored = sorted(
        candidates,
        key=lambda c: cosine_sim(profile.offer_embedding, c.seek_embedding)
                    + cosine_sim(profile.seek_embedding, c.offer_embedding),
        reverse=True,
    )
    ranked = scored[:10]

    saved_matches = []
    for candidate in ranked:
        match = Match(
            profile_id_a=profile.id,
            profile_id_b=candidate.id,
            compatibility_score=0,
            analysis="",
            conversation_starter="",
        )
        db.add(match)
        saved_matches.append((match, candidate))


    await db.commit()

    response = []
    for match, candidate in saved_matches:
        await db.refresh(match)
        response.append(
            MatchResponse(
                id=match.id,
                profile_id_a=match.profile_id_a,
                profile_id_b=match.profile_id_b,
                compatibility_score=match.compatibility_score,
                analysis=match.analysis,
                conversation_starter=match.conversation_starter,
                created_at=match.created_at,
                matched_profile=ProfileResponse.model_validate(candidate),
            )
        )

    return response
