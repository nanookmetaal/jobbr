import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, Boolean, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

ProfileType = Enum(
    "job_seeker",
    "employer",
    "mentor",
    "mentee",
    name="profile_type_enum",
)


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    profile_type: Mapped[str] = mapped_column(ProfileType, nullable=False)
    secondary_role: Mapped[str | None] = mapped_column(String, nullable=True)  # "mentor" or "mentee"
    title: Mapped[str] = mapped_column(String, nullable=False)
    bio: Mapped[str] = mapped_column(Text, nullable=False)
    skills: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    experience_years: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    location: Mapped[str] = mapped_column(String, nullable=False)
    looking_for: Mapped[str] = mapped_column(Text, nullable=False)
    work_history: Mapped[str | None] = mapped_column(Text, nullable=True)
    education: Mapped[str | None] = mapped_column(Text, nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String, nullable=True)
    website_url: Mapped[str | None] = mapped_column(String, nullable=True)
    is_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    offer_embedding: Mapped[list[float] | None] = mapped_column(Vector(1024), nullable=True)
    seek_embedding: Mapped[list[float] | None] = mapped_column(Vector(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    analyses: Mapped[list["AgentAnalysis"]] = relationship(
        "AgentAnalysis", back_populates="profile", cascade="all, delete-orphan"
    )
    matches_as_a: Mapped[list["Match"]] = relationship(
        "Match", foreign_keys="Match.profile_id_a", back_populates="profile_a", passive_deletes=True
    )
    matches_as_b: Mapped[list["Match"]] = relationship(
        "Match", foreign_keys="Match.profile_id_b", back_populates="profile_b", passive_deletes=True
    )
    swipes_given: Mapped[list["Swipe"]] = relationship(
        "Swipe", foreign_keys="Swipe.swiper_id", back_populates="swiper", passive_deletes=True
    )
    swipes_received: Mapped[list["Swipe"]] = relationship(
        "Swipe", foreign_keys="Swipe.swiped_id", back_populates="swiped", passive_deletes=True
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification", foreign_keys="Notification.profile_id", back_populates="profile", passive_deletes=True
    )


class AgentAnalysis(Base):
    __tablename__ = "agent_analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    agent_type: Mapped[str] = mapped_column(String, nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    profile: Mapped["Profile"] = relationship("Profile", back_populates="analyses")


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    profile_id_a: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    profile_id_b: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    compatibility_score: Mapped[int] = mapped_column(Integer, nullable=False)
    analysis: Mapped[str] = mapped_column(Text, nullable=False)
    conversation_starter: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    profile_a: Mapped["Profile"] = relationship(
        "Profile", foreign_keys=[profile_id_a], back_populates="matches_as_a"
    )
    profile_b: Mapped["Profile"] = relationship(
        "Profile", foreign_keys=[profile_id_b], back_populates="matches_as_b"
    )


class Swipe(Base):
    __tablename__ = "swipes"
    __table_args__ = (UniqueConstraint("swiper_id", "swiped_id", name="uq_swipe_pair"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    swiper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    swiped_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    direction: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    swiper: Mapped["Profile"] = relationship(
        "Profile", foreign_keys=[swiper_id], back_populates="swipes_given"
    )
    swiped: Mapped["Profile"] = relationship(
        "Profile", foreign_keys=[swiped_id], back_populates="swipes_received"
    )


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class WaitlistEntry(Base):
    __tablename__ = "waitlist"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    first_name: Mapped[str | None] = mapped_column(String, nullable=True)
    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)  # pending | approved
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ConnectionRequest(Base):
    __tablename__ = "connection_requests"
    __table_args__ = (UniqueConstraint("from_profile_id", "to_profile_id", name="uq_connection_request"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    from_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    to_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    from_profile: Mapped["Profile"] = relationship("Profile", foreign_keys=[from_profile_id])
    to_profile: Mapped["Profile"] = relationship("Profile", foreign_keys=[to_profile_id])


class MagicLinkToken(Base):
    __tablename__ = "magic_link_tokens"
    __table_args__ = (Index("ix_magic_link_tokens_token", "token"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String, nullable=False)
    token: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    related_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    profile: Mapped["Profile"] = relationship(
        "Profile", foreign_keys=[profile_id], back_populates="notifications"
    )
    related_profile: Mapped["Profile"] = relationship(
        "Profile", foreign_keys=[related_profile_id]
    )
