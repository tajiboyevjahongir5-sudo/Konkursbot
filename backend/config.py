import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

# Base Directory
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    BOT_TOKEN: str = "7891234567:AAExampleTokenForPeexellContestBot"
    ADMIN_IDS_RAW: str = "123456789,987654321"
    WEBAPP_URL: str = "http://localhost:8000"
    DATABASE_PATH: str = str(BASE_DIR / "data" / "contest.db")
    SECRET_KEY: str = "peexell_super_secret_key_2026_cyberpunk"

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def ADMIN_IDS(self) -> List[int]:
        if not self.ADMIN_IDS_RAW:
            return []
        ids = []
        for item in str(self.ADMIN_IDS_RAW).split(","):
            item_clean = item.strip()
            if item_clean.isdigit() or (item_clean.startswith("-") and item_clean[1:].isdigit()):
                ids.append(int(item_clean))
        return ids


settings = Settings()
