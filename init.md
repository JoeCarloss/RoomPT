🏋️‍♂️ AI 홈트레이닝 코치 앱 프로젝트 기획서

1. 프로젝트 개요 (Project Overview)

스마트폰 카메라만으로 집에서도 전문적인 PT(Personal Training)를 받는 듯한 경험을 제공하는 실시간 AI 피트니스 코치 앱입니다. 복잡한 환경 변수를 배제하고 스쿼트(Squat) 등 직관적인 맨몸 운동에 집중하여 자세 교정의 정확도와 실시간 음성 피드백의 품질을 극대화합니다.

**서버 없이 클라이언트(모바일 앱)만으로 동작합니다.** 자세 추적, 자세 판별, 음성 안내까지 전부 기기 안에서(온디바이스) 처리하며, 어떤 개인 영상 데이터도 외부로 전송되지 않습니다.

2. 앱 네이밍 후보군 (Naming Candidates)

앱의 정체성에 맞게 다음 후보 중 선택하여 브랜딩을 진행합니다.

상호작용/대화 강조: 폼챗(FormChat), 모션메이트(MotionMate), 보이스피티(VoicePT)

직관성/홈트 강조: 홈핏 가이드(HomeFit Guide), 스쿼트 라이트(SquatRight), 방구석 코치

전문성/정밀함 강조: 얼라인 앳 홈(AlignAtHome), 포즈 렌즈(PoseLens), 트루모션(TrueMotion)

3. 핵심 기능 (Key Features)

A. 실시간 자세 추적 (Real-time Pose Estimation)

스마트폰 카메라로 사용자의 움직임을 실시간 스캔.

주요 관절(어깨, 엉덩이, 무릎, 발목, 코 등 33개 포인트)의 좌표를 온디바이스 ML 모델(MediaPipe Pose Landmarker)로 실시간 추출.

정확한 횟수 카운팅 및 가동 범위(ROM) 측정.

B. 룰 기반 자세 피드백 (Rule-based Form Feedback)

관절 좌표 간의 각도·비율을 계산해 자세 오류를 규칙 기반으로 판별.

현재 감지 가능한 항목:
- 무릎 모임(Knee Collapse) — 무릎 간격이 발목 간격 대비 좁아지는지
- 상체 전방 숙임 — 엉덩이 각도가 과도하게 작아지는지
- 좌우 골반 기울어짐 — 양쪽 엉덩이 높이 차이
- 고개 처짐 — 코와 어깨 라인의 상대 위치
- 스탠스(발 너비) 적정성 — 발목 너비 대 어깨 너비 비율

카메라가 실제 거리(cm)를 알 수 없으므로(깊이 센서 미사용) 모든 임계값은 몸의 다른 부위 대비 "비율"로 판단하며, 실기기 테스트를 통해 지속적으로 튜닝합니다.

카메라 방향에 따른 한계를 명확히 안내: 정면 촬영 시 모든 피드백 항목이 동작하고, 측면 촬영 시 일부(무릎 모임 등 좌우 비교가 필요한 항목)는 비활성화됩니다. 무릎이 발끝보다 나가는지, 발뒤꿈치가 뜨는지는 카메라가 바라보는 방향을 알 수 없어 의도적으로 구현하지 않음(잘못 판단하면 오히려 틀린 코칭을 주기 때문).

C. 음성 피드백 (On-device Voice Feedback)

자세 문제가 감지되면 정해진 안내 문구를 온디바이스 TTS(Text-to-Speech)로 즉시 음성 안내 (예: "무릎이 안으로 모이고 있습니다. 발끝 방향으로 넓혀주세요").

스쿼트 1회 완료 시마다 카운트를 음성으로 안내 ("1회!", "2회!" ...).

※ 사용자 음성 인식(STT)이나 자연어 대화형 코칭은 아직 없음 — 아래 "향후 확장" 참고.

D. 설치 가이드 (Setup Guide)

앱 첫 실행 시 카메라 거리(2~3m)·방향(정면 권장)·높이(허리~가슴, 수직 거치)·조명·복장을 안내하는 온보딩 화면 제공.

E. 운동 기록 (Workout History)

운동 후 "완료" 버튼으로 세션(횟수, 운동 시간)을 온디바이스 저장소(AsyncStorage)에 저장. 기록 화면에서 총 세션/누적 횟수 통계와 세션 목록 확인, 개별/전체 삭제 가능. 기록은 기기 밖으로 나가지 않음.

4. 시스템 아키텍처 및 데이터 플로우 (Architecture)

서버가 없는 완전 클라이언트 구조입니다.

Client (Mobile App): 카메라 프레임 캡처 → 온디바이스 MediaPipe Pose Landmarker로 관절 좌표 추출 → 룰 기반 분석 엔진이 매 프레임 자세 판별 → 문제 발견 시 온디바이스 TTS로 즉시 음성 출력

영상, 좌표, 음성 그 어떤 데이터도 네트워크로 전송되지 않음 (모델 파일 다운로드는 최초 앱 빌드에 번들링되어 있어 런타임 네트워크 요청 없음)

5. 기술 스택 (Tech Stack)

Frontend (Client)

Framework: React Native (bare CLI, Expo 미사용) — 안드로이드/iOS 네이티브 앱

Camera: react-native-vision-camera (v4.7.3 고정 — v5의 Nitro Modules 아키텍처는 현재 쓰는 커뮤니티 프레임 프로세서 플러그인들과 호환 안 됨)

Pose Detection: react-native-mediapipe (MediaPipe Tasks Pose Landmarker, BlazePose 33포인트, pose_landmarker_lite.task 모델을 앱에 번들링)

TTS: react-native-tts (온디바이스 시스템 음성 엔진, 한국어)

오버레이 렌더링: react-native-svg (스켈레톤/관절 시각화, 설치 가이드 다이어그램)

Backend: 없음

Database: 온디바이스 로컬 저장소 (@react-native-async-storage/async-storage) — 운동 기록(세션별 횟수·운동 시간)을 기기 안에만 저장, 외부 전송 없음

AI & LLM: 현재 미사용. 클라우드 API 키를 클라이언트에 노출하는 문제, 서버 없는 구조라는 제약 때문에 1차 버전은 룰 기반으로만 구현하고, LLM 기반 자연어 피드백/대화형 코칭은 추후 검토 (온디바이스 LLM: Chrome 계열 Gemini Nano, WebLLM 등 / 또는 사용자가 자신의 API 키를 직접 입력하는 방식 등을 후보로 고려 중이며 아직 결정된 바 없음).

참고: 프로젝트 루트의 웹 버전(Vite+React, `src/`)은 초기 PoC로 남겨두었고, 실제 개발은 `mobile/` 디렉토리의 React Native 앱에서 진행 중.

6. Phase 별 개발 마일스톤 (Development Milestones)

Phase 1: 핵심 기능 구현 — 완료 ✅

MediaPipe Pose Landmarker 온디바이스 연동, 카메라 프레임 실시간 분석.

룰 기반 스쿼트 판별(횟수 카운팅, 무릎 모임/상체 숙임/골반 기울기/고개 처짐/스탠스 폭 감지) 및 TTS 음성 피드백까지 구현.

카메라 설치 가이드(온보딩) 화면 추가.

미검증 사항: 실기기/에뮬레이터가 없는 개발 환경 특성상 타입체크·린트까지만 확인했고, 실제 기기에서의 인식 정확도·임계값 튜닝은 진행 필요.

Phase 2: 자세 판정 정확도 고도화 (진행 중)

실기기 테스트를 통한 각 임계값(각도, 비율) 보정.

운동 종류 확장 검토 (런지 등).

Phase 3: LLM 기반 자연어 피드백 (보류)

서버 없는 구조를 유지하면서 LLM을 도입할 방법(온디바이스 LLM 또는 사용자 API 키 입력) 결정 필요.

결정되면 룰 기반 판별 결과를 LLM에 입력해 더 자연스러운 문장으로 변환, STT로 사용자 발화("무릎 아파요" 등)에 반응하는 대화형 코칭 검토.

Phase 4: 대화형 UI 및 앱 고도화 (일부 진행)

운동 기록 저장·조회(AsyncStorage 기반) — 완료 ✅ (2026-07-17)

캘린더, 사용자 대시보드 등 고도화 — 보류.

7. 여러 기기에서 개발 환경 설정 (Multi-machine Dev Setup)

이 프로젝트는 여러 PC에서 나눠서 개발합니다. 저장소: `git@github.com:JoeCarloss/RoomPT.git` (SSH). 새 기기에서 처음 셋업할 때:

공통

- `git clone git@github.com:JoeCarloss/RoomPT.git` (HTTPS 대신 SSH 권장 — HTTPS는 `gh` 토큰 만료 등으로 인증이 끊기기 쉬움. 새 기기에 SSH 키 등록 필요: `ssh-keygen` → GitHub 계정에 공개키 등록 → `ssh -T git@github.com`으로 확인)
- Node.js 22.11.0 이상 필요 (`mobile/package.json`의 `engines` 참고)
- `cd mobile && npm install` — `postinstall` 스크립트가 `patch-package`를 자동 실행해서 `react-native-tts`의 낡은 gradle 설정을 자동으로 고쳐줌 (수동 작업 불필요)
- pose_landmarker_lite.task 모델 파일은 이미 저장소에 커밋되어 있어(`mobile/assets/models/`, 그리고 iOS/Android 네이티브 프로젝트에 링크된 사본) 별도 다운로드 불필요

Android

- Android Studio + Android SDK (minSdk 24 / compileSdk 36 / targetSdk 36)
- **JDK 17 필요.** 시스템 기본 `java`가 구버전(예: 1.7)일 수 있으니 Android Studio에 내장된 JBR 또는 별도 설치한 JDK 17(예: Amazon Corretto)을 Gradle이 쓰도록 설정. `mobile/android/gradle/gradle-daemon-jvm.properties`에 Gradle 데몬용 툴체인 버전(21)이 명시되어 있어 Gradle이 자동으로 맞는 JDK를 다운로드/사용하려 시도함.
- `npm run android` 또는 Android Studio에서 `mobile/android` 열어서 실행

iOS (macOS + Xcode 필요)

- Xcode, CocoaPods 설치 필요
- `cd mobile/ios && bundle install && pod install` (최초 1회, 또는 네이티브 의존성 추가/변경 후)
- `npm run ios` 또는 Xcode에서 `mobile/ios/RoomPTMobile.xcworkspace` 열어서 실행 (`.xcodeproj` 아님, 반드시 `.xcworkspace`)

협업 규칙

- 커밋 메시지 앞에 `[Claude]` / `[Antigravity]` 접두사로 작업 주체 표시, `WORK_LOG.md`에 "왜" 이 변경을 했는지 짧게 기록 — 여러 기기/여러 도구가 같은 저장소를 건드리므로 `git log`만으로 맥락 파악 가능하게 유지.
- 다른 기기에서 작업 시작 전 `git pull`로 먼저 최신 상태 받아오기.
