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

## 2026-07-16 [Antigravity] — 모바일 코드베이스 최적화 및 룰 정확도 디버깅

- **SafeArea 간섭 해결**: `CameraScreen.tsx`에서 노치 디바이스의 상단 상태바 및 하단 홈바 인디케이터에 맞게 `useSafeAreaInsets`를 반영하여 UI 겹침 이슈 방지.
- **렌더링 성능 최적화 (프레임 드롭 방지)**: `onResults` 호출이 매 프레임 일어날 때, 무릎 각도 변화폭이 미미하고 핵심 상태(카운트, 피드백 문구, 운동 상태) 변화가 없을 경우 React State 업데이트(`setAnalysis`)를 생략하는 스로틀링 필터 적용. 이를 통해 로우엔드 기기에서의 렌더링 병목 차단.
- **측면 운동 룰 정확도 디버깅**: `squatAnalyzer.ts`에서 가시성(`visibility`)이 현저히 떨어지는 다리 각도를 스쿼트 판단 알고리즘에서 동적으로 배제하고, 잘 보이는 쪽 다리 각도를 지표로 채택하도록 보정. 또한 측면에서 수행 시 원근/가려짐으로 인한 무릎 모임(Knee Collapse) 오경고를 차단하기 위해 양측 무릎 가시성이 확보된 경우에만 모임 감지가 동작하도록 제한.
- **TTS 오디오 덕킹 적용**: `tts.ts`에서 TTS 음성이 송출될 때 기기 배경음악 볼륨이 자동으로 감쇄되도록 `Tts.setDucking(true)` 연동.

## 2026-07-16 [Claude] — Antigravity 작업 이어받기 전 비판적 검토 + 자세 피드백 확장

- 사용자 요청으로 Antigravity의 변경사항(위 항목)을 diff만 보고 넘기지 않고 전체 파일을 다시 읽고 검토함. 세 변경 모두 실제 버그 없이 타당하게 구현된 것으로 확인 (SafeArea 안전, 스로틀링이 count 변화 시 항상 통과, 무릎 모임 감지가 정면 촬영 기본 케이스엔 영향 없음, `setDucking`은 실제 API이고 Windows만 미지원). 별도로 발견한 리스크: `usePoseDetection`의 `onResults`는 `NativeEventEmitter` 기반이라 JS 스레드에서 안전하게 실행되는 걸 라이브러리 소스로 확인했지만, 이 프로젝트는 New Architecture(Bridgeless)라 실제 기기에서 문제없이 동작하는지는 기기 없이는 검증 불가 — 미확인 상태로 남음.
- `squatAnalyzer.ts`에 자세 피드백 확장: 상체 전방 숙임(엉덩이 각도), 좌우 골반 기울어짐, 고개 처짐(코-어깨 라인 비교), 스탠스 폭(발목너비 vs 어깨너비) 체크 추가. 카운팅 로직(this.poseState/count)은 기존 그대로 먼저 실행되고, 새 체크들은 그 뒤에 비차단(non-blocking) 방식으로 표시/음성 피드백 문구만 우선순위대로 덮어씀 — 무릎 모임 감지만 기존처럼 카운팅을 막음.
- **의도적으로 뺀 것**: 무릎이 발끝보다 나가는지(knee-over-toe), 발뒤꿈치 들림(heel-lift). 둘 다 2D 랜드마크만으로 판단하려면 카메라 기준 사용자가 어느 방향을 보고 있는지 알아야 하는데, 방향을 잘못 가정하면 정반대로(맞는 자세를 틀렸다고) 코칭하게 됨 — 안 하느니만 못해서 제외. 나머지 임계값(0.5, 120, 0.75, 140, 50, 0.35, 0.9, 0.6, 1.8 등)도 전부 1차 추정치라 실기기 테스트 후 튜닝 필요.
