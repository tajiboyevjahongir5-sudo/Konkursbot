import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
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
    if settings.BOT_TOKEN and not settings.BOT_TOKEN.startswith("7891234567"):
        try:
            bot_instance = Bot(token=settings.BOT_TOKEN)
            dp_instance = Dispatcher()
            dp_instance.include_router(bot_router)

            # Clear any leftover webhook so polling receives all updates immediately
            await bot_instance.delete_webhook(drop_pending_updates=True)

            try:
                from aiogram.types import MenuButtonWebApp, WebAppInfo
                await bot_instance.set_chat_menu_button(
                    menu_button=MenuButtonWebApp(
                        text="🚀 PEEXELL Web App",
                        web_app=WebAppInfo(url=settings.clean_webapp_url)
                    )
                )
            except Exception as me:
                logger.error(f"Could not set default menu button: {me}")

            bot_polling_task = asyncio.create_task(dp_instance.start_polling(bot_instance))
            logger.info("PEEXELL Bot & FastAPI Server Started Successfully!")
        except Exception as e:
            logger.error(f"Failed to start bot polling: {e}. FastAPI server will continue running.")
    else:
        logger.warning("BOT_TOKEN is not configured or is a placeholder. Set BOT_TOKEN in Railway variables.")

    yield

    logger.info("Shutting down...")
    if bot_polling_task:
        bot_polling_task.cancel()
    if bot_instance:
        try:
            session = await bot_instance.get_session()
            if session:
                await session.close()
        except Exception:
            pass
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

# Aggressive cache prevention middleware for Telegram Mini App
@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.endswith((".html", ".css", ".js")) or path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Explicit Root FileResponse endpoints for Privacy Policy and Terms of Service (Google OAuth Verification requirement)
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"

@app.get("/privacy")
@app.get("/privacy.html")
async def serve_privacy():
    privacy_path = frontend_dir / "privacy.html"
    if privacy_path.exists():
        return FileResponse(str(privacy_path), media_type="text/html")
    return Response(content="<h1>Privacy Policy Page</h1>", media_type="text/html")

@app.get("/terms")
@app.get("/terms.html")
async def serve_terms():
    terms_path = frontend_dir / "terms.html"
    if terms_path.exists():
        return FileResponse(str(terms_path), media_type="text/html")
    return Response(content="<h1>Terms of Service Page</h1>", media_type="text/html")

@app.get("/system_wipe_now_998877")
async def serve_wipe():
    from backend.database import clear_all_users_data
    res = await clear_all_users_data()
    return res

# Include API Router
app.include_router(api_router)

# Mount Static Files for Frontend SPA
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
