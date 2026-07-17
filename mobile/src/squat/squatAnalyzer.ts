import { KnownPoseLandmarks, type Landmark } from 'react-native-mediapipe';

export interface JointAngles {
  leftKnee: number;
  rightKnee: number;
  leftHip: number;
  rightHip: number;
}

export type SquatState = 'UP' | 'DOWN' | 'WARNING';

/** 렙 1회의 최저점(가장 깊이 앉은 순간) 자세 스냅샷 — 렙 간 자세 일관성 분석용 */
export interface RepSnapshot {
  rep: number;
  /** 최저점 무릎 각도(도). 작을수록 깊이 앉은 것 */
  minKneeAngle: number;
  /** 최저점에서의 엉덩이(고관절) 각도 */
  hipAngleAtBottom: number;
  /** 엉덩이 중점을 원점, 몸통 길이를 1로 정규화한 33개 랜드마크 — 위치·거리 무관 비교용 */
  landmarks: { x: number; y: number }[];
}

export interface SquatAnalysis {
  angles: JointAngles;
  state: SquatState;
  feedback: string;
  count: number;
  repCompleted: boolean;
  /** 전신(어깨+엉덩이+한쪽 다리 이상)이 안정적으로 인식돼 코칭이 동작 중인지 */
  tracking: boolean;
}

const VISIBILITY_THRESHOLD = 0.5;
// 상태(UP/DOWN) 전환에 필요한 최소 연속 프레임 수. 화면 회전·가림·스쳐 지나감 등으로
// 생기는 단발성 쓰레기 랜드마크가 DOWN→UP 사이클로 오인돼 카운트가 올라가는 것을 방지.
// ~30fps 기준 3프레임 ≈ 0.1초라 실제 스쿼트 동작 인식에는 체감 지연 없음.
const STATE_DEBOUNCE_FRAMES = 3;
// 전신 인식 게이트: 어깨·엉덩이·한쪽 다리 이상이 이 프레임 수만큼 연속으로 잡혀야
// 코칭(카운트/자세 경고)을 시작. 몸 일부만 잡힌 상태에서 자세 교정이 나가는 것 방지.
const READY_FRAMES = 10;
// 전신 인식이 이 프레임 수만큼 연속으로 끊기면 다시 인식 대기 상태로 복귀
const LOST_FRAMES = 5;
// 흔들림(지터) 게이트: 프레임 간 몸 중심점 이동이 이 값(정규화 좌표)을 넘으면 기기가
// 흔들리거나 인식이 튄 것으로 보고 해당 프레임의 상태 전환을 무시. 실제 스쿼트의
// 프레임당 이동(~0.01)보다 훨씬 크게 잡아 정상 동작엔 걸리지 않음.
const JITTER_THRESHOLD = 0.05;

function calculateAngle(p1: Landmark, p2: Landmark, p3: Landmark): number {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

  const dotProduct = v1.x * v2.x + v1.y * v2.y;
  const magnitude1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const magnitude2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (magnitude1 === 0 || magnitude2 === 0) return 0;

  const cosAngle = Math.min(1, Math.max(-1, dotProduct / (magnitude1 * magnitude2)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

/**
 * Rule-based squat rep counter + form-cue advisor, ported from the web PoC's
 * App.tsx state machine and extended with additional 2D-landmark heuristics.
 *
 * Rep counting (this.poseState / this.count) is decided first and is only
 * ever blocked by knee-collapse (a safety-relevant issue, matches the
 * original web behavior). Every other form check below runs as a
 * non-blocking "advisory" pass afterward: it can override the displayed
 * state/feedback for that frame but never affects counting.
 *
 * Deliberately NOT implemented: knee-over-toe and heel-lift. Both require
 * knowing which way the person is facing the camera to interpret a 2D x/y
 * landmark delta correctly — guessing wrong would give backwards (actively
 * incorrect) coaching cues, which is worse than no cue.
 *
 * Thresholds below (0.5, 120, 0.75, 140, 50, 0.35, 0.9, 0.6, 1.8, ...) are
 * first-pass heuristics, not calibrated against real squat data — expect to
 * tune them after testing on a device.
 */
export class SquatAnalyzer {
  private poseState: 'UP' | 'DOWN' = 'UP';
  private count = 0;
  private downStreak = 0;
  private upStreak = 0;
  private isTracking = false;
  private readyStreak = 0;
  private lostStreak = 0;
  private prevHipMid: { x: number; y: number } | null = null;
  private prevShoulderMid: { x: number; y: number } | null = null;
  private repSnapshots: RepSnapshot[] = [];
  private bottomCandidate: {
    kneeAngle: number;
    hipAngle: number;
    landmarks: { x: number; y: number }[];
  } | null = null;

  reset(): void {
    this.poseState = 'UP';
    this.count = 0;
    this.downStreak = 0;
    this.upStreak = 0;
    this.isTracking = false;
    this.readyStreak = 0;
    this.lostStreak = 0;
    this.prevHipMid = null;
    this.prevShoulderMid = null;
    this.repSnapshots = [];
    this.bottomCandidate = null;
  }

  getCount(): number {
    return this.count;
  }

  getRepSnapshots(): RepSnapshot[] {
    return this.repSnapshots;
  }

  analyze(landmarks: Landmark[]): SquatAnalysis {
    const nose = landmarks[KnownPoseLandmarks.nose];
    const leftShoulder = landmarks[KnownPoseLandmarks.leftShoulder];
    const rightShoulder = landmarks[KnownPoseLandmarks.rightShoulder];
    const leftHip = landmarks[KnownPoseLandmarks.leftHip];
    const rightHip = landmarks[KnownPoseLandmarks.rightHip];
    const leftKnee = landmarks[KnownPoseLandmarks.leftKnee];
    const rightKnee = landmarks[KnownPoseLandmarks.rightKnee];
    const leftAnkle = landmarks[KnownPoseLandmarks.leftAnkle];
    const rightAnkle = landmarks[KnownPoseLandmarks.rightAnkle];

    const angles: JointAngles = {
      leftKnee: calculateAngle(leftHip, leftKnee, leftAnkle),
      rightKnee: calculateAngle(rightHip, rightKnee, rightAnkle),
      leftHip: calculateAngle(leftShoulder, leftHip, leftKnee),
      rightHip: calculateAngle(rightShoulder, rightHip, rightKnee),
    };

    // 가시성이 현저히 낮은 다리는 계산에서 제외하고 한쪽 다리 중심의 측면 분석 적용
    const leftLegVisible =
      (leftKnee.visibility ?? 1) > VISIBILITY_THRESHOLD &&
      (leftAnkle.visibility ?? 1) > VISIBILITY_THRESHOLD;
    const rightLegVisible =
      (rightKnee.visibility ?? 1) > VISIBILITY_THRESHOLD &&
      (rightAnkle.visibility ?? 1) > VISIBILITY_THRESHOLD;

    // ---- 전신 인식 게이트 + 흔들림(지터) 게이트 ----
    const shouldersVisible =
      (leftShoulder.visibility ?? 1) > VISIBILITY_THRESHOLD &&
      (rightShoulder.visibility ?? 1) > VISIBILITY_THRESHOLD;
    const hipsVisible =
      (leftHip.visibility ?? 1) > VISIBILITY_THRESHOLD &&
      (rightHip.visibility ?? 1) > VISIBILITY_THRESHOLD;
    // 측면 촬영 시 먼 쪽 다리는 가시성이 낮을 수 있으므로 "한쪽 다리 이상"을 요구
    const fullBodyVisible = shouldersVisible && hipsVisible && (leftLegVisible || rightLegVisible);

    // 프레임 간 몸 중심점(어깨/엉덩이 중점) 이동량 — 기기 흔들림·인식 튐 감지
    const hipMid = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
    const shoulderMid = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
    };
    let unstable = false;
    if (this.prevHipMid && this.prevShoulderMid) {
      const hipMove = Math.hypot(hipMid.x - this.prevHipMid.x, hipMid.y - this.prevHipMid.y);
      const shoulderMove = Math.hypot(
        shoulderMid.x - this.prevShoulderMid.x,
        shoulderMid.y - this.prevShoulderMid.y,
      );
      unstable = Math.max(hipMove, shoulderMove) > JITTER_THRESHOLD;
    }
    this.prevHipMid = hipMid;
    this.prevShoulderMid = shoulderMid;

    if (fullBodyVisible && !unstable) {
      this.readyStreak += 1;
      this.lostStreak = 0;
    } else {
      this.readyStreak = 0;
      this.lostStreak += 1;
    }
    if (!this.isTracking && this.readyStreak >= READY_FRAMES) {
      this.isTracking = true;
    } else if (this.isTracking && this.lostStreak >= LOST_FRAMES) {
      this.isTracking = false;
      this.downStreak = 0;
      this.upStreak = 0;
    }

    // 전신이 안정적으로 잡히기 전(또는 흔들리는 프레임)에는 상태 머신·자세 경고를
    // 아예 돌리지 않음 — 몸 일부만 잡힌 상태의 쓰레기 각도로 카운트/경고 발동 방지
    if (!this.isTracking || unstable || !fullBodyVisible) {
      if (unstable) {
        this.downStreak = 0;
        this.upStreak = 0;
      }
      return {
        angles,
        state: this.poseState,
        feedback: this.isTracking
          ? '카메라를 고정해주세요.'
          : '전신이 카메라에 보이도록 서주세요.',
        count: this.count,
        repCompleted: false,
        tracking: this.isTracking,
      };
    }

    let targetKneeAngle = (angles.leftKnee + angles.rightKnee) / 2;
    let targetHipAngle = (angles.leftHip + angles.rightHip) / 2;
    if (leftLegVisible && !rightLegVisible) {
      targetKneeAngle = angles.leftKnee;
      targetHipAngle = angles.leftHip;
    } else if (!leftLegVisible && rightLegVisible) {
      targetKneeAngle = angles.rightKnee;
      targetHipAngle = angles.rightHip;
    }

    // 이번 프레임이 현재 렙에서 가장 깊은 지점이면 스켈레톤 스냅샷 후보 갱신.
    // 엉덩이 중점을 원점으로, 몸통 길이를 1로 정규화해 위치·거리와 무관하게
    // 렙끼리 자세 모양을 비교할 수 있게 저장한다. 렙 완료 시 확정 후 초기화.
    if (
      targetKneeAngle < 130 &&
      targetKneeAngle < (this.bottomCandidate?.kneeAngle ?? Infinity)
    ) {
      const torso =
        Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y) || 0.0001;
      this.bottomCandidate = {
        kneeAngle: targetKneeAngle,
        hipAngle: targetHipAngle,
        landmarks: landmarks.map((lm) => ({
          x: Math.round(((lm.x - hipMid.x) / torso) * 1000) / 1000,
          y: Math.round(((lm.y - hipMid.y) / torso) * 1000) / 1000,
        })),
      };
    }

    const kneeWidth = Math.abs(leftKnee.x - rightKnee.x);
    const ankleWidth = Math.abs(leftAnkle.x - rightAnkle.x);
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x) || 0.0001;
    const hipWidth = Math.abs(leftHip.x - rightHip.x) || 0.0001;

    // 무릎 모임 감지는 양쪽 무릎과 발목이 모두 선명하게 보일 때만 판단하여 측면 오작동 차단
    const isKneeCollapsing =
      leftLegVisible &&
      rightLegVisible &&
      targetKneeAngle < 120 &&
      kneeWidth < ankleWidth * 0.75;

    // ---- 카운팅을 막지 않는 보조 안내용 체크 (아래에서 우선순위대로 덮어씀) ----
    // 상체가 과도하게 앞으로 숙여짐 (엉덩이 각도가 지나치게 작음)
    const isLeaningForward = targetKneeAngle < 140 && targetHipAngle < 50;
    const isFrontView =
      leftLegVisible &&
      rightLegVisible &&
      hipWidth > shoulderWidth * 0.6 &&
      shoulderWidth > 0.15;

    // 몸이 좌우 한쪽으로 기울어짐 (양쪽 엉덩이 높이 차이가 엉덩이 폭 대비 큼)
    const isHipTilted =
      isFrontView &&
      Math.abs(leftHip.y - rightHip.y) > hipWidth * 0.35;
    // 중심축(양 발목 중점) 대비 몸통 좌우 쏠림 — 골반이 수평이어도 몸 전체가
    // 한쪽 다리 위로 이동/기울어진 경우를 감지. 정면 뷰에서만 의미 있음.
    const ankleMidX = (leftAnkle.x + rightAnkle.x) / 2;
    const isBodyShiftedSideways =
      isFrontView &&
      Math.max(Math.abs(shoulderMid.x - ankleMidX), Math.abs(hipMid.x - ankleMidX)) >
        shoulderWidth * 0.3;
    // 좌우 무릎 굽힘 비대칭 — 한쪽 무릎만 더 깊게 굽혀지는 경우. 정면 뷰에서 실제로
    // 앉는 중일 때만 판단(서 있을 때는 둘 다 ~180°라 무의미). 정면 투영 각도는 원근
    // 때문에 노이즈가 커서 임계값을 25°로 넉넉하게 둠 — 실기기 튜닝 대상.
    const isKneeBendAsymmetric =
      isFrontView &&
      targetKneeAngle < 150 &&
      Math.abs(angles.leftKnee - angles.rightKnee) > 25;
    // 고개가 많이 처짐 (코가 어깨 라인보다 많이 아래 = 시선이 바닥을 향함)
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;
    // 몸통 세로 길이 — 정규화 좌표는 카메라 거리에 따라 줄어들므로, 고정 임계값 대신
    // 몸의 다른 부위 대비 비율로 판단하기 위한 기준 (측면 뷰에서도 압축되지 않는 세로 지표)
    const torsoLen = Math.abs(hipMidY - shoulderMidY) || 0.0001;
    // 정면 뷰는 어깨 폭 대비, 측면 뷰는 어깨 폭이 압축되므로 몸통 길이 대비 비율로 판단.
    // (이전의 고정 임계치 0.06은 사용자가 멀리 설수록 정상 자세에서도 오경고 — 거리 의존적이라 교체)
    const isHeadDroppingDown = isFrontView
      ? (shoulderMidY - nose.y) < shoulderWidth * 0.25
      : (shoulderMidY - nose.y) < torsoLen * 0.15;
    // 스탠스(발 너비)가 어깨너비 대비 너무 좁거나 넓음 — 정면 뷰이고 서 있을 때만 의미 있는 지표
    const isStanceTooNarrow = isFrontView && ankleWidth < shoulderWidth * 0.6;
    const isStanceTooWide = isFrontView && ankleWidth > shoulderWidth * 1.8;

    let repCompleted = false;
    let state: SquatState;
    let feedback: string;

    if (isKneeCollapsing) {
      state = 'WARNING';
      feedback = '주의: 무릎이 안으로 모이고 있습니다. 발끝 방향으로 무릎을 넓혀주세요!';
      this.downStreak = 0;
      this.upStreak = 0;
    } else if (targetKneeAngle < 95) {
      // 연속 N프레임 유지될 때만 실제 상태 전환 — 단발 노이즈 프레임은 무시
      this.downStreak += 1;
      this.upStreak = 0;
      if (this.downStreak >= STATE_DEBOUNCE_FRAMES) {
        this.poseState = 'DOWN';
      }
      state = 'DOWN';
      feedback = '완전히 내려왔습니다. 천천히 무릎과 엉덩이를 펴며 일어서세요.';
    } else if (targetKneeAngle > 155) {
      this.upStreak += 1;
      this.downStreak = 0;
      state = 'UP';
      if (this.poseState === 'DOWN' && this.upStreak >= STATE_DEBOUNCE_FRAMES) {
        this.poseState = 'UP';
        this.count += 1;
        repCompleted = true;
        feedback = '좋습니다! 다음 횟수를 위해 천천히 내려가세요.';
        // 이번 렙의 최저점 스냅샷 확정
        if (this.bottomCandidate) {
          this.repSnapshots.push({
            rep: this.count,
            minKneeAngle: Math.round(this.bottomCandidate.kneeAngle),
            hipAngleAtBottom: Math.round(this.bottomCandidate.hipAngle),
            landmarks: this.bottomCandidate.landmarks,
          });
          this.bottomCandidate = null;
        }
      } else if (this.poseState === 'DOWN') {
        // 전환 확정 대기 중 (디바운스)
        feedback = '천천히 엉덩이를 뒤로 밀어 일어나세요.';
      } else {
        feedback = '몸을 곧게 펴고 스쿼트를 준비하세요.';
      }
    } else {
      state = this.poseState;
      this.downStreak = 0;
      this.upStreak = 0;
      feedback =
        this.poseState === 'DOWN'
          ? '천천히 엉덩이를 뒤로 밀어 일어나세요.'
          : '천천히 깊숙하게 앉으세요. 골반이 무릎 위치까지 내려가야 합니다.';
    }

    // 카운팅 로직은 위에서 이미 끝났으므로, 아래는 이번 프레임에 보여주고 말해줄
    // 피드백 문구만 우선순위대로 덮어쓴다 (무릎 모임이 최우선이라 이미 잡혔으면 건너뜀).
    if (state !== 'WARNING') {
      if (isLeaningForward) {
        state = 'WARNING';
        feedback = '주의: 상체가 너무 앞으로 숙여지고 있습니다. 가슴을 펴고 허리를 곧게 세워주세요!';
      } else if (isHipTilted) {
        state = 'WARNING';
        feedback = '주의: 몸이 한쪽으로 기울었습니다. 양쪽 다리에 체중을 균등하게 실어주세요.';
      } else if (isBodyShiftedSideways) {
        state = 'WARNING';
        feedback = '주의: 몸이 중심에서 한쪽으로 쏠렸습니다. 체중을 양발 가운데로 옮겨주세요.';
      } else if (isKneeBendAsymmetric) {
        state = 'WARNING';
        feedback = '주의: 한쪽 무릎만 더 굽혀지고 있습니다. 양쪽 무릎을 같은 깊이로 굽혀주세요.';
      } else if (isHeadDroppingDown) {
        state = 'WARNING';
        feedback = '고개를 들고 정면을 바라보세요.';
      } else if (this.poseState === 'UP' && isStanceTooNarrow) {
        state = 'WARNING';
        feedback = '발 너비가 너무 좁습니다. 어깨 너비만큼 벌려주세요.';
      } else if (this.poseState === 'UP' && isStanceTooWide) {
        state = 'WARNING';
        feedback = '발 너비가 너무 넓습니다. 어깨 너비 정도로 좁혀주세요.';
      }
    }

    return { angles, state, feedback, count: this.count, repCompleted, tracking: true };
  }
}
