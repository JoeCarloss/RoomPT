import type { Landmark } from 'react-native-mediapipe';

/**
 * 1€ 필터 (One Euro Filter, Casiez et al. 2012) — 실시간 신호의 지터를 줄이는
 * 적응형 저역통과 필터. 느린 움직임에선 강하게 스무딩해 떨림을 없애고, 빠른
 * 움직임에선 컷오프를 높여 지연(lag)을 최소화한다. MediaPipe 포즈 랜드마크가
 * 매 프레임 미세하게 떨리는 것을 원천에서 깎아내, 상태 전환 오작동과 스켈레톤
 * 흔들림을 함께 완화한다.
 */
class LowPassFilter {
  private hatX: number | null = null;

  filter(x: number, smoothing: number): number {
    this.hatX = this.hatX === null ? x : smoothing * x + (1 - smoothing) * this.hatX;
    return this.hatX;
  }

  reset(): void {
    this.hatX = null;
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class OneEuroFilter {
  private readonly xFilter = new LowPassFilter();
  private readonly dxFilter = new LowPassFilter();
  private prevX: number | null = null;

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff: number,
  ) {}

  /** dt: 직전 프레임과의 시간 간격(초). */
  filter(x: number, dt: number): number {
    const dx = this.prevX === null ? 0 : (x - this.prevX) / dt;
    const edx = this.dxFilter.filter(dx, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    this.prevX = x;
    return this.xFilter.filter(x, alpha(cutoff, dt));
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.prevX = null;
  }
}

// 1차 추정치 — minCutoff를 낮추면 더 부드럽지만 지연↑, beta를 높이면 빠른 동작의
// 지연↓. 정규화 좌표(0~1) 기준이며 실기기에서 스켈레톤 부드러움 vs 반응성 보고 튜닝.
const MIN_CUTOFF = 1.7;
const BETA = 0.4;
const D_CUTOFF = 1.0;
// dt가 비정상(첫 프레임, 앱 복귀 후 큰 공백)일 때 쓰는 기본 간격(초, ~30fps 가정)
const DEFAULT_DT = 1 / 30;

/**
 * 33개 랜드마크의 x/y를 각각 1€ 필터로 스무딩. visibility·z 등 나머지 필드는
 * 그대로 통과시킨다. 인식이 끊기면 reset()으로 재획득 시 이전 좌표에서 끌려오는
 * 현상을 막는다.
 */
export class LandmarkFilter {
  private readonly filters = new Map<number, { x: OneEuroFilter; y: OneEuroFilter }>();
  private prevTimeSec: number | null = null;

  /** timeSec: 프레임 타임스탬프(초, 예: Date.now()/1000). */
  filter(landmarks: Landmark[], timeSec: number): Landmark[] {
    let dt = this.prevTimeSec === null ? DEFAULT_DT : timeSec - this.prevTimeSec;
    // 시계 역행·과도한 공백·0은 필터를 망가뜨리므로 방어
    if (!(dt > 0) || dt > 1) {
      dt = DEFAULT_DT;
    }
    this.prevTimeSec = timeSec;

    return landmarks.map((lm, i) => {
      let pair = this.filters.get(i);
      if (!pair) {
        pair = {
          x: new OneEuroFilter(MIN_CUTOFF, BETA, D_CUTOFF),
          y: new OneEuroFilter(MIN_CUTOFF, BETA, D_CUTOFF),
        };
        this.filters.set(i, pair);
      }
      return { ...lm, x: pair.x.filter(lm.x, dt), y: pair.y.filter(lm.y, dt) };
    });
  }

  reset(): void {
    this.filters.clear();
    this.prevTimeSec = null;
  }
}
