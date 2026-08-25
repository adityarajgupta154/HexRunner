import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSafetyReport } from '@workspace/api-client-react';
import { createSafetyQueue } from '@/src/services/safetyStorageCore';

const safetyQueue = createSafetyQueue({
  storage: AsyncStorage,
  submitReport: createSafetyReport,
});

export const getPendingSafetyReports = safetyQueue.getPendingSafetyReports;
export const queueSafetyReport = safetyQueue.queueSafetyReport;
export const removePendingSafetyReport =
  safetyQueue.removePendingSafetyReport;
export const flushPendingSafetyReports =
  safetyQueue.flushPendingSafetyReports;