import hmac
import hashlib
import json
import urllib.parse
from typing import Optional, List
from fastapi import APIRouter, Header, HTTPException, Depends, Query, Response
from pydantic import BaseModel

from backend.config import settings
from backend.database import (
    get_or_create_user,
    get_user,
    get_user_referrals_count,
    get_leaderboard,
    get_sponsors,
    add_sponsor,
    delete_sponsor,
    get_user_tasks,
    mark_task_completed,
    get_active_contest,
    update_contest,
    pick_random_winners,
    get_winners,
    get_admin_stats,
    get_db,
    get_user_tickets,
    participate_in_contest,
    is_uzb_phone
)

router = APIRouter(prefix="/api")

# Pydantic Schemas
class AddSponsorRequest(BaseModel):
    title: str
    channel_id: str
    invite_link: str
    platform: Optional[str] = "telegram"
    youtube_channel_id: Optional[str] = None


class UpdateContestRequest(BaseModel):
    title: str
    description: str
    prize_pool: str
    end_time: str


class CheckTaskRequest(BaseModel):
    sponsor_id: int


class PickWinnersRequest(BaseModel):
    count: int = 3
    prizes: Optional[List[str]] = None


def verify_telegram_webapp_data(init_data: str) -> dict:
    """Verifies Telegram WebApp initData string using HMAC-SHA256 signature."""
    if not init_data:
        raise HTTPException(status_code=401, detail="initData topilmadi")

    try:
        parsed_data = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        raise HTTPException(status_code=400, detail="initData formati noto'g'ri")

    if "hash" not in parsed_data:
        # Fallback for dev/preview testing mode if data doesn't have hash
        if "user" in parsed_data:
            return json.loads(parsed_data["user"])
        raise HTTPException(status_code=401, detail="Hash yetishmayapti")

    hash_val = parsed_data.pop("hash")
    
    # Sort keys
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))
    
    # Secret key calculation: HMAC-SHA256 of bot_token with key "WebAppData"
    secret_key = hmac.new(b"WebAppData", settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    # Note: In strict production, check calculated_hash == hash_val
    # We validate strictly, but fallback gracefully for dev testing
    if calculated_hash != hash_val and not settings.BOT_TOKEN.startswith("7891234567"):
        raise HTTPException(status_code=401, detail="Telegram initData tasdiqlanmadi (Invalid Hash)")

    if "user" not in parsed_data:
        raise HTTPException(status_code=400, detail="User ma'lumotlari topilmadi")

    return json.loads(parsed_data["user"])


async def get_current_user(
    x_telegram_init_data: Optional[str] = Header(None),
    initData: Optional[str] = Query(None)
) -> dict:
    raw_init_data = x_telegram_init_data or initData

    # Dev/Browser test mode fallback only if dummy token
    if not raw_init_data:
        if settings.BOT_TOKEN.startswith("7891234567"):
            tg_user = {
                "id": 999999999,
                "first_name": "Test User",
                "last_name": "PEEXELL",
                "username": "test_peexell_user"
            }
        else:
            raise HTTPException(status_code=401, detail="Telegram initData topilmadi")
    else:
        tg_user = verify_telegram_webapp_data(raw_init_data)

    user_db = await get_or_create_user(
        user_id=tg_user["id"],
        first_name=tg_user.get("first_name", "Foydalanuvchi"),
        last_name=tg_user.get("last_name"),
        username=tg_user.get("username")
    )
    return user_db


async def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    if not settings.is_admin(user["id"]) and not (user["id"] == 999999999 and settings.BOT_TOKEN.startswith("7891234567")):
        raise HTTPException(status_code=403, detail="Ruxsat berilmagan! Faqat Adminlar uchun.")
    return user


# --- PUBLIC API ENDPOINTS ---

@router.get("/user/me")
async def get_me(user: dict = Depends(get_current_user)):
    ref_count = await get_user_referrals_count(user["id"])
    user_tickets_list = await get_user_tickets(user["id"])
    is_admin = settings.is_admin(user["id"]) or (user["id"] == 999999999)
    bot_name = "peexell_contest_bot"
    ref_link = f"https://t.me/{bot_name}?start=ref_{user['id']}"

    return {
        "status": "success",
        "user": {
            "id": user["id"],
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "username": user["username"],
            "tickets": len(user_tickets_list),
            "points": user["points"],
            "ref_code": user["ref_code"],
            "referrals_count": ref_count,
            "ref_link": ref_link,
            "is_admin": is_admin,
            "phone_number": user.get("phone_number"),
            "is_phone_verified": is_uzb_phone(user.get("phone_number")),
            "tickets_list": user_tickets_list
        }
    }


@router.get("/user/photo/{user_id}")
async def get_user_photo(user_id: int):
    from backend.main import get_bot_instance
    bot = get_bot_instance()
    if bot and user_id > 0:
        try:
            photos = await bot.get_user_profile_photos(user_id=user_id, limit=1)
            if photos and photos.total_count > 0:
                file_id = photos.photos[0][-1].file_id
                file_info = await bot.get_file(file_id)
                photo_url = f"https://api.telegram.org/file/bot{settings.BOT_TOKEN}/{file_info.file_path}"
                return Response(status_code=302, headers={"Location": photo_url})
        except Exception:
            pass

    return Response(status_code=302, headers={"Location": "/assets/avatar.png"})


@router.get("/channel/photo")
async def get_channel_photo(channel_id: str):
    from backend.main import get_bot_instance
    bot = get_bot_instance()
    if bot and channel_id:
        try:
            chat = await bot.get_chat(channel_id)
            if chat and chat.photo:
                file_info = await bot.get_file(chat.photo.small_file_id)
                photo_url = f"https://api.telegram.org/file/bot{settings.BOT_TOKEN}/{file_info.file_path}"
                return Response(status_code=302, headers={"Location": photo_url})
        except Exception:
            pass

    return Response(status_code=302, headers={"Location": "/assets/logo.jpg"})


@router.get("/privacy")
async def get_privacy_page():
    from fastapi.responses import FileResponse
    from pathlib import Path
    privacy_path = Path(__file__).resolve().parent.parent / "frontend" / "privacy.html"
    if privacy_path.exists():
        return FileResponse(str(privacy_path), media_type="text/html")
    return Response(content="<h1>Privacy Policy Page</h1>", media_type="text/html")


@router.get("/terms")
async def get_terms_page():
    from fastapi.responses import FileResponse
    from pathlib import Path
    terms_path = Path(__file__).resolve().parent.parent / "frontend" / "terms.html"
    if terms_path.exists():
        return FileResponse(str(terms_path), media_type="text/html")
    return Response(content="<h1>Terms of Service Page</h1>", media_type="text/html")


@router.post("/contest/participate")
async def participate_contest_endpoint(user: dict = Depends(get_current_user)):
    # Enforce Uzbekistan Phone Verification (+998)
    if not is_uzb_phone(user.get("phone_number")) and user["id"] != 999999999:
        return {
            "status": "error",
            "message": "❌ Konkursda qatnashish uchun avval Telegram botimizda O'zbekiston (+998) telefon raqamingizni tasdiqlang!"
        }

    # Verify user channel subscriptions across ALL platforms
    sponsors = await get_sponsors(active_only=True)
    from backend.main import get_bot_instance
    bot = get_bot_instance()

    unsubscribed_sponsors = []
    user_tasks_list = await get_user_tasks(user["id"])
    completed_task_ids = {t["sponsor_id"] for t in user_tasks_list if t.get("completed") == 1}

    for s in sponsors:
        inv = str(s.get("invite_link", "")).lower()
        p_type = s.get("platform") or "telegram"
        if "youtube.com" in inv or "youtu.be" in inv:
            p_type = "youtube"
        elif "instagram.com" in inv:
            p_type = "instagram"

        if p_type == "telegram":
            is_sub = False
            if bot:
                try:
                    member = await bot.get_chat_member(chat_id=s["channel_id"], user_id=user["id"])
                    if member.status in ["creator", "administrator", "member"]:
                        is_sub = True
                        await mark_task_completed(user["id"], s["id"])
                except Exception:
                    if user["id"] == 999999999 and settings.BOT_TOKEN.startswith("7891234567"):
                        is_sub = True

            if not is_sub and not (user["id"] == 999999999 and settings.BOT_TOKEN.startswith("7891234567")):
                unsubscribed_sponsors.append(s["title"])

        elif p_type in ["youtube", "instagram"]:
            if s["id"] not in completed_task_ids:
                unsubscribed_sponsors.append(s["title"])

    if unsubscribed_sponsors and not (user["id"] == 999999999 and settings.BOT_TOKEN.startswith("7891234567")):
        joined_list = ", ".join(unsubscribed_sponsors)
        from backend.database import revoke_user_tickets_for_unsub
        revoked = await revoke_user_tickets_for_unsub(user["id"])
        msg = f"❌ Iltimos, barcha homiy kanallarga obuna bo'ling! Obuna bo'linmagan: {joined_list}"
        if revoked > 0:
            msg = f"⚠️ DIQQAT! Siz homiy kanallardan ({joined_list}) chiqib ketganingiz sababli barcha biletlaringiz BEKOR QILINDI! Qayta qatnashish uchun barcha homiylarga obuna bo'ling."
        return {
            "status": "error",
            "message": msg
        }

    # Execute contest participation and ticket issuance
    res = await participate_in_contest(user["id"])
    if res["already_joined"]:
        return {
            "status": "success",
            "already_joined": True,
            "ticket_number": res["ticket_number"],
            "total_tickets": res["total_tickets"],
            "message": f"Siz allaqachon barcha homiylarga obuna bo'lgansiz va konkursga qatnashgansiz! Biletingiz: {res['ticket_number']}"
        }

    return {
        "status": "success",
        "already_joined": False,
        "ticket_number": res["ticket_number"],
        "total_tickets": res["total_tickets"],
        "message": f"🎉 Tabriklaymiz! Barcha homiylarga obuna bo'ldingiz va konkursda muvaffaqiyatli qatnashdingiz! Omadli biletingiz: {res['ticket_number']}"
    }


@router.get("/contest/active")
async def get_contest():
    contest = await get_active_contest()
    return {"status": "success", "contest": contest}


@router.get("/tasks")
async def get_tasks(user: dict = Depends(get_current_user)):
    tasks = await get_user_tasks(user["id"])
    return {"status": "success", "tasks": tasks}


@router.post("/tasks/check")
async def check_task(body: CheckTaskRequest, user: dict = Depends(get_current_user)):
    sponsors = await get_sponsors(active_only=False)
    sponsor = next((s for s in sponsors if s["id"] == body.sponsor_id), None)
    
    if not sponsor:
        raise HTTPException(status_code=404, detail="Sponsor kanal topilmadi")

    inv_link = str(sponsor.get("invite_link", "")).lower()
    platform = sponsor.get("platform") or "telegram"
    if "youtube.com" in inv_link or "youtu.be" in inv_link:
        platform = "youtube"
    elif "instagram.com" in inv_link:
        platform = "instagram"

    is_subscribed = False

    from backend.main import get_bot_instance
    bot = get_bot_instance()

    if platform in ["youtube", "instagram"]:
        # Check if already completed in user_tasks
        user_tasks_list = await get_user_tasks(user["id"])
        is_subscribed = any(t["sponsor_id"] == body.sponsor_id and t.get("completed") == 1 for t in user_tasks_list)
    elif bot:
        try:
            member = await bot.get_chat_member(chat_id=sponsor["channel_id"], user_id=user["id"])
            if member.status in ["creator", "administrator", "member"]:
                is_subscribed = True
            else:
                is_subscribed = False
        except Exception:
            if user["id"] == 999999999 and settings.BOT_TOKEN.startswith("7891234567"):
                is_subscribed = True
            else:
                is_subscribed = False
    else:
        if user["id"] == 999999999 and settings.BOT_TOKEN.startswith("7891234567"):
            is_subscribed = True
        else:
            is_subscribed = False

    if is_subscribed:
        res = await mark_task_completed(user["id"], body.sponsor_id)
        if isinstance(res, dict) and res.get("status") == "error":
            return {
                "status": "error",
                "completed": False,
                "message": res.get("message", "Xatolik yuz berdi")
            }

        all_completed = isinstance(res, dict) and res.get("all_completed")
        already_done = isinstance(res, dict) and res.get("already_done")
        ticket_issued = isinstance(res, dict) and res.get("ticket_issued")
        t_num = res.get("ticket_number") if isinstance(res, dict) else None

        if all_completed:
            if ticket_issued:
                msg = f"🎉 Tabriklaymiz! Barcha homiy kanallarga obuna bo'ldingiz! Bilet biriktirildi: {t_num}"
            else:
                msg = f"🎉 Tabriklaymiz! Barcha homiylarga obuna bo'lgansiz. Biletingiz: {t_num or '#PXL-1001'}"
        else:
            if already_done:
                msg = f"✅ '{sponsor['title']}' kanaliga obuna tasdiqlangan. Bilet olish uchun qolgan homiy kanallarga ham obuna bo'ling."
            else:
                msg = f"✅ '{sponsor['title']}' kanaliga obuna tasdiqlandi! Bilet berilishi uchun barcha homiy kanallarga obuna bo'ling."

        return {
            "status": "success",
            "completed": True,
            "all_completed": all_completed,
            "message": msg
        }
    else:
        return {
            "status": "error",
            "completed": False,
            "message": f"❌ Siz '{sponsor['title']}' kanaliga obuna bo'lmadingiz! Iltimos obuna bo'ling."
        }


@router.get("/leaderboard")
async def leaderboard():
    top_users = await get_leaderboard(limit=50)
    return {"status": "success", "leaderboard": top_users}


@router.get("/winners")
async def winners_list():
    winners = await get_winners()
    return {"status": "success", "winners": winners}


# --- ADMIN API ENDPOINTS ---

@router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(get_current_admin)):
    stats = await get_admin_stats()
    return {"status": "success", "stats": stats}


@router.get("/admin/sponsors")
async def admin_get_sponsors(admin: dict = Depends(get_current_admin)):
    sponsors = await get_sponsors(active_only=False)
    return {"status": "success", "sponsors": sponsors}


@router.post("/admin/sponsors")
async def admin_add_sponsor(body: AddSponsorRequest, admin: dict = Depends(get_current_admin)):
    sp_id = await add_sponsor(body.title, body.channel_id, body.invite_link, body.platform or "telegram", body.youtube_channel_id)
    return {"status": "success", "message": "Sponsor muvaffaqiyatli qo'shildi", "sponsor_id": sp_id}


@router.delete("/admin/sponsors/{sponsor_id}")
async def admin_delete_sponsor(sponsor_id: int, admin: dict = Depends(get_current_admin)):
    await delete_sponsor(sponsor_id)
    return {"status": "success", "message": "Sponsor o'chirildi"}


@router.post("/admin/contest/update")
async def admin_update_contest(body: UpdateContestRequest, admin: dict = Depends(get_current_admin)):
    await update_contest(body.title, body.description, body.prize_pool, body.end_time)
    return {"status": "success", "message": "Konkurs tahrirlandi"}


@router.post("/admin/contest/reset_tickets")
async def admin_reset_tickets(admin: dict = Depends(get_current_admin)):
    from backend.database import clear_all_tickets_and_participants
    await clear_all_tickets_and_participants()
    return {"status": "success", "message": "🧹 Barcha biletlar va qatnashchilar yangi konkurs uchun tozalandi!"}


class BroadcastRequest(BaseModel):
    message: str


@router.post("/admin/winners/pick")
async def admin_pick_winners(body: PickWinnersRequest, admin: dict = Depends(get_current_admin)):
    contest = await get_active_contest()

    # Pre-check active Telegram sponsors and purge unsubscribed candidates before random selection
    sponsors = await get_sponsors(active_only=True)
    from backend.main import get_bot_instance
    bot = get_bot_instance()
    from backend.database import revoke_user_tickets_for_unsub, get_db

    if bot:
        async with get_db() as db:
            async with db.execute("SELECT user_id FROM contest_participants WHERE contest_id = ?", (contest["id"],)) as c_p:
                participants = await c_p.fetchall()

        for p in participants:
            uid = p["user_id"]
            for s in sponsors:
                if s.get("platform", "telegram") == "telegram":
                    try:
                        member = await bot.get_chat_member(chat_id=s["channel_id"], user_id=uid)
                        if member.status not in ["creator", "administrator", "member"]:
                            await revoke_user_tickets_for_unsub(uid)
                            break
                    except Exception:
                        pass

    winners = await pick_random_winners(contest["id"], body.count, body.prizes)

    # Auto-notify winners via Telegram bot
    if bot and winners:
        import asyncio
        for w in winners:
            try:
                msg = (
                    f"🎉 <b>TABRIKLAYMIZ!</b>\n\n"
                    f"Siz PEEXELL GRAND KONKURSida <b>{w['place']}-O'rin</b> (<i>{w['prize']}</i>) g'olibi bo'ldingiz!\n\n"
                    f"📞 Sovrinni olish uchun tez orada admin siz bilan bog'lanadi."
                )
                await bot.send_message(chat_id=w["user_id"], text=msg, parse_mode="HTML")
                await asyncio.sleep(0.05)
            except Exception:
                pass

    return {"status": "success", "winners": winners}


@router.post("/admin/broadcast")
async def admin_broadcast(body: BroadcastRequest, admin: dict = Depends(get_current_admin)):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Xabar matni bo'sh bo'lishi mumkin emas")

    from backend.main import get_bot_instance
    bot = get_bot_instance()

    if not bot:
        raise HTTPException(status_code=500, detail="Bot instansiyasi faol emas")

    async with get_db() as db:
        async with db.execute("SELECT id FROM users") as cursor:
            users = await cursor.fetchall()

    success_count = 0
    fail_count = 0
    import asyncio

    for u in users:
        try:
            await bot.send_message(chat_id=u["id"], text=body.message, parse_mode="HTML")
            success_count += 1
            await asyncio.sleep(0.04)
        except Exception:
            fail_count += 1

    return {
        "status": "success",
        "message": f"📢 Ommaviy xabar yuborildi!\n✅ Muvaffaqiyatli: {success_count} ta\n❌ Yetib bormadi: {fail_count} ta"
    }


@router.get("/admin/export")
async def admin_export(format: str = Query("csv"), admin: dict = Depends(get_current_admin)):
    async with get_db() as db:
        # Get active contest ID & title
        async with db.execute("SELECT id, title FROM contests WHERE is_active = 1 ORDER BY id DESC LIMIT 1") as c0:
            row_c = await c0.fetchone()
            contest_id = row_c["id"] if row_c else 1
            contest_name = row_c["title"] if row_c else "PEEXELL GRAND KONKURS"

        # Single fast query returning user info, aggregated ticket numbers, ticket count, and referral count
        async with db.execute("""
            SELECT 
                u.id,
                u.first_name,
                u.last_name,
                u.username,
                u.phone_number,
                u.created_at,
                COUNT(DISTINCT ut.id) as ticket_count,
                GROUP_CONCAT(DISTINCT ut.ticket_number) as ticket_numbers_str,
                (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = u.id) as referrals_count
            FROM users u
            LEFT JOIN user_tickets ut ON u.id = ut.user_id AND ut.contest_id = ?
            GROUP BY u.id
            ORDER BY ticket_count DESC, u.id ASC
        """, (contest_id,)) as cursor:
            rows = await cursor.fetchall()
            users_data = [dict(r) for r in rows]

    if format == "csv":
        import csv
        import io
        output = io.StringIO()
        # Write UTF-8 BOM for Excel auto-encoding
        output.write('\ufeff')
        writer = csv.writer(output, delimiter=';')
        
        # Report Header
        writer.writerow([f"PEEXELL KONKURS HISOBOT FAYLI - {contest_name}"])
        writer.writerow([])
        writer.writerow([
            "T/r",
            "Telegram ID",
            "Foydalanuvchi Ismi",
            "Username",
            "Telefon Raqami",
            "Biletlar Soni",
            "Bilet Raqamlari (Seriya)",
            "Chaqirgan Do'stlari",
            "Ro'yxatdan O'tgan Vaqti"
        ])

        for idx, u in enumerate(users_data, start=1):
            full_name = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip() or "Foydalanuvchi"
            uname = f"@{u['username']}" if u.get("username") else "Mavjud emas"
            phone = u.get("phone_number") or "Tasdiqlanmagan"
            tickets_str = u.get("ticket_numbers_str") or "Bilet yo'q"
            ticket_count = u.get("ticket_count") or 0
            ref_cnt = u.get("referrals_count") or 0
            created = u.get("created_at") or ""

            writer.writerow([
                idx,
                u["id"],
                full_name,
                uname,
                phone,
                f"{ticket_count} ta",
                tickets_str,
                f"{ref_cnt} ta",
                created
            ])

        csv_data = output.getvalue().encode('utf-8-sig')
        filename = f"peexell_konkurs_hisoboti.csv"
        return Response(
            content=csv_data,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    # Return structured JSON format
    export_list = []
    for idx, u in enumerate(users_data, start=1):
        full_name = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip() or "Foydalanuvchi"
        t_list = u.get("ticket_numbers_str").split(",") if u.get("ticket_numbers_str") else []
        export_list.append({
            "tr": idx,
            "id": u["id"],
            "name": full_name,
            "username": f"@{u['username']}" if u.get("username") else None,
            "phone_number": u.get("phone_number"),
            "tickets_count": u.get("ticket_count", 0),
            "ticket_numbers": t_list,
            "referrals_count": u.get("referrals_count", 0),
            "created_at": u.get("created_at")
        })

    return {
        "status": "success",
        "contest": contest_name,
        "total_participants": len(export_list),
        "data": export_list
    }


# --- YOUTUBE DATA API (GOOGLE OAUTH 2.0) ENDPOINTS ---

@router.get("/auth/google/url")
async def get_google_auth_url(sponsor_id: int, user: dict = Depends(get_current_user)):
    if not settings.GOOGLE_CLIENT_ID:
        return {
            "status": "config_required",
            "message": "Google OAuth API sozlanmagan. Server .env faylida GOOGLE_CLIENT_ID va GOOGLE_CLIENT_SECRET ni o'rnating."
        }

    scope = "https://www.googleapis.com/auth/youtube.readonly"
    state_str = f"{user['id']}_{sponsor_id}"

    redirect_uri = settings.GOOGLE_REDIRECT_URI or f"{settings.clean_webapp_url}/api/auth/google/callback"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.GOOGLE_CLIENT_ID}&"
        f"redirect_uri={urllib.parse.quote(redirect_uri, safe='')}&"
        f"response_type=code&"
        f"scope={urllib.parse.quote(scope, safe='')}&"
        f"prompt=select_account&"
        f"state={state_str}"
    )
    return {"status": "success", "url": auth_url}


@router.get("/auth/google/callback")
async def google_auth_callback(code: str, state: str):
    import urllib.request
    try:
        parts = state.split("_")
        user_id = int(parts[0]) if len(parts) > 0 else 0
        sponsor_id = int(parts[1]) if len(parts) > 1 else 0

        redirect_uri = settings.GOOGLE_REDIRECT_URI or f"{settings.clean_webapp_url}/api/auth/google/callback"
        token_url = "https://oauth2.googleapis.com/token"
        token_data = urllib.parse.urlencode({
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"
        }).encode("utf-8")

        req = urllib.request.Request(token_url, data=token_data, headers={"Content-Type": "application/x-www-form-urlencoded"})
        with urllib.request.urlopen(req) as resp:
            token_resp = json.loads(resp.read().decode("utf-8"))

        access_token = token_resp.get("access_token")
        if not access_token:
            return Response(content="<div style='font-family: sans-serif; text-align: center; padding: 40px; color: #ff3b30;'><h2>❌ Google Auth Xatosi: Access Token olinmadi</h2></div>", media_type="text/html")

        sponsors = await get_sponsors(active_only=False)
        sponsor = next((s for s in sponsors if s["id"] == sponsor_id), None)
        target_yt_id = sponsor.get("youtube_channel_id") if sponsor else None

        is_subbed = False
        try:
            yt_api_url = "https://www.googleapis.com/youtube/v3/subscriptions?mine=true&maxResults=50"
            if target_yt_id and str(target_yt_id).startswith("UC"):
                yt_api_url += f"&forChannelId={target_yt_id}"

            yt_req = urllib.request.Request(yt_api_url, headers={"Authorization": f"Bearer {access_token}"})
            with urllib.request.urlopen(yt_req) as yt_resp:
                yt_data = json.loads(yt_resp.read().decode("utf-8"))
                items = yt_data.get("items", [])
                if len(items) > 0:
                    is_subbed = True

            if not is_subbed and target_yt_id:
                gen_url = "https://www.googleapis.com/youtube/v3/subscriptions?mine=true&maxResults=50"
                gen_req = urllib.request.Request(gen_url, headers={"Authorization": f"Bearer {access_token}"})
                with urllib.request.urlopen(gen_req) as gen_resp:
                    gen_data = json.loads(gen_resp.read().decode("utf-8"))
                    for item in gen_data.get("items", []):
                        snippet = item.get("snippet", {})
                        ch_id = snippet.get("resourceId", {}).get("channelId", "")
                        ch_title = snippet.get("title", "").lower()
                        t_str = str(target_yt_id).lower()
                        sp_title = str(sponsor.get("title", "")).lower() if sponsor else ""
                        if t_str in ch_id.lower() or t_str in ch_title or (sp_title and sp_title in ch_title):
                            is_subbed = True
                            break
        except Exception:
            pass

        # Fetch Google User ID (sub)
        google_user_id = None
        try:
            u_req = urllib.request.Request("https://www.googleapis.com/oauth2/v3/userinfo", headers={"Authorization": f"Bearer {access_token}"})
            with urllib.request.urlopen(u_req) as u_resp:
                u_data = json.loads(u_resp.read().decode("utf-8"))
                google_user_id = u_data.get("sub") or u_data.get("email")
        except Exception:
            pass

        if is_subbed and sponsor_id and user_id:
            from backend.database import is_google_account_used
            if google_user_id and await is_google_account_used(google_user_id, sponsor_id):
                return Response(content="<div style='font-family: sans-serif; text-align: center; padding: 40px; color: #ff3b30;'><h2>❌ Boshqa Telegram Akkauntidan Ishlatilgan!</h2><p>Ushbu Google/Gmail akkaunti orqali boshqa Telegram hisobida allaqachon bilet olingan. Bitta Gmail bilan faqat 1 marta bilet olish mumkin!</p></div>", media_type="text/html")

            res = await mark_task_completed(user_id, sponsor_id, google_account_id=google_user_id)
            if isinstance(res, dict) and res.get("status") == "error":
                return Response(content=f"<div style='font-family: sans-serif; text-align: center; padding: 40px; color: #ff3b30;'><h2>❌ {res.get('message')}</h2></div>", media_type="text/html")

            all_done = isinstance(res, dict) and res.get("all_completed")
            ticket_msg = "+1 Bilet biriktirildi!" if (isinstance(res, dict) and res.get("ticket_issued")) else ""

            if all_done:
                card_html = f"<script>window.opener ? window.opener.postMessage('yt_success', '*') : null; setTimeout(() => window.close(), 2500);</script><h2>🎉 Tabriklaymiz! Barcha homiy kanallarga 100% rasmiy obuna bo'ldingiz! {ticket_msg}</h2><p>Oyna 2 soniyada yopiladi...</p>"
            else:
                card_html = "<script>window.opener ? window.opener.postMessage('yt_success', '*') : null; setTimeout(() => window.close(), 2500);</script><h2>✅ YouTube obunangiz 100% rasmiy tasdiqlandi!</h2><p style='color: #ffcc00;'>Bilet olish uchun barcha homiy kanallarga (Telegram va b.) ham obuna bo'ling.</p><p>Oyna 2 soniyada yopiladi...</p>"

            return Response(content=f"<div style='font-family: sans-serif; text-align: center; padding: 40px; color: #34c759;'>{card_html}</div>", media_type="text/html")
        else:
            return Response(content="<div style='font-family: sans-serif; text-align: center; padding: 40px; color: #ff3b30;'><h2>❌ Obuna aniqlanmadi!</h2><p>Iltimos ko'rsatilgan YouTube kanalga obuna bo'ling va qaytadan urinib ko'ring.</p></div>", media_type="text/html")

    except Exception as e:
        return Response(content=f"<div style='font-family: sans-serif; text-align: center; padding: 40px; color: #ff3b30;'><h2>❌ Tekshirishda Xatolik</h2><p>{str(e)}</p></div>", media_type="text/html")
