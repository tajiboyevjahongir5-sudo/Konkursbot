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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referred_by) REFERENCES users (id)
            )
        """)

        # Sponsors table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sponsors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                invite_link TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

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
                UNIQUE(user_id, sponsor_id),
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (sponsor_id) REFERENCES sponsors (id) ON DELETE CASCADE
            )
        """)

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


async def add_sponsor(title: str, channel_id: str, invite_link: str) -> int:
    async with get_db() as db:
        cursor = await db.execute("""
            INSERT INTO sponsors (title, channel_id, invite_link, is_active)
            VALUES (?, ?, ?, 1)
        """, (title, channel_id, invite_link))
        await db.commit()
        return cursor.lastrowid


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
                COALESCE(ut.completed, 0) as completed
            FROM sponsors s
            LEFT JOIN user_tasks ut ON s.id = ut.sponsor_id AND ut.user_id = ?
            WHERE s.is_active = 1
        """
        async with db.execute(query, (user_id,)) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def mark_task_completed(user_id: int, sponsor_id: int) -> bool:
    async with get_db() as db:
        # Check if task already completed
        async with db.execute(
            "SELECT completed FROM user_tasks WHERE user_id = ? AND sponsor_id = ?",
            (user_id, sponsor_id)
        ) as cursor:
            row = await cursor.fetchone()
            if row and row["completed"] == 1:
                return False  # Already completed

        # Insert or update
        now = datetime.now().isoformat()
        await db.execute("""
            INSERT INTO user_tasks (user_id, sponsor_id, completed, completed_at)
            VALUES (?, ?, 1, ?)
            ON CONFLICT(user_id, sponsor_id) DO UPDATE SET completed = 1, completed_at = ?
        """, (user_id, sponsor_id, now, now))

        # Get sponsor title for ticket reason
        sponsor_title = "Kanal obunasi"
        async with db.execute("SELECT title FROM sponsors WHERE id = ?", (sponsor_id,)) as c_sp:
            sp_row = await c_sp.fetchone()
            if sp_row and sp_row["title"]:
                sponsor_title = sp_row["title"]

        # Get active contest ID
        async with db.execute("SELECT id FROM contests WHERE is_active = 1 ORDER BY id DESC LIMIT 1") as c_c:
            c_row = await c_c.fetchone()
            contest_id = c_row["id"] if c_row else 1

        # Issue ticket for task completion
        await issue_ticket_db(db, user_id, contest_id, f"Obuna: {sponsor_title}")

        # Update points (+15)
        await db.execute("""
            UPDATE users
            SET points = points + 15
            WHERE id = ?
        """, (user_id,))

        await db.commit()
        return True


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
        end_dt = datetime.fromisoformat(contest_dict["end_time"])
        if datetime.now() >= end_dt:
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
        # Get all candidate users who have tickets
        async with db.execute("SELECT id, first_name, username, tickets FROM users WHERE tickets > 0") as cursor:
            users = [dict(r) for r in await cursor.fetchall()]

        if not users:
            return []

        # Weighted pool based on tickets count
        pool = []
        for u in users:
            pool.extend([u["id"]] * u["tickets"])

        random.shuffle(pool)
        selected_ids = []
        for uid in pool:
            if uid not in selected_ids:
                selected_ids.append(uid)
            if len(selected_ids) >= count:
                break

        # Record winners
        winners_list = []
        for idx, uid in enumerate(selected_ids):
            place = idx + 1
            prize_name = prizes[idx] if idx < len(prizes) else f"{place}-O'rin Sovrini"
            
            await db.execute("""
                INSERT INTO winners (contest_id, user_id, place, prize)
                VALUES (?, ?, ?, ?)
            """, (contest_id, uid, place, prize_name))

            async with db.execute("SELECT first_name, username FROM users WHERE id = ?", (uid,)) as c_u:
                u_info = await c_u.fetchone()
                winners_list.append({
                    "user_id": uid,
                    "first_name": u_info["first_name"] if u_info else f"User {uid}",
                    "username": u_info["username"] if u_info else None,
                    "place": place,
                    "prize": prize_name
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
    async with db.execute("SELECT MAX(id) as max_id FROM user_tickets") as c:
        row = await c.fetchone()
        max_id = row["max_id"] if (row and row["max_id"]) else 0

    next_num = 1001 + max_id
    ticket_number = f"#PXL-{next_num}"

    await db.execute("""
        INSERT INTO user_tickets (user_id, ticket_number, contest_id, reason)
        VALUES (?, ?, ?, ?)
    """, (user_id, ticket_number, contest_id, reason))

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
