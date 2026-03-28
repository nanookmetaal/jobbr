from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Vercel Postgres sets POSTGRES_URL, not DATABASE_URL - accept either
    DATABASE_URL: str = ""
    POSTGRES_URL: str = ""
    ANTHROPIC_API_KEY: str
    FRONTEND_URL: str = "http://localhost:3000"
    RESEND_API_KEY: str
    EMAIL_FROM: str = ""
    VOYAGE_API_KEY: str
    JWT_SECRET: str
    ADMIN_EMAIL: str = ""
    ADMIN_SECRET: str = ""

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def transform_db_url(cls, v: str) -> str:
        if not v:
            return v
        # Vercel Postgres provides postgres:// - convert to asyncpg format
        if v.startswith("postgres://"):
            v = "postgresql+asyncpg://" + v[len("postgres://"):]
        elif v.startswith("postgresql://") and "+asyncpg" not in v:
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        # asyncpg uses ssl=require, not sslmode=require
        v = v.replace("sslmode=require", "ssl=require")
        # SQLAlchemy's asyncpg dialect doesn't support channel_binding URL param - strip it
        v = v.replace("channel_binding=require&", "")
        v = v.replace("&channel_binding=require", "")
        v = v.replace("channel_binding=require", "")
        return v

    def get_database_url(self) -> str:
        """Return DATABASE_URL, falling back to POSTGRES_URL if not set."""
        return self.DATABASE_URL or self.transform_db_url(self.POSTGRES_URL)

    class Config:
        env_file = ".env"


settings = Settings()
