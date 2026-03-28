import json
import re
from typing import Any

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
    seek_text = (
        f"{profile.get('looking_for', '')}. "
        f"Profile type: {profile.get('profile_type', '')}."
    )

    result = await _voyage.embed(
        [offer_text, seek_text],
        model="voyage-3",
        input_type="document",
    )
    return result.embeddings[0], result.embeddings[1]
