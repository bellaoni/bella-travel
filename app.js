(() => {
  "use strict";

  let currentYear = "all";

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
    const countries = new Set(TRIPS.map(t => t.country));
    const cities = new Set(TRIPS.flatMap(t => t.cities));
    const totalDays = TRIPS.reduce((sum, t) => sum + daysBetween(t.startDate, t.endDate), 0);

    const stats = [
      { num: `${tripCount}`, label: "여행 " + tripCount + "회" },
      { num: `${countries.size}`, label: "방문국가" },
      { num: `${cities.size}`, label: "방문도시" },
      { num: `${totalDays}`, label: "총 여행일수" }
    ];

    document.getElementById("statsStrip").innerHTML = stats.map(s => `
      <div class="stat-card">
        <span class="num">${s.num}</span>
        <span class="label">${s.label}</span>
      </div>
    `).join("");
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
  renderYearFilter();
  renderTripList();
})();
