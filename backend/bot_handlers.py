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
            ],
            [
                InlineKeyboardButton(
                    text="📢 Rasmiy Kanal",
                    url="https://t.me/peexell_official"
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
    db_user = await get_or_create_user(
        user_id=user.id,
        first_name=user.first_name or "Foydalanuvchi",
        last_name=user.last_name,
        username=user.username,
        referrer_id=referrer_id
    )

    ref_count = await get_user_referrals_count(user.id)
    contest = await get_active_contest()

    bot_info = await message.bot.get_me()
    ref_link = f"https://t.me/{bot_info.username}?start=ref_{user.id}"

    welcome_text = (
        f"⚡ **PEEXELL KONKURS BOTGA XUSH KELIBSIZ!** ⚡\n\n"
        f"Salom, **{user.first_name}**!\n"
        f"🏆 **Konkurs:** {contest['title']}\n"
        f"🎁 **Sovrinlar:** {contest['prize_pool']}\n\n"
        f"🎫 **Sizning biletlaringiz:** `{db_user['tickets']}` ta\n"
        f"👥 **Chaqirgan do'stlaringiz:** `{ref_count}` ta\n\n"
        f"🔗 **Sizning referal havolangiz:**\n`{ref_link}`\n\n"
        f"🚀 Konkursda qatnashish, sponsor kanallarga obuna bo'lish va reytingni ko'rish uchun quyidagi **PEEXELL Web App** tugmasini bosing!"
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
