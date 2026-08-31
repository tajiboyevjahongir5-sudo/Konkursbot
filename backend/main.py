import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from aiogram import Bot, Dispatcher

from backend.config import settings
from backend.database import init_db
from backend.bot_handlers import router as bot_router
from backend.api import router as api_router

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("PEEXELL_BOT")

# Bot & Dispatcher Globals
bot_instance: Bot = None
dp_instance: Dispatcher = None
bot_polling_task: asyncio.Task = None


def get_bot_instance() -> Bot:
    global bot_instance
    return bot_instance


@asynccontextmanager
async def lifespan(app: FastAPI):
    global bot_instance, dp_instance, bot_polling_task
    logger.info("Initializing Database...")
    await init_db()

    logger.info("Starting Telegram Bot...")
    bot_instance = Bot(token=settings.BOT_TOKEN)
    dp_instance = Dispatcher()
    dp_instance.include_router(bot_router)

    # Start bot polling in background task
    bot_polling_task = asyncio.create_task(dp_instance.start_polling(bot_instance))
    logger.info("PEEXELL Bot & FastAPI Server Started Successfully!")

    yield

    logger.info("Shutting down...")
    if bot_polling_task:
        bot_polling_task.cancel()
    if bot_instance:
        session = await bot_instance.get_session()
        await session.close()
    logger.info("Shutdown complete.")


app = FastAPI(
    title="PEEXELL KONKURS Web App API",
    description="Telegram Mini App and Bot backend for PEEXELL Contest",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Router
app.include_router(api_router)

# Mount Static Files for Frontend SPA
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
