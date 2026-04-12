from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db

_security = HTTPBearer()


def _decode_token(credentials: HTTPAuthorizationCredentials) -> dict:
    try:
        return jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")


def get_current_email(
    credentials: HTTPAuthorizationCredentials = Security(_security),
) -> str:
    return _decode_token(credentials)["email"]


def get_current_payload(
    credentials: HTTPAuthorizationCredentials = Security(_security),
) -> dict:
    return _decode_token(credentials)


async def get_current_admin(
    payload: dict = Depends(get_current_payload),
    db: AsyncSession = Depends(get_db),
) -> str:
    from app.models import Admin
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    result = await db.execute(select(Admin).where(Admin.email == payload["email"]))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload["email"]
