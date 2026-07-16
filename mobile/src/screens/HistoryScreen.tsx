import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  clearRecords,
  deleteRecord,
  loadRecords,
  type WorkoutRecord,
} from '../services/workoutStorage';

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
          renderItem={({ item }) => (
            <View style={styles.recordRow}>
              <View style={styles.recordInfo}>
                <Text style={styles.recordDate}>{formatDate(item.endedAt)}</Text>
                <Text style={styles.recordDetail}>
                  스쿼트 {item.reps}회 · {formatDuration(item.durationSec)}
                </Text>
              </View>
              <Pressable style={styles.deleteButton} onPress={() => handleDelete(item)}>
                <Text style={styles.deleteButtonText}>삭제</Text>
              </Pressable>
            </View>
          )}
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
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
  },
  recordInfo: {
    flex: 1,
    gap: 4,
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
