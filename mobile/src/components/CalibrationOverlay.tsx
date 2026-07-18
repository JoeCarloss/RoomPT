import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

interface CalibrationOverlayProps {
  width: number;
  height: number;
  /** 전신 인식 대기 진행률 0~1 */
  progress: number;
  /** 어느 부위를 맞춰야 하는지 등 구체 안내 문구 */
  hint: string;
}

/**
 * 운동 시작 전(전신 인식 대기) 화면에 표시되는 캘리브레이션 가이드.
 * 화면 중앙에 사람 실루엣 아웃라인을 점선으로 그려 "이 안에 전신을 맞추세요"를
 * 유도하고, 인식이 안정될수록(readyProgress) 실루엣이 회색→시안으로 차오른다.
 * 정적 SVG 다이어그램 가이드와 달리 실시간으로 반응하는 셋업 UX.
 */
export function CalibrationOverlay({ width, height, progress, hint }: CalibrationOverlayProps) {
  if (width === 0 || height === 0) {
    return null;
  }

  // 실루엣을 화면 세로의 약 70%로, 가로 중앙에 배치
  const cx = width / 2;
  const figureH = height * 0.7;
  const top = (height - figureH) / 2;
  const unit = figureH / 8; // 머리~발까지 대략 8단위

  const headR = unit * 0.55;
  const headCy = top + headR;
  const shoulderY = top + unit * 1.5;
  const hipY = top + unit * 4.2;
  const footY = top + figureH;
  const shoulderHalf = unit * 1.15;
  const hipHalf = unit * 0.8;
  const footHalf = unit * 0.9;

  // 진행률에 따라 실루엣 색이 회색 → 시안으로. 아직 스켈레톤은 PoseOverlay가 그림.
  const stroke = progress >= 1 ? '#39ff14' : progress > 0.01 ? '#00e5ff' : '#94a3b8';
  const strokeOpacity = 0.5 + progress * 0.5;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        {/* 머리 */}
        <Circle
          cx={cx}
          cy={headCy}
          r={headR}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={3}
          strokeDasharray="8 8"
          fill="none"
        />
        {/* 몸통(어깨→골반) */}
        <Path
          d={`M ${cx - shoulderHalf} ${shoulderY} L ${cx + shoulderHalf} ${shoulderY} L ${cx + hipHalf} ${hipY} L ${cx - hipHalf} ${hipY} Z`}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={3}
          strokeDasharray="8 8"
          fill="none"
        />
        {/* 팔 */}
        <Line
          x1={cx - shoulderHalf}
          y1={shoulderY}
          x2={cx - shoulderHalf - unit * 0.6}
          y2={hipY}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={3}
          strokeDasharray="8 8"
        />
        <Line
          x1={cx + shoulderHalf}
          y1={shoulderY}
          x2={cx + shoulderHalf + unit * 0.6}
          y2={hipY}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={3}
          strokeDasharray="8 8"
        />
        {/* 다리 */}
        <Line
          x1={cx - hipHalf}
          y1={hipY}
          x2={cx - footHalf}
          y2={footY}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={3}
          strokeDasharray="8 8"
        />
        <Line
          x1={cx + hipHalf}
          y1={hipY}
          x2={cx + footHalf}
          y2={footY}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={3}
          strokeDasharray="8 8"
        />
      </Svg>

      <View style={[styles.hintBox, { top: top + figureH + 12 }]}>
        <Text style={styles.hintText}>{hint}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.subCaption}>
          실루엣에 정확히 맞출 필요는 없어요 — 전신만 화면에 들어오면 됩니다
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hintBox: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 10,
  },
  hintText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  progressTrack: {
    width: '70%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(148,163,184,0.4)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#00e5ff',
  },
  subCaption: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
});
