import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type {
  PresenceHeartbeatInput,
  PresenceEndInput,
} from '@workspace/api-client-react';
import { RunPresencePublisher } from '../src/services/runPresence';

async function flushOperations(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('mobile live-presence publisher', { concurrency: false }, () => {
  test('refreshes one lease, terminates on pause, and resumes with a new lease', async () => {
    let now = 10_000;
    const intervalCallbacks: Array<() => void> = [];
    const heartbeats: PresenceHeartbeatInput[] = [];
    const ended: PresenceEndInput[] = [];

    const publisher = new RunPresencePublisher({
      heartbeat: async (body) => {
        heartbeats.push(body);
        return { expiresAt: new Date(now + 30_000).toISOString() };
      },
      end: async (body) => {
        ended.push(body);
      },
      now: () => now,
      setInterval: ((callback: () => void) => {
        intervalCallbacks.push(callback);
        return 1;
      }) as typeof setInterval,
      clearInterval: (() => {
        intervalCallbacks.pop();
      }) as typeof clearInterval,
    });

    const runId = 'run_mobile_presence_001';
    const location = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 8,
      mocked: false,
    };

    publisher.beginRun(runId, true);
    publisher.publishLocation(runId, location);
    await flushOperations();

    assert.equal(heartbeats.length, 1);
    const firstLease = heartbeats[0]!.clientRunId;
    assert.match(firstLease, /^presence_/);

    now += 5_000;
    intervalCallbacks.at(-1)?.();
    await flushOperations();
    assert.equal(heartbeats.length, 2);
    assert.equal(heartbeats[1]!.clientRunId, firstLease);

    publisher.pauseRun(runId);
    await flushOperations();
    assert.deepEqual(ended, [{ clientRunId: firstLease }]);
    assert.equal(intervalCallbacks.length, 0);

    publisher.resumeRun(runId);
    publisher.publishLocation(runId, location);
    await flushOperations();
    assert.equal(heartbeats.length, 3);
    const resumedLease = heartbeats[2]!.clientRunId;
    assert.notEqual(resumedLease, firstLease);

    now += 5_000;
    intervalCallbacks.at(-1)?.();
    await flushOperations();
    assert.equal(heartbeats.length, 4);
    assert.equal(heartbeats[3]!.clientRunId, resumedLease);

    publisher.endRun(runId);
    await flushOperations();
    assert.deepEqual(ended, [
      { clientRunId: firstLease },
      { clientRunId: resumedLease },
    ]);
    assert.equal(intervalCallbacks.length, 0);

    publisher.publishLocation(runId, location);
    await flushOperations();
    assert.equal(heartbeats.length, 4);
  });
});