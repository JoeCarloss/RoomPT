import AsyncStorage from '@react-native-async-storage/async-storage';

/** 저장되는 운동 기록 1건. 전부 온디바이스(AsyncStorage)에만 저장된다. */
export interface WorkoutRecord {
  id: string;
  /** 저장 시각 (ISO 8601) */
  endedAt: string;
  /** 완료한 스쿼트 횟수 */
  reps: number;
  /** 첫 1회 완료부터 마지막 회 완료까지 걸린 시간 (초). 1회만 수행 시 0. */
  durationSec: number;
}

function isValidRecord(value: unknown): value is WorkoutRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.endedAt === 'string' &&
    typeof r.reps === 'number' &&
    typeof r.durationSec === 'number'
  );
}

const STORAGE_KEY = '@roompt/workout_records';

async function readAll(): Promise<WorkoutRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    // 형태가 깨진 항목은 걸러냄 — 손상 항목이 UI 렌더링/통계 계산에 흘러들지 않게
    return Array.isArray(parsed) ? parsed.filter(isValidRecord) : [];
  } catch {
    // 손상된 데이터는 복구 불가 — 빈 목록으로 취급 (다음 저장 시 덮어써짐)
    return [];
  }
}

/** 최신 기록이 앞에 오도록 정렬해 반환 */
export async function loadRecords(): Promise<WorkoutRecord[]> {
  const records = await readAll();
  return records.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

export async function saveRecord(record: Omit<WorkoutRecord, 'id'>): Promise<WorkoutRecord> {
  const records = await readAll();
  const saved: WorkoutRecord = {
    ...record,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  records.push(saved);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  return saved;
}

export async function deleteRecord(id: string): Promise<void> {
  const records = await readAll();
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(records.filter((r) => r.id !== id)),
  );
}

export async function clearRecords(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
