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

  // ---------------- 통계 ----------------
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
    // 팝오버 요소는 유지한 채 카드만 다시 그림
    strip.querySelectorAll(".stat-card").forEach(el => el.remove());

    stats.forEach(s => {
      const card = document.createElement("div");
      card.className = "stat-card";
      card.dataset.clickable = "true";
      card.dataset.kind = s.kind;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.innerHTML = `<span class="num">${s.num}</span><span class="label">${s.label}</span>`;

      const handleActivate = () => {
        if (s.kind === "count") { openCountModal(); }
        else if (s.kind === "days") { openDaysModal(); }
        else { togglePopover(card, s.label, s.items); }
      };
      card.addEventListener("click", handleActivate);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleActivate(); }
      });
      strip.appendChild(card);
    });
  }

  // ---------------- 국가/도시 팝오버 ----------------
  const popover = document.getElementById("statPopover");
  const popoverTitle = document.getElementById("popoverTitle");
  const popoverList = document.getElementById("popoverList");
  const popoverBackdrop = document.getElementById("popoverBackdrop");
  let activeCard = null;

  function positionPopover(cardEl) {
    const container = document.getElementById("statsStrip");
    const containerRect = container.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();

    const top = cardRect.bottom - containerRect.top + 10;
    const cardCenterX = cardRect.left + cardRect.width / 2 - containerRect.left;
    const popoverWidth = popover.offsetWidth;

    let left = cardCenterX - popoverWidth / 2;
    left = Math.max(8, Math.min(left, containerRect.width - popoverWidth - 8));

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.setProperty("--arrow-left", `${cardCenterX - left - 6}px`);
  }

  function openPopover(cardEl, title, items) {
    popoverTitle.textContent = title;
    popoverList.innerHTML = items.map(item => `<li>${item}</li>`).join("");
    popover.hidden = false;
    popoverBackdrop.hidden = false;
    positionPopover(cardEl); // 팝오버가 보인 뒤(width 측정 가능) 위치 계산
    cardEl.classList.add("is-active");
    activeCard = cardEl;
  }

  function closePopover() {
    popover.hidden = true;
    popoverBackdrop.hidden = true;
    if (activeCard) activeCard.classList.remove("is-active");
    activeCard = null;
  }

  function togglePopover(cardEl, title, items) {
    if (activeCard === cardEl) { closePopover(); return; }
    openPopover(cardEl, title, items);
  }

  popoverBackdrop.addEventListener("click", closePopover);
  window.addEventListener("resize", () => { if (activeCard) positionPopover(activeCard); });

  // ---------------- 여행 횟수 / 총 여행일수 모달 ----------------
  const countModalOverlay = document.getElementById("countModalOverlay");
  const countModalContent = document.getElementById("countModalContent");
  const daysModalOverlay = document.getElementById("daysModalOverlay");
  const daysModalContent = document.getElementById("daysModalContent");

  function openModal(overlayEl) { overlayEl.hidden = false; }
  function closeModal(overlayEl) { overlayEl.hidden = true; }
  function closeAllOverlays() {
    closePopover();
    closeModal(countModalOverlay);
    closeModal(daysModalOverlay);
  }

  function openCountModal() {
    if (TRIPS.length === 0) {
      countModalContent.innerHTML = `<p class="modal-empty">아직 등록된 여행이 없어요.</p>`;
      openModal(countModalOverlay);
      return;
    }

    // 연도별 그룹화 (최신 연도 먼저)
    const byYear = new Map();
    TRIPS.forEach(t => {
      const y = tripYear(t);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(t);
    });
    const years = Array.from(byYear.keys()).sort((a, b) => b - a);

    countModalContent.innerHTML = years.map(year => {
      const yearTrips = byYear.get(year);

      // 같은 연도 내, 방문 도시(묶음)별 횟수 집계
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
                <span>${countryFlag(info.country)} ${label}</span>
                <span class="city-count">${info.count}회</span>
              </li>
            `).join("")}
          </ul>
        </div>
      `;
    }).join("");

    openModal(countModalOverlay);
  }

  function openDaysModal() {
    if (TRIPS.length === 0) {
      daysModalContent.innerHTML = `<p class="modal-empty">아직 등록된 여행이 없어요.</p>`;
      openModal(daysModalOverlay);
      return;
    }

    // 연도별 여행일수 합계 (최신 연도 먼저)
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

    // 계절별 여행일수 합계 (여행 시작일 기준 계절에 전체 일수 귀속)
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

    daysModalContent.innerHTML = `
      <p class="modal-subsection-title">연도별</p>
      <div class="stat-bar-list">${yearBarsHtml}</div>
      <p class="modal-subsection-title">계절별</p>
      <div class="stat-bar-list">${seasonBarsHtml}</div>
    `;

    openModal(daysModalOverlay);
  }

  function initStatsModal() {
    document.getElementById("countModalClose").addEventListener("click", () => closeModal(countModalOverlay));
    document.getElementById("daysModalClose").addEventListener("click", () => closeModal(daysModalOverlay));
    countModalOverlay.addEventListener("click", (e) => { if (e.target === countModalOverlay) closeModal(countModalOverlay); });
    daysModalOverlay.addEventListener("click", (e) => { if (e.target === daysModalOverlay) closeModal(daysModalOverlay); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllOverlays(); });
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
      <button class="trip-card" type="button" data-url="${t.url}">
        <span class="trip-emoji" aria-hidden="true">${t.emoji || "✈️"}</span>
        <span class="trip-info">
          <h3>${t.title}</h3>
          <span class="trip-meta">
            <span>${formatDateRange(t)}</span>
            <span>·</span>
            <span>${t.country} ${t.cities.join(", ")}</span>
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
        // 아카이브를 경유했다는 표시. 각 여행 PWA(다른 레포/사이트)는 이 파라미터를 보고
        // sessionStorage에 기록한 뒤 홈 버튼을 띄운다. sessionStorage는 origin 단위라
        // 같은 username.github.io 도메인이면 레포가 달라도 공유된다.
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
  initStatsModal();
  renderYearFilter();
  renderTripList();
})();
