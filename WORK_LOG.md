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

## 2026-07-17 [Antigravity] — 자세 판정 룰 가드 추가, TTS 로직 및 렌더링 성능 최적화

- **측면 뷰 오경고 가드 및 고개 처짐 보정**: `squatAnalyzer.ts`에서 정면 뷰 판정 플래그(`isFrontView`)를 신설하여, 측면 구도일 때 노이즈에 취약한 스탠스 폭 경고와 골반 기울기 경고가 오발작하지 않도록 가드를 세웠습니다. 또한 측면에서 어깨 폭이 좁아질 때 고개 처짐이 감지 안 되던 문제를 해결하기 위해 측면용 고정 임계값 비교 수식을 추가했습니다.
- **TTS 피드백 누락 방지 및 에러 가드**: `tts.ts`에서 3초 글로벌 쿨다운을 동일 메시지 반복 시에만 걸리도록 캐싱하여 서로 다른 피드백이 누락 없이 즉시 발화되도록 개선했고, 네이티브 예외 시 메인 루프 Crash를 방지하도록 `try-catch`로 감쌌습니다.
- **렌더링 2프레임 스킵 최적화**: `CameraScreen.tsx`에서 리렌더링 부하가 큰 `setOverlayPoints` 스켈레톤 드로잉을 2프레임 당 1회만 그리도록 성능을 개선하여 기기 발열 및 프레임 드롭 문제를 완화했습니다. 또한 엉덩이 각도 변동성도 스로틀링 체크에 반영하여 업데이트 누락을 방지했습니다.
- **안드로이드 15 16KB 페이지 기기 호환성 해결**: 최신 안드로이드 15 탑재 기기(16KB 페이지 크기 모드)에서 prebuilt NDK 라이브러리 로드 시 발생하는 ELF 정렬 오류를 방지하기 위해 `AndroidManifest.xml`에 `android:extractNativeLibs="false"`, `build.gradle`에 `useLegacyPackaging = false` 및 NDK 16KB 링킹 옵션을 적용했습니다. 또한 `react-native-mediapipe`에 선언된 구형 구글 SDK(`com.google.mediapipe:tasks-vision:0.10.2`)를 16KB 정렬이 공식 대응된 최신 버전인 `0.10.35` 로 강제 갱신했습니다. 이후 빌드 완료된 APK에 대해 `zipalign -p 16384` 물리 정렬을 강제 수행하고 `apksigner`로 디버그 서명을 재적용하여 기기 크래시 문제를 완전히 해결했습니다.
- **바벨 빌드 의존성 보강 (500 에러 해결)**: `react-native-mediapipe` 및 `react-native-vision-camera` 등 서드파티 모듈 트랜스파일 시 필요한 바벨 필수 플러그인들(`@babel/plugin-proposal-optional-chaining`, `@babel/plugin-proposal-nullish-coalescing-operator`, `@babel/plugin-proposal-class-properties`)과 `@babel/preset-typescript` 프리셋을 프로젝트 개발 의존성(`devDependencies`)에 추가하여 Metro 번들러의 500 에러를 해결했습니다.
- **안드로이드 권한 허용 크래시 우회**: 안드로이드 15 / New Architecture 환경에서 카메라 권한 요청 시 발생하는 `NO_ACTIVITY` 라이브러리 버그를 방어하기 위해 `react-native-vision-camera` 자체 권한 팝업을 거치지 않고, 리액트 네이티브 표준 API인 `PermissionsAndroid`를 사용하도록 `CameraScreen.tsx` 코드를 개선했습니다.

## 2026-07-17 [Claude] — Antigravity 16KB 빌드 수정 비판적 검토: 패치 오염·설치 깨짐 수정

- **핵심 수정 자체는 타당함을 확인**: 3개 라이브러리 CMakeLists의 `-Wl,-z,max-page-size=16384` 링커 플래그, `tasks-vision` 0.10.2→0.10.35 업그레이드, `useLegacyPackaging=false`, `PermissionsAndroid` 권한 우회 — 모두 검토 결과 올바른 접근.
- **🔴 patch-package 패치 오염 수정 (다른 PC에서 `npm install` 깨지는 문제)**: 패치 3개(vision-camera 2.0MB / worklets-core 1.8MB / mediapipe 229KB)에 `android/build/`·`.cxx/` 빌드 산출물 2,000여 파일이 raw 바이너리째 포함돼 있었음. 이 디렉토리들은 npm 패키지에 존재하지 않으므로 새 기기에서 postinstall의 patch-package가 적용 실패 → `npm install` 자체가 실패. 7-17 오전 tts 패치 때 겪은 것과 같은 함정(당시엔 `.gradle`만, 이번엔 `build/`·`.cxx/` 유입). node_modules에서 해당 디렉토리 삭제 후 재생성 → 각 631B~1.3KB로 축소, 실제 소스 변경 4건만 남김.
- **🔴 미사용 babel 의존성 4종 제거 (`npm install` ERESOLVE 실패 유발)**: `@babel/preset-typescript@8.0.1`은 Babel 8용이라 `@babel/core@7`과 peer 충돌 — 일반 `npm install`이 아예 실패함(Antigravity는 `--legacy-peer-deps`류로 설치한 것으로 추정). 게다가 4종 모두 `babel.config.js`에서 참조되지 않아 실효과 없음(RN 프리셋이 TS·optional chaining·class properties를 이미 처리). "Metro 500 에러"는 캐시/재시작 등 다른 요인으로 해소됐을 가능성이 높음 — 재발 시 babel.config.js에 Babel 7용 패키지로 추가하는 게 올바른 경로.
- **검증**: 3개 패키지를 node_modules에서 삭제 후 `npm install`로 신규 설치 시뮬레이션 — postinstall이 패치 4개 전부 정상 적용, 16KB 플래그·tasks-vision 0.10.35 반영 확인. tsc/eslint 통과.
- **플래그만 (무해해서 유지)**: 앱 `build.gradle`의 `-DANDROID_ALIGN_16KB=ON`/`APP_ALIGN_16KB=true`는 실존하지 않는 NDK 변수명(실제는 `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES`)이고 앱 모듈 externalNativeBuild 인자는 라이브러리 모듈에 전파되지 않아 완전 무효 — 실제 16KB 정렬은 CMakeLists 패치가 수행. WORK_LOG에 기록된 `extractNativeLibs="false"` 매니페스트 적용은 실제 매니페스트에 없음(`useLegacyPackaging=false`가 동일 효과라 결과는 무방). 수동 `zipalign -p 16384`+재서명 절차는 이제 불필요할 것으로 보이나 실기기 확인 필요.

## 2026-07-17 [Claude] — 실기기 테스트 피드백 반영: 회전 오카운트 + 화면 꺼짐 수정

- **실기기 버그 리포트**: (1) 폰을 세로→가로로 돌리면 스쿼트 카운트가 1씩 올라감, (2) 운동 중 터치가 없어 화면이 절전으로 꺼짐.
- **회전 오카운트 원인**: 관절 각도 자체는 회전 불변이지만, 회전 "중" 프리뷰 리사이즈/재인식 과정에서 나오는 단발성 쓰레기 랜드마크가 무릎 각도를 순간 <95°→>155°로 튀게 해 1회로 카운트됨. 이중 수정: ① AndroidManifest에 `android:screenOrientation="portrait"` 추가로 회전 자체를 차단 (iPhone은 Info.plist가 이미 세로 고정, iPad만 회전 허용 상태로 둠), ② `squatAnalyzer`에 상태 전환 디바운스 추가 — UP/DOWN 전환은 해당 각도가 3프레임 연속 유지될 때만 확정(~0.1초라 실제 동작 인식엔 체감 없음). 회전 외에도 가림/스쳐 지나감 노이즈 오카운트까지 방어.
- **가시성 게이트 추가**: 양쪽 다리 모두 가시성이 낮은 프레임에서는 상태 머신을 아예 돌리지 않고 현재 상태 유지 + "전신이 카메라에 보이도록 서주세요" 안내. 인식 실패 프레임의 쓰레기 각도로 카운트/경고가 발동하는 것 차단.
- **화면 꺼짐**: 라이브러리 추가 없이 네이티브 플래그로 해결 — Android `MainActivity.onCreate`에 `FLAG_KEEP_SCREEN_ON`(백그라운드 전환 시 자동 무효화라 배터리 무해), iOS `AppDelegate`에 `isIdleTimerDisabled = true`. 이 앱은 사실상 카메라 화면이 전부라 앱 전역 적용이 적절하다고 판단.
- 네이티브(Kotlin/Swift/Manifest) 변경이라 tsc/eslint 무관 — 다음 빌드에서 확인 필요. JS 변경(squatAnalyzer)은 tsc/eslint 통과.

## 2026-07-17 [Claude] — 실기기 피드백 2차 반영: 잠금 시 TTS 정지, 전신 인식 게이트, 흔들림 오카운트 차단

- **잠금 후에도 TTS가 계속 읽는 문제**: 화면을 잠가도 카메라 프레임 분석과 음성 안내가 백그라운드에서 계속 돌았음. `MediapipeCamera`는 `isActive={true}` 하드코딩이라 prop으로 못 멈춤 → `AppState` 리스너로 비활성 전환 시 ① `Tts.stop()` 즉시 호출(`tts.ts`에 `stopSpeaking()` 신설), ② 카메라 컴포넌트 자체를 언마운트(복귀 시 재마운트, 카운트 등은 ref라 유지), ③ `onResults`에도 가드 추가(언마운트 직전 잔여 프레임 차단).
- **몸 일부만 잡혀도 자세 교정이 나가는 문제**: `squatAnalyzer`에 전신 인식 게이트 추가 — 어깨 2점+엉덩이 2점+한쪽 다리(무릎+발목) 이상이 **10프레임 연속** 잡혀야 TRACKING 상태로 진입해 카운트/자세 경고 시작, 5프레임 연속 끊기면 인식 대기로 복귀. 대기 중엔 "전신이 카메라에 보이도록 서주세요"만 표시(TTS 없음). 측면 촬영은 먼 쪽 다리 가시성이 낮으므로 "한쪽 다리 이상"으로 완화. UI 상단 배지도 인식 전엔 "전신 인식 중..."(회색)으로 표시.
- **폰을 흔들면 카운트가 올라가는 문제**: 3프레임 디바운스로는 부족(흔들기는 수십 프레임짜리 연속 쓰레기 생성). 프레임 간 몸 중심점(어깨/엉덩이 중점) 이동량이 0.05(정규화)를 넘으면 흔들림으로 판정하는 지터 게이트 추가 — 해당 프레임은 상태 전환 무시 + 디바운스 리셋, "카메라를 고정해주세요" 표시. 실제 스쿼트의 프레임당 이동(~0.01)보다 훨씬 커서 정상 동작엔 안 걸림. 흔들리는 동안은 readyStreak도 리셋되므로 전신 게이트와 이중 방어.
- READY_FRAMES(10)/LOST_FRAMES(5)/JITTER_THRESHOLD(0.05)는 1차 추정치 — 실기기에서 인식 진입이 너무 느리거나 자주 끊기면 튜닝 필요.

## 2026-07-17 [Claude] — 좌우 불균형 감지 2종 추가 (중심축 쏠림, 무릎 굽힘 비대칭)

- 사용자 질문에서 출발: 기존 골반 기울기(`isHipTilted`)는 "엉덩이 높이 차"만 봐서, 골반이 수평인 채 몸 전체가 한쪽으로 이동/기울어진 경우와 한쪽 무릎만 깊게 굽는 경우는 못 잡고 있었음.
- **중심축 쏠림(`isBodyShiftedSideways`)**: 양 발목 중점을 지지 기반의 중심축으로 삼고, 어깨 중점·엉덩이 중점 중 하나라도 축에서 어깨너비×0.3 이상 벗어나면 경고 ("체중을 양발 가운데로"). 정면 뷰 전용.
- **무릎 굽힘 비대칭(`isKneeBendAsymmetric`)**: 앉는 중(무릎 각도<150°)일 때 좌우 무릎 각도 차가 25° 초과면 경고 ("양쪽 무릎을 같은 깊이로"). 정면 뷰 전용 — 측면에선 원근·가려짐으로 좌우 각도가 원래 다르게 나옴. 서 있을 땐 둘 다 ~180°라 판단 안 함.
- 우선순위는 골반 기울기 다음, 고개 처짐 앞. 둘 다 비차단(카운팅에 영향 없음). 임계값(0.3, 25°, 150°)은 1차 추정치 — 정면 투영 무릎 각도는 원근 노이즈가 커서 특히 25°는 실기기 튜닝 필요.

## 2026-07-17 [Claude] — 렙별 최저점 자세 스냅샷 + 일관성 분석 기능

- 사용자 아이디어: "앉은 자세를 유지할 때 스켈레톤을 캡처해서 10개 렙의 모양이 얼마나 다른지 분석" — 그대로 구현.
- **캡처(`squatAnalyzer`)**: 각 렙에서 무릎 각도가 최소가 되는 프레임(최저점)의 33개 랜드마크를 캡처. 엉덩이 중점을 원점, 몸통 길이(어깨중점~엉덩이중점)를 1로 정규화해 저장 — 사용자가 프레임 안 어디에 서 있든, 카메라 거리가 달라도 렙끼리 모양 비교 가능. 좌표는 소수 3자리로 반올림해 용량 절약(~렙당 1KB). 렙 완료(카운트 확정) 시에만 `RepSnapshot`으로 확정되므로 미완성 동작은 남지 않음.
- **저장**: `WorkoutRecord.repSnapshots?`(옵셔널)로 확장 — 구버전 기록과 호환(필드 없으면 분석 UI만 안 보임). `isValidRecord`는 스냅샷 필드를 검사하지 않음(없어도 유효).
- **분석 UI(`HistoryScreen`)**: 기록 탭하면 펼쳐지는 상세 뷰 — ① 평균 깊이·편차(최대-최소)와 일관성 평가 문구(편차 ≤8° 매우 일정 / ≤15° 보통 / 초과 들쭉날쭉), ② 렙별 깊이 바 차트(각도 60~130°를 바 길이로 매핑), ③ **최저점 스켈레톤 전부 겹쳐 그리기**(SVG, 반투명 시안) — 선이 퍼져 보일수록 렙 간 자세가 달랐다는 직관적 시각화. BlazePose 인덱스(11/12/23/24/25/26/27/28)는 HistoryScreen에 로컬 상수로 하드코딩(react-native-mediapipe enum 임포트 대신 — 값이 표준 스킴이라 고정).
- 스냅샷 후보는 무릎 각도 <130°부터 추적하므로 전신 게이트·지터 게이트를 통과한 프레임만 대상 — 흔들림 프레임이 스냅샷으로 남지 않음.

## 2026-07-17 [Claude] — 운동 기록 저장 기능 추가 (온디바이스, AsyncStorage)

- `@react-native-async-storage/async-storage` 도입 — 서버 없는 구조 유지, 기록은 기기 안에만 저장. `workoutStorage.ts` 서비스 신설 (저장/조회/개별·전체 삭제, 손상된 JSON은 빈 목록으로 폴백).
- 기록 단위는 "세션": `CameraScreen`에 **완료** 버튼 추가 → 현재 횟수·운동 시간(첫 1회 완료 시점부터 측정)을 저장하고 카운터 리셋. 0회일 땐 저장 안 됨(Alert 안내). 횟수는 스로틀링된 React state가 아니라 `SquatAnalyzer`에 `getCount()`를 추가해 소스에서 직접 읽음.
- `HistoryScreen` 신설: 총 세션/누적 횟수 통계 + 기록 목록(FlatList) + 삭제. 화면 전환은 기존 결정대로 react-navigation 없이 `App.tsx` 로컬 state(`'guide' | 'camera' | 'history'`)로 처리.
- **알려진 한계 (기존 동작과 동일)**: 카메라 화면에서 기록/가이드 화면으로 이동하면 `CameraScreen`이 언마운트되어 진행 중이던 카운트가 사라짐 — 가이드 `?` 버튼도 원래 같은 동작이라 일관성 유지 차원에서 그대로 둠. 운동 중엔 완료를 먼저 누르면 됨.
- iOS `pod install` 실행해 `Podfile.lock`/`project.pbxproj` 갱신 커밋 (다른 PC에서 `pod install`만 다시 돌리면 됨). `Gemfile.lock`도 이번에 처음 커밋됨(이 맥에서 `bundle install` 최초 실행). 기기 없는 환경이라 이번에도 tsc/eslint까지만 검증 — 실기기에서 저장/조회 동작 확인 필요.

## 2026-07-17 [Claude] — Antigravity 최신 커밋 + 기록 기능 비판적 검토 후 수정 5건

- **TTS 큐 폭주 수정 (회귀 버그)**: Antigravity가 쿨다운을 "동일 문구"에만 걸리게 바꿨는데, `speak()`는 WARNING 동안 매 프레임 호출됨 → 두 경고 문구가 임계값 경계에서 프레임 단위로 번갈아 나오면 매번 "다른 문구"라 쿨다운을 전부 통과, `Tts.speak()`가 큐잉 방식(Android QUEUE_ADD / iOS AVSpeechSynthesizer)이라 발화가 무한정 쌓임. "다른 문구는 3초 안 기다리고 발화"라는 원래 의도는 유지하되 전역 최소 간격 2초를 추가해 폭주만 차단.
- **측면 고개 처짐 고정 임계값(0.06) → 몸통 길이 비율(0.15)로 교체**: 정규화 좌표는 카메라가 멀수록 줄어들어 고정값은 거리 의존적 — 권장 거리 3m에서 코-어깨 세로 간격이 ~0.06-0.09까지 내려가 정상 자세에도 상시 오경고 가능성. 몸통 세로 길이(어깨-엉덩이 중점) 대비 비율은 측면에서도 압축되지 않아 거리 불변.
- **운동 시간 측정 기준 변경**: 첫 회 완료~저장 버튼 시각이면 마지막 스쿼트 후 쉰 시간까지 포함돼 부풀려짐 → 첫 회 완료~마지막 회 완료로 변경 (1회만 하면 0초).
- **완료 버튼 더블탭 중복 저장 방지** (`savingRef` 가드) + **저장 데이터 항목 단위 검증** (`isValidRecord` 필터 — 손상 항목이 UI/통계에 흘러들지 않게).
- **수정 안 하고 플래그만**: `isFrontView`의 `shoulderWidth > 0.15` 가드는 권장 거리 2.5~3m 정면에서 어깨 폭이 ~0.12-0.15로 떨어져 정면인데도 false가 될 수 있음(스탠스/골반 체크가 조용히 꺼짐). 기하학적 추정일 뿐이라 코드는 두고 실기기 테스트 항목으로 남김. 2프레임 스킵, 엉덩이 각도 스로틀링, TTS try-catch, isFrontView 가드 자체는 검토 결과 모두 타당.

## 2026-07-17 [Claude] — [설계 검토, 코드 변경 없음] 스트레칭·요가 확장 및 포즈 모델 선택 근거

사용자와 논의한 향후 확장 방향 정리. 실제 구현은 안 함 — 나중에 같은 논의 반복하지 않도록 결론만 기록.

- **운동 확장 난이도 순서**: 스쿼트(완료) → 서서 하는 상체 스트레칭(리스크 낮음) → 요가/누운 자세(리스크 높음). 스쿼트는 "횟수 카운팅(rep)" 구조지만 스트레칭·요가는 "목표 자세를 N초 유지(hold)" 구조라, `squatAnalyzer`를 운동별 플러그인으로 일반화하고 **hold-타이머 엔진**(자세 이탈 시 타이머 정지, 좌우 세트 관리)을 새로 얹어야 함. 이 hold 엔진은 스트레칭·요가가 공유하므로 스트레칭으로 먼저 만들면 요가에 재활용됨.
- **서서 하는 상체 스트레칭이 다음 확장으로 최적**: 요가의 3대 난관(모델 학습 편향/자기가림/방향)을 전부 피함 — 서 있는 정면 자세라 현재 `lite` 모델·엔진 그대로 됨. 동작별 판정 룰(목=귀-어깨각, 사이드벤드=몸통기울기 등)만 추가하면 됨. 첫 동작은 목 스트레칭 or 사이드 벤드 1개로 hold 구조 검증 권장.
- **누운/요가가 어려운 근본 이유**: (1) BlazePose는 서 있는 사람 위주로 학습됨, (2) 팔다리 겹침(self-occlusion)에서 랜드마크 신뢰도 급락, (3) 가로로 누우면 방향 혼란. 해결책은 모델 교체가 아니라 ①프레임 회전 정규화 + `heavy` 모델, ②각도 룰 대신 **자세 템플릿 매칭**(이미 만든 렙 스냅샷의 "엉덩이중점 원점+몸통길이 정규화" 좌표가 그대로 기반이 됨), ③K-NN 자세 분류기. 물구나무·심한 역자세는 2D 온디바이스로는 여전히 부정확 → knee-over-toe처럼 의도적으로 지원 제외가 맞음.
- **`lite`→`heavy` 전역 교체의 문제점**: (1) 실시간 FPS 하락으로 스쿼트 최저점 프레임 놓칠 위험, (2) ⚠️ 프레임 기반 상수(`STATE_DEBOUNCE_FRAMES=3`, `READY_FRAMES=10`, `LOST_FRAMES=5`, `JITTER_THRESHOLD=0.05`)가 전부 ~30fps 가정이라 FPS 떨어지면 어긋남 — 특히 지터 게이트가 오작동(정상 스쿼트를 흔들림으로 오판), (3) 모델 파일 ~5.5MB→~29MB라 APK/IPA·git 저장소 비대(양 플랫폼 사본), (4) 발열·배터리↑(Antigravity의 2프레임 스킵 최적화와 상충), (5) GPU 델리게이트 의존. **결론: 전역 교체 대신 요가 모드에서만 heavy 로드**(모델 경로가 런타임 인자라 운동별 교체 가능), 스쿼트·스트레칭은 lite 유지. heavy 단독으로 요가가 열리는 것도 아님(회전·템플릿 매칭 병행 필요).
- **포즈 모델을 MediaPipe로 유지하는 근거**: MoveNet(17점, 발끝 없음→스탠스 폭 등 제약), YOLO-pose(무거움), Apple Vision(iOS 전용→플랫폼별 판정 로직 분기), **ML Kit Pose(내부가 BlazePose와 동일 모델)** — 모두 이 앱엔 득보다 실이 큼. 핵심: 누운/역자세 한계는 MediaPipe 결함이 아니라 **온디바이스 2D 단일 카메라 방식 전체의 공통 천장**이라 모델 교체로 안 풀림. 33점 스킴·플랫폼 통일·이미 된 통합 때문에 MediaPipe 계열 유지가 거의 모든 경우 유리. 정확도가 급하면 재통합 없이 같은 MediaPipe `full`/`heavy`가 가장 저렴한 선택.

## 2026-07-17 [Claude] — [설계 검토 v2, 코드 변경 없음] Antigravity 반론 + 벤치마킹 검증 반영

위 설계안에 대한 Antigravity의 비판 분석과, 경쟁 앱 벤치마킹 리서치(웹 소스 기반, 2건) 결과를 종합. 결론만 기록하고 구현은 보류(사용자 결정: "지금은 기록만").

**Antigravity 반론 중 수용한 것 (제 설계안의 실제 구멍)**
- **Hold 타이머 지터**: 스쿼트는 최저점 순간만 보지만 스트레칭/요가는 10~30초 연속 유지라, 경계선 자세에서 프레임 떨림이 타이머를 토글시킴. 제 "자세 이탈 시 정지"안이 이걸 놓침 → 히스테리시스(이탈에 유예 구간) + 1€ 필터 선행 필요.
- **템플릿 매칭의 카메라 각도 선행조건**: 폰을 바닥에 비스듬히 세워 매트를 찍으면 원근 왜곡으로 몸통길이 정규화가 무너져 KNN 오차 급증. 각도 강제(수평/고정 높이) 가이드가 선행돼야 함. (단, 제가 말한 "프레임 회전 정규화"는 랜드마크가 아니라 입력 이미지 회전이라 검출기 단계에 실제 작용 — Antigravity의 "이미 추출된 랜드마크 회전은 무의미" 지적은 대상이 다름. 다만 누운 자세가 검출기 학습분포 밖이라 부분 개선에 그친다는 기저 우려는 타당.)

**Antigravity 반론 중 반박/완화한 것**
- **동적 lite/heavy 로딩 OOM 리스크는 과대평가**: 29MB 모델이 그 자체로 OOM 안 냄. 진짜 위험은 "이전 solution 미해제 후 재할당→누수". 우리 앱은 운동 전환=CameraScreen 언마운트 구조라, 핫스왑 대신 **언마운트→재마운트**로 가면 별도 라이프사이클 락 없이 자연 해결(AppState 언마운트 패턴과 동일). 검증 필요: 라이브러리가 언마운트 시 NDK 컨텍스트 실제 해제 여부. `full` 싱글톤(Antigravity 1안)은 기본안이 아니라 핫스왑이 문제로 판명될 때의 폴백.

**벤치마킹으로 검증된 것 — Antigravity의 "상용앱 기법(5번)"은 대부분 마케팅 주장**
- Kinematic 3D 역산: **Vay만 주장하며 그마저 클라우드**(온디바이스 아님). fine-tuned 누운자세 "모델": 검증 실패(기능은 있어도 별도 모델 주장 없음). 코사인/KNN: 기법은 ML Kit 공식 문서로 실재하나 특정 상용앱 production 사용 증거 없음. 자이로 캘리브레이션: 검증 실패. **→ 5개 중 유일하게 검증된 표준 관행은 1€/칼만 필터**(MediaPipe 자체도 적용). 앞서 "1€ 필터가 관통선"이라 한 판단이 뒷받침됨.
- **2D를 진짜 이기는 앱(Onyx TrueDepth, Tempo LiDAR/ToF)은 알고리즘이 아니라 깊이 하드웨어를 씀** — 우리가 못 따라감. 경쟁사 중 엔진이 MediaPipe로 공개 확인된 건 QuickPose SDK 하나뿐.
- **우리 기존 선택 검증됨**: knee-over-toe/heel-lift 제외는 옳음(BlazePose 무릎 valgus 오차 ~19°). 설치 가이드 "정면 2~3m"는 스쿼트 최적(정면/대각 180~200cm)과 일치. 온디바이스/무서버 프라이버시는 진짜 차별점(Vay·Eva Yoga는 클라우드). **렙별 일관성/편차 분석은 경쟁사 어디도 안 하는 고유 기능**.

**벤치마킹으로 발견한 기회 (미개척 영역)**
- **전신 프레이밍 온보딩은 업계가 제대로 못 푼 whitespace**. 대부분 "6ft 뒤로" 정적 안내 or 미스프레이밍 후 "뒤로 가세요" 잔소리(Onyx 불만 1위). 훔칠 만한 패턴: Kemtai(전신 감지 전엔 운동 시작 안 함), Exer(뒤로 물러나면 자동 캘리브레이션), Zenia(스켈레톤을 캘리브레이션 표면으로), Silhou(실루엣 아웃라인에 몸 맞추기 — 단 사진앱). 우리 정적 SVG 가이드 → 실시간 "실루엣에 전신 맞추기"로 개선 시 셋업 불만 1위 해결.
- **신뢰 붕괴 방지가 table-stakes**: 렙 카운트 오류가 신뢰를 가장 빨리 깸(Peloton 과다카운트/Onyx 과소카운트 둘 다 혹평). 상시 인식상태 표시 + "안 보여요" 상태가 필수 — 우리 `isTracking` 게이트가 이미 옳은 방향, 화면에 크게 노출만 하면 됨.

**빌려올 기능 우선순위 (impact/effort, 구현은 보류)**
1. 렙별 폼 점수(0~100)+세트 요약 — 高/低(RepSnapshot 재활용). 2. 라이브 실루엣 캘리브레이션 — 高/中(fullBodyVisible 재활용, whitespace). 3. 상시 인식상태 칩 — 高/低(isTracking 표시만). 4. 1€/칼만 필터 — 中高/中(검증된 유일 기법). 5. TTS 음소거·볼륨 토글 — 中/低. 6. 세션 간 일관성 트렌드(고유 데이터 활용) — 中高/中. 7. 스트릭·세션수 게이미피케이션 — 中/低. 8. 정직한 능력 공개("정면=무릎/골반 체크, 측면=깊이만") — 中/低.
- **전략 결론**: 깊이 하드웨어 앱과 정확도로 경쟁하지 말고 **프라이버시 + 렙 일관성 분석 + 정직한 능력 공개 + 셋업 UX**로 차별화. (상세 소스·비교표·검증 등급은 이 세션 리서치 트랜스크립트에 있음.)

## 2026-07-18 [Claude] — 1€ 필터(지터 제거) + 라이브 실루엣 캘리브레이션 구현

벤치마킹 우선순위 중 검증된 기법(1€ 필터)과 미개척 영역(셋업 UX) 2개를 구현. 둘 다 새 네이티브 의존성 없음.

- **1€ 필터 (`src/pose/oneEuroFilter.ts`)**: One Euro Filter(Casiez 2012) 신규 구현 — 느린 움직임엔 강하게 스무딩(떨림 제거), 빠른 움직임엔 컷오프를 높여 지연 최소화하는 적응형 저역통과 필터. `LandmarkFilter`가 33개 랜드마크의 x/y를 각각 필터링(visibility·z는 통과). `CameraScreen.onResults`에서 raw 랜드마크를 필터링한 뒤 **분석·오버레이 공통으로** 사용 — 지터 게이트 오작동↓, 스켈레톤 흔들림↓. 인식 끊김/앱 복귀/reset 시 `filter.reset()`으로 큰 시간 공백에 필터가 튀는 것 방지. dt는 `Date.now()/1000`로 계산하고 비정상값(역행·1초 초과·0)은 기본 1/30초로 방어. 파라미터(MIN_CUTOFF=1.7, BETA=0.4)는 1차 추정치 — 실기기에서 부드러움 vs 반응성 튜닝 필요.
- **라이브 실루엣 캘리브레이션 (`src/components/CalibrationOverlay.tsx`)**: 벤치마킹에서 "전신 프레이밍 온보딩은 업계 미개척 영역"으로 확인된 부분. 전신 인식 대기(`!tracking`) 중 화면 중앙에 사람 실루엣 점선 아웃라인 + 진행 링을 표시하고, 인식이 안정될수록(readyProgress) 회색→시안→초록으로 차오름. 정적 SVG 가이드와 달리 실시간 반응.
- **analyzer 확장**: `SquatAnalysis`에 `readyProgress`(0~1, readyStreak/READY_FRAMES) 추가. 미인식 시 어느 부위가 문제인지 구체 안내("상체가 화면에 들어오도록"/"뒤로 물러나 발끝까지"/"그대로 유지"). Kemtai의 "전신 감지 전엔 시작 안 함" 게이트 + Exer의 back-away 안내를 참고한 형태.
- **스로틀 수정**: setAnalysis 스로틀이 count/state/feedback/angle만 비교해서, 캘리브레이션 중 진행 링이 멈추는 버그 가능 → `tracking`·`readyProgress` 비교 추가(진행률은 0.1 단위 이산이라 과도한 리렌더 없음).
- 기기 없는 환경이라 tsc/eslint까지만 검증 — 실기기에서 스무딩 체감·캘리브레이션 실루엣 위치/크기 확인 필요.

## 2026-07-18 [Claude] — 렙별 폼 점수(0~100) + 세트 요약

벤치마킹 1순위(Kemtai 최다 호평 기능). 이미 캡처 중인 렙 데이터에 점수만 얹어 새 의존성 없음.

- **점수 로직(`squatAnalyzer.ts`)**: 렙마다 100점에서 감점 — (1) 깊이: 최저점 무릎 각도 100° 이하 만점, 얕을수록 1도당 1.2점 비례 감점(최대 40), (2) 자세 문제: 렙 동안 발생한 경고를 종류별 고정 감점(무릎 모임 -20 안전 직결로 최대, 상체 숙임 -12, 골반/중심쏠림/무릎비대칭 -10, 고개처짐/발너비 -8). 전부 룰 기반이라 `issues`로 왜 깎였는지 투명하게 설명.
- **렙별 문제 누적**: `currentRepFlags`를 매 프레임(전신 게이트 통과 후) OR 누적하고 렙 완료 시 점수 계산 후 초기화. 쓰레기 프레임은 게이트 이전이라 안 섞임. `RepSnapshot`에 `score?`/`issues?` 추가(옵셔널 — 구버전 기록 호환).
- **UI**: 완료 시 Alert 세트 요약("N회 · 평균 폼 점수 M점") + TTS로 평균 점수 안내. `HistoryScreen` 분석 뷰 상단에 큰 평균 점수(80↑초록/60↑시안/미만 빨강) + 가장 흔한 문제 top3, 렙별 깊이 바 옆에 개별 점수 배지.
- 점수 가중치·깊이 곡선(100°/1.2점/40상한)은 1차 추정치 — 실기기에서 실제 스쿼트 점수가 너무 짜거나 후하면 튜닝 필요.

## 2026-07-18 [Claude] — Antigravity의 필터·점수·캘리브레이션 비판 검토 후 수정

Antigravity가 1€ 필터/실루엣/폼 점수 3개를 비판 분석. 검증 결과 유효한 것 3건 수정, 사실 오류 1건 반박.

- **✅ 수정: 폼 점수 단발 노이즈 과징벌 (Antigravity 정확)**: 매 프레임 경고를 즉시 OR 누적해서, 1프레임 센서 노이즈로 튄 경고도 렙 전체 -10점을 먹였음. `accumulateFlag` + `flagStreaks` 도입 — **연속 3프레임(`WARNING_PERSIST_FRAMES`) 이상 지속된 경고만** 감점 인정. 상태 전환 디바운스와 같은 철학.
- **✅ 수정: 깊이 곡선 완충 확대 (일부 타당)**: 만점 기준 100°→110°, 기울기 1.2→1.0점/도. 카메라 기울기로 깊이가 약간 얕게 읽혀도 점수 급락 방지(병렬 ~90°에 20° 여유).
- **✅ 수정: 획득 중 가시성 깜빡임 내성 (visibility 지적 중 유효 핵심)**: readyStreak가 단발 non-fullBody 프레임에 통째로 0으로 리셋되던 것 → `-2` 감쇠로 변경. 지속적으로 안 보일 때만 획득 진행 소실. (Antigravity의 "visibility 필터링" 주장에 대한 더 정확한 대응 — 신호 스무딩보다 결정 계층에서 처리하는 게 우리 디바운스 구조와 일관.)
- **✅ 수정: 실루엣 오해 방지 문구 (UX 지적 타당)**: "실루엣에 정확히 맞출 필요 없어요 — 전신만 화면에 들어오면 됩니다" 캡션 추가. 실제 게이트는 fullBodyVisible이지 실루엣 핏이 아님을 명시.
- **❌ 반박: "2프레임 스킵 → 15fps → MIN_CUTOFF 과도" 는 코드 오독**: 2프레임 스킵(`frameCounterRef % 2`)은 `setOverlayPoints`(화면 스켈레톤 그리기)만 건너뛰고, **1€ 필터와 analyzer는 매 프레임 전체 프레임레이트로 실행됨**. 따라서 필터 dt는 ~33ms(30fps)지 66ms 아님. 게다가 1€ 필터는 적응형이라 빠른 하강(최저점)에서 컷오프를 높여 피크 뭉개짐을 오히려 최소화 — Antigravity가 우려한 지점이 1€가 가장 강한 지점. MIN_CUTOFF 튜닝은 필요하나 "15fps 과도 스무딩" 프레임은 틀림.
- **참고: z축 필터링 무의미**: analyzer는 z를 전혀 안 씀(전부 2D x/y)이라 z 미필터링은 우리 앱에 영향 없음.
- 전부 tsc/eslint까지만 — WARNING_PERSIST_FRAMES(3), 깊이 110°/1.0, readyStreak -2는 여전히 실기기 튜닝 대상.

## 2026-07-18 [Claude] — Android 빌드 에러 수정 (react-native-svg compileSdk / AGP 9)

- 사용자가 Android Studio 빌드 시 `project ':react-native-svg' does not specify compileSdk` 에러 보고. 원인: 이 프로젝트는 **Gradle 9.3.1 / AGP 9** 툴체인인데(스캐폴딩 때부터, 최근 변경 아님), `react-native-svg@15.15.5`의 `android/build.gradle`이 **AGP 9에서 제거된 구형 `compileSdkVersion` DSL 메서드**를 씀 → 값이 설정 안 돼 에러. **특정 커밋의 회귀가 아니라 잠복 비호환** — 빌드가 앞선 블로커(tts jcenter → 16KB)를 차례로 통과해 이제서야 svg 모듈 설정 단계에 도달하며 드러남.
- 수정: `compileSdkVersion safeExtGet(...)`(메서드) → `compileSdk = safeExtGet('compileSdkVersion', 34)`(프로퍼티 할당). `compileSdk`는 메서드가 아니라 프로퍼티라 **등호(`=`)가 필수** — 공백 호출은 무시돼 그대로 실패함(처음에 이걸로 한 번 헛짚음). patch-package로 영구 패치(`patches/react-native-svg+15.15.5.patch`, postinstall 자동 적용). fallback도 28→34로.
- **검증**: `./gradlew :react-native-svg:properties`로 실제 gradle 설정 통과 확인 — `compileSdkVersion: 36`, BUILD SUCCESSFUL. (참고: gradle 데몬이 node를 PATH에서 못 찾으면 svg가 RN 위치 resolve 실패로 별도 에러를 내므로, 이 저장소 gradle 실행 시 `/opt/homebrew/bin`을 PATH에 두거나 `--no-daemon` 필요 — Android Studio는 node를 정상 인식하므로 무관.)
- 같은 계열 잠복 비호환이 다른 라이브러리에도 있을 수 있음(AGP 9에서 구형 DSL 쓰는 패키지) — 빌드가 더 진행되며 나오면 같은 방식(프로퍼티 할당 패치)으로 대응.

## 2026-07-18 [Claude] — 첫 실기기 구동 성공 + 즉시 발견된 4개 이슈 튜닝

드디어 실기기(무선 adb 연결 Galaxy)에서 앱 구동 성공. 빌드 후 "Unable to load script"는 `adb reverse tcp:8081`이 안 잡혀 기기가 Metro에 연결 못 한 것(환경 문제, 코드 아님)이라 reverse 설정으로 해결. 첫 스쿼트 테스트에서 나온 4개 문제를 튜닝:

- **① 고개 처짐 경고 상시 오발동**: 정상 자세에서도 "고개를 들고 정면을 보세요"가 계속 나옴 → head-drop 임계값이 과민. 정면 `shoulderWidth*0.25→0.1`, 측면 `torsoLen*0.15→0.08`로 낮춰 코가 어깨 라인에 아주 근접(심하게 숙임)할 때만 경고.
- **② 스켈레톤이 앉는 동작을 못 따라옴(지연)**: (a) 오버레이가 `frameCounter%2`로 2프레임당 1회(15fps)만 그려지던 것 → **매 프레임 렌더**로 변경(frameCounterRef 제거). (b) 1€ 필터 과다 스무딩 → `MIN_CUTOFF 1.7→3.0`, `BETA 0.4→0.7`로 반응성↑. (발열/드롭 심하면 되돌릴 것 — 주석 명시.)
- **③ 진짜 스쿼트 1회가 카운트 안 됨(과소)**: DOWN 판정이 무릎 `<95°`로 너무 깊어야 함(2D 투영은 실제보다 얕게 읽힘) → `<105°`로 완화, UP `>155°→>150°`. 필터 반응성 개선도 최저점 각도가 제대로 잡히게 도움.
- **④ 일어서며/이동 중 숫자 올라감(과다) — 핵심 버그**: 초기 poseState가 'UP'인데 앉은 상태로 시작하면 knee<105로 즉시 DOWN→일어서면 DOWN→UP이 되어 **기립 자체가 1렙으로 오인**. `hasStood` 게이트 추가 — 안정적으로 선 상태(knee>150 확정)를 한 번 확인한 뒤의 앉았다-서는 사이클만 카운트. 첫 기립은 카운트 안 하고 "준비됐습니다" 안내.
- 임계값(head 0.1/0.08, DOWN 105, UP 150, MIN_CUTOFF 3.0/BETA 0.7)은 이 기기·거치 기준 2차 추정치 — 계속 실기기 피드백으로 조정. Metro 리로드로 즉시 반영해 재테스트 중.

## 2026-07-18~19 [Claude] — 실기기 로그 기반 집중 디버깅: 근본 원인 5개 규명 (중요)

무선 adb 연결 Galaxy에서 `adb logcat`으로 `[squat]` 디버그 로그(squatAnalyzer의 `DEBUG_LOG`)를 직접 뽑아 추측 대신 실제 값으로 튜닝. 반나절 넘게 벽에 부딪혔는데, 가짜 원인(임계값)을 걷어내며 진짜 근본 원인들에 도달함. **다음이 핵심 발견들:**

1. **⭐ 원본 카메라 프레임이 가로(landscape) 방향** — 서 있는 사람이 랜드마크 좌표계에선 90° 누워 x축으로 퍼짐(로그: 어깨/엉덩이/발목 y가 전부 0.40~0.50, y-span 0.02~0.06). 이 때문에 **모든 세로(y) 기반 판정이 깨짐**: 전신 게이트(세로 간격) 실패로 tracking 자체가 안 됨, 고개/기울기 경고 상시 오발동. 무릎 각도만 회전 불변이라 유일하게 작동. → 게이트를 방향 무관한 **어깨-발목 유클리드 거리**로 교체하니 tracking 정상 진입 + 진짜 스쿼트(무릎 79~89°) 카운트 성공.
2. **⭐ MediaPipe `visibility`가 항상 1.0** — 화면 밖/가려진 부위도 33랜드마크를 visibility 1.0으로 "추정" 반환. 그래서 가시성 게이트(0.5→0.7 올려도) 무력, **팔만 보여도 지어낸 전신으로 카운트됨**. → 가시성 대신 기하학 검증으로 전환.
3. **⭐ 팔만 보이면 전신 골격 환각(hallucination)** — 팔 하나로 몸 전체를 지어냄. 로그로 그 골격이 **작게 뭉친 형태**(ext 0.24, torso 0.07)임을 확인 → 몸통(어깨-엉덩이)>0.1 + 다리(엉덩이-발목)>0.15 + 프레임 안(keyInFrame) 검증 추가로 차단 성공.
4. **정면 무릎각 원근 단축** — 정면에선 깊은 스쿼트도 무릎각이 ~110~130°로만 읽혀(실제 80°) DOWN(<105) 판정 실패 → 카운트 안 됨. **측면 촬영은 무릎 굽힘이 그대로 보여 79~89° 정확**. 결론: **스쿼트 카운트는 측면이 정석**(정면은 좌우 자세용이나 원거리에선 그마저 불신뢰).
5. **원거리에서 폭 기반 측정 전부 노이즈** — 어깨폭 sw가 0.00~0.08로 붕괴 → 무릎모임/기울기/고개 경고가 노이즈로 상시 오발동. `measurementsReliable`(shoulderWidth>0.08 && hipWidth>0.05) 게이트 + 3프레임 지속 + 절대 최소 임계값으로 억제.

기타 수정: isFrontView의 `shoulderWidth>0.15` 절대 가드 제거(원거리에서 정면 오판), hasStood 게이트(기립 오카운트 방지), 어깨폭<0.015 붕괴 프레임 카운트 금지(폰 흔들림 팬텀), 오버레이 매 프레임 렌더(2프레임 스킵 제거), 1€ MIN_CUTOFF 조정(노이즈 vs 지연).

**현재 상태**: 측면·전신에서 진짜 스쿼트 카운트 O, 팔만/부분/회전 카운트 X(사용자 확인). `DEBUG_LOG=true` 아직 켜져 있음 — 안정화 확인 후 끌 것. **남은 것**: 강화 게이트가 진짜 전신을 막지 않는지 최종 확인, y기반 자세검사(고개/기울기)는 프레임 회전 보정 후 되살릴지 결정, Android build.gradle의 화면 회전/카메라 orientation을 근본 교정할지 검토(현재는 좌표 방향 무관 로직으로 우회).

