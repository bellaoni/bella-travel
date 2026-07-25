(() => {
  "use strict";

  let currentYear = "all";

  // 국가명 → 국기 이모지. 목록에 없는 국가는 지구본(🌍)으로 표시.
  const COUNTRY_FLAG = {
    "일본": "🇯🇵", "한국": "🇰🇷", "대한민국": "🇰🇷", "베트남": "🇻🇳", "태국": "🇹🇭",
    "싱가포르": "🇸🇬", "대만": "🇹🇼", "필리핀": "🇵🇭", "말레이시아": "🇲🇾",
    "인도네시아": "🇮🇩", "중국": "🇨🇳", "홍콩": "🇭🇰", "마카오": "🇲🇴",
    "미국": "🇺🇸", "캐나다": "🇨🇦", "프랑스": "🇫🇷", "영국": "🇬🇧", "이탈리아": "🇮🇹",
    "스페인": "🇪🇸", "독일": "🇩🇪", "호주": "🇦🇺", "뉴질랜드": "🇳🇿"
  };
  function countryFlag(country) { return COUNTRY_FLAG[country] || "🌍"; }

  // 여행 제목/도시명 등 registry에서 온 문자열을 innerHTML에 그대로 꽂기 전에 이스케이프.
  // (특수문자가 포함된 데이터를 넣어도 마크업이 깨지지 않도록 하는 안전장치)
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  // 계절 판별: 3~5월 봄 / 6~8월 여름 / 9~11월 가을 / 12,1,2월 겨울
  // (여행 시작일 기준. 월을 넘겨서 진행되는 여행은 시작 계절에 전체 일수를 귀속시키는 근사치)
  const SEASON_META = {
    spring: { emoji: "🌸", label: "봄" },
    summer: { emoji: "☀️", label: "여름" },
    fall: { emoji: "🍂", label: "가을" },
    winter: { emoji: "❄️", label: "겨울" }
  };
  function seasonOf(dateStr) {
    const m = Number(dateStr.slice(5, 7));
    if (m >= 3 && m <= 5) return "spring";
    if (m >= 6 && m <= 8) return "summer";
    if (m >= 9 && m <= 11) return "fall";
    return "winter";
  }

  // ---------------- 유틸 ----------------
  function daysBetween(start, end) {
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    return Math.round((e - s) / 86400000) + 1; // 당일 포함
  }

  function tripYear(trip) {
    return Number(trip.startDate.slice(0, 4));
  }

  function formatDateRange(trip) {
    const s = trip.startDate.slice(5).replace("-", ".");
    const e = trip.endDate.slice(5).replace("-", ".");
    return `${tripYear(trip)}.${s} – ${e}`;
  }

  // ---------------- 통계 카드 ----------------
  function renderStats() {
    const tripCount = TRIPS.length;
    const countryList = Array.from(new Set(TRIPS.map(t => t.country))).sort((a, b) => a.localeCompare(b, "ko"));
    const cityList = Array.from(new Set(TRIPS.flatMap(t => t.cities))).sort((a, b) => a.localeCompare(b, "ko"));
    const totalDays = TRIPS.reduce((sum, t) => sum + daysBetween(t.startDate, t.endDate), 0);

    const stats = [
      { num: `${tripCount}`, label: "여행 " + tripCount + "회", kind: "count" },
      { num: `${countryList.length}`, label: "방문국가", kind: "country", items: countryList },
      { num: `${cityList.length}`, label: "방문도시", kind: "city", items: cityList },
      { num: `${totalDays}`, label: "총 여행일수", kind: "days" }
    ];

    const strip = document.getElementById("statsStrip");
    strip.innerHTML = "";

    stats.forEach(s => {
      const card = document.createElement("div");
      card.className = "stat-card";
      card.dataset.clickable = "true";
      card.dataset.kind = s.kind;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.innerHTML = `<span class="num">${s.num}</span><span class="label">${s.label}</span>`;

      const handleActivate = () => openStatModalByKind(s.kind, s.items);
      card.addEventListener("click", handleActivate);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleActivate(); }
      });
      strip.appendChild(card);
    });
  }

  // ---------------- 공용 통계 모달 ----------------
  // 여행횟수 / 방문국가 / 방문도시 / 총여행일수 4개 카드가 전부 이 모달 하나를 공유한다.
  // 콘텐츠만 바뀌기 때문에 네 가지 통계가 항상 동일한 디자인/동작으로 유지된다.
  const statModalOverlay = document.getElementById("statModalOverlay");
  const statModalTitle = document.getElementById("statModalTitle");
  const statModalContent = document.getElementById("statModalContent");
  const statModalClose = document.getElementById("statModalClose");
  let lastFocusedEl = null;

  function openStatModal(title, contentHtml) {
    lastFocusedEl = document.activeElement;
    statModalTitle.textContent = title;
    statModalContent.innerHTML = contentHtml;
    statModalOverlay.hidden = false;
    statModalClose.focus(); // 모달이 열리면 포커스를 닫기 버튼으로 이동 (키보드/스크린리더 사용성)
  }
  function closeStatModal() {
    statModalOverlay.hidden = true;
    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
      lastFocusedEl.focus(); // 모달을 열기 전 포커스가 있던 요소로 되돌림
    }
    lastFocusedEl = null;
  }
  function initStatModal() {
    statModalClose.addEventListener("click", closeStatModal);
    statModalOverlay.addEventListener("click", (e) => {
      if (e.target === statModalOverlay) closeStatModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !statModalOverlay.hidden) closeStatModal();
    });
  }

  function openStatModalByKind(kind, items) {
    if (kind === "count") { openStatModal("🧳 여행 횟수", buildCountModalContent()); return; }
    if (kind === "days") { openStatModal("📅 총 여행일수", buildDaysModalContent()); return; }
    if (kind === "country") { openStatModal("🌏 방문국가", buildListModalContent(items, { flag: true })); return; }
    if (kind === "city") { openStatModal("🏙 방문도시", buildListModalContent(items, { flag: false })); return; }
  }

  // 방문국가/방문도시: 이름별 방문 횟수까지 함께 표시 (여행횟수 모달과 동일한 배지 목록 디자인)
  function buildListModalContent(items, opts) {
    if (!items || items.length === 0) {
      return `<p class="modal-empty">아직 등록된 항목이 없어요.</p>`;
    }
    const countMap = new Map();
    TRIPS.forEach(t => {
      const keys = opts.flag ? [t.country] : t.cities;
      keys.forEach(key => countMap.set(key, (countMap.get(key) || 0) + 1));
    });
    return `
      <ul class="year-group-list">
        ${items.map(item => `
          <li>
            <span>${opts.flag ? countryFlag(item) + " " : ""}${escapeHtml(item)}</span>
            <span class="city-count">${countMap.get(item) || 0}회</span>
          </li>
        `).join("")}
      </ul>
    `;
  }

  // 여행 횟수: 연도별(최신순) 그룹 + 그룹 내 방문 도시별 횟수
  function buildCountModalContent() {
    if (TRIPS.length === 0) {
      return `<p class="modal-empty">아직 등록된 여행이 없어요.</p>`;
    }

    const byYear = new Map();
    TRIPS.forEach(t => {
      const y = tripYear(t);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(t);
    });
    const years = Array.from(byYear.keys()).sort((a, b) => b - a);

    return years.map(year => {
      const yearTrips = byYear.get(year);

      const cityMap = new Map(); // label -> { count, country }
      yearTrips.forEach(t => {
        const label = t.cities.join(" · ");
        if (!cityMap.has(label)) cityMap.set(label, { count: 0, country: t.country });
        cityMap.get(label).count += 1;
      });
      const cityEntries = Array.from(cityMap.entries())
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], "ko"));

      return `
        <div class="year-group">
          <div class="year-group-title">
            <span>${year}년</span>
            <span class="count-badge">${yearTrips.length}회</span>
          </div>
          <ul class="year-group-list">
            ${cityEntries.map(([label, info]) => `
              <li>
                <span>${countryFlag(info.country)} ${escapeHtml(label)}</span>
                <span class="city-count">${info.count}회</span>
              </li>
            `).join("")}
          </ul>
        </div>
      `;
    }).join("");
  }

  // 총 여행일수: 연도별 + 계절별 CSS 막대그래프 (섹션별로 최댓값 100% 기준)
  function buildDaysModalContent() {
    if (TRIPS.length === 0) {
      return `<p class="modal-empty">아직 등록된 여행이 없어요.</p>`;
    }

    const yearDays = new Map();
    TRIPS.forEach(t => {
      const y = tripYear(t);
      const d = daysBetween(t.startDate, t.endDate);
      yearDays.set(y, (yearDays.get(y) || 0) + d);
    });
    const years = Array.from(yearDays.keys()).sort((a, b) => b - a);
    const maxYearDays = Math.max(...years.map(y => yearDays.get(y)));

    const yearBarsHtml = years.map(y => {
      const days = yearDays.get(y);
      const pct = maxYearDays > 0 ? Math.round((days / maxYearDays) * 100) : 0;
      return `
        <div class="stat-bar-row">
          <span class="stat-bar-label">${y}년</span>
          <span class="stat-bar-track"><span class="stat-bar-fill" style="width:${pct}%"></span></span>
          <span class="stat-bar-value">${days}일</span>
        </div>
      `;
    }).join("");

    const seasonDays = { spring: 0, summer: 0, fall: 0, winter: 0 };
    TRIPS.forEach(t => {
      seasonDays[seasonOf(t.startDate)] += daysBetween(t.startDate, t.endDate);
    });
    const seasonOrder = ["spring", "summer", "fall", "winter"];
    const maxSeasonDays = Math.max(...seasonOrder.map(s => seasonDays[s]));

    const seasonBarsHtml = seasonOrder.map(s => {
      const meta = SEASON_META[s];
      const days = seasonDays[s];
      const pct = maxSeasonDays > 0 ? Math.round((days / maxSeasonDays) * 100) : 0;
      return `
        <div class="stat-bar-row">
          <span class="stat-bar-label">${meta.emoji} ${meta.label}</span>
          <span class="stat-bar-track"><span class="stat-bar-fill season" style="width:${pct}%"></span></span>
          <span class="stat-bar-value">${days}일</span>
        </div>
      `;
    }).join("");

    return `
      <p class="modal-subsection-title">연도별</p>
      <div class="stat-bar-list">${yearBarsHtml}</div>
      <p class="modal-subsection-title">계절별</p>
      <div class="stat-bar-list">${seasonBarsHtml}</div>
    `;
  }

  // ---------------- 연도 필터 ----------------
  function renderYearFilter() {
    const years = Array.from(new Set(TRIPS.map(tripYear))).sort((a, b) => b - a);
    const chips = ["all", ...years];
    const el = document.getElementById("yearFilter");
    el.innerHTML = chips.map(y => `
      <button class="year-chip ${y === currentYear ? "active" : ""}" data-year="${y}">
        ${y === "all" ? "전체" : y + "년"}
      </button>
    `).join("");
    el.querySelectorAll(".year-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        currentYear = btn.dataset.year === "all" ? "all" : Number(btn.dataset.year);
        renderYearFilter();
        renderTripList();
      });
    });
  }

  // ---------------- 여행 목록 ----------------
  function renderTripList() {
    const filtered = TRIPS
      .filter(t => currentYear === "all" || tripYear(t) === currentYear)
      .sort((a, b) => b.startDate.localeCompare(a.startDate)); // 최신 여행이 위로

    document.getElementById("listTitle").textContent =
      currentYear === "all" ? "여행 목록" : `${currentYear}년 여행`;

    const listEl = document.getElementById("tripList");

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="empty-state">아직 등록된 여행이 없어요.</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(t => `
      <button class="trip-card" type="button" data-url="${escapeHtml(t.url)}">
        <span class="trip-emoji" aria-hidden="true">${t.emoji || "✈️"}</span>
        <span class="trip-info">
          <h3>${escapeHtml(t.title)}</h3>
          <span class="trip-meta">
            <span>${formatDateRange(t)}</span>
            <span>·</span>
            <span>${escapeHtml(t.country)} ${escapeHtml(t.cities.join(", "))}</span>
            <span>·</span>
            <span>${daysBetween(t.startDate, t.endDate)}일</span>
          </span>
        </span>
        <span class="trip-arrow" aria-hidden="true">›</span>
      </button>
    `).join("");

    listEl.querySelectorAll(".trip-card").forEach(card => {
      card.addEventListener("click", () => {
        const url = card.dataset.url; // 절대경로, 예: "/fukuoka-trip/"
        location.href = url + (url.includes("?") ? "&" : "?") + "source=archive";
      });
    });
  }

  // ---------------- 다크모드 ----------------
  const THEME_KEY = "bella-travel-theme";
  function applyTheme(isDark) {
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try { localStorage.setItem(THEME_KEY, isDark ? "dark" : "light"); } catch (e) {}
    const meta = document.getElementById("themeColorMeta");
    if (meta) meta.setAttribute("content", isDark ? "#1E1B18" : "#3D5A6C");
  }
  const darkModeToggle = document.getElementById("darkModeToggle");
  darkModeToggle.checked = document.documentElement.getAttribute("data-theme") === "dark";
  applyTheme(darkModeToggle.checked);
  darkModeToggle.addEventListener("change", (e) => applyTheme(e.target.checked));

  // ---------------- 초기화 ----------------
  renderStats();
  initStatModal();
  renderYearFilter();
  renderTripList();

  // ---------------- 서비스워커 업데이트 알림 ----------------
  function showUpdateToast(reg) {
    let toast = document.getElementById("swUpdateToast");
    if (toast) { toast.hidden = false; return; }
    toast = document.createElement("div");
    toast.id = "swUpdateToast";
    toast.className = "sw-update-toast";
    toast.innerHTML = `<span>새 버전이 있어요</span><button type="button" id="swUpdateBtn">새로고침</button>`;
    document.body.appendChild(toast);
    toast.querySelector("#swUpdateBtn").addEventListener("click", () => {
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      toast.hidden = true;
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) showUpdateToast(reg);
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast(reg);
            }
          });
        });
      }).catch(() => {});

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
    });
  }
})();
