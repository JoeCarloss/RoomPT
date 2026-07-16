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
 * Rule-based squat rep counter, ported from the web PoC's App.tsx state
 * machine. Same thresholds (knee angle < 95deg = down, > 155deg = up,
 * knee-width < 75% of ankle-width while descending = knee collapse).
 */
export class SquatAnalyzer {
  private poseState: 'UP' | 'DOWN' = 'UP';
  private count = 0;

  reset(): void {
    this.poseState = 'UP';
    this.count = 0;
  }

  analyze(landmarks: Landmark[]): SquatAnalysis {
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
    const leftVisible = (leftKnee.visibility ?? 1) > 0.5 && (leftAnkle.visibility ?? 1) > 0.5;
    const rightVisible = (rightKnee.visibility ?? 1) > 0.5 && (rightAnkle.visibility ?? 1) > 0.5;

    let targetKneeAngle = (angles.leftKnee + angles.rightKnee) / 2;
    if (leftVisible && !rightVisible) {
      targetKneeAngle = angles.leftKnee;
    } else if (!leftVisible && rightVisible) {
      targetKneeAngle = angles.rightKnee;
    }

    const kneeWidth = Math.abs(leftKnee.x - rightKnee.x);
    const ankleWidth = Math.abs(leftAnkle.x - rightAnkle.x);
    
    // 무릎 모임 감지는 양쪽 무릎과 발목이 모두 선명하게 보일 때만 판단하여 측면 오작동 차단
    const isKneeCollapsing = 
      leftVisible && 
      rightVisible && 
      targetKneeAngle < 120 && 
      kneeWidth < ankleWidth * 0.75;

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

    return { angles, state, feedback, count: this.count, repCompleted };
  }
}
