from fastapi import APIRouter

from app.api.v1.endpoints import academics, admin, health, resources

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(academics.router)
api_router.include_router(resources.router)
api_router.include_router(admin.router)
