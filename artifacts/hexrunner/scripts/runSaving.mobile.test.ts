import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type {
  CreateCivicReportRequest,
  SaveRunRequest,
  SaveRunResult,
} from '@workspace/api-client-react';
import {
  createRunStorage,
  PENDING_RUN_KEY,
  type RunStorageAdapter,
} from '../src/services/runStorageCore';
import { getPendingRunRecoveryRoute } from '../src/services/pendingRunRecovery';
import {
  isRunSummaryDoneDisabled,
  isRunSummaryRetryVisible,
  runSummarySaveAttempt,
  type RunSummarySaveStatus,
} from '../src/services/runSummaryState';
import {
  createSafetyQueue,
  PENDING_SAFETY_REPORTS_KEY,
} from '../src/services/safetyStorageCore';
import {
  createCivicQueue,
  PENDING_CIVIC_REPORTS_KEY,
} from '../src/services/civicStorageCore';

function createMemoryStorage() {
  const values = new Map<string, string>();
  const storage: RunStorageAdapter = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
  return { storage, values };
}

function pendingRun(clientRunId: string): SaveRunRequest {
  return {
    clientRunId,
    startedAt: '2026-08-25T10:00:00.000Z',
    endedAt: '2026-08-25T10:10:00.000Z',
    elapsedSeconds: 600,
    distanceKm: 1.5,
    points: [
      {
        lat: 12.9716,
        lng: 77.5946,
        timestamp: Date.parse('2026-08-25T10:05:00.000Z'),
      },
    ],
    claimedHexes: ['8960145b483ffff'],
  };
}

function savedResult(clientRunId: string): SaveRunResult {
  return {
    runId: clientRunId,
    saved: true,
    idempotent: false,
    newHexes: 1,
    stolenHexes: 0,
    claimedHexes: 1,
    baseCredit: 1,
    bonusCredit: 0,
    totalCredit: 1,
    coldZoneHexes: 0,
    budgetSkippedHexes: 0,
    dailyClaimedHexes: 1,
    dailyBudget: 10,
    dailyBonusCredit: 0,
    dailyBonusCap: 5,
    currentStreak: 1,
    loopDetected: false,
    interiorHexes: 0,
    antiSpoof: {
      flaggedSuspicious: false,
      reason: null,
      mockLocationDetected: null,
      averageAccuracyMeters: null,
      maxSpeedMetersPerSecond: null,
    },
  };
}

describe('mobile run-saving regression checks', { concurrency: false }, () => {
  test('successful save stays recoverable until Done clears it', async () => {
    const { storage, values } = createMemoryStorage();
    const run = pendingRun('run_mobile_success_001');
    const store = createRunStorage({
      storage,
      saveRunRequest: async (savedRun) => savedResult(savedRun.clientRunId),
    });

    await store.queueRunForSave(run);
    const result = await store.savePendingRun(run.clientRunId);

    assert.equal(result.saved, true);
    assert.equal(isRunSummaryDoneDisabled('saving'), true);
    assert.equal(isRunSummaryDoneDisabled('saved'), false);
    assert.ok(values.has(PENDING_RUN_KEY));

    await store.clearPendingRun(run.clientRunId);
    assert.equal(await store.getPendingRun(), null);
    assert.equal(values.has(PENDING_RUN_KEY), false);
  });

  test('a forced failure keeps Done disabled and Retry can succeed', async () => {
    const { storage, values } = createMemoryStorage();
    const run = pendingRun('run_mobile_retry_001');
    let attempts = 0;
    const store = createRunStorage({
      storage,
      saveRunRequest: async (savedRun) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Forced offline failure.');
        }
        return savedResult(savedRun.clientRunId);
      },
    });

    await store.queueRunForSave(run);
    const states: RunSummarySaveStatus[] = [];
    const errors: string[] = [];
    const observer = {
      onSaving() {
        states.push('saving' as const);
      },
      onSaved() {
        states.push('saved' as const);
      },
      onFailed(message: string) {
        errors.push(message);
        states.push('failed' as const);
      },
    };

    await runSummarySaveAttempt({
      clientRunId: run.clientRunId,
      savePendingRun: store.savePendingRun,
      observer,
    });
    assert.deepEqual(states, ['saving', 'failed']);
    assert.deepEqual(errors, ['Forced offline failure.']);
    assert.equal(isRunSummaryDoneDisabled('failed'), true);
    assert.equal(isRunSummaryRetryVisible('failed'), true);
    assert.ok(values.has(PENDING_RUN_KEY));

    await runSummarySaveAttempt({
      clientRunId: run.clientRunId,
      savePendingRun: store.savePendingRun,
      observer,
    });
    assert.deepEqual(states, ['saving', 'failed', 'saving', 'saved']);
    assert.equal(attempts, 2);
    assert.equal(isRunSummaryDoneDisabled('saved'), false);
    assert.equal(isRunSummaryRetryVisible('saved'), false);
  });

  test('startup restores one pending run and routes back to Summary', async () => {
    const { storage } = createMemoryStorage();
    const run = pendingRun('run_mobile_recovery_001');
    const firstProcess = createRunStorage({
      storage,
      saveRunRequest: async (savedRun) => savedResult(savedRun.clientRunId),
    });
    await firstProcess.queueRunForSave(run);

    const restartedProcess = createRunStorage({
      storage,
      saveRunRequest: async (savedRun) => savedResult(savedRun.clientRunId),
    });
    const restored = await restartedProcess.getPendingRun();
    const recoveryRoute = getPendingRunRecoveryRoute(restored, '/');

    assert.equal(restored?.clientRunId, run.clientRunId);
    assert.deepEqual(recoveryRoute, {
      pathname: '/run-summary',
      params: {
        clientRunId: run.clientRunId,
        elapsedSeconds: '600',
        distanceKm: '1.5',
        pointCount: '1',
        hexCount: '1',
      },
    });
    assert.equal(
      getPendingRunRecoveryRoute(restored, '/run-summary'),
      null,
    );
  });

  test('saving a run immediately flushes its queued safety report', async () => {
    const { storage, values } = createMemoryStorage();
    const clientRunId = 'run_safety_delivery_001';
    let runExists = false;
    const safetyQueue = createSafetyQueue({
      storage,
      now: () => Date.parse('2026-08-25T10:10:00.000Z'),
      submitReport: async (report) => {
        if (!runExists) throw new Error('409 run not saved');
        return {
          accepted: true,
          duplicate: false,
          areaH3Index: report.areaH3Index,
          advisory: 'Crowdsourced signal only.',
        };
      },
    });
    await safetyQueue.queueSafetyReport({
      clientReportId: 'safety_delivery_001',
      clientRunId,
      areaH3Index: '8860145b49fffff',
      occurredAt: '2026-08-25T10:05:00.000Z',
    });

    const beforeSave = await safetyQueue.flushPendingSafetyReports(clientRunId);
    assert.deepEqual(beforeSave, { delivered: 0, remaining: 1 });

    await runSummarySaveAttempt({
      clientRunId,
      savePendingRun: async (savedRunId) => {
        runExists = true;
        return savedResult(savedRunId);
      },
      observer: {
        onSaving() {},
        onSaved() {},
        onFailed(message) {
          assert.fail(message);
        },
      },
      afterSaved: async () => {
        const delivery =
          await safetyQueue.flushPendingSafetyReports(clientRunId);
        assert.deepEqual(delivery, { delivered: 1, remaining: 0 });
      },
    });

    assert.equal(values.has(PENDING_SAFETY_REPORTS_KEY), false);
  });

  test('a stable civic draft survives an uncertain response and flushes after run save', async () => {
    const { storage, values } = createMemoryStorage();
    const clientRunId = 'run_civic_delivery_001';
    const draft: CreateCivicReportRequest = {
      clientReportId: 'civic_delivery_001',
      clientRunId,
      category: 'pothole',
      areaH3Index: '8860145b49fffff',
      occurredAt: '2026-08-25T10:05:00.000Z',
      photoObjectPath: '/civic-photos/retry-safe-photo',
      consentToPublishCoarseReport: true,
    };
    let runExists = false;
    const attempts: string[] = [];
    const civicQueue = createCivicQueue({
      storage,
      submitReport: async (report) => {
        attempts.push(report.clientReportId);
        if (!runExists) throw new Error('409 run not saved');
        return {
          reportId: report.clientReportId,
          accepted: true,
          duplicate: false,
          moderationState: 'unreviewed',
          advisory: 'Community information only.',
        };
      },
    });
    await civicQueue.queueCivicReport(draft);

    assert.deepEqual(
      await civicQueue.flushPendingCivicReports(clientRunId),
      { delivered: 0, remaining: 1 },
    );
    assert.ok(values.has(PENDING_CIVIC_REPORTS_KEY));

    await runSummarySaveAttempt({
      clientRunId,
      savePendingRun: async (savedRunId) => {
        runExists = true;
        return savedResult(savedRunId);
      },
      observer: {
        onSaving() {},
        onSaved() {},
        onFailed(message) {
          assert.fail(message);
        },
      },
      afterSaved: async () => {
        assert.deepEqual(
          await civicQueue.flushPendingCivicReports(clientRunId),
          { delivered: 1, remaining: 0 },
        );
      },
    });

    assert.deepEqual(attempts, [
      'civic_delivery_001',
      'civic_delivery_001',
    ]);
    assert.equal(values.has(PENDING_CIVIC_REPORTS_KEY), false);
  });
});