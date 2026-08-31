import logging
from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from backend.config import settings
from backend.database import get_or_create_user, get_user_referrals_count, get_active_contest

router = Router()
logger = logging.getLogger(__name__)


def get_main_keyboard() -> InlineKeyboardMarkup:
    web_app_url = settings.clean_webapp_url
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 PEEXELL Web App",
                    web_app=WebAppInfo(url=web_app_url)
                )
            ]
        ]
    )


@router.message(CommandStart())
async def start_handler(message: Message):
    user = message.from_user
    text_args = message.text.split()
    referrer_id = None

    if len(text_args) > 1:
        param = text_args[1].strip()
        if param.startswith("ref_"):
            param = param[4:]
        if param.isdigit():
            referrer_id = int(param)

    # Save/update user in database
    await get_or_create_user(
        user_id=user.id,
        first_name=user.first_name or "Foydalanuvchi",
        last_name=user.last_name,
        username=user.username,
        referrer_id=referrer_id
    )

    welcome_text = (
        f"⚡ **PEEXELL KONKURS BOT** ⚡\n\n"
        f"Salom, **{user.first_name}**! 👋\n"
        f"Konkursda qatnashish va bilet olish uchun pastdagi **🚀 PEEXELL Web App** tugmasini bosing:"
    )

    await message.answer(
        welcome_text,
        parse_mode="Markdown",
        reply_markup=get_main_keyboard()
    )


@router.message(Command("admin"))
async def admin_handler(message: Message):
    if not settings.is_admin(message.from_user.id):
        await message.answer("❌ Kechirasiz, siz admin emassiz!")
        return

    admin_url = f"{settings.clean_webapp_url}?tab=admin"
    admin_keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="⚙️ Admin Panelni Ochish",
                    web_app=WebAppInfo(url=admin_url)
                )
            ]
        ]
    )

    admin_text = (
        f"⚙️ **PEEXELL ADMIN PANEL** ⚙️\n\n"
        f"Siz admin huquqiga egasiz!\n"
        f"Admin panelini bevosita ochish uchun pastdagi tugmani bosing:"
    )

    await message.answer(
        admin_text,
        parse_mode="Markdown",
        reply_markup=admin_keyboard
    )
