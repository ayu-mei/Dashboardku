from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    max_upload_bytes: int = 50 * 1024 * 1024
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def settings():
    return Settings()
