# 작업 로그

Claude와 Antigravity IDE가 같은 로컬 저장소를 함께 작업합니다. 커밋 메시지 앞에 `[Claude]` / `[Antigravity]` 접두사를 붙여 `git log`에서 서로 뭘 했는지 구분합니다. 이 파일에는 커밋 로그로는 드러나지 않는 맥락(의도, 결정 이유)만 짧게 남깁니다.

---

## 2026-07-16 [Claude]

- git 저장소 초기화 (로컬 이력 추적 용도, 단일 PC 작업이라 remote 없음)
- Phase 1(MediaPipe 연동 + 룰 기반 스쿼트 판별)이 이미 App.tsx에 구현되어 있음을 확인 — Antigravity가 먼저 작업한 것으로 보임
- package.json에 Tailwind 관련 패키지가 없는데 App.tsx는 Tailwind 유틸리티 클래스(flex, grid-cols-12 등)를 사용 중 → 실제로는 스타일이 전혀 적용되지 않는 버그였음. tailwindcss/postcss/autoprefixer 설치, tailwind.config.js content 경로 설정, index.css에 @tailwind 지시어 추가로 수정. App.tsx의 오타(`min-height-screen` → `min-h-screen`, 유효하지 않은 Tailwind 클래스였음)도 수정.
- dev 서버(`npm run dev`)로 CSS 컴파일 결과 확인 완료 (grid-cols-12, lg:col-span-7 등 정상 생성). 이 환경엔 브라우저 스크린샷 도구가 없어 시각적 확인은 못 함 — 사용자가 브라우저에서 직접 확인 필요.

## 2026-07-16 [Claude] — 네이티브 앱(React Native)으로 전환

- 사용자가 웹이 아닌 진짜 안드로이드/아이폰 앱을 원한다는 걸 확인. Expo → 사용자가 "Expo 쓰지 말고" 요청해 **bare React Native CLI**로 최종 결정 (`mobile/` 서브디렉토리, 웹 PoC는 루트에 그대로 유지). 이 맥에 Xcode 26.5 / CocoaPods / Android SDK가 이미 설치돼 있어 로컬 iOS·Android 빌드 모두 가능함을 확인.
- 포즈 인식 라이브러리로 처음엔 사용자가 고른 대로 Google ML Kit 래퍼(`react-native-vision-camera-mlkit`)를 설치했으나, 실제 코드를 까보니 **README 로드맵에 포즈 감지가 "in progress"로 명시돼 있고 TS export에도 포즈 관련 함수가 전혀 없는 미완성 패키지**였음. 사용자에게 알리고 `react-native-mediapipe`(cdiddy77, 0.6.0)로 교체 — 이 패키지는 실제 `poseDetection` 모듈이 구현돼 있음을 코드 레벨에서 확인 후 결정.
- `react-native-vision-camera`는 최신 v5가 아니라 **v4.7.3에 고정**. v5는 Nitro Modules 아키텍처로 전환됐는데, mediapipe/ML-Kit 커뮤니티 프레임 프로세서 플러그인들은 모두 구세대 `react-native-worklets-core` 기반이라 v5와 호환 안 됨.
- `react-native-reanimated`는 실제로 vision-camera나 mediapipe 코드 어디에서도 import되지 않는 걸 확인해 제거함 (Reanimated 4가 요구하는 별도 peer `react-native-worklets`(Software Mansion, worklets-core와는 다른 패키지)와의 불필요한 충돌을 피함).
- MediaPipe pose_landmarker_lite.task 모델 파일(Google 공식 공개 호스팅)을 다운로드해 `mobile/assets/models/`에 두고, `react-native-asset` CLI로 iOS/Android 네이티브 프로젝트에 자동 링킹. Android는 `assets/custom/` 하위에 들어가 모델 경로 문자열이 플랫폼마다 다름(Android: `custom/pose_landmarker_lite.task`, iOS: `pose_landmarker_lite.task`) — `CameraScreen.tsx`에서 `Platform.OS` 분기 처리.
- 웹 PoC(`src/App.tsx`)의 관절 각도 계산 + 스쿼트 상태 머신(UP/DOWN/WARNING, 무릎 모임 감지, 카운트)을 `mobile/src/squat/squatAnalyzer.ts`로 그대로 포팅. MediaPipe Tasks의 `KnownPoseLandmarks` 명명 규칙이 웹 버전 인덱스(11,12,23,24,25,26,27,28)와 동일한 33포인트 BlazePose 스킴이라 거의 1:1로 이식됨.
- 이 컨테이너 환경엔 모바일 기기/에뮬레이터가 없어 카메라·포즈 인식 자체는 실행 못 함. `npx tsc --noEmit`, `eslint`만 통과 확인. 실제 동작은 사용자가 `npm run ios` / `npm run android`로 직접 확인 필요.
