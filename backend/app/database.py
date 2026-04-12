from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.get_database_url(), echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    from app import models  # noqa: F401
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        # Add embedding columns to existing tables that predate this migration
        await conn.execute(text(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS offer_embedding vector(1024)"
        ))
        await conn.execute(text(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS seek_embedding vector(1024)"
        ))
        await conn.execute(text(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS work_history text"
        ))
        # admins table is created by create_all; no ALTER needed
        await conn.execute(text(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS education text"
        ))
        await conn.execute(text(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_url varchar"
        ))
        await conn.execute(text(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()"
        ))
        await conn.execute(text(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website_url varchar"
        ))
        await conn.execute(text(
            "ALTER TABLE magic_link_tokens ADD COLUMN IF NOT EXISTS pending_email varchar"
        ))
        await conn.execute(text(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS secondary_role varchar"
        ))
        await conn.execute(text(
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_complete boolean NOT NULL DEFAULT false"
        ))
        await conn.execute(text(
            "ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS first_name varchar"
        ))
        await conn.execute(text(
            "ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS last_name varchar"
        ))
        await conn.execute(text(
            "ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS approved_at timestamptz"
        ))
        # Remove old columns dropped in refactor (were NOT NULL, causing 500s)
        await conn.execute(text(
            "ALTER TABLE matches DROP COLUMN IF EXISTS analysis"
        ))
        await conn.execute(text(
            "ALTER TABLE matches DROP COLUMN IF EXISTS conversation_starter"
        ))
        # introductions table added - create_all handles it, but ensure
        # it exists on prod DBs that predate this migration
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS introductions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                profile_id_a UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                profile_id_b UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                introduced_by VARCHAR NOT NULL,
                message TEXT,
                created_at TIMESTAMPTZ DEFAULT now(),
                CONSTRAINT uq_introduction UNIQUE (profile_id_a, profile_id_b)
            )
        """))
