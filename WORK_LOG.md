# 작업 로그

Claude와 Antigravity IDE가 같은 로컬 저장소를 함께 작업합니다. 커밋 메시지 앞에 `[Claude]` / `[Antigravity]` 접두사를 붙여 `git log`에서 서로 뭘 했는지 구분합니다. 이 파일에는 커밋 로그로는 드러나지 않는 맥락(의도, 결정 이유)만 짧게 남깁니다.

---

## 2026-07-16 [Claude]

- git 저장소 초기화 (로컬 이력 추적 용도, 단일 PC 작업이라 remote 없음)
- Phase 1(MediaPipe 연동 + 룰 기반 스쿼트 판별)이 이미 App.tsx에 구현되어 있음을 확인 — Antigravity가 먼저 작업한 것으로 보임
- package.json에 Tailwind 관련 패키지가 없는데 App.tsx는 Tailwind 유틸리티 클래스(flex, grid-cols-12 등)를 사용 중 → 실제로는 스타일이 전혀 적용되지 않는 버그였음. tailwindcss/postcss/autoprefixer 설치, tailwind.config.js content 경로 설정, index.css에 @tailwind 지시어 추가로 수정. App.tsx의 오타(`min-height-screen` → `min-h-screen`, 유효하지 않은 Tailwind 클래스였음)도 수정.
- dev 서버(`npm run dev`)로 CSS 컴파일 결과 확인 완료 (grid-cols-12, lg:col-span-7 등 정상 생성). 이 환경엔 브라우저 스크린샷 도구가 없어 시각적 확인은 못 함 — 사용자가 브라우저에서 직접 확인 필요.
