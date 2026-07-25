// shared-core/popup.js
// 팝업(모달/뷰어/참고정보 카드) 열기·닫기 공용 로직. fukuoka-trip/app.js의
// openCard/bindCardClose를 그대로 추출(로직 변경 없음).
// id 규칙: "{prefix}Backdrop" / "{prefix}Close" / "{prefix}CloseBottom"

let lastFocusedEl = null;

function openCard(prefix) {
  lastFocusedEl = document.activeElement;
  const backdrop = document.getElementById(prefix + "Backdrop");
  if (!backdrop) return;
  backdrop.hidden = false;
  const closeBtn = document.getElementById(prefix + "Close");
  if (closeBtn) closeBtn.focus();
}

function bindCardClose(prefix, onClose) {
  const backdrop = document.getElementById(prefix + "Backdrop");
  if (!backdrop) return;
  const doClose = () => {
    backdrop.hidden = true;
    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
      lastFocusedEl.focus();
    }
    lastFocusedEl = null;
    if (onClose) onClose();
  };
  const closeBtn = document.getElementById(prefix + "Close");
  if (closeBtn) closeBtn.addEventListener("click", doClose);
  const bottomBtn = document.getElementById(prefix + "CloseBottom");
  if (bottomBtn) bottomBtn.addEventListener("click", doClose);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) doClose();
  });
  // Escape 키로 닫기: 이 카드가 실제로 열려있을 때만 반응(hidden이면 무시)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) doClose();
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { openCard, bindCardClose };
} else {
  window.SharedCore = window.SharedCore || {};
  window.SharedCore.popup = { openCard, bindCardClose };
}
