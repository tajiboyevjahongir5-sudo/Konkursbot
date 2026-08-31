/* ==========================================================================
   PEEXELL KONKURS TELEGRAM WEB APP - JAVASCRIPT SPA LOGIC
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Telegram WebApp SDK Initialization
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('#121316');
      tg.setBackgroundColor('#121316');
    } catch (e) {
      console.log("Header color set not supported in older SDK");
    }
  }

  // App State
  let currentUser = null;
  let activeContest = null;
  let countdownInterval = null;

  // Telegram Init Data String
  const initData = tg?.initData || "";

  // Helper API fetch function with initData header
  async function apiFetch(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
      ...(options.headers || {})
    };

    try {
      const response = await fetch(endpoint, { ...options, headers });
      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { message: text || "Server xatoligi" };
      }

      if (!response.ok) {
        throw new Error(data.detail || data.message || "Xatolik yuz berdi");
      }
      return data;
    } catch (err) {
      console.error(`API Error (${endpoint}):`, err);
      showToast(err.message || "Tarmoq xatosi", "danger");
      throw err;
    }
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "fa-circle-check";
    if (type === "danger") icon = "fa-circle-xmark";
    if (type === "warning") icon = "fa-triangle-exclamation";

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // --- TAB NAVIGATION SYSTEM ---
  const navItems = document.querySelectorAll(".nav-item");
  const tabContents = document.querySelectorAll(".tab-content");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const targetTab = item.getAttribute("data-tab");

      navItems.forEach(n => n.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      item.classList.add("active");
      const targetEl = document.getElementById(targetTab);
      if (targetEl) targetEl.classList.add("active");

      // Tab specific refresh logic
      if (targetTab === "tab-tasks") loadTasks();
      if (targetTab === "tab-leaderboard") loadLeaderboard();
      if (targetTab === "tab-admin") loadAdminData();
    });
  });

  // --- DATA LOADING & STATE MANAGEMENT ---
  async function loadUserData() {
    try {
      const res = await apiFetch("/api/user/me");
      if (res.status === "success" && res.user) {
        currentUser = res.user;

        // Update Header
        const hTickets = document.getElementById("header-tickets-count");
        if (hTickets) hTickets.textContent = currentUser.tickets;

        // Update Profile Tab elements
        const pName = document.getElementById("prof-user-name");
        const pId = document.getElementById("prof-user-id");
        const pTickets = document.getElementById("prof-tickets-count");
        const pRefs = document.getElementById("prof-referrals-count");

        if (pName) pName.textContent = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Foydalanuvchi';
        if (pId) pId.textContent = `ID: ${currentUser.id}`;
        if (pTickets) pTickets.textContent = currentUser.tickets;
        if (pRefs) pRefs.textContent = currentUser.referrals_count;

        // Render User Tickets Grid
        const ticketsContainer = document.getElementById("user-tickets-container");
        if (ticketsContainer) {
          if (currentUser.tickets_list && currentUser.tickets_list.length > 0) {
            ticketsContainer.innerHTML = "";
            currentUser.tickets_list.forEach(t => {
              const card = document.createElement("div");
              card.className = "pxl-ticket-card";
              card.innerHTML = `
                <div>
                  <div class="pxl-ticket-badge">
                    <i class="fa-solid fa-ticket"></i>
                    <span>${t.ticket_number}</span>
                  </div>
                  <div class="pxl-ticket-reason">${t.reason || 'Omadli Bilet'}</div>
                </div>
                <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">PEEXELL</div>
              `;
              ticketsContainer.appendChild(card);
            });
          } else {
            ticketsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 15px; grid-column: 1/-1;">Hozircha biletlaringiz yo\'q. Konkursda qatnashib bilet oling!</div>';
          }
        }

        // Update Friends Tab elements
        const rInput = document.getElementById("ref-link-input");
        const rCount = document.getElementById("profile-ref-count");
        const rTickets = document.getElementById("profile-ref-tickets");

        if (rInput) rInput.value = currentUser.ref_link;
        if (rCount) rCount.textContent = currentUser.referrals_count;
        if (rTickets) rTickets.textContent = currentUser.tickets;

        // Show Admin Nav button if Admin
        if (currentUser.is_admin) {
          const adminBtn = document.getElementById("nav-admin-btn");
          if (adminBtn) adminBtn.style.display = "flex";
        }
      }
    } catch (err) {
      console.log("Could not load user data");
    }
  }

  async function loadContestData() {
    try {
      const res = await apiFetch("/api/contest/active");
      if (res.status === "success" && res.contest) {
        activeContest = res.contest;

        document.getElementById("contest-title").textContent = activeContest.title;
        document.getElementById("contest-description").textContent = activeContest.description;
        document.getElementById("contest-prizes-list").textContent = activeContest.prize_pool;

        startCountdown(activeContest.end_time);
      }
    } catch (err) {
      console.log("Could not load contest data");
    }
  }

  // --- COUNTDOWN TIMER ---
  function startCountdown(endTimeStr) {
    if (countdownInterval) clearInterval(countdownInterval);

    const endTime = new Date(endTimeStr).getTime();

    function updateTimer() {
      const now = new Date().getTime();
      const distance = endTime - now;

      if (distance <= 0) {
        clearInterval(countdownInterval);
        document.getElementById("timer-days").textContent = "00";
        document.getElementById("timer-hours").textContent = "00";
        document.getElementById("timer-mins").textContent = "00";
        document.getElementById("timer-secs").textContent = "00";
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      document.getElementById("timer-days").textContent = String(days).padStart(2, '0');
      document.getElementById("timer-hours").textContent = String(hours).padStart(2, '0');
      document.getElementById("timer-mins").textContent = String(minutes).padStart(2, '0');
      document.getElementById("timer-secs").textContent = String(seconds).padStart(2, '0');
    }

    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
  }

  // --- TASKS MODULE ---
  async function loadTasks() {
    const container = document.getElementById("tasks-container");
    if (!container) return;
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Yuklanmoqda...</div>';

    try {
      const res = await apiFetch("/api/tasks");
      if (res.status === "success" && res.tasks) {
        if (res.tasks.length === 0) {
          container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Hozircha vazifalar mavjud emas.</div>';
          return;
        }

        container.innerHTML = "";
        res.tasks.forEach(task => {
          const item = document.createElement("div");
          item.className = "task-item";
          
          const isDone = task.completed === 1;

          item.innerHTML = `
            <div class="task-info">
              <div class="task-icon"><i class="fa-brands fa-telegram"></i></div>
              <div>
                <div class="task-title">${task.title}</div>
                <div class="task-reward">+1 Bilet | +15 Ball</div>
              </div>
            </div>
            <div class="task-actions">
              <a href="${task.invite_link}" target="_blank" class="btn btn-secondary btn-sm" onclick="event.stopPropagation();">
                A'zo bo'lish
              </a>
              ${
                isDone 
                ? '<button class="btn btn-sm" style="background: var(--success-color); color: #fff;" disabled><i class="fa-solid fa-check"></i></button>'
                : `<button class="btn btn-primary btn-sm btn-check-task" data-id="${task.sponsor_id}"><i class="fa-solid fa-sync"></i> Tekshirish</button>`
              }
            </div>
          `;
          container.appendChild(item);
        });

        // Add check button event listeners
        document.querySelectorAll(".btn-check-task").forEach(btn => {
          btn.addEventListener("click", async (e) => {
            const sponsorId = parseInt(btn.getAttribute("data-id"));
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tekshirilmoqda...';

            try {
              const checkRes = await apiFetch("/api/tasks/check", {
                method: "POST",
                body: JSON.stringify({ sponsor_id: sponsorId })
              });

              if (checkRes.completed) {
                showToast(checkRes.message, "success");
                await loadUserData();
                await loadTasks();
              } else {
                showToast(checkRes.message, "danger");
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-sync"></i> Tekshirish';
              }
            } catch (err) {
              btn.disabled = false;
              btn.innerHTML = '<i class="fa-solid fa-sync"></i> Tekshirish';
            }
          });
        });
      }
    } catch (err) {
      container.innerHTML = '<div style="text-align: center; color: var(--danger-color); padding: 20px;">Vazifalarni yuklashda xatolik.</div>';
    }
  }

  // --- LEADERBOARD MODULE ---
  async function loadLeaderboard() {
    const listEl = document.getElementById("leaderboard-list");
    if (!listEl) return;

    try {
      const res = await apiFetch("/api/leaderboard");
      if (res.status === "success" && res.leaderboard) {
        const board = res.leaderboard;

        // Top 3 Podium update
        if (board[0]) {
          document.getElementById("podium-1-name").textContent = board[0].first_name || board[0].username || "Foydalanuvchi";
          document.getElementById("podium-1-tickets").textContent = `${board[0].tickets} Bilet`;
        }
        if (board[1]) {
          document.getElementById("podium-2-name").textContent = board[1].first_name || board[1].username || "Foydalanuvchi";
          document.getElementById("podium-2-tickets").textContent = `${board[1].tickets} Bilet`;
        }
        if (board[2]) {
          document.getElementById("podium-3-name").textContent = board[2].first_name || board[2].username || "Foydalanuvchi";
          document.getElementById("podium-3-tickets").textContent = `${board[2].tickets} Bilet`;
        }

        // List render for rank 4+
        listEl.innerHTML = "";
        board.forEach((u, index) => {
          const rank = index + 1;
          const row = document.createElement("div");
          row.className = "leader-row";

          let rankBadge = `${rank}`;
          if (rank === 1) rankBadge = "🥇";
          if (rank === 2) rankBadge = "🥈";
          if (rank === 3) rankBadge = "🥉";

          const nameStr = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || `User ${u.id}`;

          row.innerHTML = `
            <div class="leader-rank">${rankBadge}</div>
            <div class="leader-user">${nameStr}</div>
            <div class="leader-stats">${u.tickets} 🎟️</div>
          `;
          listEl.appendChild(row);
        });
      }
    } catch (err) {
      listEl.innerHTML = '<div style="text-align: center; color: var(--danger-color); padding: 20px;">Reytingni yuklashda xatolik.</div>';
    }
  }

  // --- CONTEST PARTICIPATION ACTION ---
  const participateBtn = document.getElementById("btn-participate-contest");
  if (participateBtn) {
    participateBtn.addEventListener("click", async () => {
      participateBtn.disabled = true;
      participateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Obuna tekshirilmoqda...';

      try {
        const res = await apiFetch("/api/contest/participate", { method: "POST" });
        if (res.status === "success") {
          showToast(res.message, "success");
          await loadUserData();
        } else {
          showToast(res.message || "Barcha sponsor kanallarga obuna bo'ling!", "warning");
        }
      } catch (err) {
      } finally {
        participateBtn.disabled = false;
        participateBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 🚀 Qatnashish';
      }
    });
  }

  // --- REFERRAL LINK ACTIONS ---
  const copyBtn = document.getElementById("btn-copy-ref");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const linkInput = document.getElementById("ref-link-input");
      if (linkInput && linkInput.value) {
        navigator.clipboard.writeText(linkInput.value).then(() => {
          showToast("Taklif havolasi nusxalandi! 🚀", "success");
        }).catch(() => {
          showToast("Nusxalashda xatolik!", "danger");
        });
      }
    });
  }

  const shareBtn = document.getElementById("btn-share-ref");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const link = document.getElementById("ref-link-input").value;
      const shareText = `🚀 PEEXELL GRAND KONKURSda ishtirok eting! 10,000,000 UZS va iPhone 15 Pro yutib oling!\n\nQuyidagi havola orqali kiring va +1 Bonus Bilet oling:`;
      const fullShareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;

      if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(fullShareUrl);
      } else {
        window.open(fullShareUrl, '_blank');
      }
    });
  }

  // --- ADMIN PANEL ACTIONS ---
  async function loadAdminData() {
    if (!currentUser || !currentUser.is_admin) return;

    try {
      // Pre-fill Contest Edit Form
      if (activeContest) {
        const titleInput = document.getElementById("admin-contest-title");
        const descInput = document.getElementById("admin-contest-desc");
        const prizeInput = document.getElementById("admin-contest-prizes");
        const endInput = document.getElementById("admin-contest-endtime");

        if (titleInput) titleInput.value = activeContest.title || "";
        if (descInput) descInput.value = activeContest.description || "";
        if (prizeInput) prizeInput.value = activeContest.prize_pool || "";
        if (endInput && activeContest.end_time) {
          try {
            const dt = new Date(activeContest.end_time);
            const localIso = new Date(dt.getTime() - (dt.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            endInput.value = localIso;
          } catch (e) {}
        }
      }

      // Load Stats
      const statsRes = await apiFetch("/api/admin/stats");
      if (statsRes.status === "success") {
        document.getElementById("admin-stat-users").textContent = statsRes.stats.total_users;
        document.getElementById("admin-stat-tickets").textContent = statsRes.stats.total_tickets;
      }

      // Load Sponsors
      const sponsorsRes = await apiFetch("/api/admin/sponsors");
      if (sponsorsRes.status === "success") {
        const spList = document.getElementById("admin-sponsors-list");
        if (spList) {
          spList.innerHTML = "";
          sponsorsRes.sponsors.forEach(s => {
            const item = document.createElement("div");
            item.className = "task-item";
            item.innerHTML = `
              <div>
                <div class="task-title">${s.title} (${s.channel_id})</div>
                <div class="task-reward"><a href="${s.invite_link}" target="_blank" style="color: var(--secondary-color);">${s.invite_link}</a></div>
              </div>
              <button class="btn btn-sm btn-delete-sponsor" data-id="${s.id}" style="background: var(--danger-color); color: #fff;">
                <i class="fa-solid fa-trash"></i>
              </button>
            `;
            spList.appendChild(item);
          });

          document.querySelectorAll(".btn-delete-sponsor").forEach(b => {
            b.addEventListener("click", async () => {
              const sid = b.getAttribute("data-id");
              if (confirm("Ushbu sponsor kanalni o'chirmoqchimisiz?")) {
                await apiFetch(`/api/admin/sponsors/${sid}`, { method: "DELETE" });
                showToast("Sponsor o'chirildi", "success");
                loadAdminData();
              }
            });
          });
        }
      }
    } catch (err) {
      console.log("Admin load error");
    }
  }

  // Save Contest Form Handler
  const saveContestBtn = document.getElementById("btn-save-contest");
  if (saveContestBtn) {
    saveContestBtn.addEventListener("click", async () => {
      const title = document.getElementById("admin-contest-title").value.trim();
      const description = document.getElementById("admin-contest-desc").value.trim();
      const prize_pool = document.getElementById("admin-contest-prizes").value.trim();
      const end_time_val = document.getElementById("admin-contest-endtime").value;

      if (!title || !description || !prize_pool || !end_time_val) {
        showToast("Barcha maydonlarni to'ldiring!", "warning");
        return;
      }

      const end_time = new Date(end_time_val).toISOString();

      try {
        await apiFetch("/api/admin/contest/update", {
          method: "POST",
          body: JSON.stringify({ title, description, prize_pool, end_time })
        });
        showToast("Konkurs ma'lumotlari yangilandi! 🏆", "success");
        await loadContestData();
      } catch (err) {}
    });
  }

  // Add Sponsor Form Handler
  const addSponsorBtn = document.getElementById("btn-add-sponsor");
  if (addSponsorBtn) {
    addSponsorBtn.addEventListener("click", async () => {
      const title = document.getElementById("admin-sponsor-title").value.trim();
      const channel_id = document.getElementById("admin-sponsor-channel-id").value.trim();
      const invite_link = document.getElementById("admin-sponsor-link").value.trim();

      if (!title || !channel_id || !invite_link) {
        showToast("Barcha maydonlarni to'ldiring!", "warning");
        return;
      }

      try {
        await apiFetch("/api/admin/sponsors", {
          method: "POST",
          body: JSON.stringify({ title, channel_id, invite_link })
        });
        showToast("Sponsor kanal qo'shildi! 🎉", "success");
        document.getElementById("admin-sponsor-title").value = "";
        document.getElementById("admin-sponsor-channel-id").value = "";
        document.getElementById("admin-sponsor-link").value = "";
        loadAdminData();
      } catch (err) {}
    });
  }

  // Pick Random Winners Handler
  const pickWinnersBtn = document.getElementById("btn-pick-winners");
  if (pickWinnersBtn) {
    pickWinnersBtn.addEventListener("click", async () => {
      if (!confirm("Biletlar asosida 3 ta tasodifiy g'olibni aniqlashni tasdiqlaysizmi?")) return;

      pickWinnersBtn.disabled = true;
      pickWinnersBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aniqlanmoqda...';

      try {
        const res = await apiFetch("/api/admin/winners/pick", {
          method: "POST",
          body: JSON.stringify({ count: 3 })
        });

        if (res.status === "success" && res.winners) {
          showToast("G'oliblar muvaffaqiyatli aniqlandi! 🏆", "success");
          const resultDiv = document.getElementById("admin-winners-result");
          resultDiv.innerHTML = '<b>🏆 Konkurs G\'oliblari:</b><br>';
          res.winners.forEach(w => {
            resultDiv.innerHTML += `<div>${w.place}-O'rin: <b>${w.first_name}</b> (@${w.username || 'no_user'}) - <i>${w.prize}</i></div>`;
          });
        }
      } catch (err) {
      } finally {
        pickWinnersBtn.disabled = false;
        pickWinnersBtn.innerHTML = '<i class="fa-solid fa-dice"></i> G\'oliblarni Aniqlash (Random)';
      }
    });
  }

  // Export Buttons Handlers
  const exportCsvBtn = document.getElementById("btn-export-csv");
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
      window.open(`/api/admin/export?format=csv&initData=${encodeURIComponent(initData)}`, '_blank');
    });
  }

  const exportJsonBtn = document.getElementById("btn-export-json");
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", async () => {
      const data = await apiFetch("/api/admin/export?format=json");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "peexell_contest_export.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // --- INITIAL STARTUP ---
  async function init() {
    await loadUserData();
    await loadContestData();
    await loadTasks();

    // Check if user opened WebApp in Admin mode via /admin
    const urlParams = new URLSearchParams(window.location.search);
    const targetTab = urlParams.get("tab") || tg?.initDataUnsafe?.start_param;

    if (targetTab === "admin" && currentUser && currentUser.is_admin) {
      const navItems = document.querySelectorAll(".nav-item");
      const tabContents = document.querySelectorAll(".tab-content");

      navItems.forEach(n => n.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      const adminNav = document.getElementById("nav-admin-btn");
      const adminTab = document.getElementById("tab-admin");

      if (adminNav) adminNav.classList.add("active");
      if (adminTab) adminTab.classList.add("active");

      await loadAdminData();
    }
  }

  init();
});
