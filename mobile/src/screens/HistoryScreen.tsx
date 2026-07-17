import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  clearRecords,
  deleteRecord,
  loadRecords,
  type WorkoutRecord,
} from '../services/workoutStorage';
import type { RepSnapshot } from '../squat/squatAnalyzer';

// BlazePose 33포인트 스킴의 몸통·다리 인덱스 (어깨 11/12, 엉덩이 23/24, 무릎 25/26, 발목 27/28)
const SKELETON_POINTS = [11, 12, 23, 24, 25, 26, 27, 28];
const SKELETON_CONNECTIONS: Array<[number, number]> = [
  [11, 12],
  [23, 24],
  [11, 23],
  [12, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
];

/** 렙별 최저점 스냅샷들의 일관성 분석: 깊이 차트 + 스켈레톤 겹쳐 그리기 */
function RepConsistency({ snapshots }: { snapshots: RepSnapshot[] }) {
  const angles = snapshots.map((s) => s.minKneeAngle);
  const mean = Math.round(angles.reduce((a, b) => a + b, 0) / angles.length);
  const spread = Math.max(...angles) - Math.min(...angles);
  const consistencyLabel =
    spread <= 8 ? '매우 일정해요 👍' : spread <= 15 ? '대체로 일정해요' : '깊이가 들쭉날쭉해요 — 일정한 깊이를 목표로 해보세요';

  // 모든 스냅샷의 스켈레톤을 한 화면에 겹쳐 그리기 위한 공통 스케일 계산
  const W = 220;
  const H = 200;
  const PAD = 16;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of snapshots) {
    for (const i of SKELETON_POINTS) {
      const p = s.landmarks[i];
      if (!p) {
        continue;
      }
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offsetX = PAD + ((W - PAD * 2) - spanX * scale) / 2;
  const offsetY = PAD + ((H - PAD * 2) - spanY * scale) / 2;
  const tx = (x: number) => offsetX + (x - minX) * scale;
  const ty = (y: number) => offsetY + (y - minY) * scale;

  return (
    <View style={styles.analysisBox}>
      <Text style={styles.analysisTitle}>
        자세 일관성 — 평균 깊이 {mean}° · 편차 {spread}°
      </Text>
      <Text style={styles.analysisLabel}>{consistencyLabel}</Text>

      {snapshots.map((s) => {
        // 깊이(최저점 무릎 각도)를 바 길이로: 60°(매우 깊음)~130°(얕음) 범위 매핑
        const pct = Math.min(100, Math.max(5, ((130 - s.minKneeAngle) / 70) * 100));
        return (
          <View key={s.rep} style={styles.depthRow}>
            <Text style={styles.depthRep}>{s.rep}회</Text>
            <View style={styles.depthTrack}>
              <View style={[styles.depthFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.depthAngle}>{s.minKneeAngle}°</Text>
          </View>
        );
      })}

      <Text style={styles.overlayCaption}>
        최저점 스켈레톤 겹쳐보기 — 선이 퍼져 보일수록 렙마다 자세가 달랐다는 뜻
      </Text>
      <View style={styles.overlayWrap}>
        <Svg width={W} height={H}>
          {snapshots.map((s) =>
            SKELETON_CONNECTIONS.map(([a, b]) => {
              const pa = s.landmarks[a];
              const pb = s.landmarks[b];
              if (!pa || !pb) {
                return null;
              }
              return (
                <Line
                  key={`${s.rep}-${a}-${b}`}
                  x1={tx(pa.x)}
                  y1={ty(pa.y)}
                  x2={tx(pb.x)}
                  y2={ty(pb.y)}
                  stroke="#00e5ff"
                  strokeOpacity={0.35}
                  strokeWidth={2}
                />
              );
            }),
          )}
        </Svg>
      </View>
    </View>
  );
}

interface HistoryScreenProps {
  onClose: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mi = `${d.getMinutes()}`.padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd} ${hh}:${mi}`;
}

function formatDuration(sec: number): string {
  if (sec < 60) {
    return `${sec}초`;
  }
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

export function HistoryScreen({ onClose }: HistoryScreenProps) {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<WorkoutRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadRecords().then(setRecords);
  }, []);

  const handleDelete = useCallback((record: WorkoutRecord) => {
    Alert.alert('기록 삭제', `${formatDate(record.endedAt)} · ${record.reps}회 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteRecord(record.id).then(() =>
            setRecords((prev) => prev?.filter((r) => r.id !== record.id) ?? prev),
          );
        },
      },
    ]);
  }, []);

  const handleClearAll = useCallback(() => {
    Alert.alert('전체 삭제', '모든 운동 기록을 삭제할까요? 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '전체 삭제',
        style: 'destructive',
        onPress: () => {
          clearRecords().then(() => setRecords([]));
        },
      },
    ]);
  }, []);

  const totalReps = records?.reduce((sum, r) => sum + r.reps, 0) ?? 0;
  const totalSessions = records?.length ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.title}>운동 기록</Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>닫기</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalSessions}</Text>
          <Text style={styles.statLabel}>총 세션</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalReps}</Text>
          <Text style={styles.statLabel}>누적 스쿼트</Text>
        </View>
      </View>

      {records === null ? (
        <Text style={styles.emptyText}>불러오는 중...</Text>
      ) : records.length === 0 ? (
        <Text style={styles.emptyText}>
          아직 저장된 기록이 없습니다.{'\n'}운동 후 "완료" 버튼을 누르면 기록이 저장됩니다.
        </Text>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const hasSnapshots = (item.repSnapshots?.length ?? 0) > 0;
            const expanded = selectedId === item.id;
            return (
              <View style={styles.recordCard}>
                <Pressable
                  style={styles.recordRow}
                  onPress={() =>
                    hasSnapshots && setSelectedId(expanded ? null : item.id)
                  }
                >
                  <View style={styles.recordInfo}>
                    <Text style={styles.recordDate}>{formatDate(item.endedAt)}</Text>
                    <Text style={styles.recordDetail}>
                      스쿼트 {item.reps}회 · {formatDuration(item.durationSec)}
                    </Text>
                    {hasSnapshots && (
                      <Text style={styles.recordHint}>
                        {expanded ? '탭하여 분석 접기 ▲' : '탭하여 자세 분석 보기 ▼'}
                      </Text>
                    )}
                  </View>
                  <Pressable style={styles.deleteButton} onPress={() => handleDelete(item)}>
                    <Text style={styles.deleteButtonText}>삭제</Text>
                  </Pressable>
                </Pressable>
                {expanded && item.repSnapshots && (
                  <RepConsistency snapshots={item.repSnapshots} />
                )}
              </View>
            );
          }}
          ListFooterComponent={
            <Pressable style={styles.clearAllButton} onPress={handleClearAll}>
              <Text style={styles.clearAllButtonText}>전체 기록 삭제</Text>
            </Pressable>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
  },
  closeButton: {
    backgroundColor: '#1b243d',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  closeButtonText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    color: '#00e5ff',
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 22,
  },
  list: {
    gap: 10,
    paddingBottom: 24,
  },
  recordCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  recordInfo: {
    flex: 1,
    gap: 4,
  },
  recordHint: {
    color: '#00e5ff',
    fontSize: 11,
  },
  analysisBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1b243d',
    padding: 14,
    gap: 8,
  },
  analysisTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  analysisLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 4,
  },
  depthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  depthRep: {
    color: '#94a3b8',
    fontSize: 11,
    width: 32,
    textAlign: 'right',
  },
  depthTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1b243d',
    overflow: 'hidden',
  },
  depthFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#00e5ff',
  },
  depthAngle: {
    color: '#f8fafc',
    fontSize: 11,
    width: 36,
  },
  overlayCaption: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 8,
  },
  overlayWrap: {
    alignItems: 'center',
  },
  recordDate: {
    color: '#94a3b8',
    fontSize: 12,
  },
  recordDetail: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1b243d',
  },
  deleteButtonText: {
    color: '#ff2a6d',
    fontSize: 12,
  },
  clearAllButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  clearAllButtonText: {
    color: '#ff2a6d',
    fontSize: 13,
  },
});
