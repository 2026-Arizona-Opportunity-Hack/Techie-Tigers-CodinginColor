"""Settings read from the repo-root .env (see .env.example)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    supabase_url: str
    supabase_anon_key: str
    # Bypasses RLS. Only for server-side jobs (imports, AI drafting, API-key route).
    supabase_service_role_key: str
    # Comma-separated list of origins allowed to call the API (the React app).
    frontend_origins: str = "http://localhost:5173"
    # OpenAI-compatible endpoint for AI-drafted donor updates (the OHack gateway).
    # Leave the key unset to turn AI drafting off; updates fall back to templates.
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str | None = None
    openai_model: str = "gpt-oss-120b"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
