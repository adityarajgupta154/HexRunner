import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  activeElapsedSeconds,
  completedPauseDurationMs,
  resumeRunAfterGpsRestart,
  shouldResumePresenceOnForeground,
} from '../src/services/runSessionLifecycle.ts';

describe('mobile run-session lifecycle', { concurrency: false }, () => {
  test('excludes completed and in-progress paused wall time from active elapsed time', () => {
    const startedAt = 10_000;

    assert.equal(
      activeElapsedSeconds({
        startedAt,
        now: 40_000,
        completedPausedMs: 10_000,
        pauseStartedAt: null,
      }),
      20,
    );
    assert.equal(
      activeElapsedSeconds({
        startedAt,
        now: 55_000,
        completedPausedMs: 10_000,
        pauseStartedAt: 40_000,
      }),
      20,
    );
    assert.equal(completedPauseDurationMs(40_000, 55_000), 15_000);
  });

  test('stops the watcher on pause and resumes presence only after GPS restarts', async () => {
    const events: string[] = [];
    let pausedMs = 0;

    events.push('watcher:stop', 'presence:pause');
    const resumed = await resumeRunAfterGpsRestart({
      restartGps: async () => {
        events.push('watcher:restart:start');
        await Promise.resolve();
        events.push('watcher:restart:ready');
      },
      isRunCurrent: () => true,
      stopGps: () => events.push('watcher:stop-stale'),
      commitResume: () => {
        pausedMs += completedPauseDurationMs(20_000, 32_000);
        events.push('timing:resume');
      },
      resumePresence: () => events.push('presence:resume'),
    });

    assert.equal(resumed, true);
    assert.equal(pausedMs, 12_000);
    assert.deepEqual(events, [
      'watcher:stop',
      'presence:pause',
      'watcher:restart:start',
      'watcher:restart:ready',
      'timing:resume',
      'presence:resume',
    ]);
  });

  test('keeps the run paused and presence offline when GPS restart fails', async () => {
    const events: string[] = [];

    await assert.rejects(
      resumeRunAfterGpsRestart({
        restartGps: async () => {
          events.push('watcher:restart');
          throw new Error('permission denied');
        },
        isRunCurrent: () => true,
        stopGps: () => events.push('watcher:stop'),
        commitResume: () => events.push('timing:resume'),
        resumePresence: () => events.push('presence:resume'),
      }),
      /permission denied/,
    );
    assert.deepEqual(events, ['watcher:restart']);
  });

  test('foreground resumes presence only for an active, unpaused run', () => {
    assert.equal(
      shouldResumePresenceOnForeground({ isRunning: true, isPaused: false }),
      true,
    );
    assert.equal(
      shouldResumePresenceOnForeground({ isRunning: true, isPaused: true }),
      false,
    );
    assert.equal(
      shouldResumePresenceOnForeground({ isRunning: false, isPaused: false }),
      false,
    );
  });

  test('cancels a late GPS restart after the run ends without resuming presence', async () => {
    const events: string[] = [];
    const resumed = await resumeRunAfterGpsRestart({
      restartGps: async () => {
        events.push('watcher:restart');
      },
      isRunCurrent: () => false,
      stopGps: () => events.push('watcher:stop'),
      commitResume: () => events.push('timing:resume'),
      resumePresence: () => events.push('presence:resume'),
    });

    assert.equal(resumed, false);
    assert.deepEqual(events, ['watcher:restart', 'watcher:stop']);
  });
});