import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { KnownPoseLandmarkConnections } from 'react-native-mediapipe';

export interface OverlayPoint {
  x: number;
  y: number;
  visibility?: number;
}

interface PoseOverlayProps {
  /** Landmarks already converted to view-pixel space (see ViewCoordinator.convertPoint). */
  landmarks: OverlayPoint[] | null;
  width: number;
  height: number;
}

const VISIBILITY_THRESHOLD = 0.5;

export function PoseOverlay({ landmarks, width, height }: PoseOverlayProps) {
  if (!landmarks || width === 0 || height === 0) return null;

  return (
    <Svg width={width} height={height} style={styles.overlay}>
      {KnownPoseLandmarkConnections.map(([i, j], index) => {
        const p1 = landmarks[i];
        const p2 = landmarks[j];
        if (
          !p1 ||
          !p2 ||
          (p1.visibility ?? 1) < VISIBILITY_THRESHOLD ||
          (p2.visibility ?? 1) < VISIBILITY_THRESHOLD
        ) {
          return null;
        }
        return (
          <Line
            key={index}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke="rgba(0, 229, 255, 0.85)"
            strokeWidth={4}
          />
        );
      })}
      {landmarks.map((landmark, index) => {
        if ((landmark.visibility ?? 1) < VISIBILITY_THRESHOLD) return null;
        return (
          <Circle key={index} cx={landmark.x} cy={landmark.y} r={4} fill="#ffffff" />
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
