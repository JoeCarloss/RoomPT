🏋️‍♂️ AI 홈트레이닝 코치 앱 프로젝트 기획서

1. 프로젝트 개요 (Project Overview)

스마트폰 카메라와 다중모달(Multimodal) LLM을 활용하여 집에서도 전문적인 PT(Personal Training)를 받는 듯한 경험을 제공하는 실시간 대화형 AI 피트니스 코치 앱입니다. 복잡한 환경 변수를 배제하고 스쿼트(Squat)와 런지(Lunge) 등 직관적인 맨몸 운동에 집중하여 자세 교정의 정확도와 실시간 음성 피드백의 품질을 극대화합니다.

2. 앱 네이밍 후보군 (Naming Candidates)

앱의 정체성에 맞게 다음 후보 중 선택하여 브랜딩을 진행합니다.

상호작용/대화 강조: 폼챗(FormChat), 모션메이트(MotionMate), 보이스피티(VoicePT)

직관성/홈트 강조: 홈핏 가이드(HomeFit Guide), 스쿼트 라이트(SquatRight), 방구석 코치

전문성/정밀함 강조: 얼라인 앳 홈(AlignAtHome), 포즈 렌즈(PoseLens), 트루모션(TrueMotion)

3. 핵심 기능 (Key Features)

A. 실시간 자세 추적 (Real-time Pose Estimation)

스마트폰 카메라로 사용자의 움직임을 초당 30프레임 이상 스캔.

주요 관절(어깨, 엉덩이, 무릎, 발목 등)의 좌표와 각도를 실시간 추출.

정확한 횟수 카운팅 및 가동 범위(ROM) 측정.

B. VLM 기반 시공간적 피드백 (Spatio-temporal Feedback)

단순 "각도 이탈 경고"가 아닌, 전체 동작의 흐름(Sequence)을 파악.

예: "무릎이 안으로 모이고 있어요. 발끝 방향으로 무릎을 열어주세요."

C. 실시간 양방향 음성 코치 (Conversational Voice Coaching)

운동 중 사용자의 음성 발화("나 무릎 아파", "너무 힘들어")를 인식.

LLM이 실시간으로 맥락을 파악하여 텍스트 생성 후 TTS(Text-to-Speech)로 음성 안내.

운동 세트 간 휴식 시간에 동기부여 멘트 제공.

4. 시스템 아키텍처 및 데이터 플로우 (Architecture)

Client (Mobile): 영상 캡처 ➡️ Edge AI 모델 구동 ➡️ 관절 3D 좌표 추출

Network (WebSocket): 영상 원본이 아닌 '좌표 데이터'와 '음성 텍스트'만 서버로 전송 (대역폭 및 레이턴시 최소화)

Backend Server: 실시간 좌표 시퀀스 분석 및 상태 관리

AI Engine: 좌표 메타데이터 + 사용자 음성 ➡️ 다중모달 LLM 프롬프트 주입 ➡️ 자연어 피드백 생성

Response: 생성된 텍스트 ➡️ TTS 변환 ➡️ Client로 전송 후 음성 출력

5. 기술 스택 (Tech Stack)

Frontend (Client)

Framework: React Native 또는 Flutter (크로스 플랫폼 지원 및 네이티브 카메라 제어 용이)

Edge AI: Google MediaPipe (BlazePose) - 가볍고 빠르며 모바일 환경에 최적화됨.

Backend (Server)

Framework: Node.js (Express/NestJS) 또는 Spring Boot

Communication: WebSocket / WebRTC (실시간 양방향 통신)

Database: PostgreSQL (유저 및 운동 기록) + Redis (실시간 프레임 세션 관리)

AI & LLM

Prototype/Cloud API: OpenAI GPT-4o / Anthropic Claude 3.5 Sonnet (초기 로직 검증용)

Local Inference (Option): Mac Mini M4 Pro 환경을 활용한 로컬 Llama 3 (8B) + vLLM/Ollama (비용 절감 및 레이턴시 테스트)

TTS/STT: OpenAI Whisper(STT) / ElevenLabs 또는 Google Cloud TTS(TTS)

6. Phase 별 개발 마일스톤 (Development Milestones)

Phase 1: 핵심 기능 검증 (PoC)

MediaPipe 연동 및 스쿼트 랜드마크 추출 확인.

하드코딩된 룰 기반(Rule-based)으로 자세 오류 판별 및 콘솔 출력.

Phase 2: LLM 파이프라인 통합

추출된 좌표 데이터를 텍스트 프롬프트로 변환하여 LLM에 전달.

LLM이 생성한 피드백을 TTS로 변환하여 모바일 기기에서 재생 (레이턴시 최적화).

Phase 3: 대화형 UI 및 앱 고도화

운동 기록 UI, 캘린더, 사용자 대시보드 추가.

STT를 적용하여 사용자의 음성 피드백을 반영하는 양방향 소통 구현.