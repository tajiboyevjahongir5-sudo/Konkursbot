import os
import shutil
import uvicorn
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def setup_env():
    env_path = BASE_DIR / ".env"
    env_example_path = BASE_DIR / ".env.example"
    data_dir = BASE_DIR / "data"

    data_dir.mkdir(parents=True, exist_ok=True)

    if not env_path.exists():
        if env_example_path.exists():
            shutil.copy(env_example_path, env_path)
            print(" Created .env file from .env.example template.")
        else:
            print(" .env.example not found.")


if __name__ == "__main__":
    setup_env()
    print("=" * 60)
    print("🚀 PEEXELL KONKURS TELEGRAM BOT & WEB APP ISHGATUSHMOQDA...")
    print("📍 Local WebApp URL: http://localhost:8000")
    print("=" * 60)
    
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
