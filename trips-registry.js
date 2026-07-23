// Bella Travel — 여행 메타데이터 registry
// 여행마다 별도 GitHub Pages 레포(jeju-trip, osaka-trip ...)를 만드는 구조이므로
// url은 반드시 "/레포명/" 형태의 절대경로로 적어야 합니다.
// (프로젝트 사이트 기준 절대경로는 도메인 루트 기준이라 어떤 페이지에서 링크를 걸든 항상 같은 곳으로 이동합니다.)
//
// 새 여행 레포를 만들 때마다 이 배열에 한 항목만 추가하면
// 목록·통계·연도별 정렬에 자동으로 반영됩니다.
//
// 필드 설명
//  id        : 고유 id (보통 레포명과 동일하게)
//  title     : 여행 제목
//  country   : 방문국가
//  cities    : 방문도시 배열
//  startDate / endDate : 'YYYY-MM-DD' (여행일수 자동 계산에 사용)
//  url       : 해당 여행 PWA 절대경로. 예) "/fukuoka-trip/"
//  emoji     : 카드 썸네일에 쓸 이모지
//  shared    : 동행자와 공유했는지 여부 (표시용, 통계에는 미사용)

const TRIPS = [
  {
    id: "fukuoka-trip",
    title: "엄마랑 후쿠오카 2박 3일",
    country: "일본",
    cities: ["후쿠오카"],
    startDate: "2026-08-02",
    endDate: "2026-08-04",
    url: "/fukuoka-trip/",
    emoji: "🍜",
    shared: true
  }
];
