import sqlite3
import aiosqlite
import random
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from backend.config import settings


@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(settings.DATABASE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys = ON;")
        yield conn


async def init_db():
    async with get_db() as db:
        await db.execute("PRAGMA foreign_keys = ON;")
        
        # Users table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                first_name TEXT,
                last_name TEXT,
                username TEXT,
                ref_code TEXT UNIQUE,
                referred_by INTEGER,
                points INTEGER DEFAULT 0,
                tickets INTEGER DEFAULT 1,
                phone_number TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referred_by) REFERENCES users (id)
            )
        """)

        # Add phone_number column if missing in existing DB
        try:
            await db.execute("ALTER TABLE users ADD COLUMN phone_number TEXT;")
            await db.commit()
        except Exception:
            pass

        # Sponsors table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sponsors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                invite_link TEXT NOT NULL,
                platform TEXT DEFAULT 'telegram',
                youtube_channel_id TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migration: Ensure platform and youtube_channel_id columns exist in sponsors table
        async with db.execute("PRAGMA table_info(sponsors)") as cursor:
            columns = [column[1] for column in await cursor.fetchall()]
            if "platform" not in columns:
                await db.execute("ALTER TABLE sponsors ADD COLUMN platform TEXT DEFAULT 'telegram'")
            if "youtube_channel_id" not in columns:
                await db.execute("ALTER TABLE sponsors ADD COLUMN youtube_channel_id TEXT")
            if "is_winner_channel" not in columns:
                await db.execute("ALTER TABLE sponsors ADD COLUMN is_winner_channel INTEGER DEFAULT 0")

        # Contests table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS contests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                prize_pool TEXT,
                end_time TIMESTAMP NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Referrals table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER NOT NULL,
                referred_id INTEGER UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referrer_id) REFERENCES users (id),
                FOREIGN KEY (referred_id) REFERENCES users (id)
            )
        """)

        # User Tasks table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                sponsor_id INTEGER NOT NULL,
                completed INTEGER DEFAULT 0,
                completed_at TIMESTAMP,
                google_account_id TEXT,
                UNIQUE(user_id, sponsor_id),
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (sponsor_id) REFERENCES sponsors (id) ON DELETE CASCADE
            )
        """)

        # Migration: Ensure google_account_id column exists in user_tasks table
        async with db.execute("PRAGMA table_info(user_tasks)") as cursor:
            columns = [column[1] for column in await cursor.fetchall()]
            if "google_account_id" not in columns:
                await db.execute("ALTER TABLE user_tasks ADD COLUMN google_account_id TEXT")

        # Winners table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS winners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contest_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                place INTEGER NOT NULL,
                prize TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contest_id) REFERENCES contests (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)

        # User Tickets table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                ticket_number TEXT UNIQUE NOT NULL,
                contest_id INTEGER NOT NULL,
                reason TEXT DEFAULT 'Qatnashish',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (contest_id) REFERENCES contests (id)
            )
        """)

        # Contest Participants table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS contest_participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                contest_id INTEGER NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, contest_id),
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (contest_id) REFERENCES contests (id)
            )
        """)

        # Database Indexes for ultra-fast query speeds
        await db.execute("CREATE INDEX IF NOT EXISTS idx_user_tickets_user_contest ON user_tickets (user_id, contest_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_contest_participants_user_contest ON contest_participants (user_id, contest_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id)")

        await db.commit()

        # Seed initial sponsors if none exist
        async with db.execute("SELECT COUNT(*) as cnt FROM sponsors") as cursor:
            row = await cursor.fetchone()
            if row["cnt"] == 0:
                await db.execute("""
                    INSERT INTO sponsors (title, channel_id, invite_link) VALUES
                    ('PEEXELL Rasmiy Kanal', '@peexell_official', 'https://t.me/peexell_official'),
                    ('PEEXELL News & Updates', '@peexell_news', 'https://t.me/peexell_news')
                """)
                await db.commit()

        # Seed initial contest if none exists
        async with db.execute("SELECT COUNT(*) as cnt FROM contests WHERE is_active = 1") as cursor:
            row = await cursor.fetchone()
            if row["cnt"] == 0:
                default_end = (datetime.now() + timedelta(days=7)).isoformat()
                await db.execute("""
                    INSERT INTO contests (title, description, prize_pool, end_time, is_active)
                    VALUES (?, ?, ?, ?, 1)
                """, (
                    "PEEXELL GRAND KONKURS 2026",
                    "Do'stlaringizni taklif qiling va sponsor kanallarga a'zo bo'ling! Har bir bilet g'olib bo'lish imkoniyatini oshiradi.",
                    "10,000,000 UZS + iPhone 15 Pro + 5x Telegram Premium",
                    default_end
                ))
                await db.commit()


async def get_or_create_user(
    user_id: int,
    first_name: str,
    last_name: Optional[str] = None,
    username: Optional[str] = None,
    referrer_id: Optional[int] = None
) -> Dict[str, Any]:
    async with get_db() as db:
        async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cursor:
            existing = await cursor.fetchone()
            if existing:
                # Update existing user profile info
                await db.execute("""
                    UPDATE users 
                    SET first_name = ?, last_name = ?, username = ?
                    WHERE id = ?
                """, (first_name, last_name, username, user_id))
                await db.commit()
                
                async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as c2:
                    return dict(await c2.fetchone())

        # Create new user
        ref_code = f"ref_{user_id}"
        valid_referrer = None

        if referrer_id and referrer_id != user_id:
            async with db.execute("SELECT id FROM users WHERE id = ?", (referrer_id,)) as cursor:
                ref_user = await cursor.fetchone()
                if ref_user:
                    valid_referrer = referrer_id

        # Initial tickets: 1 base ticket + 1 bonus ticket if referred by someone
        initial_tickets = 2 if valid_referrer else 1
        initial_points = 10 if valid_referrer else 0

        await db.execute("""
            INSERT INTO users (id, first_name, last_name, username, ref_code, referred_by, tickets, points)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, first_name, last_name, username, ref_code, valid_referrer, initial_tickets, initial_points))

        if valid_referrer:
            # Record referral
            await db.execute("""
                INSERT OR IGNORE INTO referrals (referrer_id, referred_id)
                VALUES (?, ?)
            """, (valid_referrer, user_id))

            # Reward referrer: +1 ticket and +20 points
            await db.execute("""
                UPDATE users
                SET tickets = tickets + 1, points = points + 20
                WHERE id = ?
            """, (valid_referrer,))

        await db.commit()

        async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as c2:
            return dict(await c2.fetchone())


async def get_user(user_id: int) -> Optional[Dict[str, Any]]:
    async with get_db() as db:
        async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_user_referrals_count(user_id: int) -> int:
    async with get_db() as db:
        async with db.execute("SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            return row["cnt"] if row else 0


async def get_leaderboard(limit: int = 50) -> List[Dict[str, Any]]:
    async with get_db() as db:
        query = """
            SELECT 
                u.id, 
                u.first_name, 
                u.last_name, 
                u.username, 
                u.tickets, 
                u.points,
                COUNT(r.id) as referral_count
            FROM users u
            LEFT JOIN referrals r ON u.id = r.referrer_id
            GROUP BY u.id
            ORDER BY u.tickets DESC, referral_count DESC, u.points DESC
            LIMIT ?
        """
        async with db.execute(query, (limit,)) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_sponsors(active_only: bool = True) -> List[Dict[str, Any]]:
    async with get_db() as db:
        query = "SELECT * FROM sponsors WHERE is_active = 1" if active_only else "SELECT * FROM sponsors"
        async with db.execute(query) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def add_sponsor(title: str, channel_id: str, invite_link: str, platform: str = "telegram", youtube_channel_id: Optional[str] = None, is_winner_channel: int = 0) -> int:
    async with get_db() as db:
        if is_winner_channel:
            await db.execute("UPDATE sponsors SET is_winner_channel = 0")
        cursor = await db.execute("""
            INSERT INTO sponsors (title, channel_id, invite_link, platform, youtube_channel_id, is_winner_channel, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        """, (title, channel_id, invite_link, platform, youtube_channel_id, 1 if is_winner_channel else 0))
        await db.commit()
        return cursor.lastrowid


async def set_winner_channel(sponsor_id: Optional[int]) -> bool:
    """Sets a sponsor Telegram channel as the designated winner announcement channel.
    If sponsor_id is None or <= 0, disables announcement channel."""
    async with get_db() as db:
        await db.execute("UPDATE sponsors SET is_winner_channel = 0")
        if sponsor_id and sponsor_id > 0:
            await db.execute("UPDATE sponsors SET is_winner_channel = 1 WHERE id = ?", (sponsor_id,))
        await db.commit()
        return True


async def get_winner_channel() -> Optional[Dict[str, Any]]:
    """Returns the sponsor Telegram channel currently designated for winner announcements."""
    async with get_db() as db:
        async with db.execute(
            "SELECT * FROM sponsors WHERE is_winner_channel = 1 AND platform = 'telegram' AND is_active = 1 LIMIT 1"
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def delete_sponsor(sponsor_id: int) -> bool:
    async with get_db() as db:
        await db.execute("DELETE FROM sponsors WHERE id = ?", (sponsor_id,))
        await db.execute("DELETE FROM user_tasks WHERE sponsor_id = ?", (sponsor_id,))
        await db.commit()
        return True


async def get_user_tasks(user_id: int) -> List[Dict[str, Any]]:
    async with get_db() as db:
        query = """
            SELECT 
                s.id as sponsor_id,
                s.title,
                s.channel_id,
                s.invite_link,
                s.platform,
                s.youtube_channel_id,
                COALESCE(ut.completed, 0) as completed
            FROM sponsors s
            LEFT JOIN user_tasks ut ON s.id = ut.sponsor_id AND ut.user_id = ?
            WHERE s.is_active = 1
        """
        async with db.execute(query, (user_id,)) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def is_google_account_used(google_account_id: str, sponsor_id: int, current_user_id: int = 0) -> bool:
    if not google_account_id:
        return False
    async with get_db() as db:
        async with db.execute(
            "SELECT id FROM user_tasks WHERE sponsor_id = ? AND google_account_id = ? AND completed = 1 AND user_id != ?",
            (sponsor_id, google_account_id, current_user_id)
        ) as cursor:
            row = await cursor.fetchone()
            return row is not None


async def mark_task_completed(user_id: int, sponsor_id: int, google_account_id: Optional[str] = None) -> Dict[str, Any]:
    async with get_db() as db:
        # Check if Google account was already used by another Telegram user for this sponsor task
        if google_account_id:
            async with db.execute(
                "SELECT user_id FROM user_tasks WHERE sponsor_id = ? AND google_account_id = ? AND completed = 1 AND user_id != ?",
                (sponsor_id, google_account_id, user_id)
            ) as c_g:
                dup = await c_g.fetchone()
                if dup:
                    return {
                        "status": "error",
                        "message": "Ushbu Google akkauntdan boshqa foydalanuvchi foydalangan!",
                        "completed": False,
                        "all_completed": False,
                        "ticket_issued": False
                    }

        # Check if task already completed in user_tasks
        already_done = False
        async with db.execute(
            "SELECT completed FROM user_tasks WHERE user_id = ? AND sponsor_id = ?",
            (user_id, sponsor_id)
        ) as cursor:
            row = await cursor.fetchone()
            if row and row["completed"] == 1:
                already_done = True

        now = datetime.now().isoformat()
        if not already_done:
            await db.execute("""
                INSERT INTO user_tasks (user_id, sponsor_id, completed, completed_at, google_account_id)
                VALUES (?, ?, 1, ?, ?)
                ON CONFLICT(user_id, sponsor_id) DO UPDATE SET completed = 1, completed_at = ?, google_account_id = ?
            """, (user_id, sponsor_id, now, google_account_id, now, google_account_id))

            # Update points (+15)
            await db.execute("UPDATE users SET points = points + 15 WHERE id = ?", (user_id,))
            await db.commit()

        # Check if ALL active sponsors are completed by this user
        async with db.execute("SELECT COUNT(*) as cnt FROM sponsors WHERE is_active = 1") as c_sp:
            total_sponsors = (await c_sp.fetchone())["cnt"]

        async with db.execute("""
            SELECT COUNT(DISTINCT s.id) as cnt
            FROM sponsors s
            JOIN user_tasks ut ON s.id = ut.sponsor_id
            WHERE s.is_active = 1 AND ut.user_id = ? AND ut.completed = 1
        """, (user_id,)) as c_ut:
            completed_sponsors = (await c_ut.fetchone())["cnt"]

        all_completed = (total_sponsors > 0) and (completed_sponsors >= total_sponsors)

        ticket_issued = False
        ticket_number = None

        if all_completed:
            # Get active contest ID
            async with db.execute("SELECT id FROM contests WHERE is_active = 1 ORDER BY id DESC LIMIT 1") as c_c:
                c_row = await c_c.fetchone()
                contest_id = c_row["id"] if c_row else 1

            # Check if ticket already exists for this contest
            async with db.execute("SELECT ticket_number FROM user_tickets WHERE user_id = ? AND contest_id = ?", (user_id, contest_id)) as c_t:
                ex_t = await c_t.fetchone()
                if not ex_t:
                    ticket_number = await issue_ticket_db(db, user_id, contest_id, "Barcha homiylarga obuna bo'lindi")
                    ticket_issued = True
                else:
                    ticket_number = ex_t["ticket_number"]

            # Register participant in contest_participants
            await db.execute("""
                INSERT OR IGNORE INTO contest_participants (user_id, contest_id)
                VALUES (?, ?)
            """, (user_id, contest_id))
            await db.commit()

        return {
            "status": "success",
            "already_done": already_done,
            "completed": True,
            "all_completed": all_completed,
            "ticket_issued": ticket_issued,
            "ticket_number": ticket_number
        }


async def clear_all_tickets_and_participants(db=None):
    """Clears all tickets, participants, and resets user ticket counts for a new contest cycle."""
    async def _clear(conn):
        await conn.execute("DELETE FROM user_tickets")
        await conn.execute("DELETE FROM contest_participants")
        await conn.execute("DELETE FROM user_tasks")
        await conn.execute("UPDATE users SET tickets = 0, points = 0")
        await conn.commit()

    if db:
        await _clear(db)
    else:
        async with get_db() as conn:
            await _clear(conn)


async def check_and_handle_contest_expiration(db):
    """Checks if active contest time expired. If expired, deactivates it and clears tickets for new contest."""
    async with db.execute("SELECT * FROM contests WHERE is_active = 1 ORDER BY id DESC LIMIT 1") as c:
        row = await c.fetchone()
        if not row:
            return
        contest_dict = dict(row)

    try:
        raw_end = contest_dict["end_time"]
        if raw_end.endswith("Z"):
            end_dt = datetime.fromisoformat(raw_end.replace("Z", "+00:00"))
        else:
            end_dt = datetime.fromisoformat(raw_end)
        
        now = datetime.now(end_dt.tzinfo) if end_dt.tzinfo else datetime.now()
        if now >= end_dt:
            await db.execute("UPDATE contests SET is_active = 0 WHERE id = ?", (contest_dict["id"],))
            await db.commit()
            await clear_all_tickets_and_participants(db)
    except Exception:
        pass


async def get_active_contest() -> Dict[str, Any]:
    async with get_db() as db:
        await check_and_handle_contest_expiration(db)

        async with db.execute("SELECT * FROM contests WHERE is_active = 1 ORDER BY id DESC LIMIT 1") as cursor:
            row = await cursor.fetchone()
            if row:
                return dict(row)
            
            # Create default active contest if missing
            default_end = (datetime.now() + timedelta(days=7)).isoformat()
            cursor2 = await db.execute("""
                INSERT INTO contests (title, description, prize_pool, end_time, is_active)
                VALUES (?, ?, ?, ?, 1)
            """, (
                "PEEXELL GRAND KONKURS 2026",
                "Do'stlaringizni taklif qiling va sponsor kanallarga a'zo bo'ling!",
                "10,000,000 UZS + iPhone 15 Pro + 5x Telegram Premium",
                default_end
            ))
            await db.commit()
            cid = cursor2.lastrowid
            async with db.execute("SELECT * FROM contests WHERE id = ?", (cid,)) as cursor3:
                return dict(await cursor3.fetchone())


async def update_contest(title: str, description: str, prize_pool: str, end_time: str) -> bool:
    async with get_db() as db:
        active = await get_active_contest()
        await db.execute("""
            UPDATE contests
            SET title = ?, description = ?, prize_pool = ?, end_time = ?
            WHERE id = ?
        """, (title, description, prize_pool, end_time, active["id"]))
        await db.commit()
        return True


async def pick_random_winners(contest_id: int, count: int = 3, prizes: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    if not prizes:
        prizes = ["🥇 1-O'rin: iPhone 15 Pro", "🥈 2-O'rin: 3,000,000 UZS", "🥉 3-O'rin: Telegram Premium (1 yil)"]
    
    async with get_db() as db:
        # Get candidates who joined THIS contest and have tickets for THIS contest
        async with db.execute("""
            SELECT u.id, u.first_name, u.username, COUNT(ut.id) as contest_tickets
            FROM users u
            JOIN contest_participants cp ON u.id = cp.user_id
            JOIN user_tickets ut ON u.id = ut.user_id AND ut.contest_id = cp.contest_id
            WHERE cp.contest_id = ?
            GROUP BY u.id
            HAVING contest_tickets > 0
        """, (contest_id,)) as cursor:
            users = [dict(r) for r in await cursor.fetchall()]

        if not users:
            return []

        # Weighted pool based on tickets count for current contest
        pool = []
        for u in users:
            pool.extend([u["id"]] * u["contest_tickets"])

        random.shuffle(pool)
        selected_ids = []
        for uid in pool:
            if uid not in selected_ids:
                selected_ids.append(uid)
            if len(selected_ids) >= count:
                break

        # Clean previous winners for this contest cycle
        await db.execute("DELETE FROM winners WHERE contest_id = ?", (contest_id,))

        # Record winners
        winners_list = []
        for idx, uid in enumerate(selected_ids):
            place = idx + 1
            prize_name = prizes[idx] if idx < len(prizes) else f"{place}-O'rin Sovrini"
            
            await db.execute("""
                INSERT INTO winners (contest_id, user_id, place, prize)
                VALUES (?, ?, ?, ?)
            """, (contest_id, uid, place, prize_name))

            async with db.execute("SELECT first_name, last_name, username, phone_number FROM users WHERE id = ?", (uid,)) as c_u:
                u_info = await c_u.fetchone()
            async with db.execute("SELECT ticket_number FROM user_tickets WHERE user_id = ? AND contest_id = ? LIMIT 1", (uid, contest_id)) as c_t:
                t_info = await c_t.fetchone()
                ticket_num = t_info["ticket_number"] if t_info else None
            
            fname = u_info["first_name"] if u_info and u_info["first_name"] else ""
            lname = u_info["last_name"] if u_info and u_info["last_name"] else ""
            full_name = f"{fname} {lname}".strip() or f"Foydalanuvchi #{uid}"

            winners_list.append({
                "user_id": uid,
                "first_name": full_name,
                "username": u_info["username"] if u_info else None,
                "phone_number": u_info["phone_number"] if u_info else None,
                "place": place,
                "prize": prize_name,
                "ticket_number": ticket_num
            })

        await db.commit()
        return winners_list


async def get_winners(contest_id: Optional[int] = None) -> List[Dict[str, Any]]:
    async with get_db() as db:
        query = """
            SELECT 
                w.id,
                w.contest_id,
                w.user_id,
                w.place,
                w.prize,
                w.created_at,
                u.first_name,
                u.last_name,
                u.username
            FROM winners w
            JOIN users u ON w.user_id = u.id
        """
        params = ()
        if contest_id:
            query += " WHERE w.contest_id = ?"
            params = (contest_id,)
        query += " ORDER BY w.place ASC, w.id DESC"

        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_admin_stats() -> Dict[str, Any]:
    async with get_db() as db:
        async with db.execute("SELECT COUNT(*) as cnt FROM users") as c1:
            total_users = (await c1.fetchone())["cnt"]
        
        async with db.execute("SELECT COUNT(*) as cnt FROM referrals") as c2:
            total_referrals = (await c2.fetchone())["cnt"]

        async with db.execute("SELECT SUM(tickets) as total_tickets FROM users") as c3:
            total_tickets = (await c3.fetchone())["total_tickets"] or 0

        async with db.execute("SELECT COUNT(*) as cnt FROM sponsors WHERE is_active = 1") as c4:
            active_sponsors = (await c4.fetchone())["cnt"]

        async with db.execute("SELECT COUNT(*) as cnt FROM user_tasks WHERE completed = 1") as c5:
            completed_tasks = (await c5.fetchone())["cnt"]

        return {
            "total_users": total_users,
            "total_referrals": total_referrals,
            "total_tickets": total_tickets,
            "active_sponsors": active_sponsors,
            "completed_tasks": completed_tasks
        }


async def issue_ticket_db(db, user_id: int, contest_id: int, reason: str = "Konkursda qatnashish") -> str:
    ticket_number = ""
    retry_count = 0
    while retry_count < 10:
        async with db.execute("SELECT COUNT(*) as cnt FROM user_tickets WHERE contest_id = ?", (contest_id,)) as c_cnt:
            cnt = (await c_cnt.fetchone())["cnt"]

        next_num = cnt + 1 + retry_count
        candidate_number = f"#PXL-{next_num}"

        try:
            await db.execute("""
                INSERT INTO user_tickets (user_id, ticket_number, contest_id, reason)
                VALUES (?, ?, ?, ?)
            """, (user_id, candidate_number, contest_id, reason))
            ticket_number = candidate_number
            break
        except (sqlite3.IntegrityError, aiosqlite.IntegrityError, Exception):
            retry_count += 1
            continue

    async with db.execute("SELECT COUNT(*) as total FROM user_tickets WHERE user_id = ?", (user_id,)) as c2:
        cnt_row = await c2.fetchone()
        total_cnt = cnt_row["total"] if cnt_row else 1
        await db.execute("UPDATE users SET tickets = ? WHERE id = ?", (total_cnt, user_id))

    return ticket_number


async def get_user_tickets(user_id: int) -> List[Dict[str, Any]]:
    async with get_db() as db:
        async with db.execute("""
            SELECT ticket_number, reason, created_at
            FROM user_tickets
            WHERE user_id = ?
            ORDER BY id DESC
        """, (user_id,)) as c:
            rows = await c.fetchall()
            return [dict(r) for r in rows]


async def participate_in_contest(user_id: int) -> Dict[str, Any]:
    async with get_db() as db:
        # Get active contest
        async with db.execute("SELECT id FROM contests WHERE is_active = 1 ORDER BY id DESC LIMIT 1") as c:
            row = await c.fetchone()
            if not row:
                raise ValueError("Faol konkurs topilmadi")
            contest_id = row["id"]

        # Check if already joined contest
        async with db.execute("SELECT id FROM contest_participants WHERE user_id = ? AND contest_id = ?", (user_id, contest_id)) as c:
            existing = await c.fetchone()

        if existing:
            async with db.execute("SELECT ticket_number FROM user_tickets WHERE user_id = ? AND contest_id = ? ORDER BY id ASC LIMIT 1", (user_id, contest_id)) as c_t:
                t_row = await c_t.fetchone()
                t_num = t_row["ticket_number"] if t_row else "#PXL-1001"
            
            async with db.execute("SELECT COUNT(*) as cnt FROM user_tickets WHERE user_id = ?", (user_id,)) as c_cnt:
                total_t = (await c_cnt.fetchone())["cnt"]

            return {
                "already_joined": True,
                "ticket_number": t_num,
                "total_tickets": total_t
            }

        # First time joining contest
        await db.execute("""
            INSERT INTO contest_participants (user_id, contest_id)
            VALUES (?, ?)
        """, (user_id, contest_id))

        # Issue 1st participation ticket
        ticket_number = await issue_ticket_db(db, user_id, contest_id, "Konkursda qatnashish")

        # Check Referral rule for referrer (Every 5 active participating friends = +1 Ticket)
        async with db.execute("SELECT referred_by FROM users WHERE id = ?", (user_id,)) as c_ref:
            ref_row = await c_ref.fetchone()
            referrer_id = ref_row["referred_by"] if ref_row else None

        if referrer_id:
            # Count active participating referrals for this referrer
            async with db.execute("""
                SELECT COUNT(cp.id) as active_cnt
                FROM referrals r
                JOIN contest_participants cp ON r.referred_id = cp.user_id
                WHERE r.referrer_id = ? AND cp.contest_id = ?
            """, (referrer_id, contest_id)) as c_act:
                active_referrals = (await c_act.fetchone())["active_cnt"]

            # Number of referral tickets referrer should have (1 for every 5 active friends)
            earned_ref_tickets = active_referrals // 5

            # Number of referral tickets referrer has already received
            async with db.execute("""
                SELECT COUNT(*) as existing_ref_t
                FROM user_tickets
                WHERE user_id = ? AND contest_id = ? AND reason LIKE '%do''st taklifi%'
            """, (referrer_id, contest_id)) as c_earned:
                already_issued = (await c_earned.fetchone())["existing_ref_t"]

            # Issue missing referral tickets if milestone hit
            if earned_ref_tickets > already_issued:
                new_tickets_to_issue = earned_ref_tickets - already_issued
                for i in range(new_tickets_to_issue):
                    milestone = (already_issued + i + 1) * 5
                    await issue_ticket_db(db, referrer_id, contest_id, f"{milestone} ta do'st taklifi")

        await db.commit()

        async with db.execute("SELECT COUNT(*) as cnt FROM user_tickets WHERE user_id = ?", (user_id,)) as c_cnt:
            total_t = (await c_cnt.fetchone())["cnt"]

        return {
            "already_joined": False,
            "ticket_number": ticket_number,
            "total_tickets": total_t
        }


def is_uzb_phone(phone_number: str) -> bool:
    if not phone_number:
        return False
    clean = str(phone_number).replace("+", "").replace(" ", "").replace("-", "").strip()
    return clean.startswith("998") and len(clean) >= 12


async def revoke_user_tickets_for_unsub(user_id: int) -> int:
    async with get_db() as db:
        async with db.execute("SELECT COUNT(*) as cnt FROM user_tickets WHERE user_id = ?", (user_id,)) as c:
            revoked_count = (await c.fetchone())["cnt"]

        await db.execute("DELETE FROM user_tickets WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM contest_participants WHERE user_id = ?", (user_id,))
        await db.execute("UPDATE user_tasks SET completed = 0 WHERE user_id = ?", (user_id,))
        await db.execute("UPDATE users SET tickets = 0 WHERE id = ?", (user_id,))
        await db.commit()
        return revoked_count


async def save_user_phone(user_id: int, phone_number: str) -> bool:
    clean = str(phone_number).replace("+", "").replace(" ", "").replace("-", "").strip()
    full_phone = f"+{clean}"
    async with get_db() as db:
        await db.execute("UPDATE users SET phone_number = ? WHERE id = ?", (full_phone, user_id))
        await db.commit()
        return True


async def clear_all_users_data() -> dict:
    async with get_db() as db:
        await db.execute("DELETE FROM user_tasks;")
        await db.execute("DELETE FROM user_tickets;")
        await db.execute("DELETE FROM contest_participants;")
        await db.execute("DELETE FROM referrals;")
        await db.execute("DELETE FROM winners;")
        await db.execute("DELETE FROM users;")
        await db.commit()
        return {"status": "success", "message": "Barcha foydalanuvchi ma'lumotlari to'liq tozalandi."}


async def get_detailed_admin_stats() -> Dict[str, Any]:
    async with get_db() as db:
        async with db.execute("SELECT COUNT(*) as cnt FROM users") as c:
            total_users = (await c.fetchone())["cnt"]
            
        async with db.execute("SELECT COUNT(*) as cnt FROM user_tickets") as c:
            total_tickets = (await c.fetchone())["cnt"]
            
        async with db.execute("SELECT COUNT(*) as cnt FROM referrals") as c:
            total_referrals = (await c.fetchone())["cnt"]
            
        async with db.execute("SELECT COUNT(*) as cnt FROM sponsors WHERE is_active = 1") as c:
            active_sponsors = (await c.fetchone())["cnt"]
            
        async with db.execute("SELECT COUNT(DISTINCT google_account_id) as cnt FROM user_tasks WHERE google_account_id IS NOT NULL AND google_account_id != ''") as c:
            google_verified_count = (await c.fetchone())["cnt"]
            
        async with db.execute("SELECT COUNT(*) as cnt FROM users WHERE created_at >= datetime('now', '-1 day')") as c:
            today_users = (await c.fetchone())["cnt"]

        async with db.execute("SELECT COUNT(*) as cnt FROM winners") as c:
            total_winners = (await c.fetchone())["cnt"]

        return {
            "total_users": total_users,
            "total_tickets": total_tickets,
            "total_referrals": total_referrals,
            "active_sponsors": active_sponsors,
            "google_verified_count": google_verified_count,
            "today_users": today_users,
            "total_winners": total_winners
        }


async def search_users(query: str = "", limit: int = 50) -> List[Dict[str, Any]]:
    query_str = query.strip() if query else ""
    
    async with get_db() as db:
        if not query_str:
            sql = """
                SELECT u.id, u.first_name, u.last_name, u.username, u.tickets, u.phone_number, u.created_at,
                       (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referrals_count,
                       (SELECT COUNT(*) FROM user_tasks WHERE user_id = u.id AND completed = 1) as tasks_count
                FROM users u
                ORDER BY u.tickets DESC, u.id DESC LIMIT ?
            """
            params = (limit,)
        elif query_str.isdigit():
            sql = """
                SELECT u.id, u.first_name, u.last_name, u.username, u.tickets, u.phone_number, u.created_at,
                       (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referrals_count,
                       (SELECT COUNT(*) FROM user_tasks WHERE user_id = u.id AND completed = 1) as tasks_count
                FROM users u
                WHERE u.id = ? OR CAST(u.id AS TEXT) LIKE ?
                ORDER BY u.tickets DESC LIMIT ?
            """
            params = (int(query_str), f"%{query_str}%", limit)
        else:
            clean_q = query_str.lstrip("@")
            sql = """
                SELECT u.id, u.first_name, u.last_name, u.username, u.tickets, u.phone_number, u.created_at,
                       (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referrals_count,
                       (SELECT COUNT(*) FROM user_tasks WHERE user_id = u.id AND completed = 1) as tasks_count
                FROM users u
                WHERE LOWER(u.username) LIKE LOWER(?) OR LOWER(u.first_name) LIKE LOWER(?) OR LOWER(u.last_name) LIKE LOWER(?)
                ORDER BY u.tickets DESC LIMIT ?
            """
            params = (f"%{clean_q}%", f"%{clean_q}%", f"%{clean_q}%", limit)
            
        async with db.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def admin_modify_user_tickets(user_id: int, delta: int, reason: str = "Admin tomonidan berildi") -> Dict[str, Any]:
    async with get_db() as db:
        async with db.execute("SELECT id, tickets FROM users WHERE id = ?", (user_id,)) as c:
            user = await c.fetchone()
            if not user:
                return {"status": "error", "message": "Foydalanuvchi topilmadi"}

        curr_tickets = user["tickets"]
        new_tickets = max(0, curr_tickets + delta)
        await db.execute("UPDATE users SET tickets = ? WHERE id = ?", (new_tickets, user_id))

        if delta > 0:
            async with db.execute("SELECT id FROM contests WHERE is_active = 1 ORDER BY id DESC LIMIT 1") as c:
                row_c = await c.fetchone()
                contest_id = row_c["id"] if row_c else 1
            
            await db.execute("""
                INSERT OR IGNORE INTO contest_participants (user_id, contest_id)
                VALUES (?, ?)
            """, (user_id, contest_id))

            for _ in range(delta):
                ticket_num = f"TICK-{user_id}-{random.randint(100000, 999999)}"
                await db.execute("""
                    INSERT INTO user_tickets (user_id, contest_id, ticket_number, reason)
                    VALUES (?, ?, ?, ?)
                """, (user_id, contest_id, ticket_num, reason))
        elif delta < 0:
            abs_delta = abs(delta)
            await db.execute("""
                DELETE FROM user_tickets WHERE id IN (
                    SELECT id FROM user_tickets WHERE user_id = ? ORDER BY id DESC LIMIT ?
                )
            """, (user_id, abs_delta))

        await db.commit()
        return {
            "status": "success",
            "message": f"Foydalanuvchi biletlari yangilandi: {curr_tickets} -> {new_tickets}",
            "new_tickets": new_tickets
        }


async def clear_winners() -> Dict[str, Any]:
    async with get_db() as db:
        await db.execute("DELETE FROM winners;")
        await db.commit()
        return {"status": "success", "message": "G'oliblar ro'yxati muvaffaqiyatli tozalandi."}


