# Bella Travel — 개인 여행 아카이브 (허브)

## 구조 (멀티 레포)

여행마다 독립된 GitHub Pages 레포를 만들고, 이 `bella-travel` 레포는 **목록 · 통계만 담당하는 허브**입니다.
여행 PWA 코드를 이 레포 안에 넣지 않습니다 — 각자 자기 레포에 그대로 둡니다.

```
username.github.io/bella-travel/     ← 이 레포. 나만 사용 (아무에게도 링크 공유 안 함)
username.github.io/fukuoka-trip/     ← 별도 레포. 동행자 공유용
username.github.io/jeju-trip/        ← 별도 레포. 동행자 공유용
username.github.io/osaka-trip/       ← 별도 레포. 동행자 공유용
```

같은 `username.github.io` 도메인 아래 있는 여러 프로젝트 사이트이기 때문에,
서로 다른 레포라도 `sessionStorage` 기반 홈 버튼 로직이 정상적으로 동작합니다
(sessionStorage는 경로가 아니라 도메인 단위로 공유돼요).

## 배포

이 레포 폴더(`index.html`, `style.css`, `app.js`, `trips-registry.js`) 그대로
GitHub Pages(Settings → Pages → main / root)로 올리면 됩니다.

## 새 여행 추가하는 법

1. 새 여행은 `fukuoka-trip`을 복사해서 **새 레포**로 만듭니다 (예: `osaka-trip`).
2. `index.html` 맨 위 인라인 스크립트의 `window.TRIP_ID = "fukuoka-trip";`를 새 레포 이름(예: `"osaka-trip"`)으로 바꿉니다.
   - IndexedDB 이름(db.js) · 테마/아코디언 localStorage 키 · 백업파일 식별자(app.js)가 전부 이 값 하나에서 자동으로 파생되므로, 이 한 줄만 바꾸면 같은 도메인의 다른 여행 앱과 데이터가 섞이지 않습니다. (이 줄을 빠뜨리면 두 앱이 같은 IndexedDB를 공유하게 되니 꼭 확인하세요.)
3. 그 레포 안 `data.js`(일정), `index.html`(`<title>`/`<h1>`/apple-mobile-web-app-title), `manifest.json`(name/short_name/description)을 새 여행 내용으로 바꿉니다.
   - ⚠️ `data.js`의 `GEO_COORDS`/`GEO_SEARCH_QUERY`는 반드시 비운 뒤 새로 채웁니다. 지우지 않으면 이전 여행의 장소 좌표가 죽은 코드로 계속 남습니다.
   - ⚠️ `index.html`의 "공항 → 시내" 교통 카드는 다른 참고정보와 달리 `data.js`가 아니라 마크업에 직접 쓰여 있어서 (예: "후쿠오카 공항 → 하카타역") 반드시 손으로 새 여행 내용으로 바꿔야 합니다.
4. 그 레포의 `app.js` 맨 위 `ARCHIVE_URL`이 `/bella-travel/`로 되어 있는지 확인합니다 (기본값 그대로면 OK).
5. 새 레포를 GitHub Pages로 배포합니다.
6. 이 `bella-travel` 레포의 `trips-registry.js`에 새 여행 정보를 한 항목 추가합니다:

```js
{
  id: "osaka-trip",
  title: "오사카 3박 4일",
  country: "일본",
  cities: ["오사카", "교토"],
  startDate: "2027-03-10",
  endDate: "2027-03-13",
  url: "/osaka-trip/",       // 반드시 절대경로("/레포명/")
  emoji: "🍡",
  shared: true
}
```

7. `bella-travel` 레포에 이 파일만 다시 업로드하면 목록·통계·연도필터에 자동 반영됩니다.

## 홈 버튼 동작 원리

- Bella Travel에서 여행 카드 클릭 → `해당레포URL/?source=archive`로 이동
- 여행 PWA가 이 파라미터를 감지해 `sessionStorage`에 저장하고 주소창에서는 파라미터를 지움
- 이 세션 플래그가 있을 때만 여행 PWA 헤더에 홈(←) 버튼이 나타나 Bella Travel로 돌아갈 수 있음
- 동행자가 공유 링크(파라미터 없음)로 직접 접속하면 플래그가 없어 홈 버튼이 보이지 않음
- 탭을 완전히 닫으면 세션 플래그는 사라짐 — 다시 아카이브를 거쳐 들어오면 됨

## PWA로 설치하기

이 허브도 이제 `manifest.json` + `sw.js`가 있는 PWA예요. 배포 후 브라우저에서
"홈 화면에 추가"를 하면 아이콘으로 설치되고, 오프라인에서도 마지막으로 본 목록이 뜹니다.
(여행 PWA들과 마찬가지로 캐시 우선 전략이라 데이터를 자주 바꾼 직후엔 새로고침이 필요할 수 있어요.)

## 참고

- 각 여행 레포는 서로 독립적이라, 하나의 URL/공유 상태가 다른 레포에 영향을 주지 않습니다.
- GitHub Pages는 정적 호스팅이라 완전한 접근 제한(로그인)은 불가능합니다. 이 구조는
  "실수로 다른 여행이 보이지 않게" 하는 UX이며, 보안 수준의 차단이 아닙니다.
