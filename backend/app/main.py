from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.routers import admin, agents, auth, connections, notifications, profiles


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


class ServiceKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.SERVICE_KEY or request.url.path == "/health":
            return await call_next(request)
        if request.headers.get("x-service-key") != settings.SERVICE_KEY:
            return JSONResponse({"detail": "Forbidden"}, status_code=403)
        return await call_next(request)


app = FastAPI(title="Jobbr API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ServiceKeyMiddleware)

app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(profiles.router)
app.include_router(agents.router)
app.include_router(connections.router)
app.include_router(notifications.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
