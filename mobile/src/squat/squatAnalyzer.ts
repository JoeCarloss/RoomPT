import { KnownPoseLandmarks, type Landmark } from 'react-native-mediapipe';

export interface JointAngles {
  leftKnee: number;
  rightKnee: number;
  leftHip: number;
  rightHip: number;
}

export type SquatState = 'UP' | 'DOWN' | 'WARNING';

export interface SquatAnalysis {
  angles: JointAngles;
  state: SquatState;
  feedback: string;
  count: number;
  repCompleted: boolean;
}

const VISIBILITY_THRESHOLD = 0.5;

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

  reset(): void {
    this.poseState = 'UP';
    this.count = 0;
  }

  getCount(): number {
    return this.count;
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

    let targetKneeAngle = (angles.leftKnee + angles.rightKnee) / 2;
    let targetHipAngle = (angles.leftHip + angles.rightHip) / 2;
    if (leftLegVisible && !rightLegVisible) {
      targetKneeAngle = angles.leftKnee;
      targetHipAngle = angles.leftHip;
    } else if (!leftLegVisible && rightLegVisible) {
      targetKneeAngle = angles.rightKnee;
      targetHipAngle = angles.rightHip;
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
    // 몸이 좌우 한쪽으로 기울어짐 (양쪽 엉덩이 높이 차이가 엉덩이 폭 대비 큼)
    const isHipTilted =
      leftLegVisible &&
      rightLegVisible &&
      hipWidth > shoulderWidth * 0.6 &&
      Math.abs(leftHip.y - rightHip.y) > hipWidth * 0.35;
    // 고개가 많이 처짐 (코가 어깨 라인보다 많이 아래 = 시선이 바닥을 향함)
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const isHeadDroppingDown = shoulderMidY - nose.y < shoulderWidth * 0.25;
    // 스탠스(발 너비)가 어깨너비 대비 너무 좁거나 넓음 — 서 있을 때만 의미 있는 지표
    const isStanceTooNarrow = ankleWidth < shoulderWidth * 0.6;
    const isStanceTooWide = ankleWidth > shoulderWidth * 1.8;

    let repCompleted = false;
    let state: SquatState;
    let feedback: string;

    if (isKneeCollapsing) {
      state = 'WARNING';
      feedback = '주의: 무릎이 안으로 모이고 있습니다. 발끝 방향으로 무릎을 넓혀주세요!';
    } else if (targetKneeAngle < 95) {
      state = 'DOWN';
      this.poseState = 'DOWN';
      feedback = '완전히 내려왔습니다. 천천히 무릎과 엉덩이를 펴며 일어서세요.';
    } else if (targetKneeAngle > 155) {
      state = 'UP';
      if (this.poseState === 'DOWN') {
        this.poseState = 'UP';
        this.count += 1;
        repCompleted = true;
        feedback = '좋습니다! 다음 횟수를 위해 천천히 내려가세요.';
      } else {
        feedback = '몸을 곧게 펴고 스쿼트를 준비하세요.';
      }
    } else {
      state = this.poseState;
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

    return { angles, state, feedback, count: this.count, repCompleted };
  }
}
