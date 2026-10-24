from fastapi import APIRouter

<<<<<<< HEAD
from app.api.v1.endpoints import health, resources, tutor, upload
=======
from app.api.v1.endpoints import academics, admin, health, resources
>>>>>>> 48299e259552bcd96d9e5997f35bae5d20ab9192

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(academics.router)
api_router.include_router(resources.router)
<<<<<<< HEAD
api_router.include_router(tutor.router)
api_router.include_router(upload.router)
=======
api_router.include_router(admin.router)
>>>>>>> 48299e259552bcd96d9e5997f35bae5d20ab9192
