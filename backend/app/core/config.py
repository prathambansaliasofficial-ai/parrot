from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Parrot API"
    environment: str = "development"
    cors_origins: str = "http://localhost:3000"
    supabase_url: str | None = None
    # Prefer the new secret key. Keep legacy service_role support during migration.
    supabase_secret_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str = "course-resources"
    ingestion_api_key: str | None = None
    max_upload_size_mb: int = 50

    @property
    def supabase_server_key(self) -> str | None:
        return self.supabase_secret_key or self.supabase_service_role_key

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
