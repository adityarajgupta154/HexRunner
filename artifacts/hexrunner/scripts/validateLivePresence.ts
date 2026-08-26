const assert = {
  strictEqual: (actual: any, expected: any, message?: string) => {
    if (actual !== expected) {
      throw new Error(`Assertion failed: ${message} - expected ${expected}, got ${actual}`);
    }
  },
  deepEqual: (actual: any, expected: any, message?: string) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Assertion failed: ${message}\nExpected: ${JSON.stringify(expected)}\nGot: ${JSON.stringify(actual)}`);
    }
  }
};

import { LivePresenceController, getCardinalDirection, selectGhostTarget, type PresenceState } from '../src/services/livePresenceController.ts';
import type { ExactPresence } from '@workspace/api-client-react';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runSyncTests() {
  console.log('[Test] Running Ghost Race Target & Direction');
  assert.strictEqual(getCardinalDirection(0, 0, 1, 0), 'N');
  assert.strictEqual(getCardinalDirection(0, 0, 1, 1), 'NE');
  assert.strictEqual(getCardinalDirection(0, 0, 0, 1), 'E');
  assert.strictEqual(getCardinalDirection(0, 0, -1, 0), 'S');
  assert.strictEqual(getCardinalDirection(0, 0, 0, -1), 'W');

  const loc = { latitude: 0, longitude: 0, accuracy: 10, mocked: false };
  const exactRunners: ExactPresence[] = [
    {
      visibility: 'exact',
      userId: '1',
      displayName: 'A',
      lat: 1,
      lng: 0,
      distanceMeters: 50,
      interactionToken: 'token_exact_runner_1',
      waveAvailable: true,
    },
    {
      visibility: 'exact',
      userId: '2',
      displayName: 'B',
      lat: -1,
      lng: 0,
      distanceMeters: 20,
      interactionToken: 'token_exact_runner_2',
      waveAvailable: true,
    }
  ];

  const target = selectGhostTarget(exactRunners, loc);
  assert.strictEqual(target?.runner.userId, '2', 'Selected nearest runner');
  assert.strictEqual(target?.direction, 'S', 'Direction is correct');

  const noTarget = selectGhostTarget([], loc);
  assert.strictEqual(noTarget, null, 'No target for empty exact runners');

  console.log('✓ Target & Direction tests pass');
}

async function runAsyncTests() {
  console.log('[Test] LivePresenceController State Machine');
  
  let currentTime = 10000;
  let timeouts: { id: number; cb: () => void; ms: number }[] = [];
  let timeoutCounter = 0;
  
  let resolveGetNearby: any = null;
  let rejectGetNearby: any = null;
  let getNearbyCalls = 0;
  let updateAnchorCalls = 0;
  let endAnchorCalls = 0;
  let states: PresenceState[] = [];

  let createdSessions = 0;
  const mockDeps = {
    now: () => currentTime,
    setTimeout: (cb: () => void, ms: number) => {
      const id = ++timeoutCounter;
      timeouts.push({ id, cb, ms });
      return id;
    },
    clearTimeout: (id: any) => {
      timeouts = timeouts.filter(t => t.id !== id);
    },
    createSessionId: () => {
      createdSessions++;
      return `session-${createdSessions}`;
    },
    updateDiscoveryAnchor: async (input: any) => {
      assert.strictEqual(input.clientSessionId !== undefined, true, 'clientSessionId sent to update');
      updateAnchorCalls++;
      // Return a promise that resolves later to simulate in-flight POST
      return new Promise<any>((resolve) => {
        setTimeout(() => resolve({ expiresAt: 'later' }), 5);
      });
    },
    endDiscoveryAnchor: async (input: any) => {
      assert.strictEqual(input.clientSessionId !== undefined, true, 'clientSessionId sent to end');
      endAnchorCalls++;
    },
    getNearbyPresence: async (params: any, opts: any) => {
      getNearbyCalls++;
      return new Promise<any>((resolve, reject) => {
        resolveGetNearby = () => {
          if (opts.signal.aborted) {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          } else {
            resolve({
              runners: [
                { visibility: 'exact', userId: '1', lat: 1, lng: 1, distanceMeters: 10 },
                { visibility: 'anonymous', lat: 2, lng: 2, distanceBandMeters: 500 }
              ],
              ambientCount: 2
            });
          }
        };
        rejectGetNearby = (err = new Error('Network error')) => {
          if (opts.signal.aborted) {
            const abrt = new Error('aborted');
            abrt.name = 'AbortError';
            reject(abrt);
          } else {
            reject(err);
          }
        }
      });
    }
  };

  const controller = new LivePresenceController(mockDeps, (state) => states.push(state));

  console.log('  -> Testing: valid-location gating');
  // 1. Start with invalid location (accuracy 200 > 100)
  controller.update(true, 'home', { latitude: 0, longitude: 0, accuracy: 200, mocked: false });
  await sleep(10);
  assert.strictEqual(updateAnchorCalls, 0, 'No anchor update for invalid location');
  assert.strictEqual(getNearbyCalls, 0, 'No nearby fetch for invalid location');
  assert.strictEqual(timeouts.length, 1, 'Poll queued');

  console.log('  -> Testing: immediate start with valid location');
  // Provide valid location
  controller.update(true, 'home', { latitude: 0, longitude: 0, accuracy: 50, mocked: false });
  // The moment we get a valid location, since we were waiting, we should poll immediately!
  await sleep(10); // Start triggers immediately
  assert.strictEqual(updateAnchorCalls, 1, 'Anchor updated');
  assert.strictEqual(getNearbyCalls, 1, 'Nearby fetch requested');
  assert.strictEqual(states[states.length - 1].isLoading, true, 'State is loading');
  
  // Resolve first fetch
  resolveGetNearby();
  await sleep(10);
  assert.strictEqual(states[states.length - 1].hasSnapshot, true, 'Snapshot is true');
  assert.strictEqual(states[states.length - 1].exactRunners.length, 1, 'Exact runner set');
  assert.strictEqual(states[states.length - 1].anonymousRunners.length, 1, 'Anonymous runner set');

  console.log('  -> Testing: Stale and Eviction (>10s, >30s)');
  // Next poll is queued
  const nextPoll = timeouts.find(t => t.ms === 5000);
  assert.strictEqual(nextPoll !== undefined, true, 'Next poll queued');
  
  // Advance 11 seconds
  currentTime += 11000;
  nextPoll!.cb();
  await sleep(10);
  
  assert.strictEqual(states[states.length - 1].isStale, true, 'Marked stale after 10s');
  
  // Fail the fetch to see if stale stays
  rejectGetNearby();
  await sleep(10);
  assert.strictEqual(states[states.length - 1].isOffline, true, 'Marked offline');
  assert.strictEqual(states[states.length - 1].hasSnapshot, true, 'Snapshot retained on failure');

  // Advance to 31 seconds total
  currentTime += 20000;
  const poll2 = timeouts.find(t => t.ms === 5000);
  poll2!.cb();
  await sleep(10);
  
  assert.strictEqual(states[states.length - 1].hasSnapshot, false, 'Snapshot cleared after 30s');
  assert.strictEqual(states[states.length - 1].isStale, false, 'Stale flag cleared');
  assert.strictEqual(states[states.length - 1].exactRunners.length, 0, 'Runners cleared');

  console.log('  -> Testing: request abort on blur/dispose');
  // Fetch again
  resolveGetNearby();
  await sleep(10);
  // It's still fetching, but it was cleared. We need to start a new fetch.
  controller.update(true, 'home', { latitude: 0, longitude: 0, accuracy: 50, mocked: false });
  await sleep(10);
  const getNearbyCallsBefore = getNearbyCalls;
  
  // Blur (stop)
  controller.update(false, 'home', null);
  await sleep(10);
  assert.strictEqual(endAnchorCalls, 1, 'End anchor called');
  
  // No new successful state should arrive from that aborted fetch
  rejectGetNearby(); // the promise was aborted, so our mock should reject with AbortError
  await sleep(10);
  assert.strictEqual(states[states.length - 1].isLoading, false, 'Loading is false after stop');
  assert.strictEqual(endAnchorCalls, 1, 'End anchor only called once for one blur event');

  // If we dispose now (while already stopped), it shouldn't call endAnchor again
  controller.dispose();
  assert.strictEqual(endAnchorCalls, 1, 'Dispose after blur does not double-end anchor');

  // Make a new controller to test overlapping getNearby and exact-only Ghost behavior
  const controller2 = new LivePresenceController(mockDeps, (state) => states.push(state));
  controller2.update(true, 'home', { latitude: 0, longitude: 0, accuracy: 50, mocked: false });
  await sleep(10);
  assert.strictEqual(getNearbyCalls, getNearbyCallsBefore + 1, 'Started new fetch');
  
  // Second update should abort the first and start a new one (not overlap)
  controller2.update(false, 'home', null);
  await sleep(10);
  assert.strictEqual(endAnchorCalls, 2, 'End anchor called for second controller');
  
  console.log('  -> Testing: run mode never anchors');
  controller2.update(true, 'run', { latitude: 0, longitude: 0, accuracy: 50, mocked: false });
  await sleep(10);
  const updateAnchorCallsRun = updateAnchorCalls;
  resolveGetNearby();
  await sleep(10);
  assert.strictEqual(updateAnchorCalls, updateAnchorCallsRun, 'Run mode does not update anchor');

  // Dispose
  controller2.dispose();
  assert.strictEqual(endAnchorCalls, 2, 'End anchor not called for run mode dispose');
  
  console.log('  -> Testing: Home->Run mode transition cleanup');
  const controller3 = new LivePresenceController(mockDeps, (state) => states.push(state));
  controller3.update(true, 'home', { latitude: 0, longitude: 0, accuracy: 50, mocked: false });
  await sleep(10);
  assert.strictEqual(updateAnchorCalls, updateAnchorCallsRun + 1, 'Anchor updated for home mode');
  
  // Transition directly to run mode while enabled
  controller3.update(true, 'run', { latitude: 0, longitude: 0, accuracy: 50, mocked: false });
  await sleep(10);
  assert.strictEqual(endAnchorCalls, 3, 'End anchor called on transition to run mode');

  controller3.dispose();

  console.log('✓ All Async tests pass');
}

runSyncTests();
runAsyncTests().catch((error: unknown) => {
  console.error(error);
  throw error;
});