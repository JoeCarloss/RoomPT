import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, StyleSheet, Text, View, PermissionsAndroid } from 'react-native';
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
import { CalibrationOverlay } from '../components/CalibrationOverlay';
import { SquatAnalyzer, type SquatAnalysis } from '../squat/squatAnalyzer';
import { LandmarkFilter } from '../pose/oneEuroFilter';
import { speak, stopSpeaking } from '../services/tts';
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
  tracking: false,
  readyProgress: 0,
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
  // 랜드마크 지터를 1€ 필터로 스무딩 — 분석·오버레이 공통 소스에 적용
  const landmarkFilterRef = useRef(new LandmarkFilter());
  // 운동 시간(durationSec) = 첫 1회 완료 ~ 마지막 회 완료. 저장 버튼 누르는 시각 기준으로
  // 재면 마지막 스쿼트 후 쉰 시간까지 부풀려지므로 마지막 회 완료 시각을 따로 기록한다.
  const firstRepAtRef = useRef<number | null>(null);
  const lastRepAtRef = useRef<number | null>(null);
  // 완료 버튼 더블탭으로 같은 세션이 중복 저장되는 것 방지
  const savingRef = useRef(false);
  const frameCounterRef = useRef(0);

  // 잠금·백그라운드 전환 시 카메라(언마운트)와 TTS를 즉시 정지 — 화면이 꺼진 뒤에도
  // 프레임 분석과 음성 안내가 계속 도는 문제 방지. 카운트 등은 ref에 있어 복귀 후 유지됨.
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const appActiveRef = useRef(appActive);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active';
      appActiveRef.current = active;
      setAppActive(active);
      if (!active) {
        stopSpeaking();
        // 복귀 시 큰 시간 공백으로 필터가 튀지 않게 리셋
        landmarkFilterRef.current.reset();
      }
    });
    return () => sub.remove();
  }, []);

  const requestPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        setHasCamPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
        // "다시 묻지 않음"으로 거부되면 request가 다이얼로그 없이 즉시 never_ask_again을
        // 반환해 버튼이 먹통이 됨 — 시스템 설정으로 안내해 막다른 상태 탈출
        if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          Alert.alert(
            '카메라 권한 필요',
            '설정에서 카메라 권한을 직접 허용해주세요.',
            [
              { text: '취소', style: 'cancel' },
              { text: '설정 열기', onPress: () => Linking.openSettings() },
            ],
          );
        }
      } catch (err) {
        console.warn(err);
      }
    } else {
      camPermission.requestPermission().then(setHasCamPermission);
    }
  }, [camPermission]);

  const onResults = useCallback(
    (result: PoseDetectionResultBundle, vc: ViewCoordinator) => {
      // 언마운트 직전에 도착한 마지막 프레임들이 백그라운드에서 처리되지 않게 가드
      if (!appActiveRef.current) {
        return;
      }
      const rawLandmarks = result.results[0]?.landmarks[0];
      if (!rawLandmarks || rawLandmarks.length === 0) {
        // 인식 끊김 — 필터를 리셋해 재획득 시 이전 좌표에서 끌려오지 않게
        landmarkFilterRef.current.reset();
        setOverlayPoints(null);
        return;
      }

      // 1€ 필터로 지터 스무딩 후 분석·오버레이 모두 이 좌표를 사용
      const poseLandmarks = landmarkFilterRef.current.filter(rawLandmarks, Date.now() / 1000);

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
          prev.tracking === next.tracking &&
          // 캘리브레이션 진행 링이 스로틀에 막혀 멈추지 않도록 진행률 변화도 반영
          prev.readyProgress === next.readyProgress &&
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
    landmarkFilterRef.current.reset();
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
    const repSnapshots = analyzerRef.current.getRepSnapshots();
    const scored = repSnapshots.filter((s) => typeof s.score === 'number');
    const avgScore =
      scored.length > 0
        ? Math.round(scored.reduce((a, s) => a + (s.score ?? 0), 0) / scored.length)
        : null;
    savingRef.current = true;
    saveRecord({
      endedAt: new Date().toISOString(),
      reps,
      durationSec,
      repSnapshots: repSnapshots.length > 0 ? repSnapshots : undefined,
    })
      .then(() => {
        speak(
          avgScore !== null
            ? `운동 완료! ${reps}회, 평균 폼 점수 ${avgScore}점입니다.`
            : `운동 완료! ${reps}회 기록했습니다.`,
          true,
        );
        Alert.alert(
          '세트 완료',
          avgScore !== null
            ? `스쿼트 ${reps}회 · 평균 폼 점수 ${avgScore}점\n기록 화면에서 렙별 분석을 볼 수 있습니다.`
            : `스쿼트 ${reps}회를 기록했습니다.`,
        );
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
      {appActive && (
        <MediapipeCamera
          style={StyleSheet.absoluteFill}
          solution={poseDetection}
          activeCamera={activeCamera}
          resizeMode="cover"
        />
      )}
      <PoseOverlay landmarks={overlayPoints} width={viewSize.width} height={viewSize.height} />

      {!analysis.tracking && (
        <CalibrationOverlay
          width={viewSize.width}
          height={viewSize.height}
          progress={analysis.readyProgress}
          hint={analysis.feedback}
        />
      )}

      <View style={[styles.topBar, { top: insets.top > 0 ? insets.top + 8 : 16 }]}>
        <View
          style={[
            styles.stateBadge,
            !analysis.tracking
              ? styles.stateBadgeSearching
              : analysis.state === 'WARNING'
                ? styles.stateBadgeWarning
                : analysis.state === 'DOWN'
                  ? styles.stateBadgeDown
                  : styles.stateBadgeUp,
          ]}
        >
          <Text style={[styles.stateBadgeText, !analysis.tracking && styles.stateBadgeTextSearching]}>
            {analysis.tracking ? `SQUAT : ${analysis.state}` : '전신 인식 중...'}
          </Text>
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
  stateBadgeSearching: { backgroundColor: '#1b243d' },
  stateBadgeText: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    color: '#000',
  },
  stateBadgeTextSearching: {
    color: '#94a3b8',
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
