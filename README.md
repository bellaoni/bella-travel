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

이 레포는 **GitHub Actions**로 자동 배포됩니다(`.github/workflows/deploy.yml`, fukuoka-trip과 동일 방식).
main 브랜치에 커밋하면 자동으로 빌드·배포되고, `sw.js`의 캐시 버전도 커밋마다 자동 갱신되니
버전 숫자를 직접 손댈 필요는 없습니다.

**최초 1회만 설정**
1. **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정
   (기존 "Deploy from a branch(main/root)" 방식이었다면 이 설정으로 바꿔야 함)
2. 전환 직후 1~2회는 기존 수동 배포 결과와 비교해 정상 동작을 확인한 뒤, 그 다음부터는
   완전히 Actions 배포만 사용합니다 (급격한 전환 지양).

**파일 올릴 때마다(수정 반영)**: 폴더(`index.html`, `style.css`, `app.js`, `trips-registry.js`,
`scaffold.html`, `manifest.json`, `sw.js`, `icon-*.png`, `.github/workflows/deploy.yml`) 그대로 커밋 → **Actions** 탭에서
배포 완료 확인 (보통 1~2분). (`scaffold.html`은 `sw.js`의 오프라인 캐시 대상에서는 제외되어 있습니다 — 새 레포 생성은 온라인이 항상 필요하기 때문)

## 새 여행 추가하는 법

수동으로 파일을 복사·find-replace하지 않고, 이 허브에 포함된 `scaffold.html` 생성기를 사용합니다.

1. 이 허브 메인화면의 **"+ 새 여행 만들기"** 버튼(또는 `/bella-travel/scaffold.html` 직접 접속)으로 들어갑니다.
2. TRIP_ID(레포 이름) · 여행 제목 · 홈화면 짧은 이름 · 설명 · 공항명/도착역명 · 시작일/종료일 · 대표 아이콘(선택)을 입력하고 **"📦 파일 생성하고 다운로드"**를 누릅니다.
   - TRIP_ID가 `db.js`(IndexedDB 이름) · localStorage 키 · 백업파일 식별자에 전부 자동 반영되므로 다른 여행 앱과 데이터가 섞이지 않습니다.
   - `GEO_COORDS`는 빈 상태로 생성되고, "공항 → 시내" 교통정보 카드도 입력한 공항/역명 기준 템플릿으로 자동 채워집니다(더 이상 마크업 직접 수정 불필요).
   - `app.js`의 `ARCHIVE_URL`은 `/bella-travel/`이 기본값으로 유지됩니다.
3. GitHub에서 새 레포를 만들고(이름 = 위에서 입력한 TRIP_ID와 동일하게), 다운로드된 zip을 압축 해제한 뒤 "Add file → Upload files"로 폴더째 업로드합니다(`shared-core`, `.github/workflows` 하위폴더 구조 유지).
4. Settings → Pages에서 GitHub Actions로 배포를 활성화합니다.
5. 일정·장소·교통정보 등 실제 콘텐츠는 새 레포의 `data.js`에 채워 넣습니다(`GEO_COORDS`도 이때 실제 좌표로 채웁니다).
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
  emoji: "🍡"
}
```

7. `bella-travel` 레포에 이 파일만 다시 업로드하면 목록·통계·연도필터에 자동 반영됩니다.

## shared-core 동기화

`shared-core/`(popup.js, theme.js 등)는 레포마다 파일 복사본으로 존재하며, 자동 동기화 시스템은 없습니다.
**`scaffold.html`(이 허브 레포 내)이 원본(정본)**이며, fukuoka-trip을 포함한 다른 모든 레포의 shared-core는
생성 시점 정본의 스냅샷입니다. 정본이 갱신되면 이미 생성된 여행 레포에는 수동으로 반영해야 하며, 새 레포를
만들기 전에는 각 레포의 shared-core와 정본 사이에 diff가 없는지 확인하는 것을 권장합니다.

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
