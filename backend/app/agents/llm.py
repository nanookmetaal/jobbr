import json
import re
from typing import Any, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
import voyageai

from app.config import settings

llm = ChatAnthropic(model="claude-sonnet-4-6", api_key=settings.ANTHROPIC_API_KEY)
llm_fast = ChatAnthropic(model="claude-haiku-4-5-20251001", api_key=settings.ANTHROPIC_API_KEY)
_voyage = voyageai.AsyncClient(api_key=settings.VOYAGE_API_KEY)


def _extract_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {"raw_output": text}


def _extract_json_array(text: str) -> Optional[list]:
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


async def _call(model: ChatAnthropic, system: str, human: str) -> str:
    response = await model.ainvoke([
        SystemMessage(content=system),
        HumanMessage(content=human),
    ])
    return response.content


async def analyze_profile(profile: dict, previous_analyses: Optional[dict] = None) -> dict[str, Any]:
    profile_str = json.dumps(profile, indent=2)

    prev_gaps_str = ""
    prev_tips_str = ""
    if previous_analyses:
        prev_gaps = (previous_analyses.get("profile_analyst") or {}).get("gaps", [])
        prev_tips = (previous_analyses.get("profile_coach") or {}).get("tips", [])
        if prev_gaps:
            prev_gaps_str = f"\nPreviously flagged gaps: {json.dumps(prev_gaps)}"
        if prev_tips:
            prev_tips_str = f"\nPrevious tips given: {json.dumps(prev_tips)}"

    analyst_system = (
        "You are a seasoned talent acquisition specialist reviewing professional profiles. "
        "Be honest and calibrated: if a profile is strong, say so with a high score and few gaps. "
        "Only flag genuine issues - do not manufacture criticism on a well-written profile."
    )
    analyst_human = (
        f"Analyze the following professional profile:\n\n{profile_str}\n\n"
        + (
            f"This person has updated their profile based on prior feedback.{prev_gaps_str}\n"
            "Only list a gap if it genuinely still applies. If a previously flagged issue "
            "has been addressed, acknowledge it as a strength instead.\n\n"
            if prev_gaps_str else ""
        )
        + "Return a JSON object with keys: 'completeness_score' (0-100), "
        "'strengths' (list of strings), 'gaps' (list of strings), 'summary' (string)."
    )

    analyst_raw = await _call(llm, analyst_system, analyst_human)

    coach_system = (
        "You are an executive career coach. Suggest concrete improvements to strengthen "
        "a professional profile. If the profile is already strong in an area, do not "
        "suggest changes to it - only address genuine remaining weaknesses."
    )
    coach_human = (
        f"Analyst review:\n\n{analyst_raw}\n\n"
        f"Original profile:\n\n{profile_str}\n\n"
        + (
            f"Previously given tips:{prev_tips_str}\n"
            "Do not repeat tips that have already been acted on.\n\n"
            if prev_tips_str else ""
        )
        + "Return a JSON object with keys: "
        "'improved_bio' (string), 'suggested_skills' (list), "
        "'title_suggestion' (string), 'looking_for_suggestion' (string), "
        "'tips' (list of strings)."
    )

    coach_raw = await _call(llm, coach_system, coach_human)

    return {
        "profile_analyst": _extract_json(analyst_raw),
        "profile_coach": _extract_json(coach_raw),
    }


async def generate_embeddings(profile: dict) -> tuple[list[float], list[float]]:
    """Return (offer_embedding, seek_embedding) for a profile."""
    parts = [
        profile.get('title', ''),
        profile.get('bio', ''),
        f"Skills: {', '.join(profile.get('skills', []))}",
        f"{profile.get('experience_years', 0)} years experience",
    ]
    if profile.get('work_history'):
        parts.append(f"Work history: {profile['work_history']}")
    if profile.get('education'):
        parts.append(f"Education: {profile['education']}")
    offer_text = ". ".join(p for p in parts if p)

    roles = profile.get('profile_type', '')
    if profile.get('secondary_role'):
        roles += f" and {profile['secondary_role']}"
    seek_parts = [
        profile.get('looking_for', ''),
        f"Role: {roles}",
    ]
    if profile.get('location'):
        seek_parts.append(f"Location: {profile['location']}")
    if profile.get('experience_years') is not None:
        seek_parts.append(f"Experience level: {profile['experience_years']} years")
    if profile.get('skills'):
        seek_parts.append(f"Background in: {', '.join(profile['skills'])}")
    seek_text = ". ".join(p for p in seek_parts if p)

    offer_result = await _voyage.embed([offer_text], model="voyage-3", input_type="document")
    seek_result = await _voyage.embed([seek_text], model="voyage-3", input_type="query")
    return offer_result.embeddings[0], seek_result.embeddings[0]


async def rank_matches(profile: dict, candidates: list[dict]) -> list[dict]:
    """Return candidates enriched with compatibility_score, analysis, conversation_starter."""
    profile_str = json.dumps({
        k: v for k, v in profile.items()
        if k in ("name", "profile_type", "secondary_role", "title", "bio", "skills",
                 "experience_years", "looking_for", "work_history", "education")
    }, indent=2)

    candidates_str = json.dumps([
        {k: v for k, v in c.items()
         if k in ("id", "name", "profile_type", "secondary_role", "title", "bio",
                  "skills", "experience_years", "looking_for")}
        for c in candidates
    ], indent=2)

    system = (
        "You are a professional networking expert for a builders community. "
        "Your job is to evaluate how well a set of candidates complement a given profile."
    )
    human = (
        f"Profile:\n{profile_str}\n\n"
        f"Candidates:\n{candidates_str}\n\n"
        "For each candidate return a JSON array where every item has exactly these keys:\n"
        "- 'id': the candidate's id (string)\n"
        "- 'compatibility_score': integer 0-100 (how well they complement the profile)\n\n"
        "Return only the JSON array, no other text."
    )

    raw = await _call(llm_fast, system, human)
    results = _extract_json_array(raw)
    if not results:
        return []
    return results
