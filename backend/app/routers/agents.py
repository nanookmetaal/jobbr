import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm import analyze_profile, rank_matches
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
        "secondary_role": profile.secondary_role,
        "title": profile.title,
        "bio": profile.bio,
        "skills": profile.skills,
        "experience_years": profile.experience_years,
        "location": profile.location,
        "looking_for": profile.looking_for,
        "work_history": profile.work_history,
        "education": profile.education,
        "linkedin_url": profile.linkedin_url,
        "website_url": profile.website_url,
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
    my_compatible_types: set[str] = set(compatible.get(profile.profile_type, []))
    if profile.secondary_role:
        my_compatible_types.update(compatible.get(profile.secondary_role, []))

    if not my_compatible_types:
        return []

    # Fetch candidates whose primary or secondary role is compatible
    candidates_result = await db.execute(
        select(Profile).where(
            Profile.id != profile.id,
            or_(
                Profile.profile_type.in_(my_compatible_types),
                Profile.secondary_role.in_(my_compatible_types),
            ),
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

    # LLM ranking pass - enrich top candidates with scores, analysis, conversation starters
    profile_dict_for_ranking = {
        "name": profile.name,
        "profile_type": profile.profile_type,
        "secondary_role": profile.secondary_role,
        "title": profile.title,
        "bio": profile.bio,
        "skills": profile.skills,
        "experience_years": profile.experience_years,
        "looking_for": profile.looking_for,
        "work_history": profile.work_history,
        "education": profile.education,
    }
    candidate_dicts = [
        {
            "id": str(c.id),
            "name": c.name,
            "profile_type": c.profile_type,
            "secondary_role": c.secondary_role,
            "title": c.title,
            "bio": c.bio,
            "skills": c.skills,
            "experience_years": c.experience_years,
            "looking_for": c.looking_for,
        }
        for c in ranked
    ]
    llm_rankings = await rank_matches(profile_dict_for_ranking, candidate_dicts)
    rankings_by_id = {r["id"]: r for r in llm_rankings if isinstance(r, dict) and "id" in r}

    saved_matches = []
    for candidate in ranked:
        ranking = rankings_by_id.get(str(candidate.id), {})
        match = Match(
            profile_id_a=profile.id,
            profile_id_b=candidate.id,
            compatibility_score=int(ranking.get("compatibility_score", 0)),
            analysis=ranking.get("analysis", ""),
            conversation_starter=ranking.get("conversation_starter", ""),
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
