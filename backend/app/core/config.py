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
    supabase_service_role_key: str | None = None

    # ASI:One / ASI:1 OpenAI-compatible credentials (server-side only).
    asi_one_api_key: str | None = None
    asi_one_base_url: str = "https://api.asi1.ai/v1"
    asi_one_model: str = "asi1"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
