// shared-core/theme.js
// 다크모드 적용 공용 로직. fukuoka-trip/app.js, bella-travel/app.js에 동일 코드가
// 중복돼 있던 것을 추출. THEME_KEY와 토글 엘리먼트 id만 앱마다 다르므로 인자로 받는다.
//
// 사용 예:
//   const { applyTheme, initThemeToggle } = SharedCore.theme;
//   initThemeToggle({ themeKey: THEME_KEY, toggleId: "darkModeToggle" });

function applyTheme(isDark, opts) {
  const themeKey = opts && opts.themeKey;
  if (isDark) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  if (themeKey) {
    try { localStorage.setItem(themeKey, isDark ? "dark" : "light"); } catch (e) {}
  }
  const meta = document.getElementById("themeColorMeta");
  if (meta) meta.setAttribute("content", isDark ? "#1E1B18" : "#3D5A6C");
}

function initThemeToggle(opts) {
  const toggle = document.getElementById(opts.toggleId || "darkModeToggle");
  if (!toggle) return;
  toggle.checked = document.documentElement.getAttribute("data-theme") === "dark";
  applyTheme(toggle.checked, opts);
  toggle.addEventListener("change", (e) => applyTheme(e.target.checked, opts));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { applyTheme, initThemeToggle };
} else {
  window.SharedCore = window.SharedCore || {};
  window.SharedCore.theme = { applyTheme, initThemeToggle };
}
