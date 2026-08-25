import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCivicReport } from '@workspace/api-client-react';
import { createCivicQueue } from '@/src/services/civicStorageCore';

const civicQueue = createCivicQueue({
  storage: AsyncStorage,
  submitReport: createCivicReport,
});

export const getPendingCivicReports = civicQueue.getPendingCivicReports;
export const queueCivicReport = civicQueue.queueCivicReport;
export const removePendingCivicReport =
  civicQueue.removePendingCivicReport;
export const flushPendingCivicReports =
  civicQueue.flushPendingCivicReports;