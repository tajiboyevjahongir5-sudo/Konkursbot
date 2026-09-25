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
    bottomNav.style.display = "flex";
    document.body.style.paddingBottom = "";
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
      if (targetTab === "tab-leaderboard") {
        loadLeaderboard();
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

        // Update "Mening Imkoniyatim" Widget
        const cTickets = document.getElementById("chance-tickets-num");
        const cProgress = document.getElementById("chance-progress-bar");
        const cPercent = document.getElementById("chance-percent-label");
        const ticketCount = currentUser.tickets || 0;
        if (cTickets) cTickets.textContent = `${ticketCount} ta`;
        
        let chancePercent = 10;
        if (ticketCount > 0) {
          chancePercent = Math.min(100, 20 + (ticketCount * 15));
        }
        if (cProgress) cProgress.style.width = `${chancePercent}%`;
        if (cPercent) cPercent.textContent = `Imkoniyat: ${chancePercent}%`;

        // Show Admin Nav Button if user is an Admin
        if (currentUser.is_admin) {
          const adminNavBtn = document.getElementById("nav-item-admin");
          if (adminNavBtn) adminNavBtn.style.display = "flex";
        }
      }
    } catch (err) {
      console.log("Could not load user data");
    }
  }

  // Quick invite button switch to Friends tab
  const quickInviteBtn = document.getElementById("btn-quick-invite");
  if (quickInviteBtn) {
    quickInviteBtn.addEventListener("click", () => {
      const friendsNav = document.querySelector('.nav-item[data-tab="tab-friends"]');
      if (friendsNav) friendsNav.click();
    });
  }

  async function loadContestData() {
    try {
      const res = await apiFetch("/api/contest/active");
      if (res.status === "success" && res.contest) {
        activeContest = res.contest;

        const titleEl = document.getElementById("contest-title");
        const descEl = document.getElementById("contest-description");
        const prizesEl = document.getElementById("contest-prizes-list");

        if (titleEl) titleEl.textContent = activeContest.title || "";
        if (descEl) descEl.textContent = activeContest.description || "";
        if (prizesEl) prizesEl.textContent = activeContest.prize_pool || "";

        if (activeContest.end_time) {
          startCountdown(activeContest.end_time);
        }
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

      const dEl = document.getElementById("timer-days");
      const hEl = document.getElementById("timer-hours");
      const mEl = document.getElementById("timer-mins");
      const sEl = document.getElementById("timer-secs");

      if (distance <= 0) {
        clearInterval(countdownInterval);
        if (dEl) dEl.textContent = "00";
        if (hEl) hEl.textContent = "00";
        if (mEl) mEl.textContent = "00";
        if (sEl) sEl.textContent = "00";
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      if (dEl) dEl.textContent = String(days).padStart(2, '0');
      if (hEl) hEl.textContent = String(hours).padStart(2, '0');
      if (mEl) mEl.textContent = String(minutes).padStart(2, '0');
      if (sEl) sEl.textContent = String(seconds).padStart(2, '0');
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
          item.className = "task-item-card";

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
          let btnText = "Telegram'da A'zo Bo'lish";
          let subtitleText = task.channel_id;
          let iconHtml = `<img src="/api/channel/photo?channel_id=${encodeURIComponent(task.channel_id)}" alt="${task.title}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='assets/logo.jpg';">`;
          let linkAttr = `href="${task.invite_link}" target="_blank"`;

          if (isYT) {
            iconClass = "fa-youtube";
            iconColor = "#ff3b30";
            btnBg = "rgba(255, 59, 48, 0.18)";
            btnBorder = "#ff3b30";
            btnText = "YouTube'da Obuna";
            subtitleText = "YouTube Kanal (Google API)";
            iconHtml = '<i class="fa-brands fa-youtube" style="color: #ff3b30; font-size: 1.5rem;"></i>';
          } else if (isIG) {
            iconClass = "fa-instagram";
            iconColor = "#e1306c";
            btnBg = "rgba(225, 48, 108, 0.18)";
            btnBorder = "#e1306c";
            btnText = "Instagram'da Kuzatish";
            subtitleText = "Instagram Profil";
            iconHtml = '<i class="fa-brands fa-instagram" style="color: #e1306c; font-size: 1.5rem;"></i>';
            linkAttr = `href="#" class="btn-ig-link" data-url="${task.invite_link}" data-id="${task.sponsor_id}"`;
          }

          item.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                <div class="task-platform-avatar" style="border-color: ${btnBorder}; box-shadow: 0 0 10px ${btnBorder}44;">
                  ${iconHtml}
                </div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 800; font-size: 0.94rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${task.title}</div>
                  <div style="font-size: 0.74rem; color: var(--text-secondary); margin-top: 1px;">${subtitleText}</div>
                </div>
              </div>
              <div class="task-reward-badge">
                <span style="font-size: 0.85rem;">🎟️</span> +1 Bilet
              </div>
            </div>
            <div style="display: flex; gap: 8px; width: 100%; margin-top: 4px;">
              <a ${linkAttr} class="btn btn-sm ${isIG ? 'btn-ig-link' : ''}" onclick="event.stopPropagation();" style="flex: 1; justify-content: center; padding: 10px; font-size: 0.85rem; font-weight: 700; border-radius: 10px; background: ${btnBg}; border: 1px solid ${btnBorder}; color: ${iconColor};">
                <i class="fa-brands ${iconClass}" style="color: ${iconColor};"></i> ${btnText}
              </a>
              ${
                isDone 
                ? '<button class="btn btn-sm" style="flex: 1; justify-content: center; background: #22c55e; color: #fff; padding: 10px; font-size: 0.85rem; font-weight: 800; border-radius: 10px; border: none; box-shadow: 0 0 12px rgba(34, 197, 94, 0.4);" disabled><i class="fa-solid fa-circle-check"></i> Bajarildi</button>'
                : `<button class="btn btn-primary btn-sm btn-check-task" data-id="${task.sponsor_id}" data-platform="${platform}" style="flex: 1; justify-content: center; padding: 10px; font-size: 0.85rem; font-weight: 800; border-radius: 10px;"><i class="fa-solid fa-arrows-rotate"></i> Tekshirish</button>`
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
                // First check if already verified in database
                const preCheck = await apiFetch("/api/tasks/check", {
                  method: "POST",
                  body: JSON.stringify({ sponsor_id: sponsorId })
                });

                if (preCheck && preCheck.completed) {
                  showToast(preCheck.message || "✅ YouTube obunasi allaqachon tasdiqlangan!", "success");
                  await loadUserData();
                  await loadTasks();
                  return;
                }

                // If not verified, request OAuth auth URL
                const gRes = await apiFetch(`/api/auth/google/url?sponsor_id=${sponsorId}`);
                if (gRes && gRes.status === "success" && gRes.url) {
                  const modal = document.getElementById("yt-oauth-modal");
                  const proceedBtn = document.getElementById("btn-yt-modal-proceed");
                  const closeBtn = document.getElementById("btn-yt-modal-close");
                  const checkDoneBtn = document.getElementById("btn-yt-modal-check-done");
                  const botStatus = document.getElementById("yt-modal-bot-status");

                  if (modal && proceedBtn) {
                    proceedBtn.href = gRes.url;
                    if (botStatus) {
                      botStatus.style.display = gRes.sent_to_bot ? "block" : "none";
                    }

                    // Direct click on proceed button: trigger openLink immediately on user click
                    proceedBtn.onclick = (ev) => {
                      if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
                        ev.preventDefault();
                        window.Telegram.WebApp.openLink(gRes.url, { try_instant_view: false });
                      }
                    };

                    if (closeBtn) {
                      closeBtn.onclick = () => {
                        modal.style.display = "none";
                      };
                    }

                    if (checkDoneBtn) {
                      checkDoneBtn.onclick = async () => {
                        try {
                          checkDoneBtn.disabled = true;
                          checkDoneBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tekshirilmoqda...';
                          const resDone = await apiFetch("/api/tasks/check", {
                            method: "POST",
                            body: JSON.stringify({ sponsor_id: sponsorId })
                          });
                          if (resDone && resDone.completed) {
                            modal.style.display = "none";
                            showToast(resDone.message || "🎉 YouTube obunangiz tasdiqlandi!", "success");
                            await loadUserData();
                            await loadTasks();
                          } else {
                            showToast(resDone.message || "❌ Hali tasdiqlanmadi. Iltimos brauzerda Google akkauntingizni tanlab ruxsat bering.", "warning");
                          }
                        } catch (e) {
                          showToast("Tekshirishda xatolik yuz berdi", "danger");
                        } finally {
                          checkDoneBtn.disabled = false;
                          checkDoneBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Brauzerda tasdiqladim, tekshirish';
                        }
                      };
                    }

                    modal.style.display = "flex";
                  } else {
                    // Fallback
                    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
                      window.Telegram.WebApp.openLink(gRes.url, { try_instant_view: false });
                    } else {
                      window.open(gRes.url, '_blank');
                    }
                    showToast("🔐 Google orqali tasdiqlash havolasi ochilmoqda...", "warning");
                  }
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
        const p1Name = document.getElementById("podium-1-name");
        const p1Tickets = document.getElementById("podium-1-tickets");
        const p2Name = document.getElementById("podium-2-name");
        const p2Tickets = document.getElementById("podium-2-tickets");
        const p3Name = document.getElementById("podium-3-name");
        const p3Tickets = document.getElementById("podium-3-tickets");

        if (board[0]) {
          if (p1Name) p1Name.textContent = board[0].first_name || board[0].username || "Foydalanuvchi";
          if (p1Tickets) p1Tickets.textContent = `${board[0].tickets} Bilet`;
        }
        if (board[1]) {
          if (p2Name) p2Name.textContent = board[1].first_name || board[1].username || "Foydalanuvchi";
          if (p2Tickets) p2Tickets.textContent = `${board[1].tickets} Bilet`;
        }
        if (board[2]) {
          if (p3Name) p3Name.textContent = board[2].first_name || board[2].username || "Foydalanuvchi";
          if (p3Tickets) p3Tickets.textContent = `${board[2].tickets} Bilet`;
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
        const winnerSelect = document.getElementById("admin-winner-channel-select");
        const winnerBadge = document.getElementById("badge-winner-channel-active");
        const winnerInfo = document.getElementById("admin-winner-channel-info");
        const winnersHintLabel = document.getElementById("winners-target-channel-label");

        // Update Winner Channel Select Dropdown
        if (winnerSelect) {
          const currentVal = winnerSelect.value;
          winnerSelect.innerHTML = '<option value="">-- Tanlanmagan (Kanalga e\'lon yuborilmaydi) --</option>';
          const tgSponsors = (sponsorsRes.sponsors || []).filter(s => (s.platform || "telegram") === "telegram");
          tgSponsors.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s.id;
            opt.textContent = `✈️ ${s.title} (${s.channel_id})`;
            if (s.is_winner_channel) {
              opt.selected = true;
            }
            winnerSelect.appendChild(opt);
          });
        }

        const activeWinnerCh = sponsorsRes.winner_channel || (sponsorsRes.sponsors || []).find(s => s.is_winner_channel);
        if (activeWinnerCh) {
          if (winnerBadge) winnerBadge.style.display = "inline-flex";
          if (winnerInfo) {
            winnerInfo.style.display = "block";
            winnerInfo.innerHTML = `<i class="fa-solid fa-bullhorn"></i> Hozirgi e'lon kanali: <b>${activeWinnerCh.title}</b> (<code>${activeWinnerCh.channel_id}</code>)`;
          }
          if (winnersHintLabel) {
            winnersHintLabel.textContent = `${activeWinnerCh.title} (${activeWinnerCh.channel_id})`;
          }
        } else {
          if (winnerBadge) winnerBadge.style.display = "none";
          if (winnerInfo) winnerInfo.style.display = "none";
          if (winnersHintLabel) winnersHintLabel.textContent = "Tanlanmagan";
        }

        if (spList) {
          spList.innerHTML = "";
          if (!sponsorsRes.sponsors || sponsorsRes.sponsors.length === 0) {
            spList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 15px;">Hozircha sponsorlar qo\'shilmagan.</div>';
          } else {
            sponsorsRes.sponsors.forEach(s => {
              const item = document.createElement("div");
              item.className = "task-item";
              
              const isTelegram = (s.platform || "telegram") === "telegram";
              const isWinner = !!s.is_winner_channel;
              
              let platformIcon = "✈️";
              if (s.platform === "youtube") platformIcon = "🔴";
              else if (s.platform === "instagram") platformIcon = "📸";

              const winnerBadgeHtml = isWinner 
                ? `<span class="badge" style="background: rgba(197, 255, 0, 0.2); color: var(--primary-color); border: 1px solid var(--primary-color); font-size: 0.72rem; padding: 2px 7px; border-radius: 5px; margin-left: 6px; font-weight: 700;"><i class="fa-solid fa-bullhorn"></i> G'oliblar Kanali</span>`
                : "";

              const makeWinnerBtnHtml = (isTelegram && !isWinner)
                ? `<button class="btn btn-sm btn-set-winner" data-id="${s.id}" data-title="${s.title}" style="background: rgba(197, 255, 0, 0.15); color: var(--primary-color); border: 1px solid var(--primary-color); padding: 4px 8px; font-size: 0.74rem;" title="G'oliblarni e'lon qilish kanali qilib belgilash"><i class="fa-solid fa-bullhorn"></i> E'lon kanali qilish</button>`
                : "";

              item.innerHTML = `
                <div style="flex: 1; min-width: 0;">
                  <div class="task-title" style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                    ${platformIcon} <b>${s.title}</b> <span style="font-size: 0.78rem; color: var(--text-secondary);">(${s.channel_id})</span>
                    ${winnerBadgeHtml}
                  </div>
                  <div class="task-reward" style="margin-top: 3px;">
                    <a href="${s.invite_link}" target="_blank" style="color: var(--secondary-color); font-size: 0.78rem; word-break: break-all;">${s.invite_link}</a>
                  </div>
                </div>
                <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0; margin-left: 8px;">
                  ${makeWinnerBtnHtml}
                  <button class="btn btn-sm btn-delete-sponsor" data-id="${s.id}" style="background: var(--danger-color); color: #fff; padding: 6px 10px;">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              `;
              spList.appendChild(item);
            });

            document.querySelectorAll(".btn-delete-sponsor").forEach(b => {
              b.addEventListener("click", async () => {
                const sid = b.getAttribute("data-id");
                if (confirm("Ushbu sponsor kanalni o'chirmoqchimisiz?")) {
                  await apiFetch(`/api/admin/sponsors/${sid}`, { method: "DELETE" });
                  showToast("Sponsor o'chirildi", "success");
                  await loadAdminData();
                }
              });
            });

            document.querySelectorAll(".btn-set-winner").forEach(b => {
              b.addEventListener("click", async () => {
                const sid = parseInt(b.getAttribute("data-id"));
                try {
                  const res = await apiFetch("/api/admin/sponsors/winner-channel", {
                    method: "POST",
                    body: JSON.stringify({ sponsor_id: sid })
                  });
                  if (res.status === "success") {
                    showToast(res.message, "success");
                    await loadAdminData();
                  }
                } catch (e) {
                  showToast("Xatolik yuz berdi", "danger");
                }
              });
            });
          }
        }
      }
      // Auto-load users list
      performUserSearch("");
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
    const winnerGroup = document.getElementById("group-sponsor-winner-channel");
    const isWinnerChk = document.getElementById("admin-sponsor-is-winner-channel");

    if (platform === "telegram") {
      if (lblTitle) lblTitle.textContent = "✈️ Telegram Kanal Nomi:";
      if (titleInput) titleInput.placeholder = "Masalan: PEEXELL News";

      if (lblChannelId) lblChannelId.textContent = "✈️ Telegram Username yoki ID:";
      if (channelIdInput) channelIdInput.placeholder = "@peexell_news yoki -1001234567890";
      if (hintChannelId) hintChannelId.innerHTML = '<i class="fa-solid fa-circle-info" style="color: var(--primary-color);"></i> Bot ushbu kanalda administrator bo\'lishi shart!';

      if (lblLink) lblLink.textContent = "✈️ Taklif Havolasi (Invite Link):";
      if (linkInput) linkInput.placeholder = "https://t.me/peexell_news";

      if (ytGroup) ytGroup.style.display = "none";
      if (winnerGroup) winnerGroup.style.display = "block";
    } else if (platform === "youtube") {
      if (lblTitle) lblTitle.textContent = "🔴 YouTube Kanal Nomi:";
      if (titleInput) titleInput.placeholder = "Masalan: Jahongir Projects";

      if (lblChannelId) lblChannelId.textContent = "🔴 YouTube Handle yoki ID:";
      if (channelIdInput) channelIdInput.placeholder = "@JahongirProjects";
      if (hintChannelId) hintChannelId.innerHTML = '<i class="fa-brands fa-youtube" style="color: #ff3b30;"></i> YouTube kanali @handle yoki qidiruv nomi';

      if (lblLink) lblLink.textContent = "🔴 YouTube Kanal Havolasi (URL):";
      if (linkInput) linkInput.placeholder = "https://youtube.com/@JahongirProjects";

      if (ytGroup) ytGroup.style.display = "block";
      if (winnerGroup) winnerGroup.style.display = "none";
      if (isWinnerChk) isWinnerChk.checked = false;
    } else if (platform === "instagram") {
      if (lblTitle) lblTitle.textContent = "📸 Instagram Profil Nomi:";
      if (titleInput) titleInput.placeholder = "Masalan: PEEXELL Official";

      if (lblChannelId) lblChannelId.textContent = "📸 Instagram Username (@username):";
      if (channelIdInput) channelIdInput.placeholder = "@peexell.uz";
      if (hintChannelId) hintChannelId.innerHTML = '<i class="fa-brands fa-instagram" style="color: #E1306C;"></i> Instagram foydalanuvchi nomi';

      if (lblLink) lblLink.textContent = "📸 Instagram Profil Havolasi (URL):";
      if (linkInput) linkInput.placeholder = "https://instagram.com/peexell.uz";

      if (ytGroup) ytGroup.style.display = "none";
      if (winnerGroup) winnerGroup.style.display = "none";
      if (isWinnerChk) isWinnerChk.checked = false;
    }
  }

  if (platformSelect) {
    platformSelect.addEventListener("change", updateSponsorFormUI);
    updateSponsorFormUI();
  }

  // Save Winner Announcement Channel Handler
  const saveWinnerChannelBtn = document.getElementById("btn-save-winner-channel");
  if (saveWinnerChannelBtn) {
    saveWinnerChannelBtn.addEventListener("click", async () => {
      const selectEl = document.getElementById("admin-winner-channel-select");
      const val = selectEl ? selectEl.value : "";
      const sponsorId = val ? parseInt(val) : null;

      saveWinnerChannelBtn.disabled = true;
      saveWinnerChannelBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saqlanmoqda...';

      try {
        const res = await apiFetch("/api/admin/sponsors/winner-channel", {
          method: "POST",
          body: JSON.stringify({ sponsor_id: sponsorId })
        });
        if (res.status === "success") {
          showToast(res.message, "success");
          await loadAdminData();
        } else {
          showToast(res.message || "Xatolik yuz berdi", "danger");
        }
      } catch (err) {
        showToast("E'lon kanalini saqlashda xatolik!", "danger");
      } finally {
        saveWinnerChannelBtn.disabled = false;
        saveWinnerChannelBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saqlash';
      }
    });
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
      const is_winner_channel = document.getElementById("admin-sponsor-is-winner-channel")?.checked || false;

      if (!title || !channel_id || !invite_link) {
        showToast("Barcha maydonlarni to'ldiring!", "warning");
        return;
      }

      try {
        await apiFetch("/api/admin/sponsors", {
          method: "POST",
          body: JSON.stringify({ title, channel_id, invite_link, platform, youtube_channel_id, is_winner_channel })
        });
        showToast("Sponsor qo'shildi! 🎉", "success");
        document.getElementById("admin-sponsor-title").value = "";
        document.getElementById("admin-sponsor-channel-id").value = "";
        document.getElementById("admin-sponsor-link").value = "";
        if (document.getElementById("admin-sponsor-is-winner-channel")) document.getElementById("admin-sponsor-is-winner-channel").checked = false;
        if (document.getElementById("admin-sponsor-yt-id")) document.getElementById("admin-sponsor-yt-id").value = "";
        await loadAdminData();
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

      // Auto-load users list when user clicks Foydalanuvchilar tab!
      if (targetId === "subtab-users") {
        performUserSearch("");
      }
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

  async function performUserSearch(queryOverride) {
    const q = (queryOverride !== undefined) ? queryOverride : (searchUserInput?.value.trim() || "");

    if (searchResultsDiv) {
      searchResultsDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 15px;"><i class="fa-solid fa-spinner fa-spin"></i> Foydalanuvchilar yuklanmoqda...</div>';
    }

    try {
      const res = await apiFetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
      if (res.status === "success" && res.users) {
        if (res.users.length === 0) {
          if (q) {
            searchResultsDiv.innerHTML = '<div style="text-align: center; color: var(--danger-color); padding: 15px;">Foydalanuvchi topilmadi.</div>';
          } else {
            searchResultsDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 15px;">Hozircha botda foydalanuvchilar mavjud emas.<br><small style="color: var(--primary-color);">Foydalanuvchilar botga /start bosishi bilan bu yerda avtomatik paydo bo\'ladi.</small></div>';
          }
          return;
        }

        searchResultsDiv.innerHTML = "";
        res.users.forEach(u => {
          const card = document.createElement("div");
          card.className = "admin-user-card";
          const userName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Foydalanuvchi';
          const userHandle = u.username ? `@${u.username}` : `ID: ${u.id}`;

          let profileLink = "";
          if (u.username) {
            profileLink = `https://t.me/${u.username.replace(/^@/, '')}`;
          } else if (u.phone_number) {
            let p = u.phone_number.trim().replace(/[^\d+]/g, '');
            if (!p.startsWith("+")) p = "+" + p;
            profileLink = `https://t.me/${p}`;
          } else {
            profileLink = `tg://user?id=${u.id}`;
          }

          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <div style="font-weight: 700; font-size: 0.92rem; color: #fff;">${userName}</div>
                <div style="font-size: 0.78rem; margin-top: 2px;">
                  <a href="${profileLink}" class="user-direct-profile-link" data-username="${u.username || ''}" data-id="${u.id}" data-phone="${u.phone_number || ''}" style="color: var(--primary-color); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                    ${userHandle} (ID: ${u.id}) <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.65rem;"></i>
                  </a>
                </div>
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
              ${u.phone_number ? `<div>📞 <a href="tel:${u.phone_number}" style="color: inherit; text-decoration: underline;">${u.phone_number}</a></div>` : ''}
            </div>

            <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
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
              <button class="btn btn-sm btn-user-profile" data-username="${u.username || ''}" data-id="${u.id}" data-phone="${u.phone_number || ''}" style="background: rgba(0, 195, 255, 0.18); color: #00c3ff; border: 1px solid #00c3ff; padding: 4px 10px; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 5px; font-weight: 600; cursor: pointer;">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Profilga o'tish
              </button>
            </div>
          `;
          searchResultsDiv.appendChild(card);
        });

        function openTelegramProfile(username, userId, phoneNumber) {
          let url = "";
          if (username) {
            const cleanUser = username.replace(/^@/, '');
            url = `https://t.me/${cleanUser}`;
          } else if (phoneNumber) {
            let p = phoneNumber.trim().replace(/[^\d+]/g, '');
            if (!p.startsWith("+")) p = "+" + p;
            url = `https://t.me/${p}`;
          } else {
            url = `tg://user?id=${userId}`;
          }

          if (window.Telegram?.WebApp?.openTelegramLink) {
            try {
              window.Telegram.WebApp.openTelegramLink(url);
              return;
            } catch (err) {}
          }
          window.open(url, "_blank");
        }

        document.querySelectorAll(".btn-user-profile, .user-direct-profile-link").forEach(el => {
          el.addEventListener("click", (e) => {
            e.preventDefault();
            const uname = el.getAttribute("data-username");
            const uid = el.getAttribute("data-id");
            const phone = el.getAttribute("data-phone");
            openTelegramProfile(uname, uid, phone);
          });
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

  let userSearchDebounceTimer = null;
  if (searchUserBtn) {
    searchUserBtn.addEventListener("click", () => {
      clearTimeout(userSearchDebounceTimer);
      performUserSearch();
    });
  }
  if (searchUserInput) {
    searchUserInput.addEventListener("input", () => {
      clearTimeout(userSearchDebounceTimer);
      const val = searchUserInput.value.trim();
      userSearchDebounceTimer = setTimeout(() => {
        performUserSearch(val);
      }, 120); // 120ms ultra-responsive instant search
    });
    searchUserInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(userSearchDebounceTimer);
        performUserSearch();
      }
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
          if (res.announced_channel) {
            if (res.announced_channel.error) {
              showToast(`G'oliblar aniqlandi, lekin kanalga e'lon yuborishda xatolik: ${res.announced_channel.error}`, "warning");
            } else {
              showToast(`G'oliblar aniqlandi va "${res.announced_channel.title}" kanalida e'lon qilindi! 🏆📢`, "success");
            }
          } else {
            showToast("G'oliblar muvaffaqiyatli aniqlandi! 🏆", "success");
          }
          const resultDiv = document.getElementById("admin-winners-result");
          if (resultDiv) {
            let channelNotice = "";
            if (res.announced_channel && !res.announced_channel.error) {
              const photoNote = res.announced_channel.sent_with_photo ? " (Rasm/Banner bilan)" : "";
              channelNotice = `
                <div style="margin-bottom: 14px; padding: 12px; background: rgba(197, 255, 0, 0.1); border: 1px solid var(--primary-color); border-radius: 10px; font-size: 0.82rem; color: var(--primary-color);">
                  <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; margin-bottom: 4px;">
                    <i class="fa-solid fa-circle-check"></i>
                    <span>Kanalda muvaffaqiyatli e'lon qilindi!${photoNote}</span>
                  </div>
                  <div style="color: #fff; font-size: 0.78rem;">
                    E'lon yuborilgan kanal: <b>${res.announced_channel.title}</b> (<code>${res.announced_channel.channel_id}</code>)
                  </div>
                </div>
              `;
            } else if (res.announced_channel && res.announced_channel.error) {
              channelNotice = `
                <div style="margin-bottom: 14px; padding: 12px; background: rgba(255, 59, 48, 0.1); border: 1px solid var(--danger-color); border-radius: 10px; font-size: 0.8rem; color: var(--danger-color);">
                  <i class="fa-solid fa-triangle-exclamation"></i> Kanalga yuborishda xatolik: ${res.announced_channel.error}
                </div>
              `;
            }

            let winnersHtml = `
              <div style="background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px; margin-top: 10px;">
                <div style="font-weight: 800; font-size: 0.95rem; color: var(--primary-color); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                  <i class="fa-solid fa-trophy"></i>
                  <span>Rasmiy G'oliblar Ro'yxati</span>
                </div>
            `;

            const medals = ["🥇", "🥈", "🥉", "🎖"];
            res.winners.forEach((w, idx) => {
              const medal = medals[idx] || "🎖";
              const userHandle = w.username ? `@${w.username}` : `ID: ${w.user_id}`;
              const ticketBadge = w.ticket_number 
                ? `<span class="badge" style="background: rgba(197, 255, 0, 0.15); color: var(--primary-color); font-weight: 700; font-size: 0.75rem; padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(197, 255, 0, 0.3);">🎟 #${w.ticket_number}</span>`
                : '';

              winnersHtml += `
                <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="font-weight: 700; font-size: 0.88rem; color: #fff;">
                      ${medal} ${w.place}-O'RIN
                    </div>
                    ${ticketBadge}
                  </div>
                  <div style="font-size: 0.82rem; color: var(--primary-color); font-weight: 600;">
                    👤 ${w.first_name} <span style="color: var(--text-secondary); font-size: 0.76rem;">(${userHandle})</span>
                  </div>
                  <div style="font-size: 0.8rem; color: #e0e0e0; margin-top: 2px;">
                    🎁 <b>${w.prize}</b>
                  </div>
                </div>
              `;
            });

            winnersHtml += `</div>`;
            resultDiv.innerHTML = channelNotice + winnersHtml;
          }
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

  // Export Buttons Handlers (Send file directly to admin's Telegram chat via bot)
  const exportCsvBtn = document.getElementById("btn-export-csv");
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", async () => {
      try {
        exportCsvBtn.disabled = true;
        exportCsvBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yuborilmoqda...';
        const res = await apiFetch("/api/admin/export?format=csv");
        if (res.status === "success") {
          showToast(res.message || "CSV fayli Telegram botingizga yuborildi! 📥", "success");
        } else {
          showToast(res.message || "Xatolik yuz berdi", "danger");
        }
      } catch (err) {
        showToast("CSV yuborishda xatolik!", "danger");
      } finally {
        exportCsvBtn.disabled = false;
        exportCsvBtn.innerHTML = '<i class="fa-solid fa-file-arrow-down"></i> CSV Botga Yuborish';
      }
    });
  }

  const exportJsonBtn = document.getElementById("btn-export-json");
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", async () => {
      try {
        exportJsonBtn.disabled = true;
        exportJsonBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yuborilmoqda...';
        const res = await apiFetch("/api/admin/export?format=json");
        if (res.status === "success") {
          showToast(res.message || "JSON fayli Telegram botingizga yuborildi! 📥", "success");
        } else {
          showToast(res.message || "Xatolik yuz berdi", "danger");
        }
      } catch (err) {
        showToast("JSON yuborishda xatolik!", "danger");
      } finally {
        exportJsonBtn.disabled = false;
        exportJsonBtn.innerHTML = '<i class="fa-solid fa-code"></i> JSON Botga Yuborish';
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

      const adminNavBtn = document.getElementById("nav-item-admin");
      if (adminNavBtn) adminNavBtn.classList.add("active");

      updateNavVisibility("tab-admin");
      await loadAdminData();
    }
  }

  // Auto-refresh tasks and user tickets when returning to WebApp from external browser
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      try {
        await loadUserData();
        await loadTasks();
      } catch (e) {}
    }
  });

  init();
});
