import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr


ProfileTypeEnum = Literal["job_seeker", "employer", "mentor", "mentee"]


class ProfileCreate(BaseModel):
    name: str
    email: str
    avatar_url: str | None = None
    profile_type: ProfileTypeEnum
    secondary_role: Literal["mentor", "mentee"] | None = None
    title: str
    bio: str
    skills: list[str] = []
    experience_years: int = 0
    location: str
    looking_for: str
    work_history: str | None = None
    education: str | None = None
    linkedin_url: str | None = None
    website_url: str | None = None


class ProfileUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    profile_type: ProfileTypeEnum | None = None
    secondary_role: Literal["mentor", "mentee"] | None = None
    title: str | None = None
    bio: str | None = None
    skills: list[str] | None = None
    experience_years: int | None = None
    location: str | None = None
    looking_for: str | None = None
    work_history: str | None = None
    education: str | None = None
    linkedin_url: str | None = None
    website_url: str | None = None
    is_complete: bool | None = None


class ProfileResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    avatar_url: str | None
    profile_type: str
    secondary_role: str | None
    title: str
    bio: str
    skills: list[str]
    experience_years: int
    location: str
    looking_for: str
    work_history: str | None
    education: str | None
    linkedin_url: str | None
    website_url: str | None
    is_complete: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentAnalysisResponse(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    agent_type: str
    result: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class MatchResponse(BaseModel):
    id: uuid.UUID
    profile_id_a: uuid.UUID
    profile_id_b: uuid.UUID
    compatibility_score: int
    analysis: str
    conversation_starter: str
    created_at: datetime
    matched_profile: ProfileResponse | None = None

    model_config = {"from_attributes": True}


class RunAgentsRequest(BaseModel):
    profile_id: uuid.UUID


class FindMatchesRequest(BaseModel):
    profile_id: uuid.UUID


class SwipeCreate(BaseModel):
    swiper_id: uuid.UUID
    swiped_id: uuid.UUID
    direction: Literal["left", "right"]


class SwipeResponse(BaseModel):
    id: uuid.UUID
    swiper_id: uuid.UUID
    swiped_id: uuid.UUID
    direction: str
    created_at: datetime
    is_mutual: bool = False

    model_config = {"from_attributes": True}


class NotificationResponse(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    type: str
    related_profile_id: uuid.UUID
    related_profile: ProfileResponse | None = None
    message: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CoffeeInviteCreate(BaseModel):
    from_profile_id: uuid.UUID
    to_profile_id: uuid.UUID
    message: str
