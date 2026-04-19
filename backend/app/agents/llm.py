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
    if previous_analyses:
        prev_gaps = (previous_analyses.get("profile_analyst") or {}).get("gaps", [])
        if prev_gaps:
            prev_gaps_str = f"\nPreviously flagged gaps: {json.dumps(prev_gaps)}"

    analyst_system = (
        "You are reviewing profiles on a small, trusted professional community platform. "
        "This is NOT LinkedIn or a recruiter database - the people reading these profiles "
        "already have a relationship with the organiser and are likely familiar with each other. "
        "The goal of a profile here is to help someone quickly understand who this person is, "
        "what they bring, and what they're looking for - so a relevant connection can reach out. "
        "Evaluate how well the profile communicates this in a warm, human way. "
        "Be honest and calibrated: if a profile is clear and genuine, say so with a high score. "
        "Do not flag things through a recruiter or ATS lens - avoid advice about shortlisting, "
        "keyword optimisation, or impressing hiring managers. Focus on clarity and authenticity. "
        "Use only plain ASCII text in your response - no em dashes, smart quotes, or other special characters. "
        "Use a hyphen (-) instead of an em dash."
    )
    analyst_human = (
        f"Analyze the following profile:\n\n{profile_str}\n\n"
        + (
            f"This person has updated their profile based on prior feedback.{prev_gaps_str}\n"
            "Only list a gap if it genuinely still applies. If a previously flagged issue "
            "has been addressed, acknowledge it as a strength instead.\n\n"
            if prev_gaps_str else ""
        )
        + "Return a JSON object with keys: "
        "'clarity_score' (0-100, how clearly the profile communicates who this person is and what they're looking for), "
        "'what_stands_out' (list of strings, genuine things that make this person interesting or easy to connect with), "
        "'what_could_be_clearer' (list of strings, anything that left you unsure about who they are or what they want - only if real), "
        "'impression' (string, 1-2 sentences on the overall feel of the profile as a human being reading it)."
    )

    analyst_raw = await _call(llm, analyst_system, analyst_human)

    return {"profile_analyst": _extract_json(analyst_raw)}


async def generate_embeddings(profile: dict) -> tuple[list, list]:
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
        "Your job is to evaluate how well a set of candidates complement a given profile. "
        "Use only plain ASCII text - no em dashes, smart quotes, or special characters."
    )
    human = (
        f"Profile:\n{profile_str}\n\n"
        f"Candidates:\n{candidates_str}\n\n"
        "For each candidate return a JSON array where every item has exactly these keys:\n"
        "- 'id': the candidate's id (string)\n"
        "- 'compatibility_score': integer 0-100 (how well they complement the profile)\n"
        "- 'match_reason': 1-2 sentence plain-text explanation of the strongest complementary qualities between them - only positive, no caveats or limitations\n\n"
        "Return only the JSON array, no other text."
    )

    raw = await _call(llm_fast, system, human)
    results = _extract_json_array(raw)
    if not results:
        return []
    return results
