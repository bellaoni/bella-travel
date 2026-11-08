(() => {
  "use strict";

  // Bella Travel 아카이브(허브)의 절대경로.
  // GitHub Pages 프로젝트 사이트 기준 "/레포명/" 형태 (도메인 루트 기준이라 사용자명과 무관하게 동작).
  // 허브 레포 이름을 바꾸면 이 값만 수정하면 됨.
  const ARCHIVE_URL = "/bella-travel/";

  // theme: 사용 활성화(data.js 참고). 특별 이벤트/체험성 일정에 자유롭게 사용 가능한 정식 태그.
  // 범례(renderMapLegend)는 실제 사용 중인 태그만 자동으로 보여준다.
  const TAG_LABEL = { normal: "일정", food: "맛집", shop: "쇼핑", sight: "관광", theme: "테마/체험" };

  let currentDay = 1;
  let currentItem = null; // 현재 모달에 열려있는 item
  const objectUrls = []; // 상세 모달 첨부용 blob object URL 추적 (해제용)
  let isArchiveEntry = false; // Bella Travel을 거쳐 들어왔는지 여부 (허브 경유 시 가계부 자동 켜기 / 지도 좌표 복사 노출 판단용)

  // 국가별 기능 스위치 (data.js TRIP_FEATURES). 없으면(구버전 data.js) 모두 켠다.
  const FEATURES = (typeof TRIP_FEATURES !== "undefined") ? TRIP_FEATURES : { visitJapan: true, japanesePhrases: true };
  function isReferenceEnabled(r) {
    if (r.id === "ref-japanese-phrases") return !!FEATURES.japanesePhrases;
    return true;
  }

  // 가계부 기기별 설정(localStorage). 허브 세션 플래그(sessionStorage)에 의존하지 않아서
  // 홈화면 아이콘으로 직접 열어도 가계부를 쓸 수 있다.
  const EXPENSE_ENABLED_KEY = (window.TRIP_ID || "fukuoka-trip") + "-expense-enabled";
  const ME_NAME_KEY = (window.TRIP_ID || "fukuoka-trip") + "-me-name";
  const RATE_CACHE_PREFIX = (window.TRIP_ID || "fukuoka-trip") + "-rate-"; // 마지막으로 조회한 환율 캐시(오프라인에서 재사용)
  const EXP_DEFAULT = (typeof EXPENSE_CURRENCY_DEFAULT !== "undefined") ? EXPENSE_CURRENCY_DEFAULT : { code: "KRW", krwRate: 1 };
  const EXP_CATEGORIES = (typeof EXPENSE_CATEGORIES !== "undefined") ? EXPENSE_CATEGORIES : [];
  function isExpenseEnabled() { try { return localStorage.getItem(EXPENSE_ENABLED_KEY) === "1"; } catch (e) { return false; } }
  function setExpenseEnabled(on) { try { localStorage.setItem(EXPENSE_ENABLED_KEY, on ? "1" : "0"); } catch (e) {} }
  function getMeName() {
    let v = "";
    try { v = localStorage.getItem(ME_NAME_KEY) || ""; } catch (e) {}
    return (v || TRIP.meName || "").trim();
  }
  function setMeName(v) { try { localStorage.setItem(ME_NAME_KEY, String(v).trim()); } catch (e) {} }

  // 가계부 데이터: 기본값은 data.js의 EXPENSES(시드). CSV로 한 번이라도 업데이트하면
  // 이후로는 IndexedDB에 저장된 값을 우선 사용한다. (백업 JSON에도 이 값이 포함됨)
  let currentExpenses = [...EXPENSES];
  async function loadExpenses() {
    try {
      const stored = await DB.getExpenses();
      if (Array.isArray(stored)) currentExpenses = stored;
    } catch (e) {
      // DB 접근 실패 시 data.js 기본값을 그대로 사용
    }
  }

  // ---------------- 공용: HTML 이스케이프 ----------------
  // 사용자가 직접 타이핑한 값(체크리스트, 메모 등)을 innerHTML에 꽂기 전에 반드시 거쳐서
  // 마크업이 깨지거나 스크립트가 삽입되는 것을 막는다. (data.js의 고정 콘텐츠는 대상 아님)
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  // ---------------- 공용: 팝업 카드 열기/닫기 포커스 관리 (T4: shared-core/popup.js로 이식) ----------------
  // "{prefix}Backdrop" / "{prefix}Close" / "{prefix}CloseBottom" id 규칙, 포커스 저장/복귀 로직 모두
  // shared-core-test에서 검증된 코드와 동일(변경 없음). 호출부는 기존과 동일하게 openCard/bindCardClose 그대로 사용.
  const { openCard, bindCardClose } = SharedCore.popup;

  // ---------------- 공용: 첨부 이미지 업로드 전 리사이즈 (T4: shared-core/attachments.js로 이식) ----------------
  // maxDim(1600)/quality(0.85) 기본값이 기존 RESIZE_MAX_DIM/RESIZE_QUALITY와 동일하므로
  // 호출부(resizeImageIfNeeded(file))는 옵션 없이 그대로 사용. 로직 변경 없음(canvas 리사이즈 실경로는
  // shared-core-test에서 브라우저 전용 API라 Node 시뮬레이션 범위 밖으로 표기, 코드 자체는 원본과 동일).
  const { resizeImageIfNeeded } = SharedCore.attachments;

  // 첨부(사진/PDF) 그리드 렌더링 공용 함수.
  // 상세 모달, Visit Japan Web QR 카드 등 첨부가 필요한 곳 어디서든 재사용.
  // gridId: 그릴 대상 그리드 엘리먼트 id
  // itemId: DB에 저장된 첨부의 소속 id
  // urlStore: 이 그리드가 생성한 object URL을 추적/해제하기 위한 배열(호출부마다 별도로 준비)
  async function renderAttachmentGrid(gridId, itemId, urlStore) {
    const grid = document.getElementById(gridId);
    const attachments = await DB.getAttachments(itemId);
    grid.innerHTML = "";
    while (urlStore.length) {
      URL.revokeObjectURL(urlStore.pop());
    }
    attachments.forEach(att => {
      const url = URL.createObjectURL(att.blob);
      urlStore.push(url);
      const div = document.createElement("div");
      div.className = "attach-thumb";
      if (att.type.startsWith("image/")) {
        div.innerHTML = `<img src="${url}" alt="${escapeHtml(att.name)}">`;
      } else {
        div.innerHTML = `<div class="pdf-badge">📄<br>${escapeHtml(att.name)}</div>`;
      }
      const del = document.createElement("button");
      del.className = "del-attach";
      del.textContent = "✕";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        await DB.deleteAttachment(att.id);
        renderAttachmentGrid(gridId, itemId, urlStore);
      });
      div.appendChild(del);
      div.addEventListener("click", () => openViewer(att, url));
      grid.appendChild(div);
    });
  }

  // ---------------- 뷰 전환 ----------------
  function switchView(view) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-" + view).classList.add("active");
    document.querySelectorAll(".nav-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.view === view);
    });
    if (view === "book") renderBook();
    if (view === "checklist") renderChecklist();
    if (view === "map") renderMap();
    else if (leafletMap) { closeMapSheet(); cancelPicking(); }
  }

  function switchDay(day) {
    currentDay = day;
    document.querySelectorAll(".day-tab").forEach(t => {
      t.classList.toggle("active", Number(t.dataset.day) === day);
    });
    renderTimeline();
  }

  // ---------------- 일정 탭 렌더링 (B3: TRIP.days 기반 동적 생성) ----------------
  function renderDayTabs() {
    const el = document.getElementById("dayTabs");
    if (!el) return;
    el.innerHTML = TRIP.days.map(d => `
      <button class="day-tab${d.day === currentDay ? " active" : ""}" data-day="${d.day}">
        <span class="day-num">DAY ${d.day}</span><span class="day-date">${d.date}</span>
      </button>`).join("");
  }

  // ---------------- 타임라인 ----------------
  function renderTimeline() {
    const el = document.getElementById("timeline");
    const items = ITEMS.filter(i => i.day === currentDay);
    el.innerHTML = items.map(itemCardHtml).join("");
    el.querySelectorAll(".tl-item").forEach(node => {
      node.querySelector(".tl-card").addEventListener("click", () => openModal(node.dataset.id));
    });
  }

  function itemCardHtml(item) {
    return `
      <div class="tl-item" data-id="${item.id}">
        <div class="tl-time-dot"><span class="dot"></span></div>
        <button class="tl-card tag-${item.tag}" type="button">
          <div class="tl-card-head">
            <h3>${item.title}</h3>
            <span class="tl-tag">${TAG_LABEL[item.tag] || ""}</span>
          </div>
          ${item.desc ? `<p class="desc">${item.desc}</p>` : ""}
          ${item.remark ? `<p class="remark">📝 ${item.remark}</p>` : ""}
          <div class="meta-row"><span>⏰ ${item.time}</span></div>
        </button>
      </div>`;
  }

  // ---------------- 예약 ----------------
  function renderBook() {
    const el = document.getElementById("bookPanel");
    let html = "";

    html += `<div class="book-card"><h3>🏨 숙소</h3>
      <div class="book-row"><span class="k">숙소명</span><span class="v">${TRIP.hotel.name}</span></div>
      <div class="book-row"><span class="k">체크인</span><span class="v">${TRIP.hotel.checkin}</span></div>
      <div class="book-row"><span class="k">체크아웃</span><span class="v">${TRIP.hotel.checkout}</span></div>
      <div class="book-row"><span class="k">체크인</span><span class="v">2026-08-02</span></div>
      <div class="book-row"><span class="k">체크아웃</span><span class="v">2026-08-04</span></div>
    </div>`;

    TRIP.flights.forEach((f) => {
      html += `<div class="book-card"><h3>✈️ ${f.route}</h3>
        <div class="book-row"><span class="k">날짜</span><span class="v">${f.date}</span></div>
        <div class="book-row"><span class="k">출발</span><span class="v">${f.dep}</span></div>
        <div class="book-row"><span class="k">도착</span><span class="v">${f.arr}</span></div>
        <div class="book-row"><span class="k">편명</span><span class="v">${f.code}</span></div>
      </div>`;
    });

    el.innerHTML = html;
  }

  // ITEMS에 없는 id로 모달을 열 때(예: 향후 자유메모 항목) 빈 값으로 대체
  function resolveItem(id) {
    const found = ITEMS.find(i => i.id === id);
    if (found) return found;
    return { id, title: "메모", desc: "", mapQuery: "", time: "", remark: "" };
  }

  // ---------------- 체크리스트 ----------------
  // 유효 카테고리는 data.js의 CHECKLIST_CATEGORIES가 단일 소스(B1). 이 목록에 없는 값(구 카테고리명
  // "서류" 포함)이나 빈 값은 전부 "미분류"로 취급(하위호환)
  const CHECKLIST_VALID_CATS = CHECKLIST_CATEGORIES;
  const CHECKLIST_CATEGORY_ORDER = [...CHECKLIST_VALID_CATS, "미분류"];

  // 필터보기 현재 선택값("전체" 또는 CHECKLIST_CATEGORY_ORDER 중 하나). 세션 내에서만 유지.
  let checklistFilter = "전체";

  function groupChecklistByCategory(list) {
    const groups = {};
    list.forEach((it, idx) => {
      // 기존(카테고리 필드 없음/구 카테고리명 포함) 항목도 에러 없이 "미분류"로 표시(하위호환)
      const cat = CHECKLIST_VALID_CATS.includes(it.category) ? it.category : "미분류";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ ...it, idx });
    });
    return CHECKLIST_CATEGORY_ORDER.filter(cat => groups[cat]).map(cat => ({ cat, items: groups[cat] }));
  }

  function renderChecklistFilterTabs() {
    const filterEl = document.getElementById("checklistFilter");
    if (!filterEl) return;
    const tabs = ["전체", ...CHECKLIST_CATEGORY_ORDER];
    filterEl.innerHTML = tabs.map(cat => `
      <button type="button" class="checklist-filter-btn${cat === checklistFilter ? " active" : ""}"
        data-cat="${escapeHtml(cat)}" role="tab" aria-selected="${cat === checklistFilter}">${escapeHtml(cat)}</button>
    `).join("");
    filterEl.querySelectorAll("[data-cat]").forEach(btn => {
      btn.addEventListener("click", () => {
        checklistFilter = btn.dataset.cat;
        renderChecklist();
      });
    });
  }

  async function renderChecklist() {
    const list = await DB.getChecklist();
    const el = document.getElementById("checklistList");

    renderChecklistFilterTabs();

    const groups = groupChecklistByCategory(list);
    const visibleGroups = checklistFilter === "전체" ? groups : groups.filter(g => g.cat === checklistFilter);

    el.innerHTML = visibleGroups.map(({ cat, items }) => `
      <li class="checklist-group-header" role="presentation">${escapeHtml(cat)}</li>
      ${items.map(it => `
        <li class="${it.done ? "done" : ""}" data-idx="${it.idx}">
          <label class="checklist-item-label">
            <input type="checkbox" ${it.done ? "checked" : ""} aria-label="${escapeHtml(it.text)} 완료 체크">
            <span>${escapeHtml(it.text)}</span>
          </label>
          <select class="checklist-cat-select" data-idx="${it.idx}" aria-label="${escapeHtml(it.text)} 카테고리 변경">
            ${CHECKLIST_CATEGORY_ORDER.map(c => `<option value="${c}" ${c === cat ? "selected" : ""}>${c}</option>`).join("")}
          </select>
          <button class="del" aria-label="${escapeHtml(it.text)} 삭제">삭제</button>
        </li>`).join("")}
    `).join("");

    el.querySelectorAll("li[data-idx]").forEach(li => {
      const idx = Number(li.dataset.idx);
      li.querySelector("input").addEventListener("change", async (e) => {
        const l = await DB.getChecklist();
        l[idx].done = e.target.checked;
        await DB.setChecklist(l);
        renderChecklist();
      });
      li.querySelector(".del").addEventListener("click", async () => {
        const l = await DB.getChecklist();
        l.splice(idx, 1);
        await DB.setChecklist(l);
        renderChecklist();
      });
      li.querySelector(".checklist-cat-select").addEventListener("change", async (e) => {
        const l = await DB.getChecklist();
        // "미분류" 선택 시 category를 빈 값으로 저장(그룹핑 로직상 미분류와 동일하게 처리됨)
        l[idx].category = e.target.value === "미분류" ? "" : e.target.value;
        await DB.setChecklist(l);
        renderChecklist();
      });
    });

    const refEl = document.getElementById("refList");
    if (refEl) {
      refEl.innerHTML = REFERENCE_ITEMS.filter(isReferenceEnabled).map(r => `
        <li><span>${r.title}</span>
          <button class="btn-ghost small" data-ref="${r.id}">보기</button>
        </li>`).join("");
      refEl.querySelectorAll("[data-ref]").forEach(btn => {
        btn.addEventListener("click", () => openReferenceCard(btn.dataset.ref));
      });
    }
  }

  // 추가폼 카테고리 select: index.html에 하드코딩하지 않고 data.js의 CHECKLIST_CATEGORIES에서 렌더링(단일 소스화, B1)
  (function populateChecklistCategoryInput() {
    const el = document.getElementById("checklistCategoryInput");
    if (!el) return;
    el.innerHTML = CHECKLIST_VALID_CATS.map(c => `<option value="${c}">${c}</option>`).join("")
      + `<option value="" selected>미분류</option>`;
  })();

  document.getElementById("checklistForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("checklistInput");
    const categoryInput = document.getElementById("checklistCategoryInput");
    const text = input.value.trim();
    if (!text) return;
    const category = categoryInput ? categoryInput.value : "";
    const list = await DB.getChecklist();
    list.push({ text, done: false, category });
    await DB.setChecklist(list);
    input.value = "";
    // 카테고리 선택값은 리셋하지 않음(연속 추가 시 마지막 선택 유지)
    renderChecklist();
  });

  // ---------------- 공항↔시내 이동방법 카드 (B2: data.js TRANSIT_INFO 렌더링) ----------------
  function renderTransitCard() {
    const t = TRANSIT_INFO;
    const header = document.getElementById("transitCardHeader");
    if (header) header.innerHTML = `<h2>${t.title}</h2>`;
    const body = document.getElementById("transitCardBody");
    if (!body) return;
    body.innerHTML = t.methods.map((m, i) => `
      ${i > 0 ? '<hr class="washi-divider">' : ""}
      <h3>${m.icon} ${m.name}</h3>
      <ul>
        ${m.steps.map(s => `<li>${s}</li>`).join("")}
        <li><b>${m.durationLabel}</b>: ${m.duration}</li>
        <li><b>${m.fareLabel}</b>: ${m.fare}</li>
      </ul>
      <p class="pay-label">결제</p>
      <ul>
        ${m.payment.map(p => `<li>${p}</li>`).join("")}
      </ul>
    `).join("") + `
      <hr class="washi-divider">
      <h3>💡 추천</h3>
      <ul>
        ${t.recommend.map(r => `<li>${r}</li>`).join("")}
      </ul>
    `;
  }

  function openReferenceCard(id) {
    if (id === "ref-airport-station") {
      renderTransitCard();
      openCard("transitCard");
    } else if (id === "ref-japanese-phrases") {
      renderPhraseTable();
      openCard("phraseCard");
    } else if (id === "ref-shopping-stores") {
      renderStoreTable();
      openCard("storeCard");
    } else if (id === "ref-shopping-list") {
      renderShoppingList();
      openCard("shoppingCard");
    } else if (id === "ref-food-list") {
      renderFoodList();
      openCard("foodCard");
    }
  }
  // ---------------- Visit Japan Web QR 카드 (준비물 아래 고정 퀵카드에서 오픈) ----------------
  const QR_ITEM_ID = "ref-visit-japan-qr";
  const qrObjectUrls = [];
  function renderQrAttachments() {
    return renderAttachmentGrid("qrAttachGrid", QR_ITEM_ID, qrObjectUrls);
  }
  document.getElementById("qrQuickBtn")?.addEventListener("click", () => {
    renderQrAttachments();
    openCard("qrCard");
  });
  document.getElementById("qrFileInput")?.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    for (const f of files) {
      const resized = await resizeImageIfNeeded(f);
      await DB.addAttachment(QR_ITEM_ID, resized);
    }
    e.target.value = "";
    renderQrAttachments();
  });

  // ---------------- 자주쓰는 일본어 카드 ----------------
  function renderPhraseTable() {
    const body = document.getElementById("phraseTableBody");
    let html = "";
    let lastCategory = null;
    JAPANESE_PHRASES.forEach(p => {
      if (p.category && p.category !== lastCategory) {
        html += `<tr class="phrase-cat"><td colspan="3">${p.category}</td></tr>`;
        lastCategory = p.category;
      }
      html += `<tr><td>${p.ko}</td><td>${p.ja}</td><td>${p.pron}</td></tr>`;
    });
    body.innerHTML = html;
  }
  // ---------------- 참고정보 공용: 지도 링크 생성 ----------------
  // mapQuery(검색어 문자열)만 있으면 어디서든 재사용 가능 (상세 모달의 modalMapLink와 동일한 방식)
  function mapLinkHtml(query) {
    if (!query) return "";
    const url = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
    return `<a class="map-link map-link-inline" href="${url}" target="_blank" rel="noopener" aria-label="지도에서 보기">📍</a>`;
  }

  // ---------------- 쇼핑 추천 매장 카드 (표) ----------------
  function renderStoreTable() {
    const body = document.getElementById("storeTableBody");
    body.innerHTML = SHOPPING_STORES.map(s => `
      <tr>
        <td data-label="매장">
          <div class="store-name-cell">
            <span>${s.name}</span>
          </div>
        </td>
        <td data-label="위치">${s.area} ${mapLinkHtml(s.mapQuery)}</td>
        <td data-label="영업시간">${s.hours || "-"}</td>
        <td data-label="추천 상품">${s.recommend}</td>
      </tr>`).join("");
  }
  // ---------------- 쇼핑리스트 / 꼭 먹어야 할 음식 공용 렌더러 ----------------
  // groups: [{ group, items: [{ title, desc, mapQuery }] }] 형태를 그대로 렌더링.
  // 같은 구조를 쓰기 때문에 다른 여행에서도 SHOPPING_LIST / FOOD_LIST 데이터만 바꾸면 재사용 가능.
  function renderGroupedList(groups, containerId) {
    const el = document.getElementById(containerId);
    el.innerHTML = groups.map((g, gi) => `
      ${gi > 0 ? '<hr class="washi-divider">' : ""}
      <h3>${g.group}</h3>
      <ul class="item-list">
        ${g.items.map(it => `
          <li>
            <div class="item-content">
              <div class="item-line">
                <span class="item-title">${it.title}</span>
                ${mapLinkHtml(it.mapQuery)}
              </div>
              <p class="item-desc">${it.desc}</p>
            </div>
          </li>`).join("")}
      </ul>`).join("");
  }
  function renderShoppingList() { renderGroupedList(SHOPPING_LIST, "shoppingListBody"); }
  function renderFoodList() { renderGroupedList(FOOD_LIST, "foodListBody"); }

  // ---------------- 가계부 (나만 보기 전용) ----------------
  // 분류 로직: splitWith 인원수 > 1 → 공동경비(내 몫 = 금액/인원수)
  //           splitWith 인원수 = 1 & 그 사람이 나 → 개인경비(전액)
  //           splitWith 인원수 = 1 & 그 사람이 내가 아님 → 내 가계부에서 제외
  function classifyExpense(e) {
    const n = e.splitWith.length;
    if (n > 1) return "shared";
    if (n === 1 && e.splitWith[0] === getMeName()) return "personal";
    return "excluded";
  }
  function myShare(e, type) {
    const krw = e.amount * e.krwRate;
    if (type === "shared") return krw / e.splitWith.length;
    if (type === "personal") return krw;
    return 0;
  }
  // 통화 표시 규칙: 기호가 있는 통화는 기호+숫자(₩1,000), 기호가 없는 통화는 숫자+코드(1,000 VND)
  // 통화-기호 매핑은 data.js CURRENCY_SYMBOLS(B4 단일 소스)를 그대로 참조. 목록에 없는 통화는 "1,000 VND"처럼 코드가 붙어 표시된다.
  function formatMoney(amount, currency) {
    const symbol = CURRENCY_SYMBOLS[currency];
    const numStr = amount.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
    return symbol ? `${symbol}${numStr}` : `${numStr} ${currency}`;
  }
  function fmtKRW(n) { return formatMoney(Math.round(n), "KRW"); }
  function fmtOriginal(e) { return formatMoney(e.amount, e.currency); }
  function buildOtherExpensesHtml(otherRows) {
    if (!otherRows.length) return "";
    let lastDay = null;
    const body = otherRows.map(e => {
      let dayHeader = "";
      if (e.day !== lastDay) {
        dayHeader = `<tr class="phrase-cat"><td colspan="4">${escapeHtml(e.day)}</td></tr>`;
        lastDay = e.day;
      }
      const krw = e.amount * e.krwRate;
      return `${dayHeader}
        <tr>
          <td>${escapeHtml(e.item)}${e.category ? `<br><span class="expense-share-note">${escapeHtml(e.category)}</span>` : ""}</td>
          <td>${fmtOriginal(e)}${e.currency !== "KRW" ? `<br>(${fmtKRW(krw)})` : ""}</td>
          <td><span class="expense-badge expense-badge-others">타인</span><br><span class="expense-share-note">${escapeHtml(e.splitWith.join(", "))}</span></td>
          <td class="expense-actions"><button type="button" class="expense-act" data-exp-edit="${e.idx}" aria-label="수정">✏️</button><button type="button" class="expense-act" data-exp-del="${e.idx}" aria-label="삭제">🗑️</button></td>
        </tr>`;
    }).join("");
    return `
      <details class="accordion accordion-nested expense-others" open>
        <summary><span>👥 타인 경비 (내 합계 미포함)</span><span class="expense-cat-total">${otherRows.length}건</span></summary>
        <div class="accordion-body">
          <p class="expense-share-note">내 이름이 아닌 한 사람만 적은 항목이에요. 내 지출·공동경비 합계에는 포함되지 않아요. 이름을 잘못 적었다면 ✏️로 고쳐 주세요.</p>
          <table class="phrase-table expense-table">
            <thead><tr><th>항목명</th><th>금액</th><th>구분</th><th></th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </details>`;
  }
  function renderExpenses() {
    refreshExpenseFormOptions();
    const allRows = currentExpenses.map((e, idx) => ({ ...e, idx, type: classifyExpense(e) }));
    const rows = allRows
      .filter(e => e.type !== "excluded")
      .map(e => ({ ...e, krw: e.amount * e.krwRate, share: myShare(e, e.type) }));
    // 내 이름이 아닌 한 사람만 적은 "타인 경비"는 합계에서는 빼되, 저장 여부를 확인하고 고칠 수 있게 목록에는 따로 보여준다.
    const otherRows = allRows.filter(e => e.type === "excluded");

    const totalMine = rows.reduce((sum, e) => sum + e.share, 0);
    const totalShared = rows.filter(e => e.type === "shared").reduce((sum, e) => sum + e.krw, 0);
    const mineEl = document.getElementById("expenseTotal");
    const sharedEl = document.getElementById("expenseSharedTotal");
    if (mineEl) mineEl.textContent = fmtKRW(totalMine);
    if (sharedEl) sharedEl.textContent = fmtKRW(totalShared);

    // 카테고리별로 묶고, 카테고리 안에서는 일차 순서를 유지한 채 그룹핑
    const categories = {};
    rows.forEach(e => {
      if (!categories[e.category]) categories[e.category] = { total: 0, currencyTotals: {}, rows: [] };
      categories[e.category].total += e.share;
      if (e.currency !== "KRW") {
        const shareOriginal = e.type === "shared" ? e.amount / e.splitWith.length : e.amount;
        categories[e.category].currencyTotals[e.currency] = (categories[e.category].currencyTotals[e.currency] || 0) + shareOriginal;
      }
      categories[e.category].rows.push(e);
    });

    const listEl = document.getElementById("expenseCategoryList");
    if (listEl) {
      listEl.innerHTML = Object.entries(categories).map(([cat, data]) => {
        let lastDay = null;
        const bodyRows = data.rows.map(e => {
          let dayHeader = "";
          if (e.day !== lastDay) {
            dayHeader = `<tr class="phrase-cat"><td colspan="4">${e.day}</td></tr>`;
            lastDay = e.day;
          }
          const shareNote = e.type === "shared" ? `<br><span class="expense-share-note">내 몫 ${fmtKRW(e.share)}</span>` : "";
          return `${dayHeader}
            <tr>
              <td>${escapeHtml(e.item)}</td>
              <td>${fmtOriginal(e)}${e.currency !== "KRW" ? `<br>(${fmtKRW(e.krw)})` : ""}</td>
              <td><span class="expense-badge expense-badge-${e.type}">${e.type === "shared" ? "공동" : "개인"}</span>${shareNote}</td>
              <td class="expense-actions"><button type="button" class="expense-act" data-exp-edit="${e.idx}" aria-label="수정">✏️</button><button type="button" class="expense-act" data-exp-del="${e.idx}" aria-label="삭제">🗑️</button></td>
            </tr>`;
        }).join("");
        const currencyNote = Object.entries(data.currencyTotals)
          .map(([cur, sum]) => formatMoney(sum, cur))
          .join(" · ");
        return `
          <details class="accordion accordion-nested">
            <summary><span>${escapeHtml(cat || "미분류")}</span><span class="expense-cat-total">${fmtKRW(data.total)}${currencyNote ? `<br><span class="expense-currency-note">(${currencyNote})</span>` : ""}</span></summary>
            <div class="accordion-body">
              <table class="phrase-table expense-table">
                <thead><tr><th>항목명</th><th>금액</th><th>구분</th><th></th></tr></thead>
                <tbody>${bodyRows}</tbody>
              </table>
            </div>
          </details>`;
      }).join("") + buildOtherExpensesHtml(otherRows);
    }
  }
  document.getElementById("expenseDetailBtn")?.addEventListener("click", () => {
    renderExpenses();
    openCard("expenseCard");
  });

  // ---------------- 가계부 입력 (앱 안에서 추가/수정/삭제) ----------------
  // 외부 가계부 앱(CSV 내보내기)이 없어져도 이 앱 안에서 바로 입력할 수 있다. 데이터는 이 기기의 IndexedDB에만 저장되고
  // (백업 JSON에 포함), CSV 가져오기/내보내기는 보조 수단이다.
  let editingExpenseIdx = null;
  let lastExpenseDay = null;

  function expenseDayOptions() {
    const opts = ["여행준비"];
    (TRIP.days || []).forEach(d => opts.push(`${d.day}일차`));
    opts.push("여행 후");
    return opts;
  }
  // ---- 통화 선택 + 환율 ----
  // 통화는 고정 목록이 아니다: 기본 통화·원화·이미 쓴 통화·자주 쓰는 통화 + "다른 통화 직접 입력…"(코드 3자리)로 추가한다.
  // 환율 우선순위: ① 같은 통화로 마지막에 입력한 환율 → ② 마지막으로 조회한 환율(캐시) → ③ 생성 시 입력한 기본값 → ④ 온라인이면 자동 조회.
  // 자동 조회: https://open.er-api.com (키 없음, 하루 1회 갱신, 출처 표기 필요 → 환율칸 아래에 링크 표시). 실패하면 직접 입력하면 된다.
  const COMMON_CURRENCIES = ["USD", "EUR", "JPY", "CNY", "GBP", "THB", "TWD", "VND", "HKD", "SGD", "AUD"];
  const CUSTOM_CURRENCY = "__custom__";
  let currencyNames = null;
  let prevCurrency = null;
  function currencyLabel(code) {
    let name = "";
    try {
      if (!currencyNames) currencyNames = new Intl.DisplayNames(["ko"], { type: "currency" });
      name = currencyNames.of(code) || "";
    } catch (e) {}
    return name && name !== code ? `${code} · ${name}` : code;
  }
  function isWellFormedCurrency(code) { return /^[A-Z]{3}$/.test(code); }
  function rebuildCurrencyOptions(selected) {
    const sel = document.getElementById("expCurrency");
    if (!sel) return;
    const used = currentExpenses.map(e => e.currency).filter(isWellFormedCurrency);
    const codes = Array.from(new Set([EXP_DEFAULT.code, "KRW", ...used, ...COMMON_CURRENCIES]));
    if (selected && isWellFormedCurrency(selected) && !codes.includes(selected)) codes.unshift(selected);
    sel.innerHTML = codes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(currencyLabel(c))}</option>`).join("")
      + `<option value="${CUSTOM_CURRENCY}">＋ 다른 통화 직접 입력…</option>`;
    sel.value = (selected && codes.includes(selected)) ? selected : EXP_DEFAULT.code;
    prevCurrency = sel.value;
  }
  function onCurrencyChange() {
    const sel = document.getElementById("expCurrency");
    if (sel.value === CUSTOM_CURRENCY) {
      const input = (prompt("통화 코드 3자리를 입력해 주세요 (예: HKD, CHF, PHP)") || "").trim().toUpperCase();
      if (!isWellFormedCurrency(input)) {
        if (input) alert("영문 대문자 3자리 통화 코드로 입력해 주세요. 예: HKD");
        rebuildCurrencyOptions(prevCurrency || EXP_DEFAULT.code);
        return;
      }
      rebuildCurrencyOptions(input);
    }
    prevCurrency = sel.value;
    applyRateForCurrency();
  }
  function usedRate(code) {
    for (let i = currentExpenses.length - 1; i >= 0; i--) {
      const e = currentExpenses[i];
      if (e.currency === code && e.krwRate > 0) return e.krwRate;
    }
    return 0;
  }
  function cachedRate(code) {
    try {
      const j = JSON.parse(localStorage.getItem(RATE_CACHE_PREFIX + code) || "null");
      return j && j.rate > 0 ? j : null;
    } catch (e) { return null; }
  }
  function setRateNote(html) {
    const el = document.getElementById("expRateNote");
    if (!el) return;
    el.innerHTML = html;
    el.hidden = !html;
  }
  function rateNoteHtml(code, info) {
    return `1 ${escapeHtml(code)} ≈ ${info.rate}원 (${escapeHtml(info.asOf)} 기준) · 직접 수정 가능 · <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">Rates By Exchange Rate API</a>`;
  }
  async function fetchKrwRate(code) {
    const res = await fetch("https://open.er-api.com/v6/latest/" + encodeURIComponent(code));
    if (!res.ok) throw new Error("http " + res.status);
    const data = await res.json();
    const krw = data && data.rates && data.rates.KRW;
    if (data.result !== "success" || !(krw > 0)) throw new Error("no rate");
    const ts = data.time_last_update_unix ? new Date(data.time_last_update_unix * 1000) : new Date();
    return { rate: Math.round(krw * 10000) / 10000, asOf: ts.toISOString().slice(0, 10) };
  }
  async function fetchRateIntoForm(manual) {
    const sel = document.getElementById("expCurrency");
    const code = sel.value;
    if (!isWellFormedCurrency(code) || code === "KRW") return;
    if (!manual && navigator.onLine === false) return;
    const rateEl = document.getElementById("expRate");
    const btn = document.getElementById("expRateFetch");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "…";
    try {
      const info = await fetchKrwRate(code);
      if (sel.value !== code) return; // 조회하는 사이 통화가 바뀜
      rateEl.value = info.rate;
      try { localStorage.setItem(RATE_CACHE_PREFIX + code, JSON.stringify(info)); } catch (e) {}
      setRateNote(rateNoteHtml(code, info));
    } catch (err) {
      if (manual) setRateNote("⚠️ 환율을 불러오지 못했어요(오프라인이거나 지원하지 않는 통화). 직접 입력해 주세요.");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
  function applyRateForCurrency() {
    const code = document.getElementById("expCurrency").value || "KRW";
    const rateEl = document.getElementById("expRate");
    const btn = document.getElementById("expRateFetch");
    if (code === "KRW") {
      rateEl.value = "1"; rateEl.disabled = true;
      if (btn) btn.hidden = true;
      setRateNote("");
      return;
    }
    rateEl.disabled = false;
    if (btn) btn.hidden = false;
    const used = usedRate(code);
    const cached = cachedRate(code);
    if (used > 0) {
      rateEl.value = used;
      setRateNote("마지막으로 입력한 환율이에요. 최신 환율은 [조회]로 불러올 수 있어요.");
    } else if (cached) {
      rateEl.value = cached.rate;
      setRateNote(rateNoteHtml(code, cached));
    } else if (EXP_DEFAULT.code === code && EXP_DEFAULT.krwRate > 0) {
      rateEl.value = EXP_DEFAULT.krwRate;
      setRateNote("여행 생성 때 입력한 환율이에요. 최신 환율은 [조회]로 불러올 수 있어요.");
    } else {
      rateEl.value = "";
      setRateNote("");
      fetchRateIntoForm(false); // 온라인이면 자동 조회, 실패하면 직접 입력
    }
  }
  function refreshExpenseFormOptions() {
    const curSel = document.getElementById("expCurrency");
    if (!curSel) return;
    const hint = document.getElementById("expenseNameHint");
    if (hint) hint.hidden = !!getMeName();
    if (!curSel.dataset.bound) {
      curSel.dataset.bound = "1";
      rebuildCurrencyOptions(EXP_DEFAULT.code);
      curSel.addEventListener("change", onCurrencyChange);
      document.getElementById("expRateFetch")?.addEventListener("click", () => fetchRateIntoForm(true));
      applyRateForCurrency();
    } else {
      rebuildCurrencyOptions(curSel.value);
    }
    const daySel = document.getElementById("expDay");
    if (daySel && !daySel.options.length) {
      const opts = expenseDayOptions();
      daySel.innerHTML = opts.map(d => `<option value="${d}">${d}</option>`).join("");
      daySel.value = opts.includes("1일차") ? "1일차" : opts[0];
    }
    // 카테고리: 직접 입력(텍스트) + 목록에서 고르기(드롭다운) 둘 다 가능. 목록 = data.js EXPENSE_CATEGORIES + 지금까지 쓴 카테고리.
    const catSel = document.getElementById("expCategorySel");
    if (catSel) {
      const cats = Array.from(new Set([...EXP_CATEGORIES, ...currentExpenses.map(e => e.category).filter(Boolean)]));
      catSel.innerHTML = `<option value="">▾ 목록</option>` + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      catSel.value = "";
      if (!catSel.dataset.bound) {
        catSel.dataset.bound = "1";
        catSel.addEventListener("change", () => {
          if (catSel.value) {
            document.getElementById("expCategory").value = catSel.value;
            catSel.value = "";
          }
        });
      }
    }
  }
  function resetExpenseForm() {
    editingExpenseIdx = null;
    ["expItem", "expAmount", "expSplitWith"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    const submit = document.getElementById("expSubmitBtn");
    if (submit) submit.textContent = "추가";
    const cancel = document.getElementById("expCancelBtn");
    if (cancel) cancel.hidden = true;
  }
  async function persistExpenses(next) {
    await DB.replaceExpenses(next);
    currentExpenses = next;
    renderExpenses();
  }
  function ensureSelectValue(sel, value) {
    if (![...sel.options].some(o => o.value === value)) {
      const opt = document.createElement("option");
      opt.value = value; opt.textContent = value;
      sel.appendChild(opt);
    }
    sel.value = value;
  }

  document.getElementById("expenseForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const $ = (id) => document.getElementById(id);
    const item = $("expItem").value.trim();
    const amount = Number($("expAmount").value);
    const currency = $("expCurrency").value || "KRW";
    if (!isWellFormedCurrency(currency)) { alert("통화를 선택해 주세요."); return; }
    const krwRate = currency === "KRW" ? 1 : Number($("expRate").value);
    const splitRaw = $("expSplitWith").value.split(/[,;]/).map(x => x.trim()).filter(Boolean);
    const me = getMeName();
    if (!item || $("expAmount").value === "" || !(amount >= 0)) { alert("항목명과 금액을 입력해 주세요."); return; }
    if (!(krwRate > 0)) { alert("환율(1통화당 원화)을 입력해 주세요."); $("expRate").focus(); return; }
    if (!splitRaw.length && !me) {
      alert("설정에서 '내 이름'을 먼저 입력해 주세요. (혼자 쓴 경비는 내 이름으로 기록돼요)");
      return;
    }
    const row = {
      day: $("expDay").value || "기타",
      item,
      category: $("expCategory").value.trim(),
      amount,
      currency,
      krwRate,
      splitWith: splitRaw.length ? splitRaw : [me],
    };
    try {
      await loadExpenses();
      const next = [...currentExpenses];
      if (editingExpenseIdx !== null && next[editingExpenseIdx]) next[editingExpenseIdx] = row;
      else next.push(row);
      await persistExpenses(next);
      lastExpenseDay = row.day;
      resetExpenseForm();
      $("expItem").focus();
    } catch (err) {
      alert("저장에 실패했어요. 다시 시도해 주세요.");
    }
  });
  document.getElementById("expCancelBtn")?.addEventListener("click", resetExpenseForm);

  // 상세 카드의 ✏️/🗑️ 버튼 (목록이 다시 그려지므로 컨테이너에 위임)
  document.getElementById("expenseCategoryList")?.addEventListener("click", async (ev) => {
    const editBtn = ev.target.closest("[data-exp-edit]");
    const delBtn = ev.target.closest("[data-exp-del]");
    if (editBtn) {
      const idx = Number(editBtn.dataset.expEdit);
      const e = currentExpenses[idx];
      if (!e) return;
      const $ = (id) => document.getElementById(id);
      editingExpenseIdx = idx;
      $("expItem").value = e.item;
      $("expAmount").value = e.amount;
      ensureSelectValue($("expCurrency"), e.currency || "KRW");
      applyRateForCurrency();
      if (e.currency && e.currency !== "KRW") $("expRate").value = e.krwRate;
      ensureSelectValue($("expDay"), e.day || "기타");
      $("expCategory").value = e.category || "";
      const me = getMeName();
      $("expSplitWith").value = (e.splitWith.length === 1 && e.splitWith[0] === me) ? "" : e.splitWith.join(", ");
      $("expSubmitBtn").textContent = "수정 저장";
      $("expCancelBtn").hidden = false;
      document.getElementById("expenseCardClose")?.click();
      const acc = $("expenseAccordion");
      if (acc) { acc.open = true; acc.scrollIntoView({ block: "start" }); }
      $("expItem").focus();
    } else if (delBtn) {
      const idx = Number(delBtn.dataset.expDel);
      const e = currentExpenses[idx];
      if (!e) return;
      if (!confirm(`"${e.item}" 항목을 삭제할까요?`)) return;
      try {
        await DB.pushExpenseSnapshot(currentExpenses); // 삭제 전 상태를 백업 → "이전으로 되돌리기"로 복구 가능
        await persistExpenses(currentExpenses.filter((_, i) => i !== idx));
        resetExpenseForm();
        await updateExpenseUndoButton();
      } catch (err) {
        alert("삭제에 실패했어요.");
      }
    }
  });

  // ---------------- 가계부 켜기/끄기 + 내 이름 (기기별 설정) ----------------
  function applyExpenseVisibility() {
    const on = isExpenseEnabled();
    const acc = document.getElementById("expenseAccordion");
    if (acc) acc.hidden = !on;
    const csv = document.getElementById("expenseCsvSection");
    if (csv) csv.hidden = !on;
    const toggle = document.getElementById("expenseToggle");
    if (toggle) toggle.checked = on;
    if (on) {
      loadExpenses().then(() => { renderExpenses(); updateExpenseUndoButton(); });
    }
  }
  function initExpenseSettings() {
    document.getElementById("expenseToggle")?.addEventListener("change", (ev) => {
      setExpenseEnabled(ev.target.checked);
      applyExpenseVisibility();
    });
    const nameInput = document.getElementById("meNameInput");
    if (nameInput) {
      nameInput.value = getMeName();
      nameInput.addEventListener("input", () => {
        setMeName(nameInput.value);
        if (isExpenseEnabled()) renderExpenses();
      });
    }
  }

  // ---------------- 가계부 CSV 내보내기 (가져오기와 같은 컬럼이라 그대로 다시 불러올 수 있음) ----------------
  document.getElementById("expenseCsvExportBtn")?.addEventListener("click", async () => {
    try {
      await loadExpenses();
      const esc = (v) => {
        const t = String(v ?? "");
        return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      };
      const lines = ["day,item,category,amount,currency,krwRate,splitWith"].concat(
        currentExpenses.map(e => [e.day, e.item, e.category, e.amount, e.currency, e.krwRate, (e.splitWith || []).join(";")].map(esc).join(","))
      );
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${window.TRIP_ID || "trip"}-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showCsvStatus(`✅ ${currentExpenses.length}건을 CSV로 내보냈어요.`);
    } catch (err) {
      showCsvStatus("⚠️ CSV 내보내기에 실패했어요.");
    }
  });

  // ---------------- 가계부 CSV 가져오기 (추가 또는 전체 교체) ----------------
  // 아래 두 헤더 형식을 모두 인식한다 (컬럼 순서는 상관없음):
  //  - 기본 형식: day,item,category,amount,currency,krwRate,splitWith
  //  - 가계부 앱 내보내기 형식: 일차,항목명,카테고리,금액,통화,통화 당 원화,원화 환산,
  //    장소,나만보기 비용,결제한 사람,결제한 사람 수,나눠 낼 사람,나눠 낼 사람 수
  // splitWith(나눠 낼 사람)는 세미콜론(;) 또는 쉼표(,)로 여러 명을 구분해도 된다.
  // 분류(공동/개인/제외) 로직인 classifyExpense/myShare는 splitWith만 보고 판단하므로
  // 그 외 컬럼(장소, 나만보기 비용, 결제한 사람 등)은 있어도 그냥 무시된다.
  // "▼"로 시작하는 줄이나 빈 줄을 만나면 그 아래는 요약 합계 구간으로 보고 읽기를 멈춘다.
  const EXPENSE_HEADER_ALIASES = {
    day: ["day", "일차"],
    item: ["item", "항목명"],
    category: ["category", "카테고리"],
    amount: ["amount", "금액"],
    currency: ["currency", "통화"],
    krwRate: ["krwRate", "통화 당 원화"],
    splitWith: ["splitWith", "나눠 낼 사람"],
  };
  const EXPENSE_FIELD_LABEL = {
    day: "day(일차)", item: "item(항목명)", category: "category(카테고리)",
    amount: "amount(금액)", currency: "currency(통화)", krwRate: "krwRate(통화 당 원화)",
    splitWith: "splitWith(나눠 낼 사람)",
  };

  // 큰따옴표로 감싼 필드 안의 쉼표(예: "1,093,600")를 지켜가며 한 줄을 셀 배열로 쪼갠다.
  function parseCsvLine(line) {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  }

  function toNumber(raw) {
    if (raw == null) return NaN;
    const cleaned = String(raw).replace(/,/g, "").trim();
    if (cleaned === "") return NaN;
    return Number(cleaned);
  }

  function parseExpenseCsv(text) {
    const allLines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    let start = 0;
    while (start < allLines.length && allLines[start].trim() === "") start++;
    if (start >= allLines.length) throw new Error("빈 CSV예요.");

    const header = parseCsvLine(allLines[start]);
    const fieldIndex = {};
    Object.entries(EXPENSE_HEADER_ALIASES).forEach(([field, aliases]) => {
      const idx = header.findIndex(h => aliases.includes(h));
      if (idx !== -1) fieldIndex[field] = idx;
    });
    const missing = ["item", "amount"].filter(f => !(f in fieldIndex)); // 나머지 컬럼은 비워도 기본값 처리
    if (missing.length) {
      throw new Error(`컬럼 누락: ${missing.map(f => EXPENSE_FIELD_LABEL[f]).join(", ")}`);
    }

    const rows = [];
    for (let i = start + 1; i < allLines.length; i++) {
      const line = allLines[i];
      if (line.trim() === "" || line.trim().startsWith("▼")) break; // 요약 합계 구간 시작
      const cells = parseCsvLine(line);
      const get = (field) => cells[fieldIndex[field]] ?? "";

      const amount = toNumber(get("amount"));
      const item = get("item");
      const currency = (get("currency") || "KRW").trim().toUpperCase();
      if (!isWellFormedCurrency(currency)) {
        throw new Error(`${i + 1}번째 줄 통화 코드가 올바르지 않아요. (영문 3자리, 예: JPY)`);
      }
      let krwRate = toNumber(get("krwRate"));
      if (Number.isNaN(krwRate) && currency === "KRW") krwRate = 1;
      if (!item || Number.isNaN(amount) || Number.isNaN(krwRate)) {
        throw new Error(`${i + 1}번째 줄 형식이 올바르지 않아요.`);
      }
      let splitWith = get("splitWith").split(/[,;]/).map(s => s.trim()).filter(Boolean);
      if (!splitWith.length) {
        const me = getMeName();
        if (!me) throw new Error("나눠 낼 사람이 빈 줄이 있어요. 설정에서 '내 이름'을 먼저 입력해 주세요.");
        splitWith = [me];
      }
      rows.push({ day: get("day") || "기타", item, category: get("category"), amount, currency, krwRate, splitWith });
    }
    if (!rows.length) throw new Error("가져올 항목이 없어요.");
    return rows;
  }

  // 가계부 앱들이 CSV를 UTF-8이 아니라 EUC-KR(CP949)로 내보내는 경우가 흔해서,
  // file.text()(항상 UTF-8로만 해석)로 읽으면 한글 헤더("일차" 등)가 깨져 컬럼을 못 찾는다.
  // UTF-8로 디코딩했을 때 깨진 문자(치환 문자 U+FFFD)가 섞여 있으면 EUC-KR로 다시 읽어본다.
  async function readCsvFileAsText(file) {
    const buffer = await file.arrayBuffer();
    const utf8Text = new TextDecoder("utf-8").decode(buffer);
    if (!utf8Text.includes("\uFFFD")) return utf8Text; // 정상 UTF-8
    try {
      const eucKrText = new TextDecoder("euc-kr").decode(buffer);
      // EUC-KR로도 깨졌으면(치환 문자 존재) 그래도 UTF-8 결과보단 EUC-KR을 우선 신뢰
      return eucKrText;
    } catch (err) {
      // 브라우저가 euc-kr 디코더를 지원하지 않는 극히 드문 경우 UTF-8 결과라도 사용
      return utf8Text;
    }
  }

  // ---------------- 가계부 CSV 자동 백업 / 되돌리기 (D1, 최근 1~2개 스냅샷만 유지) ----------------
  function showCsvStatus(msg) {
    const statusEl = document.getElementById("expenseCsvStatus");
    if (statusEl) { statusEl.textContent = msg; statusEl.hidden = false; }
  }
  async function updateExpenseUndoButton() {
    const btn = document.getElementById("expenseUndoBtn");
    if (!btn) return;
    try {
      const snapshots = await DB.getExpenseSnapshots();
      btn.hidden = snapshots.length === 0;
    } catch (e) {
      btn.hidden = true;
    }
  }
  document.getElementById("expenseUndoBtn")?.addEventListener("click", async () => {
    if (!confirm("가장 최근 CSV 업로드 이전 상태로 되돌릴까요?")) return;
    try {
      const snapshot = await DB.popExpenseSnapshot();
      if (!snapshot) {
        showCsvStatus("⚠️ 되돌릴 이전 상태가 없어요.");
        await updateExpenseUndoButton();
        return;
      }
      await DB.replaceExpenses(snapshot.list);
      currentExpenses = snapshot.list;
      renderExpenses();
      showCsvStatus(`↩️ 되돌리기 완료 (${new Date(snapshot.ts).toLocaleString("ko-KR")} 상태로 복원)`);
      await updateExpenseUndoButton();
    } catch (err) {
      showCsvStatus("⚠️ 되돌리기에 실패했어요.");
    }
  });

  document.getElementById("expenseCsvInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    const mode = document.getElementById("expenseCsvMode")?.value || "append";
    if (!confirm(mode === "replace" ? "CSV를 올리면 현재 가계부 내역 전체가 새 내용으로 교체돼요. 계속할까요?" : "CSV 내역을 현재 가계부 뒤에 추가할까요?")) return;
    try {
      const text = await readCsvFileAsText(file);
      const rows = parseExpenseCsv(text);
      await loadExpenses(); // 스냅샷 정확도를 위해 교체 직전 최신 상태로 갱신
      await DB.pushExpenseSnapshot(currentExpenses); // 교체 전 상태를 자동 백업(최근 2개까지만 유지, 그 이전은 자동 폐기)
      const nextList = mode === "replace" ? rows : [...currentExpenses, ...rows];
      await DB.replaceExpenses(nextList);
      currentExpenses = nextList;
      renderExpenses();
      showCsvStatus(`✅ ${rows.length}건 ${mode === "replace" ? "교체" : "추가"} 완료 (${new Date().toLocaleString("ko-KR")})`);
      await updateExpenseUndoButton();
    } catch (err) {
      showCsvStatus(`⚠️ 가져오기 실패: ${err.message || "CSV 형식을 확인해 주세요."}`);
    }
  });

  // ---------------- 지도 (Leaflet + OpenStreetMap) ----------------
  // 흐름: GEO_COORDS(확정 좌표, data.js)에 있으면 그걸 바로 사용 → 없으면 mapQuery(+영문 검색어)로
  // Nominatim 지오코딩 시도 → 성공하면 기기에 캐시. 실패한 장소는 지도에서 빼지 않고 "위치 확인 필요"
  // 목록에 남겨, 지도를 탭해서 직접 위치를 찍어 저장할 수 있게 한다(좌표 입력 없이).
  const TAG_COLOR_VAR = { normal: "var(--tape)", food: "var(--pink)", shop: "var(--sight)", sight: "var(--moss)", theme: "var(--indigo)" };
  function tagColorVar(tag) { return TAG_COLOR_VAR[tag] || "var(--tape)"; }

  let leafletMap = null;
  let mapMarkerLayers = null; // TRIP.days 기준 동적 생성 (B3) — { [day]: layerGroup, ... }
  let currentMapDay = "all";
  let mapInitialized = false;
  let geocodeQueueRunning = false;
  let selectedMarkerEl = null; // 현재 선택(확대)된 마커의 DOM 엘리먼트 — 시트를 닫으면 원래 크기로 복귀

  // 마커 가시성 개선(T11): 작은 원형 점 대신 눈에 잘 띄는 핀(물방울) 모양으로 변경.
  // 좌표 기준점이 핀 끝(뾰족한 부분)으로 바뀌므로 iconAnchor/popupAnchor도 함께 조정했다.
  function makePinIcon(tag, orderNum) {
    const numHtml = orderNum ? `<span class="map-pin-num">${orderNum}</span>` : "";
    return L.divIcon({
      className: "map-pin-wrap",
      html: `<span class="map-pin" style="background:${tagColorVar(tag)}">${numHtml}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 26],
      popupAnchor: [0, -26]
    });
  }

  // 일정 순서 번호(T13): 각 날짜별로 mapQuery가 있고 noPin이 아닌 일정에 1부터 순서를 매긴다.
  // ITEMS 배열이 이미 시간순(입력 순서)이므로 day별로 순회하며 카운트만 하면 된다.
  let itemOrderMap = new Map(); // itemId -> 그 날짜 안에서의 순번(1부터)
  function computeItemOrderNumbers() {
    itemOrderMap = new Map();
    TRIP.days.forEach((d) => {
      let n = 0;
      ITEMS.filter((i) => i.day === d.day && i.mapQuery && !i.noPin).forEach((i) => {
        n += 1;
        itemOrderMap.set(i.id, n);
      });
    });
  }

  function addMarkerForItem(item, coords) {
    const orderNum = itemOrderMap.get(item.id);
    const marker = L.marker([coords.lat, coords.lng], { icon: makePinIcon(item.tag, orderNum) });
    marker.on("click", () => {
      if (pickingItem) {
        // 위치찍기 모드 중 이미 있는 마커를 탭하면, 그 위치로 현재 찍는 중인 핀을 옮긴다
        onMapTapWhilePicking(coords);
        return;
      }
      selectMarker(marker);
      showMapSheet(item, coords);
    });
    marker.addTo(mapMarkerLayers[item.day]);
  }

  // 마커 선택 시 확대 표시(T12). 상세 시트를 닫으면 selectMarker(closeMapSheet)에서 원래 크기로 복귀.
  function selectMarker(marker) {
    if (selectedMarkerEl) selectedMarkerEl.classList.remove("selected");
    selectedMarkerEl = marker.getElement ? marker.getElement() : null;
    if (selectedMarkerEl) selectedMarkerEl.classList.add("selected");
  }

  function deselectMarker() {
    if (selectedMarkerEl) selectedMarkerEl.classList.remove("selected");
    selectedMarkerEl = null;
  }

  // ---------------- 마커 탭 → 하단 시트(바텀시트) ----------------
  function showMapSheet(item, coords) {
    const sheet = document.getElementById("mapSheet");
    if (!sheet) return;
    sheet.innerHTML = `
      <div class="map-sheet-tape" style="background:${tagColorVar(item.tag)}"></div>
      <div class="map-sheet-head">
        <span class="tl-tag">${TAG_LABEL[item.tag] || ""}</span>
        <span class="map-sheet-time">${item.time || ""}</span>
        <button class="map-sheet-close" type="button" aria-label="닫기">✕</button>
      </div>
      <h3 class="map-sheet-title">${item.title}</h3>
      ${item.desc ? `<p class="map-sheet-desc">${item.desc}</p>` : ""}
      <button class="btn-primary small map-sheet-detail" type="button">자세히 보기</button>
    `;
    sheet.classList.add("open");
    sheet.querySelector(".map-sheet-close").addEventListener("click", closeMapSheet);
    sheet.querySelector(".map-sheet-detail").addEventListener("click", () => {
      closeMapSheet();
      openModal(item.id);
    });
    if (coords) panMapForSheet(coords);
  }

  function closeMapSheet() {
    document.getElementById("mapSheet")?.classList.remove("open");
    deselectMarker();
  }

  // 바텀시트가 열리면서 마커를 가리는 경우, 마커가 시트 위쪽 보이는 영역에 들어오도록 지도를 살짝 위로 이동
  function panMapForSheet(coords) {
    if (!leafletMap) return;
    const sheet = document.getElementById("mapSheet");
    if (!sheet) return;
    const sheetHeight = sheet.offsetHeight;
    if (!sheetHeight) return;
    const margin = 24; // 시트 위쪽 여유 여백
    const point = leafletMap.latLngToContainerPoint([coords.lat, coords.lng]);
    const mapSize = leafletMap.getSize();
    const visibleBottom = mapSize.y - sheetHeight - margin;
    if (point.y > visibleBottom) {
      leafletMap.panBy([0, point.y - visibleBottom], { animate: true });
    }
  }

  // ---------------- 위치 확인 필요 → 지도 탭해서 직접 찍기 ----------------
  let pickingItem = null;   // 현재 위치를 찍는 중인 항목
  let pickingMarker = null; // 확정 전 임시 마커(드래그로 미세조정 가능)

  function startPicking(item) {
    closeMapSheet();
    pickingItem = item;
    if (pickingMarker) { leafletMap.removeLayer(pickingMarker); pickingMarker = null; }
    const bar = document.getElementById("mapPickerBar");
    document.getElementById("mapPickerText").textContent = `"${item.title}" 위치를 지도에서 탭해주세요`;
    document.getElementById("mapPickerSave").disabled = true;
    bar.hidden = false;
    leafletMap.getContainer().classList.add("picking");
  }

  function cancelPicking() {
    if (pickingMarker) { leafletMap.removeLayer(pickingMarker); pickingMarker = null; }
    pickingItem = null;
    document.getElementById("mapPickerBar").hidden = true;
    leafletMap.getContainer().classList.remove("picking");
  }

  async function confirmPicking() {
    if (!pickingItem || !pickingMarker) return;
    const { lat, lng } = pickingMarker.getLatLng();
    await DB.setGeocode(pickingItem.mapQuery, { lat, lng, manual: true, failed: false, ts: Date.now() });
    cancelPicking();
    renderMap();
  }

  function onMapTapWhilePicking(latlng) {
    if (pickingMarker) {
      pickingMarker.setLatLng(latlng);
    } else {
      pickingMarker = L.marker(latlng, { icon: makePinIcon(pickingItem.tag), draggable: true }).addTo(leafletMap);
    }
    document.getElementById("mapPickerSave").disabled = false;
  }

  function renderMapLegend() {
    const el = document.getElementById("mapLegend");
    if (!el) return;
    const present = new Set(ITEMS.filter((i) => i.mapQuery).map((i) => i.tag));
    const order = ["normal", "food", "sight", "shop", "theme"];
    const tags = order.filter((t) => present.has(t)).concat([...present].filter((t) => !order.includes(t)));
    el.innerHTML = tags.map((tag) => `
      <span class="map-legend-item"><span class="map-legend-dot" style="background:${tagColorVar(tag)}"></span>${TAG_LABEL[tag] || tag}</span>
    `).join("");
  }

  // ---------------- 지도 탭 필터 렌더링 (B3: TRIP.days 기반 동적 생성) ----------------
  function renderMapDayFilter() {
    const el = document.getElementById("mapDayFilter");
    if (!el) return;
    const allBtn = `<button class="day-tab active" data-mapday="all" type="button"><span class="day-num">전체</span></button>`;
    const dayBtns = TRIP.days.map(d => `
      <button class="day-tab" data-mapday="${d.day}" type="button"><span class="day-num">DAY ${d.day}</span></button>`).join("");
    el.innerHTML = allBtn + dayBtns;
  }

  function ensureLeafletMap() {
    if (leafletMap) return;
    renderMapDayFilter();
    leafletMap = L.map("leafletMap", { zoomControl: true }).setView([33.7, 130.2], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(leafletMap);
    mapMarkerLayers = {};
    TRIP.days.forEach((d) => {
      mapMarkerLayers[d.day] = L.layerGroup().addTo(leafletMap);
    });
    document.querySelectorAll("#mapDayFilter .day-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyMapDayFilter(btn.dataset.mapday, true);
      });
    });
    leafletMap.on("click", (e) => {
      if (pickingItem) onMapTapWhilePicking(e.latlng);
      else closeMapSheet();
    });
    document.getElementById("mapPickerCancel").addEventListener("click", cancelPicking);
    document.getElementById("mapPickerSave").addEventListener("click", confirmPicking);
    renderMapLegend();
  }

  function fitToVisibleMarkers() {
    const visibleLayers = TRIP.days.map((d) => d.day)
      .filter((d) => currentMapDay === "all" || String(d) === currentMapDay)
      .map((d) => mapMarkerLayers[d]);
    const markers = visibleLayers.flatMap((g) => g.getLayers());
    if (!markers.length) return;
    const group = L.featureGroup(markers);
    leafletMap.fitBounds(group.getBounds().pad(0.2));
  }

  function applyMapDayFilter(day, refit) {
    currentMapDay = day;
    document.querySelectorAll("#mapDayFilter .day-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mapday === day);
    });
    // "전체" 탭에서는 날짜별 순번이 뒤섞여 보이므로, 특정 DAY를 선택했을 때만 숫자를 노출한다.
    leafletMap.getContainer().classList.toggle("day-selected", day !== "all");
    TRIP.days.map((d) => d.day).forEach((d) => {
      const layer = mapMarkerLayers[d];
      const show = day === "all" || String(d) === day;
      if (show && !leafletMap.hasLayer(layer)) layer.addTo(leafletMap);
      if (!show && leafletMap.hasLayer(layer)) leafletMap.removeLayer(layer);
    });
    if (refit) fitToVisibleMarkers();
  }

  function renderPendingList(pendingItems) {
    const wrap = document.getElementById("mapPending");
    const list = document.getElementById("mapPendingList");
    // 공유자에게는 의미 없는 기능이라 Bella Travel을 거쳐 들어왔을 때만 노출
    if (!isArchiveEntry || !pendingItems.length) { wrap.hidden = true; list.innerHTML = ""; return; }
    wrap.hidden = false;
    list.innerHTML = pendingItems.map((item) => `
      <li class="map-pending-item" data-id="${item.id}">
        <div class="map-pending-head">
          <span>${item.title}</span>
          <div class="map-pending-actions">
            <button class="btn-ghost small map-retry-btn" type="button" data-query="${item.mapQuery.replace(/"/g, "&quot;")}">다시 시도</button>
            <a class="btn-ghost small" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.mapQuery)}" target="_blank" rel="noopener">구글 지도</a>
          </div>
        </div>
        <button class="btn-primary small map-pick-btn" type="button" data-id="${item.id}">📍 지도에서 위치 찍기</button>
      </li>`).join("");

    list.querySelectorAll(".map-retry-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "확인 중...";
        const query = btn.dataset.query;
        const result = await geocodeNominatim(query).catch(() => null);
        if (result) {
          await DB.setGeocode(query, { lat: result.lat, lng: result.lng, manual: false, failed: false, ts: Date.now() });
        } else {
          await DB.setGeocode(query, { manual: false, failed: true, ts: Date.now() });
          btn.disabled = false;
          btn.textContent = "다시 시도";
        }
        renderMap();
      });
    });

    list.querySelectorAll(".map-pick-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = ITEMS.find((i) => i.id === btn.dataset.id);
        if (item) startPicking(item);
      });
    });
  }

  async function geocodeNominatim(query) {
    // GEO_SEARCH_QUERY[query]가 없거나(현재 {} 기본값) 빈 문자열이면 원본 query로 대체.
    // searchText 자체가 끝까지 빈 값이면(예: mapQuery가 빈 문자열인 항목) 무의미한 조회를
    // 시도하지 않고 바로 실패 처리해 불필요한 네트워크 요청을 막는다.
    const searchText = GEO_SEARCH_QUERY[query] || query;
    if (!searchText) return null;
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ko&q=" + encodeURIComponent(searchText);
    const res = await fetch(url);
    if (!res.ok) throw new Error("geocode failed");
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }

  // 아직 캐시에 없는 장소들만 순서대로, Nominatim 정책(초당 1건)에 맞춰 천천히 지오코딩한다.
  async function runGeocodeQueue(queryGroups) {
    if (geocodeQueueRunning) return;
    geocodeQueueRunning = true;
    try {
      for (const [query, items] of queryGroups) {
        const result = await geocodeNominatim(query).catch(() => null);
        if (result) {
          await DB.setGeocode(query, { lat: result.lat, lng: result.lng, manual: false, failed: false, ts: Date.now() });
          items.forEach((item) => addMarkerForItem(item, result));
        } else {
          await DB.setGeocode(query, { manual: false, failed: true, ts: Date.now() });
        }
        await new Promise((r) => setTimeout(r, 1100)); // Nominatim 사용 정책: 초당 1건 이하
      }
    } finally {
      geocodeQueueRunning = false;
      renderMap();
    }
  }

  async function renderMap() {
    ensureLeafletMap();
    leafletMap.invalidateSize();
    computeItemOrderNumbers();

    const withQuery = ITEMS.filter((i) => i.mapQuery && !i.noPin);
    const byQuery = new Map();
    withQuery.forEach((item) => {
      if (!byQuery.has(item.mapQuery)) byQuery.set(item.mapQuery, []);
      byQuery.get(item.mapQuery).push(item);
    });

    TRIP.days.forEach((d) => mapMarkerLayers[d.day].clearLayers());
    selectedMarkerEl = null; // clearLayers로 기존 마커 DOM이 사라지므로 참조도 함께 초기화
    const pendingItems = [];
    const toGeocode = [];

    for (const [query, items] of byQuery.entries()) {
      const fixed = GEO_COORDS[query];
      if (fixed) {
        items.forEach((item) => addMarkerForItem(item, fixed));
        continue;
      }
      const cached = await DB.getGeocode(query);
      if (cached && !cached.failed) {
        items.forEach((item) => addMarkerForItem(item, cached));
      } else if (cached && cached.failed) {
        pendingItems.push(items[0]);
      } else {
        toGeocode.push([query, items]);
      }
    }

    renderPendingList(pendingItems);

    if (!mapInitialized) {
      mapInitialized = true;
      applyMapDayFilter(currentMapDay, true);
    } else {
      applyMapDayFilter(currentMapDay, false);
    }

    if (toGeocode.length) runGeocodeQueue(toGeocode);
  }


  // ---------------- 오프라인 지도 타일 미리 받기 (shared-core/offline-tiles.js로 이식, T02 반영값 그대로 전달) ----------------
  SharedCore.offlineTiles.initOfflineTiles({
    geoCoords: GEO_COORDS,
    getAllGeocodes: () => DB.getAllGeocodes(),
    storageKey: (window.TRIP_ID || "fukuoka-trip") + "-offline-tiles-state-v1",
    zooms: [13, 14, 15, 16],
    radiusM: 750,
    fetchDelayMs: 300,
    maxTiles: 2500,
  });

  // ---------------- 상세 모달 ----------------
  async function openModal(id) {
    const item = resolveItem(id);
    currentItem = item;

    document.getElementById("modalTime").textContent = item.time || "메모";
    document.getElementById("modalTime").style.display = item.time ? "" : "none";
    document.getElementById("modalTitle").textContent = item.title;
    document.getElementById("modalSubtitle").textContent =
      [item.desc, item.remark].filter(Boolean).join(" · ");

    const mapLink = document.getElementById("modalMapLink");
    if (item.mapQuery) {
      mapLink.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(item.mapQuery);
      mapLink.style.display = "";
    } else {
      mapLink.style.display = "none";
    }

    const note = await DB.getNote(item.id);
    document.getElementById("modalNote").value = note;

    await renderAttachments(item.id);

    openCard("modal");
  }

  // 메모 자동저장 (debounce)
  let noteTimer = null;
  document.getElementById("modalNote").addEventListener("input", (e) => {
    if (!currentItem) return;
    const id = currentItem.id;
    const val = e.target.value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => DB.setNote(id, val), 400);
  });

  function renderAttachments(itemId) {
    return renderAttachmentGrid("modalAttachGrid", itemId, objectUrls);
  }

  document.getElementById("modalFileInput").addEventListener("change", async (e) => {
    if (!currentItem) return;
    const files = Array.from(e.target.files);
    for (const f of files) {
      const resized = await resizeImageIfNeeded(f);
      await DB.addAttachment(currentItem.id, resized);
    }
    e.target.value = "";
    renderAttachments(currentItem.id);
  });

  // ---------------- 첨부파일 뷰어 팝업 ----------------
  function openViewer(att, url) {
    const content = document.getElementById("viewerContent");
    if (att.type.startsWith("image/")) {
      content.innerHTML = `<img src="${url}" alt="${escapeHtml(att.name)}">`;
    } else if (att.type === "application/pdf") {
      content.innerHTML = `<iframe src="${url}"></iframe>`;
    } else {
      content.innerHTML = `<p style="color:#fff">미리보기를 지원하지 않는 파일이에요.</p>`;
    }
    openCard("viewer");
  }
  // ---------------- 네비게이션 바인딩 ----------------
  document.getElementById("dayTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".day-tab");
    if (btn) switchDay(Number(btn.dataset.day));
  });
  document.getElementById("bottomNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (btn) switchView(btn.dataset.view);
  });

  // ---------------- 다크모드 (T4: shared-core/theme.js로 이식) ----------------
  // initThemeToggle이 토글 checked 동기화 + theme-color 메타 반영 + change 리스너 등록까지 한 번에 처리(로직 동일).
  const THEME_KEY = (window.TRIP_ID || "fukuoka-trip") + "-theme";
  SharedCore.theme.initThemeToggle({ themeKey: THEME_KEY, toggleId: "darkModeToggle" });

  // ---------------- 데이터 백업 / 복원 (T4: shared-core/backup.js로 이식, 로직 변경 없음) ----------------
  const { blobToDataURL, dataURLToBlob, downloadJSON } = SharedCore.backup;

  function showBackupStatus(msg) {
    const el = document.getElementById("backupStatus");
    el.textContent = msg;
    el.hidden = false;
  }

  document.getElementById("exportBtn").addEventListener("click", async () => {
    const btn = document.getElementById("exportBtn");
    btn.disabled = true;
    try {
      const [notes, checklist, rawAttachments, geocodes] = await Promise.all([
        DB.getAllNotes(),
        DB.getChecklist(),
        DB.getAllAttachments(),
        DB.getAllGeocodes()
      ]);
      const attachments = await Promise.all(rawAttachments.map(async (a) => ({
        id: a.id,
        itemId: a.itemId,
        name: a.name,
        type: a.type,
        createdAt: a.createdAt,
        dataUrl: await blobToDataURL(a.blob)
      })));
      const payload = {
        app: (window.TRIP_ID || "fukuoka-trip") + "-pwa",
        version: 3,
        exportedAt: new Date().toISOString(),
        notes, checklist, attachments, geocodes
      };
      // 가계부는 이 기기에서 켜져 있을 때(허브 경유 또는 설정 토글)만 백업에 포함
      if (isArchiveEntry || isExpenseEnabled()) {
        await loadExpenses();
        payload.expenses = currentExpenses;
        payload.meName = getMeName();
      }
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadJSON(payload, `${window.TRIP_ID || "fukuoka-trip"}-backup-${dateStr}.json`);
      showBackupStatus(`✅ 내보내기 완료 (${new Date().toLocaleString("ko-KR")})`);
    } catch (err) {
      showBackupStatus("⚠️ 내보내기에 실패했어요. 다시 시도해 주세요.");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("importFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    if (!confirm("백업 파일을 불러오면 현재 저장된 메모·사진·체크리스트·가계부 위에 덮어써요. 계속할까요?")) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload || payload.app !== (window.TRIP_ID || "fukuoka-trip") + "-pwa") {
        showBackupStatus("⚠️ 이 앱의 백업 파일이 아니에요.");
        return;
      }

      for (const [itemId, noteText] of Object.entries(payload.notes || {})) {
        await DB.setNote(itemId, noteText);
      }
      if (Array.isArray(payload.checklist)) {
        await DB.setChecklist(payload.checklist);
      }
      for (const att of payload.attachments || []) {
        const blob = await dataURLToBlob(att.dataUrl);
        await DB.putAttachmentRaw({
          id: att.id, itemId: att.itemId, name: att.name,
          type: att.type, blob, createdAt: att.createdAt
        });
      }
      for (const [query, record] of Object.entries(payload.geocodes || {})) {
        await DB.setGeocode(query, record);
      }
      if (Array.isArray(payload.expenses)) {
        await DB.replaceExpenses(payload.expenses);
        currentExpenses = payload.expenses;
        setExpenseEnabled(true);
      }
      if (payload.meName && !getMeName()) {
        setMeName(payload.meName);
        const mi = document.getElementById("meNameInput");
        if (mi) mi.value = payload.meName;
      }
      applyExpenseVisibility();

      showBackupStatus(`✅ 가져오기 완료 (${new Date().toLocaleString("ko-KR")})`);
      renderChecklist();
      if (leafletMap) renderMap();
      if (currentItem) await renderAttachments(currentItem.id);
    } catch (err) {
      showBackupStatus("⚠️ 가져오기에 실패했어요. 올바른 백업 파일인지 확인해 주세요.");
    }
  });

  document.getElementById("exportGeoBtn")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("geoExportStatus");
    const all = await DB.getAllGeocodes();
    const lines = Object.entries(all)
      .filter(([query, rec]) => rec && !rec.failed && !(query in GEO_COORDS))
      .map(([query, rec]) => `  "${query.replace(/"/g, "\\\"")}": { lat: ${rec.lat}, lng: ${rec.lng} },`);

    if (!lines.length) {
      statusEl.textContent = "새로 추가할 좌표가 없어요. (이미 다 GEO_COORDS에 있거나, 아직 확인된 곳이 없어요)";
      statusEl.hidden = false;
      return;
    }
    const snippet = lines.join("\n");
    const askText = `이 여행의 data.js 파일과 함께 새 대화에서 Claude에게 붙여넣고 "GEO_COORDS에 추가해줘"라고 요청하세요. Claude가 반영한 data.js를 돌려주면, 그 파일을 GitHub 레포에 재업로드하면 모든 기기에서 공유돼요.`;
    try {
      await navigator.clipboard.writeText(snippet);
      statusEl.textContent = `✅ ${lines.length}곳 좌표를 복사했어요. ${askText}`;
    } catch (e) {
      // 클립보드 접근 실패 시 화면에 직접 표시해서 수동으로 복사 가능하게 (안내 문구를 위에 붙여서 표시)
      statusEl.textContent = `아래 내용을 선택해 복사한 뒤, ${askText}\n\n${snippet}`;
    }
    statusEl.hidden = false;
  });

  // ---------------- 진입 경로 확인 (Bella Travel 아카이브 연동, shared-core/entry-source.js로 이식) ----------------
  isArchiveEntry = SharedCore.entrySource.initEntrySource({ archiveUrl: ARCHIVE_URL });
  if (isArchiveEntry) {
    // 허브를 거쳐 들어온 기기는 (아직 설정한 적 없다면) 가계부를 자동으로 켠다. 이후 홈화면 아이콘으로 직접 열어도 유지되고,
    // 설정의 "가계부 사용" 토글로 끌 수 있다. (iOS는 홈화면 앱 저장소가 Safari와 분리되므로 거기서는 토글을 직접 켜면 된다)
    try { if (localStorage.getItem(EXPENSE_ENABLED_KEY) === null) setExpenseEnabled(true); } catch (e) {}
    // 지도 좌표 복사는 나만 보기 전용 - 공유자에게는 의미 없는 개발용 기능
    const geoCopySection = document.getElementById("geoCopySection");
    if (geoCopySection) geoCopySection.hidden = false;
  }
  initExpenseSettings();
  applyExpenseVisibility();
  if (!FEATURES.visitJapan) document.getElementById("qrQuickCard")?.remove();

  // ---------------- 팝업 닫기 일괄 바인딩 ----------------
  bindCardClose("modal", () => { currentItem = null; });
  bindCardClose("viewer");
  bindCardClose("transitCard");
  bindCardClose("qrCard");
  bindCardClose("phraseCard");
  bindCardClose("storeCard");
  bindCardClose("shoppingCard");
  bindCardClose("foodCard");
  bindCardClose("expenseCard");

  // ---------------- 아코디언 열림/닫힘 상태 기억 ----------------
  // 사용자가 마지막으로 펼치거나 접어둔 상태를 기기에 저장해두고, 다음 접속(새로고침 포함) 시 그대로 복원한다.
  // 저장된 상태가 없는 아코디언은 기본값(닫힘)으로 시작한다.
  const ACCORDION_STATE_KEY = (window.TRIP_ID || "fukuoka-trip") + "-accordion-state";
  (function initAccordionMemory() {
    let states = {};
    try { states = JSON.parse(localStorage.getItem(ACCORDION_STATE_KEY)) || {}; } catch (e) {}

    document.querySelectorAll(".checklist-panel > details.accordion[id]").forEach((el) => {
      if (Object.prototype.hasOwnProperty.call(states, el.id)) {
        el.open = states[el.id];
      }
      el.addEventListener("toggle", () => {
        states[el.id] = el.open;
        try { localStorage.setItem(ACCORDION_STATE_KEY, JSON.stringify(states)); } catch (e) {}
      });
    });
  })();

  // ---------------- 초기화 ----------------
  renderDayTabs();
  renderTimeline();

  // ---------------- 안드로이드 "앱 설치" 배너 ----------------
  // 안드로이드 크롬은 PWA 설치 조건을 만족하면 beforeinstallprompt 이벤트를 쏘는데,
  // 기본 동작(브라우저 자체 미니 인포바)을 막고 이 이벤트를 저장해뒀다가
  // 우리 쪽 UI(하단 배너)의 "설치하기" 버튼을 눌렀을 때만 표준 설치창을 띄운다.
  // iOS Safari는 이 API 자체가 없어서 배너가 뜨지 않으며, 기존처럼 "홈 화면에 추가"를 수동 안내해야 한다.
  let deferredInstallPrompt = null;
  let installBannerDismissed = false;

  function showInstallBanner() {
    if (installBannerDismissed || !deferredInstallPrompt) return;
    let banner = document.getElementById("installBanner");
    if (banner) { banner.hidden = false; return; }
    banner = document.createElement("div");
    banner.id = "installBanner";
    banner.className = "install-banner";
    banner.innerHTML = `
      <span>홈 화면에 앱으로 설치할 수 있어요</span>
      <div class="install-banner-actions">
        <button type="button" id="installBannerDismiss" aria-label="닫기">✕</button>
        <button type="button" id="installBannerBtn">설치하기</button>
      </div>`;
    document.body.appendChild(banner);
    banner.querySelector("#installBannerDismiss").addEventListener("click", () => {
      installBannerDismissed = true; // 이번 방문에서는 다시 띄우지 않음
      banner.hidden = true;
    });
    banner.querySelector("#installBannerBtn").addEventListener("click", async () => {
      banner.hidden = true;
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt(); // 표준 설치 확인창 (브라우저 제공)
      await deferredInstallPrompt.userChoice; // 수락/거절 여부와 무관하게 프롬프트는 1회용
      deferredInstallPrompt = null;
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallBanner();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    const banner = document.getElementById("installBanner");
    if (banner) banner.hidden = true;
  });

  // ---------------- 서비스워커 등록 / 업데이트 알림 (shared-core/sw-lifecycle.js로 이식) ----------------
  SharedCore.swLifecycle.initServiceWorker();
})();
