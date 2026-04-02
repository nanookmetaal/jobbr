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


async def analyze_profile(profile: dict) -> dict[str, Any]:
    profile_str = json.dumps(profile, indent=2)

    analyst_system = (
        "You are a seasoned talent acquisition specialist with 15 years of experience "
        "reviewing professional profiles. You have a sharp eye for gaps, vague language, "
        "and missing details that reduce a profile's effectiveness. "
        "Your role is to review profiles for completeness, clarity, and missing information."
    )
    analyst_human = (
        f"Analyze the following professional profile:\n\n{profile_str}\n\n"
        "Return a JSON object with keys: 'completeness_score' (0-100), "
        "'strengths' (list of strings), 'gaps' (list of strings), 'summary' (string)."
    )

    analyst_raw = await _call(llm, analyst_system, analyst_human)

    coach_system = (
        "You are an executive career coach who has helped thousands of professionals "
        "land their dream roles. You specialize in crafting compelling narratives and "
        "turning weak profile sections into powerful statements. Your role is to suggest "
        "concrete rewrites and improvements to strengthen a professional profile."
    )
    coach_human = (
        f"Given this analyst review of a profile:\n\n{analyst_raw}\n\n"
        f"And the original profile:\n\n{profile_str}\n\n"
        "Suggest concrete improvements. Return a JSON object with keys: "
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
        "Your job is to evaluate how well a set of candidates complement a given profile "
        "and craft specific, warm introductory messages."
    )
    human = (
        f"Profile:\n{profile_str}\n\n"
        f"Candidates:\n{candidates_str}\n\n"
        "For each candidate return a JSON array where every item has exactly these keys:\n"
        "- 'id': the candidate's id (string)\n"
        "- 'compatibility_score': integer 0-100 (how well they complement the profile)\n"
        "- 'analysis': 1-2 sentences on why they are a good match\n"
        "- 'conversation_starter': a short, specific opening message the profile could send "
        "to this candidate (first person, warm but professional)\n\n"
        "Return only the JSON array, no other text."
    )

    raw = await _call(llm_fast, system, human)
    results = _extract_json_array(raw)
    if not results:
        return []
    return results
