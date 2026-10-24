from fastapi import APIRouter

from app.api.v1.endpoints import health, resources, tutor, upload

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(resources.router)
api_router.include_router(tutor.router)
api_router.include_router(upload.router)
