import {
  saveRun,
} from '@workspace/api-client-react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createRunStorage,
  type PendingRun,
} from '@/src/services/runStorageCore';

export type { PendingRun } from '@/src/services/runStorageCore';

export function createClientRunId(): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 14);
  return `run_${time}_${random}`;
}

const runStorage = createRunStorage({
  storage: AsyncStorage,
  saveRunRequest: saveRun,
});

export const queueRunForSave = runStorage.queueRunForSave;
export const getPendingRun = runStorage.getPendingRun;
export const clearPendingRun = runStorage.clearPendingRun;
export const savePendingRun = runStorage.savePendingRun;