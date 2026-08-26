import assert from 'node:assert/strict';
import type {
  LiveInteraction,
  SendWaveInput,
  SendWaveResult,
} from '@workspace/api-client-react';
import {
  LiveInteractionsController,
  type InteractionsState,
} from '../src/services/liveInteractionsController.ts';
import {
  WaveActionController,
  classifyWaveError,
  type WaveActionState,
} from '../src/services/waveActionController.ts';

class FakeClock {
  nowMs = 1_000_000;
  private nextId = 1;
  private timers = new Map<number, { callback: () => void; at: number }>();

  now = () => this.nowMs;

  setTimeout = (callback: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.set(id, { callback, at: this.nowMs + ms });
    return id as unknown as ReturnType<typeof setTimeout>;
  };

  clearTimeout = (rawId: ReturnType<typeof setTimeout>) => {
    this.timers.delete(rawId as unknown as number);
  };

  advance(ms: number) {
    const target = this.nowMs + ms;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.nowMs = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.nowMs = target;
  }
}

function event(
  clock: FakeClock,
  id: string,
  kind: LiveInteraction['kind'],
  ttlMs: number,
): LiveInteraction {
  return {
    id,
    kind,
    copy: kind === 'wave' ? 'A nearby runner waved' : 'A runner entered',
    createdAt: new Date(clock.nowMs).toISOString(),
    expiresAt: new Date(clock.nowMs + ttlMs).toISOString(),
  };
}

async function flush() {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function validateInteractionLifecycle() {
  const clock = new FakeClock();
  const states: InteractionsState[] = [];
  let gets = 0;
  let ackAttempts = 0;
  const liveEvent = event(clock, 'event-wave-0001', 'wave', 6_200);
  const controller = new LiveInteractionsController(
    {
      getLiveInteractions: async () => {
        gets += 1;
        return { events: [liveEvent] };
      },
      acknowledgeLiveInteractions: async () => {
        ackAttempts += 1;
        if (ackAttempts === 1) throw new TypeError('offline');
      },
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    },
    (state) => states.push(state),
  );

  controller.update(true, true);
  await flush();
  assert.equal(gets, 1, 'polls immediately after enable plus snapshot');
  assert.equal(states.at(-1)?.events.length, 1, 'publishes a live event');
  assert.equal(ackAttempts, 1, 'attempts acknowledgement after ingest');

  clock.advance(4_999);
  await flush();
  assert.equal(states.at(-1)?.events.length, 1, 'keeps event before expiry');
  clock.advance(1);
  await flush();
  assert.equal(gets, 2, 'keeps a serial five-second poll');
  assert.equal(ackAttempts, 2, 'retries a failed acknowledgement');
  assert.equal(states.at(-1)?.events.length, 1);

  clock.advance(1_199);
  await flush();
  assert.equal(states.at(-1)?.events.length, 1, 'keeps event before expiry');
  clock.advance(1);
  await flush();
  assert.equal(
    states.at(-1)?.events.length,
    0,
    'expires at the server deadline rather than the next poll',
  );

  clock.advance(3_800);
  await flush();
  assert.equal(ackAttempts, 2, 'does not acknowledge an ingested ID twice');

  controller.update(false, false);
  assert.equal(states.at(-1)?.events.length, 0, 'clears alerts on focus loss');
  assert.equal(states.at(-1)?.isOffline, false);
  controller.dispose();
}

async function validateDismissAndLateResponseGuards() {
  const clock = new FakeClock();
  const states: InteractionsState[] = [];
  let resolvePoll:
    | ((value: { events: LiveInteraction[] }) => void)
    | undefined;
  const controller = new LiveInteractionsController(
    {
      getLiveInteractions: () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        }),
      acknowledgeLiveInteractions: async () => {},
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    },
    (state) => states.push(state),
  );

  controller.update(true, true);
  controller.update(false, false);
  resolvePoll?.({ events: [event(clock, 'late-event-0001', 'contest', 10_000)] });
  await flush();
  assert.equal(states.at(-1)?.events.length, 0, 'late poll cannot resurrect alerts');

  const dismissStates: InteractionsState[] = [];
  const dismissEvent = event(clock, 'dismiss-event-1', 'contest', 20_000);
  const dismissController = new LiveInteractionsController(
    {
      getLiveInteractions: async () => ({ events: [dismissEvent] }),
      acknowledgeLiveInteractions: async () => {},
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    },
    (state) => dismissStates.push(state),
  );
  dismissController.update(true, true);
  await flush();
  dismissController.dismiss(dismissEvent.id);
  clock.advance(5_000);
  await flush();
  assert.equal(
    dismissStates.at(-1)?.events.length,
    0,
    'dismissed event stays dismissed when returned again',
  );
  dismissController.dispose();
}

async function validateWaveActions() {
  assert.equal(classifyWaveError({ status: 429 }), 'throttled');
  assert.equal(classifyWaveError({ status: 403 }), 'blocked');
  assert.equal(classifyWaveError(new TypeError('network')), 'offline');
  assert.equal(classifyWaveError({ status: 500 }), 'failed');

  const clock = new FakeClock();
  const states: WaveActionState[] = [];
  const requests: SendWaveInput[] = [];
  let attempts = 0;
  let closes = 0;
  const controller = new WaveActionController(
    {
      sendWave: async (input): Promise<SendWaveResult> => {
        requests.push(input);
        attempts += 1;
        if (attempts === 1) throw new TypeError('offline');
        return {
          waveId: 'wave-result-0001',
          expiresAt: new Date(clock.nowMs + 15_000).toISOString(),
        };
      },
      createIdempotencyKey: () => 'stable-idempotency-key',
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    },
    (state) => states.push(state),
    () => {
      closes += 1;
    },
  );

  controller.select('interaction-token-a');
  const firstAttempt = controller.send();
  const duplicateAttempt = controller.send();
  await Promise.all([firstAttempt, duplicateAttempt]);
  assert.equal(requests.length, 1, 'suppresses duplicate pending sends');
  assert.equal(states.at(-1)?.status, 'offline');

  await controller.send();
  assert.equal(states.at(-1)?.status, 'sent');
  assert.equal(requests.length, 2);
  assert.equal(
    requests[0]?.idempotencyKey,
    requests[1]?.idempotencyKey,
    'retries with the same idempotency key',
  );
  clock.advance(1_499);
  assert.equal(closes, 0, 'keeps sent confirmation visible');
  controller.select('interaction-token-b');
  clock.advance(1);
  assert.equal(closes, 0, 'target change cancels the old close timer');
  controller.dispose();
}

async function run() {
  await validateInteractionLifecycle();
  await validateDismissAndLateResponseGuards();
  await validateWaveActions();
  console.log('Live interaction controller checks passed.');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});