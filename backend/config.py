import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

# Base Directory
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    BOT_TOKEN: str = "7891234567:AAExampleTokenForPeexellContestBot"
    ADMIN_IDS: str = "123456789,987654321"
    WEBAPP_URL: str = "http://localhost:8000"
    DATABASE_PATH: str = str(BASE_DIR / "data" / "contest.db")
    SECRET_KEY: str = "peexell_super_secret_key_2026_cyberpunk"

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def clean_webapp_url(self) -> str:
        url = str(self.WEBAPP_URL).strip().rstrip('/')
        if not url.startswith("http://") and not url.startswith("https://"):
            url = "https://" + url
        elif url.startswith("http://") and not ("localhost" in url or "127.0.0.1" in url):
            url = "https://" + url[7:]
        return url

    @property
    def admin_ids_list(self) -> List[int]:
        if not self.ADMIN_IDS:
            return []
        ids = []
        for item in str(self.ADMIN_IDS).split(","):
            item_clean = item.strip()
            if item_clean.isdigit() or (item_clean.startswith("-") and item_clean[1:].isdigit()):
                ids.append(int(item_clean))
        return ids

    def is_admin(self, user_id: int) -> bool:
        return user_id in self.admin_ids_list


settings = Settings()
