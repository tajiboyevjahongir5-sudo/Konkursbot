import logging
from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove
from backend.config import settings
from backend.database import get_or_create_user, save_user_phone, is_uzb_phone

router = Router()
logger = logging.getLogger(__name__)


def get_main_keyboard() -> InlineKeyboardMarkup:
    web_app_url = settings.clean_webapp_url
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🟢 🚀 PEEXELL Web App",
                    web_app=WebAppInfo(url=web_app_url)
                )
            ]
        ]
    )


def get_contact_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="📱 Telefon raqamni yuborish (+998)",
                    request_contact=True
                )
            ]
        ],
        resize_keyboard=True,
        one_time_keyboard=True
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

    # Check if user phone number is verified and is an Uzbekistan (+998) number
    phone = db_user.get("phone_number")
    if not is_uzb_phone(phone):
        verify_text = (
            f"⚡ **PEEXELL KONKURS BOT** ⚡\n\n"
            f"Salom, **{user.first_name}**! 👋\n\n"
            f"🇺🇿 **DIQQAT: TELEFON RAQAMNI TASDIQLASH MAJBURIY!**\n"
            f"Konkursimizda faqat **O'zbekiston (`+998`)** telefon raqamiga ega foydalanuvchilar qatnashishi mumkin.\n\n"
            f"Iltimos, pastdagi **📱 Telefon raqamni yuborish (+998)** tugmasini bosing:"
        )
        await message.answer(
            verify_text,
            parse_mode="Markdown",
            reply_markup=get_contact_keyboard()
        )
        return

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


@router.message(F.contact)
async def contact_handler(message: Message):
    contact = message.contact
    user_id = message.from_user.id

    # Verify that the contact shared belongs to the user
    if contact.user_id and contact.user_id != user_id:
        await message.answer(
            "❌ Iltimos, o'zingizning shaxsiy telefon raqamingizni yuboring!",
            reply_markup=get_contact_keyboard()
        )
        return

    phone = contact.phone_number
    if not is_uzb_phone(phone):
        await message.answer(
            "❌ **Kechirasiz! Konkursimizda faqat O'zbekiston (+998) telefon raqamiga ega foydalanuvchilar qatnashishi mumkin.**",
            parse_mode="Markdown",
            reply_markup=ReplyKeyboardRemove()
        )
        return

    # Save phone number
    await save_user_phone(user_id, phone)

    clean_phone = phone if phone.startswith("+") else f"+{phone}"
    success_text = (
        f"✅ **Telefon raqamingiz muvaffaqiyatli tasdiqlandi! ({clean_phone})** 🎉\n\n"
        f"Endi konkursda qatnashishingiz mumkin! Pastdagi **🚀 PEEXELL Web App** tugmasini bosing:"
    )

    # Remove reply keyboard and send WebApp inline keyboard
    await message.answer("Raqamingiz qabul qilindi!", reply_markup=ReplyKeyboardRemove())
    await message.answer(
        success_text,
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
                    text="🟢 ⚙️ Admin Panelni Ochish",
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
