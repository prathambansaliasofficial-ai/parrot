from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.2.0",
    description="FreeResources catalog API and Supabase resource ingestion.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Ingestion-Key"],
)

app.include_router(api_router)


@app.get("/health", tags=["health"])
def root_health() -> dict[str, str]:
    return {"status": "ok", "service": "parrot-api"}
