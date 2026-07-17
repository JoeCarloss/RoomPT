import React, { useCallback, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  MediapipeCamera,
  RunningMode,
  usePoseDetection,
  type DetectionError,
  type PoseDetectionResultBundle,
  type ViewCoordinator,
} from 'react-native-mediapipe';
import { useCameraPermission, type CameraPosition } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PoseOverlay, type OverlayPoint } from '../components/PoseOverlay';
import { SquatAnalyzer, type SquatAnalysis } from '../squat/squatAnalyzer';
import { speak } from '../services/tts';
import { saveRecord } from '../services/workoutStorage';

// react-native-asset links assets/models/* into android/app/src/main/assets/custom/
// on Android, but flattens into the app bundle root on iOS.
const MODEL_NAME =
  Platform.OS === 'android' ? 'custom/pose_landmarker_lite.task' : 'pose_landmarker_lite.task';

const INITIAL_ANALYSIS: SquatAnalysis = {
  angles: { leftKnee: 180, rightKnee: 180, leftHip: 180, rightHip: 180 },
  state: 'UP',
  feedback: '카메라 앞에 서서 스쿼트 동작을 시작하세요.',
  count: 0,
  repCompleted: false,
};

interface CameraScreenProps {
  onShowGuide: () => void;
  onShowHistory: () => void;
}

export function CameraScreen({ onShowGuide, onShowHistory }: CameraScreenProps) {
  const camPermission = useCameraPermission();
  const insets = useSafeAreaInsets();
  const [hasCamPermission, setHasCamPermission] = useState(camPermission.hasPermission);
  const [activeCamera, setActiveCamera] = useState<CameraPosition>('front');
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [overlayPoints, setOverlayPoints] = useState<OverlayPoint[] | null>(null);
  const [analysis, setAnalysis] = useState<SquatAnalysis>(INITIAL_ANALYSIS);

  const analyzerRef = useRef(new SquatAnalyzer());
  // 운동 시간(durationSec) = 첫 1회 완료 ~ 마지막 회 완료. 저장 버튼 누르는 시각 기준으로
  // 재면 마지막 스쿼트 후 쉰 시간까지 부풀려지므로 마지막 회 완료 시각을 따로 기록한다.
  const firstRepAtRef = useRef<number | null>(null);
  const lastRepAtRef = useRef<number | null>(null);
  // 완료 버튼 더블탭으로 같은 세션이 중복 저장되는 것 방지
  const savingRef = useRef(false);
  const frameCounterRef = useRef(0);

  const requestPermission = useCallback(() => {
    camPermission.requestPermission().then(setHasCamPermission);
  }, [camPermission]);

  const onResults = useCallback(
    (result: PoseDetectionResultBundle, vc: ViewCoordinator) => {
      const poseLandmarks = result.results[0]?.landmarks[0];
      if (!poseLandmarks || poseLandmarks.length === 0) {
        setOverlayPoints(null);
        return;
      }

      // 2프레임당 1회만 화면 스켈레톤 라인(overlayPoints) 업데이트를 수행하여 UI 렌더링 부하 완화
      frameCounterRef.current += 1;
      if (frameCounterRef.current % 2 === 0) {
        const frameDims = vc.getFrameDims(result);
        setOverlayPoints(
          poseLandmarks.map((lm) => ({
            ...vc.convertPoint(frameDims, { x: lm.x, y: lm.y }),
            visibility: lm.visibility,
          })),
        );
      }

      const next = analyzerRef.current.analyze(poseLandmarks);
      
      setAnalysis((prev) => {
        // Prevent state updates and components re-rendering if there is no significant change in metrics
        if (
          prev.count === next.count &&
          prev.state === next.state &&
          prev.feedback === next.feedback &&
          Math.abs(prev.angles.leftKnee - next.angles.leftKnee) < 2.0 &&
          Math.abs(prev.angles.rightKnee - next.angles.rightKnee) < 2.0 &&
          Math.abs(prev.angles.leftHip - next.angles.leftHip) < 3.0 &&
          Math.abs(prev.angles.rightHip - next.angles.rightHip) < 3.0
        ) {
          return prev;
        }
        return next;
      });

      if (next.state === 'WARNING') {
        speak(next.feedback);
      } else if (next.repCompleted) {
        const now = Date.now();
        if (firstRepAtRef.current === null) {
          firstRepAtRef.current = now;
        }
        lastRepAtRef.current = now;
        speak(`${next.count}회!`, true);
      }
    },
    [],
  );

  const onError = useCallback((error: DetectionError) => {
    console.warn('[pose detection]', error.code, error.message);
  }, []);

  const poseDetection = usePoseDetection(
    { onResults, onError },
    RunningMode.LIVE_STREAM,
    MODEL_NAME,
    { fpsMode: 'none' },
  );

  const reset = useCallback(() => {
    analyzerRef.current.reset();
    firstRepAtRef.current = null;
    lastRepAtRef.current = null;
    setAnalysis(INITIAL_ANALYSIS);
  }, []);

  const finishWorkout = useCallback(() => {
    if (savingRef.current) {
      return;
    }
    const reps = analyzerRef.current.getCount();
    if (reps === 0) {
      Alert.alert('저장할 기록 없음', '스쿼트를 1회 이상 완료한 뒤 저장할 수 있습니다.');
      return;
    }
    const durationSec =
      firstRepAtRef.current === null || lastRepAtRef.current === null
        ? 0
        : Math.round((lastRepAtRef.current - firstRepAtRef.current) / 1000);
    savingRef.current = true;
    saveRecord({ endedAt: new Date().toISOString(), reps, durationSec })
      .then(() => {
        speak(`운동 완료! ${reps}회 기록했습니다.`, true);
        reset();
      })
      .catch(() => {
        Alert.alert('저장 실패', '기록을 저장하지 못했습니다. 다시 시도해주세요.');
      })
      .finally(() => {
        savingRef.current = false;
      });
  }, [reset]);

  const flipCamera = useCallback(() => {
    setActiveCamera((prev) => (prev === 'front' ? 'back' : 'front'));
  }, []);

  if (!hasCamPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>
          실시간 자세 분석을 위해 카메라 권한이 필요합니다.
        </Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>권한 허용</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) =>
        setViewSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      <MediapipeCamera
        style={StyleSheet.absoluteFill}
        solution={poseDetection}
        activeCamera={activeCamera}
        resizeMode="cover"
      />
      <PoseOverlay landmarks={overlayPoints} width={viewSize.width} height={viewSize.height} />

      <View style={[styles.topBar, { top: insets.top > 0 ? insets.top + 8 : 16 }]}>
        <View
          style={[
            styles.stateBadge,
            analysis.state === 'WARNING'
              ? styles.stateBadgeWarning
              : analysis.state === 'DOWN'
                ? styles.stateBadgeDown
                : styles.stateBadgeUp,
          ]}
        >
          <Text style={styles.stateBadgeText}>SQUAT : {analysis.state}</Text>
        </View>
        <View style={styles.topBarButtons}>
          <Pressable style={styles.flipButton} onPress={onShowGuide}>
            <Text style={styles.flipButtonText}>?</Text>
          </Pressable>
          <Pressable style={styles.flipButton} onPress={onShowHistory}>
            <Text style={styles.flipButtonText}>기록</Text>
          </Pressable>
          <Pressable style={styles.flipButton} onPress={flipCamera}>
            <Text style={styles.flipButtonText}>카메라 전환</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom > 0 ? insets.bottom + 16 : 20 }]}>
        <View style={styles.countRow}>
          <Text style={styles.countText}>{analysis.count}</Text>
          <Text style={styles.countLabel}>회 (REPS)</Text>
          <Pressable style={styles.finishButton} onPress={finishWorkout}>
            <Text style={styles.finishButtonText}>완료</Text>
          </Pressable>
          <Pressable style={styles.resetButton} onPress={reset}>
            <Text style={styles.resetButtonText}>초기화</Text>
          </Pressable>
        </View>
        <Text style={styles.angleText}>
          L: {analysis.angles.leftKnee.toFixed(0)}° / R: {analysis.angles.rightKnee.toFixed(0)}°
        </Text>
        <Text
          style={[
            styles.feedbackText,
            analysis.state === 'WARNING' && styles.feedbackTextWarning,
          ]}
        >
          {analysis.feedback}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0b0f19',
    gap: 16,
  },
  permissionText: {
    color: '#f8fafc',
    fontSize: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#00e5ff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: {
    color: '#000',
    fontWeight: '700',
  },
  topBar: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stateBadge: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  stateBadgeUp: { backgroundColor: '#39ff14' },
  stateBadgeDown: { backgroundColor: '#00e5ff' },
  stateBadgeWarning: { backgroundColor: '#ff2a6d' },
  stateBadgeText: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    color: '#000',
  },
  topBarButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  flipButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  flipButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(11,15,25,0.85)',
    padding: 20,
    gap: 8,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  countText: {
    fontSize: 48,
    fontWeight: '800',
    color: '#fff',
  },
  countLabel: {
    fontSize: 14,
    color: '#94a3b8',
    flex: 1,
  },
  finishButton: {
    backgroundColor: '#00e5ff',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  finishButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  resetButton: {
    backgroundColor: '#1b243d',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  resetButtonText: {
    color: '#f8fafc',
    fontSize: 12,
  },
  angleText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  feedbackText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  feedbackTextWarning: {
    color: '#ff2a6d',
  },
});
