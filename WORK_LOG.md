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
- 임계값이 실제 cm 단위냐는 질문에 답변: 깊이 센서가 없어 화면상 정규화 좌표만 쓰므로 절대 거리는 알 수 없고, 몸의 다른 부위(어깨너비, 발목너비 등) 대비 비율로만 판단 중. MediaPipe의 `worldLandmarks`(미터 단위 추정치)로 바꾸면 좀 더 절대값에 가까워지지만 여전히 추정치이고 코드 복잡도만 올라가서, 사용자 확인 후 비율 기준 유지하기로 함.

## 2026-07-16 [Claude] — 카메라 설치 가이드(온보딩) 화면 추가

- `SetupGuideScreen.tsx` 신설: 카메라 거리(2~3m)/방향(정면 촬영 권장, 측면은 무릎 모임 감지 등 일부 피드백 제한)/높이(허리~가슴, 수직 거치)/조명/복장을 텍스트+SVG 다이어그램(폰-사람 간 거리, 높이 표시)으로 안내. react-native-svg로 그림, 별도 이미지 에셋 없음.
- `App.tsx`가 앱 시작 시 이 가이드를 먼저 보여주고 "시작하기"를 누르면 `CameraScreen`으로 전환하도록 로컬 state로만 처리 (2개 화면뿐이라 react-navigation 등 별도 라이브러리 도입 안 함). `CameraScreen` 상단에 `?` 버튼을 추가해 언제든 가이드로 돌아갈 수 있게 함.
- "다시 보지 않기" 같은 영구 저장은 아직 없음 (AsyncStorage 등 필요) — 필요하면 추후 추가.

## 2026-07-16 [Antigravity] — 클로드 추가 자세 피드백 및 안내 화면 결함 수선

- **고개 처짐 감지 로직 정상화**: `squatAnalyzer.ts`에서 Y축 방향성(아래로 갈수록 값 증가) 및 코와 어깨의 관계를 고려하지 않고 작성된 `nose.y - shoulderMidY > shoulderWidth * 0.9` 부등식 조건(절대 활성화될 수 없음)을 `shoulderMidY - nose.y < shoulderWidth * 0.25`로 변경하여, 목이 아래로 구부러질 때 정상적으로 시선 경고가 트리거되도록 수정.
- **골반 기울임 오경고 방지**: 3/4 뷰나 측면 뷰에서 엉덩이 너비(`hipWidth`)가 perspective compression에 의해 급격히 작아져 엉덩이가 비뚤어지지 않았는데도 경고가 울리는 버그 차단. 골반 너비가 어깨 너비의 60% 이상인 정면 구도(`hipWidth > shoulderWidth * 0.6`)일 때만 기울임 상태를 검출하도록 가드 조건 삽입.
- **설치 가이드 SVG 텍스트 배치 개선**: `SetupGuideScreen.tsx` 다이어그램에서 휴대폰 및 인물의 가로축 좌표(`phoneX = 60`, `personX = 270`)를 우측으로 시프트해 화면 왼쪽 경계에서 글자가 잘려 나오는 현상 방지. 또한 SVG `<Text>` 내에서 `\n` 문자가 동작하지 않아 뭉개지던 "허리\n높이" 라벨을 2개의 개별 `<SvgText>` 태그로 분리 배치하여 선명하게 줄바꿈 출력 완료.

## 2026-07-17 [Claude] — Android 빌드 에러 수정 (react-native-tts jcenter)

- 사용자가 Android Studio에서 빌드 시 `Could not find method jcenter()` 에러 보고. 원인은 `react-native-tts@4.1.1` 패키지 자체의 `android/build.gradle`에 남아있던 2017년식 `buildscript { repositories { jcenter() } }` 블록 — JCenter는 2021년에 서비스 종료됐고 최신 Gradle엔 `jcenter()` 메서드 자체가 없음. 이 블록은 오토링킹되는 최신 RN 환경에서 애초에 불필요(루트 프로젝트가 이미 AGP를 적용함)해서 통째로 제거.
- `node_modules`는 재설치 시 사라지므로 `patch-package`로 영구 패치 (`patches/react-native-tts+4.1.1.patch`) + `package.json`에 `postinstall: patch-package` 추가. 패치 생성 중 Android Studio가 `node_modules/react-native-tts/android/.gradle/`에 남긴 빌드 캐시 파일들이 diff에 잘못 끼어들어서, 캐시 디렉토리 삭제 후 재생성해 순수 코드 diff만 남김.
- `git remote add origin` (SSH — `gh` HTTPS 토큰이 만료돼 있어서 SSH로 전환) 후 `github.com/JoeCarloss/RoomPT`로 첫 푸시 완료. 원격이 비어있어 충돌 없음.

## 2026-07-17 [Claude] — init.md를 현재 아키텍처에 맞게 재작성

- 원본 init.md는 서버(Node.js/Spring Boot) + WebSocket + PostgreSQL/Redis + 클라우드 LLM(GPT-4o/Claude) 기반 기획이었는데, 실제로는 서버 없음/LLM 없음/React Native bare CLI로 완전히 다른 방향으로 가 있어서 문서가 실제 상태와 크게 어긋나 있었음.
- 아키텍처, 기술 스택, 핵심 기능(룰 기반 피드백 항목 구체적으로 명시), 마일스톤 섹션을 현재 구현 상태에 맞게 전면 재작성. LLM/대화형 코칭/운동 기록은 "보류" 단계로 명시하고 왜 보류 중인지(서버 없는 구조에서 API 키 노출 문제 등) 이유를 남겨둠. 웹 PoC와 mobile/ RN 앱이 둘 다 저장소에 있다는 사실도 문서에 명시.
- 사용자가 다른 PC에서도 같은 구조로 작업할 예정이라고 해서 init.md에 "여러 기기에서 개발 환경 설정" 섹션 추가 (클론 방법, JDK 17 필요성, `npm install` 시 postinstall이 patch-package 자동 실행한다는 점, iOS는 `.xcworkspace`로 열어야 한다는 점 등 이번 세션에서 실제로 겪은 함정들 위주로 기록).

## 2026-07-17 [Claude] — 운동 기록 저장 기능 추가 (온디바이스, AsyncStorage)

- `@react-native-async-storage/async-storage` 도입 — 서버 없는 구조 유지, 기록은 기기 안에만 저장. `workoutStorage.ts` 서비스 신설 (저장/조회/개별·전체 삭제, 손상된 JSON은 빈 목록으로 폴백).
- 기록 단위는 "세션": `CameraScreen`에 **완료** 버튼 추가 → 현재 횟수·운동 시간(첫 1회 완료 시점부터 측정)을 저장하고 카운터 리셋. 0회일 땐 저장 안 됨(Alert 안내). 횟수는 스로틀링된 React state가 아니라 `SquatAnalyzer`에 `getCount()`를 추가해 소스에서 직접 읽음.
- `HistoryScreen` 신설: 총 세션/누적 횟수 통계 + 기록 목록(FlatList) + 삭제. 화면 전환은 기존 결정대로 react-navigation 없이 `App.tsx` 로컬 state(`'guide' | 'camera' | 'history'`)로 처리.
- **알려진 한계 (기존 동작과 동일)**: 카메라 화면에서 기록/가이드 화면으로 이동하면 `CameraScreen`이 언마운트되어 진행 중이던 카운트가 사라짐 — 가이드 `?` 버튼도 원래 같은 동작이라 일관성 유지 차원에서 그대로 둠. 운동 중엔 완료를 먼저 누르면 됨.
- iOS `pod install` 실행해 `Podfile.lock`/`project.pbxproj` 갱신 커밋 (다른 PC에서 `pod install`만 다시 돌리면 됨). `Gemfile.lock`도 이번에 처음 커밋됨(이 맥에서 `bundle install` 최초 실행). 기기 없는 환경이라 이번에도 tsc/eslint까지만 검증 — 실기기에서 저장/조회 동작 확인 필요.

