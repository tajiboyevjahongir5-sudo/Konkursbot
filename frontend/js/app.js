/* ==========================================================================
   PEEXELL KONKURS TELEGRAM WEB APP - JAVASCRIPT SPA LOGIC
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Telegram WebApp SDK Initialization
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    
    // Prevent accidental swipe down to close WebApp while scrolling
    if (typeof tg.disableVerticalSwipes === 'function') {
      tg.disableVerticalSwipes();
    }
    if (typeof tg.enableClosingConfirmation === 'function') {
      tg.enableClosingConfirmation();
    }

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

  // Listen for Google OAuth callback message
  window.addEventListener("message", async (event) => {
    if (event.data === "yt_success") {
      showToast("🎉 YouTube obunangiz Google API orqali 100% rasmiy tasdiqlandi!", "success");
      if (typeof loadUserData === 'function') await loadUserData();
      if (typeof loadTasks === 'function') await loadTasks();
    }
  });

  // Telegram Init Data String
  const initData = tg?.initData || "";

  // Helper API fetch function with initData header
  async function apiFetch(endpoint, options = {}) {
    const headers = {
      'X-Telegram-Init-Data': initData,
      ...(options.headers || {})
    };
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

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

  // --- TOAST NOTIFICATIONS & HAPTIC FEEDBACK ---
  function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    // Telegram Native Haptic Feedback Vibration
    if (tg && tg.HapticFeedback) {
      try {
        if (type === "success") tg.HapticFeedback.notificationOccurred("success");
        else if (type === "danger") tg.HapticFeedback.notificationOccurred("error");
        else tg.HapticFeedback.notificationOccurred("warning");
      } catch (e) {}
    }

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

  function updateNavVisibility(targetTab) {
    const bottomNav = document.querySelector(".bottom-nav");
    if (!bottomNav) return;

    if (targetTab === "tab-admin" || targetTab === "admin") {
      bottomNav.style.display = "none";
      document.body.style.paddingBottom = "20px";
    } else {
      bottomNav.style.display = "flex";
      document.body.style.paddingBottom = "80px";
    }
  }

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const targetTab = item.getAttribute("data-tab");

      navItems.forEach(n => n.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      item.classList.add("active");
      const targetEl = document.getElementById(targetTab);
      if (targetEl) targetEl.classList.add("active");

      updateNavVisibility(targetTab);

      // Tab specific refresh logic
      if (targetTab === "tab-contest") {
        loadContestData();
        loadTasks();
        loadPublicWinners();
      }
      if (targetTab === "tab-profile" || targetTab === "tab-friends") {
        loadUserData();
      }
      if (targetTab === "tab-admin") {
        loadAdminData();
      }
    });
  });

  // --- DATA LOADING & STATE MANAGEMENT ---
  async function loadPublicWinners() {
    const winnersEl = document.getElementById("public-winners-list");
    if (!winnersEl) return;

    try {
      const res = await apiFetch("/api/winners");
      if (res.status === "success" && res.winners && res.winners.length > 0) {
        winnersEl.innerHTML = "";
        res.winners.forEach(w => {
          const row = document.createElement("div");
          row.style.cssText = "display: flex; align-items: center; justify-content: space-between; background: rgba(26, 28, 35, 0.7); border: 1px solid var(--card-border); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;";
          
          let medal = "🥇";
          if (w.place === 2) medal = "🥈";
          if (w.place === 3) medal = "🥉";

          const uName = w.first_name || (w.username ? `@${w.username}` : `User ${w.user_id}`);

          row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.2rem;">${medal}</span>
              <div>
                <div style="font-weight: 700; font-size: 0.88rem; color: #fff;">${uName}</div>
                <div style="font-size: 0.76rem; color: var(--primary-color); font-weight: 600;">${w.prize}</div>
              </div>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 6px;">${w.place}-O'rin</div>
          `;
          winnersEl.appendChild(row);
        });
      } else {
        winnersEl.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-secondary); text-align: center; padding: 10px;">Hozircha g\'oliblar aniqlanmagan. Konkurs davom etmoqda!</div>';
      }
    } catch (err) {}
  }

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

        // Update Profile Avatar (Real Telegram Photo)
        const pAvatar = document.getElementById("prof-user-avatar");
        if (pAvatar && currentUser.id) {
          const tgPhoto = tg?.initDataUnsafe?.user?.photo_url;
          pAvatar.src = tgPhoto || `/api/user/photo/${currentUser.id}`;
        }

        // Render User Tickets Grid
        const ticketsContainer = document.getElementById("user-tickets-container");
        if (ticketsContainer) {
          if (currentUser.tickets_list && currentUser.tickets_list.length > 0) {
            ticketsContainer.innerHTML = "";
            currentUser.tickets_list.forEach(t => {
              const card = document.createElement("div");
              card.className = "pxl-ticket-card";
              card.innerHTML = `
                <div class="pxl-ticket-notch notch-left"></div>
                <div class="pxl-ticket-notch notch-right"></div>
                <div class="pxl-ticket-header">
                  <span class="pxl-ticket-icon">🎟️</span>
                  <span class="pxl-ticket-brand">PEEXELL</span>
                </div>
                <div class="pxl-ticket-number">${t.ticket_number}</div>
                <div class="pxl-ticket-reason">${t.reason || 'Omadli Bilet'}</div>
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

        const igClickTracker = {};

        container.innerHTML = "";
        res.tasks.forEach(task => {
          const item = document.createElement("div");
          item.className = "task-item";
          item.style.cssText = "background: rgba(26, 28, 35, 0.7); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px;";
          
          const isDone = task.completed === 1;
          const rawPlatform = (task.platform || "").toLowerCase();
          const invLink = (task.invite_link || "").toLowerCase();

          const isYT = rawPlatform === "youtube" || invLink.includes("youtube.com") || invLink.includes("youtu.be");
          const isIG = rawPlatform === "instagram" || invLink.includes("instagram.com");
          const platform = isYT ? "youtube" : (isIG ? "instagram" : "telegram");

          let iconClass = "fa-telegram";
          let iconColor = "#38bdf8";
          let btnBg = "rgba(0, 136, 204, 0.22)";
          let btnBorder = "#0088cc";
          let btnText = "✈️ Telegram'da A'zo Bo'lish";
          let subtitleText = task.channel_id;
          let iconHtml = `<img src="/api/channel/photo?channel_id=${encodeURIComponent(task.channel_id)}" alt="${task.title}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='assets/logo.jpg';">`;
          let linkAttr = `href="${task.invite_link}" target="_blank"`;

          if (isYT) {
            iconClass = "fa-youtube";
            iconColor = "#ff3b30";
            btnBg = "rgba(255, 59, 48, 0.18)";
            btnBorder = "#ff3b30";
            btnText = "🔴 YouTube'da Obuna Bo'lish";
            subtitleText = "YouTube Kanal (Google Data API)";
            iconHtml = '<i class="fa-brands fa-youtube" style="color: #ff3b30; font-size: 1.5rem;"></i>';
          } else if (isIG) {
            iconClass = "fa-instagram";
            iconColor = "#e1306c";
            btnBg = "rgba(225, 48, 108, 0.18)";
            btnBorder = "#e1306c";
            btnText = "📸 Instagram'da Kuzatish";
            subtitleText = "Instagram Profil (Smart Tracker)";
            iconHtml = '<i class="fa-brands fa-instagram" style="color: #e1306c; font-size: 1.5rem;"></i>';
            linkAttr = `href="#" class="btn-ig-link" data-url="${task.invite_link}" data-id="${task.sponsor_id}"`;
          }

          item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 44px; height: 44px; border-radius: 50%; overflow: hidden; border: 2px solid ${btnBorder}; flex-shrink: 0; background: var(--bg-dark); display: flex; align-items: center; justify-content: center;">
                ${iconHtml}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; font-size: 0.92rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${task.title}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${subtitleText}</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px; width: 100%;">
              <a ${linkAttr} class="btn btn-sm ${isIG ? 'btn-ig-link' : ''}" onclick="event.stopPropagation();" style="flex: 1; justify-content: center; padding: 10px; font-size: 0.85rem; font-weight: 700; border-radius: 8px; background: ${btnBg}; border: 1px solid ${btnBorder}; color: ${iconColor};">
                <i class="fa-brands ${iconClass}" style="color: ${iconColor};"></i> ${btnText}
              </a>
              ${
                isDone 
                ? '<button class="btn btn-sm" style="flex: 1; justify-content: center; background: #22c55e; color: #fff; padding: 10px; font-size: 0.85rem; font-weight: 700; border-radius: 8px; border: none;" disabled><i class="fa-solid fa-circle-check"></i> Bajarildi</button>'
                : `<button class="btn btn-primary btn-sm btn-check-task" data-id="${task.sponsor_id}" data-platform="${platform}" style="flex: 1; justify-content: center; padding: 10px; font-size: 0.85rem; font-weight: 800; border-radius: 8px;"><i class="fa-solid fa-arrows-rotate"></i> Tekshirish</button>`
              }
            </div>
          `;
          container.appendChild(item);
        });

        // Add Instagram link tracking listeners
        document.querySelectorAll(".btn-ig-link").forEach(linkBtn => {
          linkBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const targetUrl = linkBtn.getAttribute("data-url");
            const sponsorId = linkBtn.getAttribute("data-id");
            
            igClickTracker[sponsorId] = {
              clicked: true,
              timestamp: Date.now()
            };

            showToast("Instagram profilga o'tilmoqda... Obuna bo'lib qayting!", "success");

            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
              window.Telegram.WebApp.openLink(targetUrl);
            } else {
              window.open(targetUrl, '_blank');
            }
          });
        });

        // Add check button event listeners
        document.querySelectorAll(".btn-check-task").forEach(btn => {
          btn.addEventListener("click", async (e) => {
            const sponsorId = parseInt(btn.getAttribute("data-id"));
            const platform = btn.getAttribute("data-platform");
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tekshirilmoqda...';

            if (platform === "instagram") {
              const trackData = igClickTracker[sponsorId];
              if (!trackData || !trackData.clicked) {
                showToast("❌ Avval Instagram havolasiga kirib obuna bo'ling!", "warning");
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Tekshirish';
                return;
              }

              const elapsedSeconds = (Date.now() - trackData.timestamp) / 1000;
              if (elapsedSeconds < 4) {
                showToast("⏳ Iltimos, profilni ko'rish va obuna bo'lish uchun Instagram'da kamida 5 soniya turing!", "warning");
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Tekshirish';
                return;
              }

              const userIgNik = prompt("📸 Obunani tasdiqlash uchun Instagram nikingizni kiriting (masalan: @username):");
              if (!userIgNik || userIgNik.trim().length < 2) {
                showToast("❌ Obunani tasdiqlash uchun Instagram nikingizni kiritishingiz shart!", "warning");
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Tekshirish';
                return;
              }

              try {
                const checkRes = await apiFetch("/api/tasks/check", {
                  method: "POST",
                  body: JSON.stringify({ sponsor_id: sponsorId })
                });

                if (checkRes.completed) {
                  showToast(`🎉 Instagram obunangiz tasdiqlandi! (${userIgNik.trim()}) +1 Bilet berildi!`, "success");
                  await loadUserData();
                  await loadTasks();
                } else {
                  showToast(checkRes.message, "danger");
                }
              } catch (err) {
                showToast("Tekshirishda xatolik yuz berdi", "danger");
              } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Tekshirish';
              }
              return;
            }

            if (platform === "youtube") {
              try {
                const gRes = await apiFetch(`/api/auth/google/url?sponsor_id=${sponsorId}`);
                if (gRes && gRes.status === "success" && gRes.url) {
                  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
                    window.Telegram.WebApp.openLink(gRes.url);
                  } else {
                    window.open(gRes.url, '_blank', 'width=500,height=600');
                  }
                  showToast("🔐 Google akkauntingiz orqali tasdiqlash sahifasi ochilmoqda...", "warning");
                } else {
                  showToast((gRes && gRes.message) || "Google API sozlanmagan!", "danger");
                }
              } catch (err) {
                showToast(err.message || "Google API bilan ulanishda xatolik!", "danger");
              } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Tekshirish';
              }
              return;
            }

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
                btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Tekshirish';
              }
            } catch (err) {
              btn.disabled = false;
              btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Tekshirish';
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
        participateBtn.innerHTML = '🚀 Qatnashish';
      }
    });
  }

  // --- REFERRAL LINK ACTIONS ---
  function fallbackCopyText(text) {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        showToast("Taklif havolasi nusxalandi! 🚀", "success");
      } else {
        showToast("Nusxalashda xatolik!", "danger");
      }
    } catch (err) {
      showToast("Nusxalashda xatolik!", "danger");
    }
  }

  const copyBtn = document.getElementById("btn-copy-ref");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const linkInput = document.getElementById("ref-link-input");
      if (linkInput && linkInput.value) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(linkInput.value).then(() => {
            showToast("Taklif havolasi nusxalandi! 🚀", "success");
          }).catch(() => {
            fallbackCopyText(linkInput.value);
          });
        } else {
          fallbackCopyText(linkInput.value);
        }
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
        const dateInput = document.getElementById("admin-contest-enddate");
        const hourSelect = document.getElementById("admin-contest-hour");
        const minSelect = document.getElementById("admin-contest-minute");

        if (titleInput) titleInput.value = activeContest.title || "";
        if (descInput) descInput.value = activeContest.description || "";
        if (prizeInput) prizeInput.value = activeContest.prize_pool || "";
        if (activeContest.end_time) {
          try {
            const dt = new Date(activeContest.end_time);
            const yyyy = dt.getFullYear();
            const mm = String(dt.getMonth() + 1).padStart(2, '0');
            const dd = String(dt.getDate()).padStart(2, '0');
            const hh = String(dt.getHours()).padStart(2, '0');
            const min = String(dt.getMinutes()).padStart(2, '0');

            if (dateInput) dateInput.value = `${yyyy}-${mm}-${dd}`;
            if (hourSelect) hourSelect.value = hh;
            if (minSelect) {
              let matched = false;
              for (let opt of minSelect.options) {
                if (opt.value === min) {
                  minSelect.value = min;
                  matched = true;
                  break;
                }
              }
              if (!matched) {
                const newOpt = new Option(`${min} daq`, min, true, true);
                minSelect.add(newOpt);
              }
            }
          } catch (e) {}
        }
      }

      // Load Detailed Stats
      try {
        const statsRes = await apiFetch("/api/admin/stats/detailed");
        if (statsRes.status === "success" && statsRes.stats) {
          const s = statsRes.stats;
          const uEl = document.getElementById("admin-stat-users");
          const tEl = document.getElementById("admin-stat-tickets");
          const tuEl = document.getElementById("admin-stat-today-users");
          const rEl = document.getElementById("admin-stat-referrals");
          const gEl = document.getElementById("admin-stat-google-verified");
          const spEl = document.getElementById("admin-stat-sponsors-count");

          if (uEl) uEl.textContent = s.total_users;
          if (tEl) tEl.textContent = s.total_tickets;
          if (tuEl) tuEl.textContent = s.today_users;
          if (rEl) rEl.textContent = s.total_referrals;
          if (gEl) gEl.textContent = s.google_verified_count;
          if (spEl) spEl.textContent = s.active_sponsors;
        }
      } catch (e) {}

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
      const dateVal = document.getElementById("admin-contest-enddate")?.value;
      const hourVal = document.getElementById("admin-contest-hour")?.value || "23";
      const minVal = document.getElementById("admin-contest-minute")?.value || "59";

      if (!title || !description || !prize_pool || !dateVal) {
        showToast("Barcha maydonlarni to'ldiring!", "warning");
        return;
      }

      const end_time = new Date(`${dateVal}T${hourVal}:${minVal}:00`).toISOString();

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

  const platformSelect = document.getElementById("admin-sponsor-platform");
  function updateSponsorFormUI() {
    if (!platformSelect) return;
    const platform = platformSelect.value;
    const lblTitle = document.getElementById("lbl-sponsor-title");
    const titleInput = document.getElementById("admin-sponsor-title");
    const lblChannelId = document.getElementById("lbl-sponsor-channel-id");
    const channelIdInput = document.getElementById("admin-sponsor-channel-id");
    const hintChannelId = document.getElementById("hint-sponsor-channel-id");
    const lblLink = document.getElementById("lbl-sponsor-link");
    const linkInput = document.getElementById("admin-sponsor-link");
    const ytGroup = document.getElementById("yt-channel-id-group");

    if (platform === "telegram") {
      if (lblTitle) lblTitle.textContent = "✈️ Telegram Kanal Nomi:";
      if (titleInput) titleInput.placeholder = "Masalan: PEEXELL News";

      if (lblChannelId) lblChannelId.textContent = "✈️ Telegram Username yoki ID:";
      if (channelIdInput) channelIdInput.placeholder = "@peexell_news yoki -1001234567890";
      if (hintChannelId) hintChannelId.innerHTML = '<i class="fa-solid fa-circle-info" style="color: var(--primary-color);"></i> Bot ushbu kanalda administrator bo\'lishi shart!';

      if (lblLink) lblLink.textContent = "✈️ Taklif Havolasi (Invite Link):";
      if (linkInput) linkInput.placeholder = "https://t.me/peexell_news";

      if (ytGroup) ytGroup.style.display = "none";
    } else if (platform === "youtube") {
      if (lblTitle) lblTitle.textContent = "🔴 YouTube Kanal Nomi:";
      if (titleInput) titleInput.placeholder = "Masalan: Jahongir Projects";

      if (lblChannelId) lblChannelId.textContent = "🔴 YouTube Handle yoki ID:";
      if (channelIdInput) channelIdInput.placeholder = "@JahongirProjects";
      if (hintChannelId) hintChannelId.innerHTML = '<i class="fa-brands fa-youtube" style="color: #ff3b30;"></i> YouTube kanali @handle yoki qidiruv nomi';

      if (lblLink) lblLink.textContent = "🔴 YouTube Kanal Havolasi (URL):";
      if (linkInput) linkInput.placeholder = "https://youtube.com/@JahongirProjects";

      if (ytGroup) ytGroup.style.display = "block";
    } else if (platform === "instagram") {
      if (lblTitle) lblTitle.textContent = "📸 Instagram Profil Nomi:";
      if (titleInput) titleInput.placeholder = "Masalan: PEEXELL Official";

      if (lblChannelId) lblChannelId.textContent = "📸 Instagram Username (@username):";
      if (channelIdInput) channelIdInput.placeholder = "@peexell.uz";
      if (hintChannelId) hintChannelId.innerHTML = '<i class="fa-brands fa-instagram" style="color: #E1306C;"></i> Instagram foydalanuvchi nomi';

      if (lblLink) lblLink.textContent = "📸 Instagram Profil Havolasi (URL):";
      if (linkInput) linkInput.placeholder = "https://instagram.com/peexell.uz";

      if (ytGroup) ytGroup.style.display = "none";
    }
  }

  if (platformSelect) {
    platformSelect.addEventListener("change", updateSponsorFormUI);
    updateSponsorFormUI();
  }

  // Add Sponsor Form Handler
  const addSponsorBtn = document.getElementById("btn-add-sponsor");
  if (addSponsorBtn) {
    addSponsorBtn.addEventListener("click", async () => {
      const platform = document.getElementById("admin-sponsor-platform") ? document.getElementById("admin-sponsor-platform").value : "telegram";
      const title = document.getElementById("admin-sponsor-title").value.trim();
      const channel_id = document.getElementById("admin-sponsor-channel-id").value.trim();
      const invite_link = document.getElementById("admin-sponsor-link").value.trim();
      const youtube_channel_id = document.getElementById("admin-sponsor-yt-id") ? document.getElementById("admin-sponsor-yt-id").value.trim() : null;

      if (!title || !channel_id || !invite_link) {
        showToast("Barcha maydonlarni to'ldiring!", "warning");
        return;
      }

      try {
        await apiFetch("/api/admin/sponsors", {
          method: "POST",
          body: JSON.stringify({ title, channel_id, invite_link, platform, youtube_channel_id })
        });
        showToast("Sponsor qo'shildi! 🎉", "success");
        document.getElementById("admin-sponsor-title").value = "";
        document.getElementById("admin-sponsor-channel-id").value = "";
        document.getElementById("admin-sponsor-link").value = "";
        if (document.getElementById("admin-sponsor-yt-id")) document.getElementById("admin-sponsor-yt-id").value = "";
        loadAdminData();
      } catch (err) {}
    });
  }

  // Pick Random Winners Handler
  // --- ADMIN SUBTABS SWITCHING ---
  document.querySelectorAll(".admin-subtab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-subtab");
      document.querySelectorAll(".admin-subtab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".admin-subcontent").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      const contentEl = document.getElementById(targetId);
      if (contentEl) contentEl.classList.add("active");
    });
  });

  // Refresh Stats Button
  const refreshStatsBtn = document.getElementById("btn-refresh-stats");
  if (refreshStatsBtn) {
    refreshStatsBtn.addEventListener("click", async () => {
      refreshStatsBtn.disabled = true;
      refreshStatsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      await loadAdminData();
      showToast("Statistikalar yangilandi! 📊", "success");
      refreshStatsBtn.disabled = false;
      refreshStatsBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Yangilash';
    });
  }

  // User Search & Ticket Management Handlers
  const searchUserBtn = document.getElementById("btn-search-user");
  const searchUserInput = document.getElementById("admin-user-search-input");
  const searchResultsDiv = document.getElementById("admin-user-search-results");

  async function performUserSearch() {
    const q = searchUserInput?.value.trim();
    if (!q) {
      showToast("Qidiruv so'zini kiriting!", "warning");
      return;
    }

    if (searchResultsDiv) {
      searchResultsDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 15px;"><i class="fa-solid fa-spinner fa-spin"></i> Qidirilmoqda...</div>';
    }

    try {
      const res = await apiFetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
      if (res.status === "success" && res.users) {
        if (res.users.length === 0) {
          searchResultsDiv.innerHTML = '<div style="text-align: center; color: var(--danger-color); padding: 15px;">Foydalanuvchi topilmadi.</div>';
          return;
        }

        searchResultsDiv.innerHTML = "";
        res.users.forEach(u => {
          const card = document.createElement("div");
          card.className = "admin-user-card";
          const userName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Foydalanuvchi';
          const userHandle = u.username ? `@${u.username}` : `ID: ${u.id}`;

          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <div style="font-weight: 700; font-size: 0.92rem; color: #fff;">${userName}</div>
                <div style="font-size: 0.78rem; color: var(--primary-color);">${userHandle} (ID: ${u.id})</div>
              </div>
              <div style="text-align: right;">
                <span class="badge" style="background: rgba(197, 255, 0, 0.15); color: var(--primary-color); font-weight: 700; font-size: 0.85rem; padding: 4px 8px; border-radius: 6px;">
                  🎟️ <span id="user-tickets-badge-${u.id}">${u.tickets}</span> bilet
                </span>
              </div>
            </div>

            <div style="display: flex; gap: 12px; font-size: 0.76rem; color: var(--text-secondary); margin-bottom: 10px;">
              <div>👥 Referallar: <b>${u.referrals_count || 0}</b></div>
              <div>✅ Vazifalar: <b>${u.tasks_count || 0}</b></div>
              ${u.phone_number ? `<div>📞 ${u.phone_number}</div>` : ''}
            </div>

            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-ticket-mod" data-id="${u.id}" data-delta="1" style="background: rgba(197, 255, 0, 0.2); color: #fff; border: 1px solid var(--primary-color); padding: 4px 8px; font-size: 0.74rem;">
                +1 Bilet
              </button>
              <button class="btn btn-sm btn-ticket-mod" data-id="${u.id}" data-delta="5" style="background: rgba(197, 255, 0, 0.2); color: #fff; border: 1px solid var(--primary-color); padding: 4px 8px; font-size: 0.74rem;">
                +5 Bilet
              </button>
              <button class="btn btn-sm btn-ticket-mod" data-id="${u.id}" data-delta="-1" style="background: rgba(255, 59, 48, 0.2); color: #fff; border: 1px solid var(--danger-color); padding: 4px 8px; font-size: 0.74rem;">
                -1 Bilet
              </button>
              <button class="btn btn-sm btn-ticket-custom" data-id="${u.id}" style="background: rgba(255, 255, 255, 0.1); color: #fff; padding: 4px 8px; font-size: 0.74rem;">
                ✏️ Miqdor kiritish
              </button>
            </div>
          `;
          searchResultsDiv.appendChild(card);
        });

        document.querySelectorAll(".btn-ticket-mod").forEach(btn => {
          btn.addEventListener("click", async () => {
            const uid = parseInt(btn.getAttribute("data-id"));
            const delta = parseInt(btn.getAttribute("data-delta"));
            await modifyUserTickets(uid, delta);
          });
        });

        document.querySelectorAll(".btn-ticket-custom").forEach(btn => {
          btn.addEventListener("click", async () => {
            const uid = parseInt(btn.getAttribute("data-id"));
            const input = prompt("Qo'shish yoki ayirish uchun bilet miqdorini kiriting (masalan: +10 yoki -5):");
            if (input !== null) {
              const delta = parseInt(input);
              if (!isNaN(delta) && delta !== 0) {
                await modifyUserTickets(uid, delta);
              } else {
                showToast("Noto'g'ri son kiritildi!", "warning");
              }
            }
          });
        });
      }
    } catch (e) {
      if (searchResultsDiv) searchResultsDiv.innerHTML = '<div style="text-align: center; color: var(--danger-color); padding: 15px;">Qidiruvda xatolik yuz berdi.</div>';
    }
  }

  async function modifyUserTickets(userId, delta) {
    try {
      const res = await apiFetch("/api/admin/users/tickets", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, delta: delta })
      });
      if (res.status === "success") {
        showToast(res.message, "success");
        const badge = document.getElementById(`user-tickets-badge-${userId}`);
        if (badge && res.new_tickets !== undefined) {
          badge.textContent = res.new_tickets;
        }
        await loadAdminData();
      } else {
        showToast(res.message || "Xatolik yuz berdi", "danger");
      }
    } catch (e) {
      showToast("Biletni o'zgartirishda xatolik!", "danger");
    }
  }

  if (searchUserBtn) searchUserBtn.addEventListener("click", performUserSearch);
  if (searchUserInput) {
    searchUserInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") performUserSearch();
    });
  }

  // Pick Random Winners Handler
  const pickWinnersBtn = document.getElementById("btn-pick-winners");
  if (pickWinnersBtn) {
    pickWinnersBtn.addEventListener("click", async () => {
      const countVal = parseInt(document.getElementById("admin-winners-count")?.value || "3");
      if (!confirm(`Biletlar asosida ${countVal} ta tasodifiy g'olibni aniqlashni tasdiqlaysizmi?`)) return;

      pickWinnersBtn.disabled = true;
      pickWinnersBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aniqlanmoqda...';

      try {
        const res = await apiFetch("/api/admin/winners/pick", {
          method: "POST",
          body: JSON.stringify({ count: countVal })
        });

        if (res.status === "success" && res.winners) {
          showToast("G'oliblar muvaffaqiyatli aniqlandi! 🏆", "success");
          const resultDiv = document.getElementById("admin-winners-result");
          resultDiv.innerHTML = '<b>🏆 Konkurs G\'oliblari:</b><br>';
          res.winners.forEach(w => {
            resultDiv.innerHTML += `<div>${w.place}-O'rin: <b>${w.first_name}</b> (@${w.username || 'no_user'}) - <i>${w.prize}</i></div>`;
          });
          await loadPublicWinners();
        }
      } catch (err) {
      } finally {
        pickWinnersBtn.disabled = false;
        pickWinnersBtn.innerHTML = '<i class="fa-solid fa-dice-five"></i> G\'oliblarni Aniqlash (Random)';
      }
    });
  }

  // Clear Winners Handler
  const clearWinnersBtn = document.getElementById("btn-clear-winners");
  if (clearWinnersBtn) {
    clearWinnersBtn.addEventListener("click", async () => {
      if (confirm("G'oliblar ro'yxatini tozalashni tasdiqlaysizmi?")) {
        try {
          const res = await apiFetch("/api/admin/winners/clear", { method: "POST" });
          showToast(res.message || "G'oliblar tozalandi! 🧹", "success");
          const resultDiv = document.getElementById("admin-winners-result");
          if (resultDiv) resultDiv.innerHTML = "";
          await loadPublicWinners();
        } catch (e) {}
      }
    });
  }

  // Reset Tickets Handler
  const resetTicketsBtn = document.getElementById("btn-reset-tickets");
  if (resetTicketsBtn) {
    resetTicketsBtn.addEventListener("click", async () => {
      if (confirm("Haqiqatan ham barcha biletlar va qatnashchilar ma'lumotlarini nolga tushirmoqchimisiz?")) {
        try {
          const res = await apiFetch("/api/admin/contest/reset_tickets", { method: "POST" });
          showToast(res.message || "Biletlar nolga tushirildi! 🧹", "success");
          await loadAdminData();
        } catch (e) {}
      }
    });
  }

  // Clear All Users Handler
  const clearUsersBtn = document.getElementById("btn-clear-users");
  if (clearUsersBtn) {
    clearUsersBtn.addEventListener("click", async () => {
      if (confirm("Diqqat! Barcha foydalanuvchilar va ularning bajargan vazifalari to'liq o'chiriladi. Tasdiqlaysizmi?")) {
        try {
          const res = await apiFetch("/api/admin/clear_users", { method: "POST" });
          showToast(res.message || "Barcha foydalanuvchilar tozalandi! 🧹", "success");
          await loadAdminData();
        } catch (e) {}
      }
    });
  }

  // Export Buttons Handlers
  // Export Buttons Handlers (Blob-based clean downloads for Telegram WebApp)
  const exportCsvBtn = document.getElementById("btn-export-csv");
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", async () => {
      try {
        exportCsvBtn.disabled = true;
        exportCsvBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CSV Yuklanmoqda...';

        const res = await fetch(`/api/admin/export?format=csv`, {
          headers: {
            'X-Telegram-Init-Data': initData
          }
        });

        if (!res.ok) throw new Error("Yuklab olishda xatolik");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "peexell_konkurs_foydalanuvchilar.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("CSV fayl muvaffaqiyatli yuklab olindi! 📊", "success");
      } catch (err) {
        showToast("CSV faylni yuklab olishda xatolik!", "danger");
      } finally {
        exportCsvBtn.disabled = false;
        exportCsvBtn.innerHTML = '<i class="fa-solid fa-file-arrow-down"></i> CSV Yuklab Olish';
      }
    });
  }

  const exportJsonBtn = document.getElementById("btn-export-json");
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", async () => {
      try {
        exportJsonBtn.disabled = true;
        exportJsonBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> JSON Yuklanmoqda...';

        const data = await apiFetch("/api/admin/export?format=json");
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "peexell_konkurs_backup.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("JSON fayl muvaffaqiyatli yuklab olindi! 💻", "success");
      } catch (err) {
        showToast("JSON faylni yuklab olishda xatolik!", "danger");
      } finally {
        exportJsonBtn.disabled = false;
        exportJsonBtn.innerHTML = '<i class="fa-solid fa-code"></i> JSON Yuklab Olish';
      }
    });
  }

  // --- ADMIN BROADCAST GALLERY MEDIA UPLOAD ---
  let selectedBroadcastMedia = null;
  const mediaFileInput = document.getElementById("admin-broadcast-file");
  const mediaUploadArea = document.getElementById("admin-media-upload-area");
  const mediaPreviewBox = document.getElementById("admin-media-preview-box");
  const mediaThumb = document.getElementById("admin-media-thumb");
  const mediaNameEl = document.getElementById("admin-media-name");
  const mediaInfoEl = document.getElementById("admin-media-info");
  const removeMediaBtn = document.getElementById("btn-remove-broadcast-media");

  if (mediaUploadArea && mediaFileInput) {
    mediaUploadArea.addEventListener("click", () => {
      mediaFileInput.click();
    });

    mediaFileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Max 50MB check
      if (file.size > 50 * 1024 * 1024) {
        showToast("Fayl hajmi 50MB dan oshmasligi kerak!", "warning");
        mediaFileInput.value = "";
        return;
      }

      selectedBroadcastMedia = file;
      const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name);
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

      if (mediaNameEl) mediaNameEl.textContent = file.name;
      if (mediaInfoEl) mediaInfoEl.textContent = `${isVideo ? "🎥 Video" : "🖼️ Rasm"} • ${sizeMB} MB`;

      if (mediaThumb) {
        mediaThumb.innerHTML = "";
        if (isVideo) {
          mediaThumb.innerHTML = '<i class="fa-solid fa-file-video" style="font-size: 1.8rem; color: var(--primary-color);"></i>';
        } else {
          const img = document.createElement("img");
          img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
          img.src = URL.createObjectURL(file);
          mediaThumb.appendChild(img);
        }
      }

      if (mediaPreviewBox) mediaPreviewBox.style.display = "block";
      if (mediaUploadArea) mediaUploadArea.style.borderColor = "var(--primary-color)";
    });
  }

  if (removeMediaBtn) {
    removeMediaBtn.addEventListener("click", () => {
      selectedBroadcastMedia = null;
      if (mediaFileInput) mediaFileInput.value = "";
      if (mediaPreviewBox) mediaPreviewBox.style.display = "none";
      if (mediaThumb) mediaThumb.innerHTML = "";
      if (mediaUploadArea) mediaUploadArea.style.borderColor = "rgba(197, 255, 0, 0.4)";
    });
  }

  // Admin Broadcast Handler (with Gallery Photo/Video & High-Speed Batching)
  const sendBroadcastBtn = document.getElementById("btn-send-broadcast");
  if (sendBroadcastBtn) {
    sendBroadcastBtn.addEventListener("click", async () => {
      const msgInput = document.getElementById("admin-broadcast-msg");
      const photoInput = document.getElementById("admin-broadcast-photo");
      const btnTextInput = document.getElementById("admin-broadcast-btn-text");
      const btnUrlInput = document.getElementById("admin-broadcast-btn-url");

      const message = msgInput ? msgInput.value.trim() : "";
      const photo_url = photoInput ? photoInput.value.trim() : "";
      const button_text = btnTextInput ? btnTextInput.value.trim() : "";
      const button_url = btnUrlInput ? btnUrlInput.value.trim() : "";

      if (!message && !selectedBroadcastMedia && !photo_url) {
        showToast("Xabar matnini kiriting yoki rasm/video tanlang!", "warning");
        return;
      }

      if (!confirm("Barcha bot foydalanuvchilariga ushbu xabarni yuborishni tasdiqlaysizmi?")) return;

      sendBroadcastBtn.disabled = true;
      sendBroadcastBtn.innerHTML = '<i class="fa-solid fa-bolt fa-spin"></i> Tezkor yuborilmoqda...';

      try {
        let res;
        if (selectedBroadcastMedia) {
          const formData = new FormData();
          formData.append("message", message);
          if (photo_url) formData.append("photo_url", photo_url);
          if (button_text) formData.append("button_text", button_text);
          if (button_url) formData.append("button_url", button_url);
          formData.append("media_file", selectedBroadcastMedia);

          res = await apiFetch("/api/admin/broadcast", {
            method: "POST",
            body: formData
          });
        } else {
          res = await apiFetch("/api/admin/broadcast", {
            method: "POST",
            body: JSON.stringify({
              message,
              photo_url: photo_url || null,
              button_text: button_text || null,
              button_url: button_url || null
            })
          });
        }

        showToast(res.message, "success");
        if (msgInput) msgInput.value = "";
        if (photoInput) photoInput.value = "";
        if (btnTextInput) btnTextInput.value = "";
        if (btnUrlInput) btnUrlInput.value = "";
        if (removeMediaBtn) removeMediaBtn.click();
      } catch (err) {
        showToast("Xabar yuborishda xatolik!", "danger");
      } finally {
        sendBroadcastBtn.disabled = false;
        sendBroadcastBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Barchaga Yuborish (Broadcast)';
      }
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

      const adminTab = document.getElementById("tab-admin");
      if (adminTab) adminTab.classList.add("active");

      updateNavVisibility("tab-admin");
      await loadAdminData();
    }
  }

  init();
});
