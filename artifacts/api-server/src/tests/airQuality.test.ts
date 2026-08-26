import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  db,
  hexrunnerAirQualityAlertDeliveriesTable,
  pool,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  AirQualityAreaCache,
  AirQualityOutageTracker,
  buildAirQualityResponse,
  coarseAirQualityArea,
  type AirQualitySnapshot,
} from "../lib/airQuality";
import {
  AIR_QUALITY_ALERT_MAX_ATTEMPTS,
  AIR_QUALITY_ALERT_LEASE_MS,
  AIR_QUALITY_ALERT_ORPHAN_GRACE_MS,
  AirQualityOperatorNotifier,
  PostgresAirQualityAlertQueue,
  airQualityAlertRetryDelayMs,
  airQualityNotificationId,
  createAirQualityWebhookDelivery,
  type AirQualityOperatorNotification,
} from "../lib/airQualityAlerts";
import type { Logger } from "pino";

after(async () => {
  await pool.end();
});

function recordingLogger(errors: unknown[] = []): Logger {
  return {
    info() {},
    warn() {},
    error(context: unknown) {
      errors.push(context);
    },
  } as unknown as Logger;
}

describe("air-quality outage signals", { concurrency: false }, () => {
  test("records repeated failures and stale fallbacks without location data", () => {
    let now = Date.parse("2026-08-25T10:00:00.000Z");
    const tracker = new AirQualityOutageTracker({
      now: () => now,
      sustainedOutageMs: 60_000,
    });

    const firstFailure = tracker.recordFailure("unavailable", 503);
    now += 30_000;
    const fallback = tracker.recordStaleFallback(
      new Date("2026-08-25T09:45:00.000Z"),
    );
    now += 30_000;
    const repeatedFailure = tracker.recordFailure("timeout");
    const serializedSignals = JSON.stringify([
      ...firstFailure,
      ...fallback,
      ...repeatedFailure,
    ]);

    assert.deepEqual(firstFailure, [
      {
        event: "air_quality_upstream_failure",
        occurredAt: "2026-08-25T10:00:00.000Z",
        sourceFailure: "unavailable",
        sourceStatus: 503,
        outageStartedAt: "2026-08-25T10:00:00.000Z",
        outageDurationMs: 0,
        upstreamFailureCount: 1,
        staleFallbackCount: 0,
      },
    ]);
    assert.equal(fallback[0]?.event, "air_quality_stale_fallback");
    assert.equal(fallback[0]?.staleFallbackCount, 1);
    assert.equal(repeatedFailure[0]?.upstreamFailureCount, 2);
    assert.equal(repeatedFailure[0]?.staleFallbackCount, 1);
    assert.equal(repeatedFailure[1]?.event, "air_quality_outage_sustained");
    assert.equal(serializedSignals.includes("latitude"), false);
    assert.equal(serializedSignals.includes("longitude"), false);
    assert.equal(serializedSignals.includes("area"), false);
  });

  test("records one sustained signal per outage and closes it on recovery", () => {
    let now = Date.parse("2026-08-25T10:00:00.000Z");
    const tracker = new AirQualityOutageTracker({
      now: () => now,
      sustainedOutageMs: 10_000,
    });

    tracker.recordFailure("request-error");
    now += 10_000;
    const sustained = tracker.recordStaleFallback(
      new Date("2026-08-25T09:50:00.000Z"),
    );
    now += 10_000;
    const repeatedFallback = tracker.recordStaleFallback(
      new Date("2026-08-25T09:50:00.000Z"),
    );
    now += 5_000;
    const recovery = tracker.recordRecovery();
    const duplicateRecovery = tracker.recordRecovery();

    assert.equal(sustained[1]?.event, "air_quality_outage_sustained");
    assert.equal(repeatedFallback.length, 1);
    assert.deepEqual(recovery, [
      {
        event: "air_quality_upstream_recovered",
        recoveredAt: "2026-08-25T10:00:25.000Z",
        lastFailureAt: "2026-08-25T10:00:00.000Z",
        outageStartedAt: "2026-08-25T10:00:00.000Z",
        outageDurationMs: 25_000,
        upstreamFailureCount: 1,
        staleFallbackCount: 2,
      },
    ]);
    assert.deepEqual(duplicateRecovery, []);
  });

  test("starts a fresh outage window after recovery", () => {
    let now = Date.parse("2026-08-25T10:00:00.000Z");
    const tracker = new AirQualityOutageTracker({ now: () => now });

    tracker.recordFailure("timeout");
    now += 1_000;
    tracker.recordRecovery();
    now += 1_000;
    const nextFailure = tracker.recordFailure("missing-observation");

    assert.equal(
      nextFailure[0]?.outageStartedAt,
      "2026-08-25T10:00:02.000Z",
    );
    assert.equal(nextFailure[0]?.upstreamFailureCount, 1);
    assert.equal(nextFailure[0]?.staleFallbackCount, 0);
  });
});

describe("air-quality operator notifications", { concurrency: false }, () => {
  test("delivers one trigger and one resolution per sustained outage", async () => {
    const delivered: AirQualityOperatorNotification[] = [];
    const notifier = new AirQualityOperatorNotifier({
      logger: recordingLogger(),
      deliver: async (notification) => {
        delivered.push(notification);
      },
    });
    const sustained = {
      event: "air_quality_outage_sustained",
      occurredAt: "2026-08-25T10:05:00.000Z",
      outageStartedAt: "2026-08-25T10:00:00.000Z",
      outageDurationMs: 300_000,
      upstreamFailureCount: 4,
      staleFallbackCount: 7,
    } as const;
    const recovered = {
      event: "air_quality_upstream_recovered",
      recoveredAt: "2026-08-25T10:08:00.000Z",
      lastFailureAt: "2026-08-25T10:07:30.000Z",
      outageStartedAt: "2026-08-25T10:00:00.000Z",
      outageDurationMs: 480_000,
      upstreamFailureCount: 5,
      staleFallbackCount: 9,
    } as const;

    notifier.record(sustained);
    notifier.record(sustained);
    notifier.record(recovered);
    notifier.record(recovered);
    await notifier.waitForIdle();

    assert.deepEqual(delivered, [
      {
        notificationId: airQualityNotificationId(
          "triggered",
          "2026-08-25T10:00:00.000Z",
        ),
        alertType: "air_quality_upstream_outage",
        status: "triggered",
        outageStartedAt: "2026-08-25T10:00:00.000Z",
        outageDurationMs: 300_000,
        upstreamFailureCount: 4,
        staleFallbackCount: 7,
        occurredAt: "2026-08-25T10:05:00.000Z",
      },
      {
        notificationId: airQualityNotificationId(
          "resolved",
          "2026-08-25T10:00:00.000Z",
        ),
        alertType: "air_quality_upstream_outage",
        status: "resolved",
        outageStartedAt: "2026-08-25T10:00:00.000Z",
        outageDurationMs: 480_000,
        upstreamFailureCount: 5,
        staleFallbackCount: 9,
        occurredAt: "2026-08-25T10:08:00.000Z",
      },
    ]);
    assert.equal(JSON.stringify(delivered).includes("latitude"), false);
    assert.equal(JSON.stringify(delivered).includes("longitude"), false);
  });

  test("ignores recovery when no sustained alert was opened", async () => {
    const delivered: AirQualityOperatorNotification[] = [];
    const notifier = new AirQualityOperatorNotifier({
      logger: recordingLogger(),
      deliver: async (notification) => {
        delivered.push(notification);
      },
    });

    notifier.record({
      event: "air_quality_upstream_recovered",
      recoveredAt: "2026-08-25T10:01:00.000Z",
      lastFailureAt: "2026-08-25T10:00:30.000Z",
      outageStartedAt: "2026-08-25T10:00:00.000Z",
      outageDurationMs: 60_000,
      upstreamFailureCount: 1,
      staleFallbackCount: 0,
    });
    await notifier.waitForIdle();

    assert.deepEqual(delivered, []);
  });

  test("logs delivery failures without rejecting the signal path", async () => {
    const errors: unknown[] = [];
    const notifier = new AirQualityOperatorNotifier({
      logger: recordingLogger(errors),
      deliver: async () => {
        throw new Error("notification provider unavailable");
      },
    });

    assert.doesNotThrow(() => {
      notifier.record({
        event: "air_quality_outage_sustained",
        occurredAt: "2026-08-25T10:05:00.000Z",
        outageStartedAt: "2026-08-25T10:00:00.000Z",
        outageDurationMs: 300_000,
        upstreamFailureCount: 4,
        staleFallbackCount: 7,
      });
    });
    await assert.doesNotReject(notifier.waitForIdle());
    assert.equal(errors.length, 1);
  });

  test("requires an HTTPS webhook URL without failing API startup", async () => {
    assert.equal(createAirQualityWebhookDelivery(undefined), undefined);
    const deliver = createAirQualityWebhookDelivery(
      "http://alerts.example.test/aqi",
    );
    assert.ok(deliver);
    await assert.rejects(
      deliver({
        notificationId: airQualityNotificationId(
          "triggered",
          "2026-08-25T10:00:00.000Z",
        ),
        alertType: "air_quality_upstream_outage",
        status: "triggered",
        outageStartedAt: "2026-08-25T10:00:00.000Z",
        outageDurationMs: 300_000,
        upstreamFailureCount: 4,
        staleFallbackCount: 7,
        occurredAt: "2026-08-25T10:05:00.000Z",
      }),
      /must use HTTPS/,
    );
  });
});

describe("durable air-quality notification queue", { concurrency: false }, () => {
  let notificationSequence = 0;

  function notifications(): {
    trigger: AirQualityOperatorNotification;
    resolution: AirQualityOperatorNotification;
  } {
    notificationSequence += 1;
    const outageStartedAt = new Date(
      Date.now() + notificationSequence * 60_000,
    ).toISOString();
    return {
      trigger: {
        notificationId: airQualityNotificationId(
          "triggered",
          outageStartedAt,
        ),
        alertType: "air_quality_upstream_outage",
        status: "triggered",
        outageStartedAt,
        outageDurationMs: 300_000,
        upstreamFailureCount: 4,
        staleFallbackCount: 7,
        occurredAt: new Date(Date.parse(outageStartedAt) + 300_000).toISOString(),
      },
      resolution: {
        notificationId: airQualityNotificationId(
          "resolved",
          outageStartedAt,
        ),
        alertType: "air_quality_upstream_outage",
        status: "resolved",
        outageStartedAt,
        outageDurationMs: 480_000,
        upstreamFailureCount: 5,
        staleFallbackCount: 9,
        occurredAt: new Date(Date.parse(outageStartedAt) + 480_000).toISOString(),
      },
    };
  }

  test("leases one trigger, backs off, then releases its matching resolution", async (t) => {
    const queue = new PostgresAirQualityAlertQueue();
    const { trigger, resolution } = notifications();
    const ids = [trigger.notificationId, resolution.notificationId];
    t.after(async () => {
      await db
        .delete(hexrunnerAirQualityAlertDeliveriesTable)
        .where(inArray(hexrunnerAirQualityAlertDeliveriesTable.id, ids));
    });

    // Even if rows arrive out of order, the resolution cannot be claimed first.
    await queue.enqueue(resolution);
    await queue.enqueue(trigger);
    const now = new Date(Date.now() + 1_000);
    const secondQueue = new PostgresAirQualityAlertQueue();
    const concurrentClaims = await Promise.all([
      queue.claimNext(now),
      secondQueue.claimNext(now),
    ]);
    assert.equal(
      concurrentClaims.filter((claim) => claim !== null).length,
      1,
    );
    const firstClaim = concurrentClaims.find((claim) => claim !== null)!;
    assert.equal(firstClaim?.notification.status, "triggered");

    const firstFailure = await queue.markFailed(
      firstClaim!,
      "provider unavailable",
      now,
    );
    assert.deepEqual(firstFailure, {
      applied: true,
      exhausted: false,
      failedAttemptCount: 1,
    });
    assert.equal(
      await queue.claimNext(
        new Date(
          now.getTime() + airQualityAlertRetryDelayMs(1) - 1,
        ),
      ),
      null,
    );

    const retryAt = new Date(
      now.getTime() + airQualityAlertRetryDelayMs(1),
    );
    const retryClaim = await queue.claimNext(retryAt);
    assert.equal(retryClaim?.notification.notificationId, trigger.notificationId);
    await queue.markDelivered(retryClaim!, retryAt);

    const resolutionClaim = await queue.claimNext(retryAt);
    assert.equal(
      resolutionClaim?.notification.notificationId,
      resolution.notificationId,
    );
    await queue.markDelivered(resolutionClaim!, retryAt);
  });

  test("marks exhausted trigger and blocked resolution without storing location", async (t) => {
    const queue = new PostgresAirQualityAlertQueue();
    const { trigger, resolution } = notifications();
    const ids = [trigger.notificationId, resolution.notificationId];
    t.after(async () => {
      await db
        .delete(hexrunnerAirQualityAlertDeliveriesTable)
        .where(inArray(hexrunnerAirQualityAlertDeliveriesTable.id, ids));
    });
    await queue.enqueue(trigger);
    await queue.enqueue(resolution);

    let now = new Date(Date.now() + 1_000);
    for (let attempt = 1; attempt <= AIR_QUALITY_ALERT_MAX_ATTEMPTS; attempt += 1) {
      const claim = await queue.claimNext(now);
      assert.equal(claim?.notification.notificationId, trigger.notificationId);
      const failure = await queue.markFailed(
        claim!,
        "provider unavailable",
        now,
      );
      assert.equal(failure.applied, true);
      assert.equal(failure.failedAttemptCount, attempt);
      assert.equal(
        failure.exhausted,
        attempt === AIR_QUALITY_ALERT_MAX_ATTEMPTS,
      );
      now = new Date(
        now.getTime() + airQualityAlertRetryDelayMs(attempt),
      );
    }

    const rows = await db
      .select()
      .from(hexrunnerAirQualityAlertDeliveriesTable)
      .where(inArray(hexrunnerAirQualityAlertDeliveriesTable.id, ids));
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.exhaustedAt instanceof Date));
    assert.ok(rows.every((row) => row.deliveredAt === null));
    const serialized = JSON.stringify(rows);
    assert.equal(serialized.includes("latitude"), false);
    assert.equal(serialized.includes("longitude"), false);
    assert.equal(serialized.includes("coordinates"), false);
  });

  test("stale lease completion cannot exhaust a resolution after trigger delivery", async (t) => {
    const firstQueue = new PostgresAirQualityAlertQueue();
    const secondQueue = new PostgresAirQualityAlertQueue();
    const { trigger, resolution } = notifications();
    const ids = [trigger.notificationId, resolution.notificationId];
    t.after(async () => {
      await db
        .delete(hexrunnerAirQualityAlertDeliveriesTable)
        .where(inArray(hexrunnerAirQualityAlertDeliveriesTable.id, ids));
    });
    await firstQueue.enqueue(trigger);
    await firstQueue.enqueue(resolution);

    let now = new Date(Date.now() + 1_000);
    for (let attempt = 1; attempt < AIR_QUALITY_ALERT_MAX_ATTEMPTS; attempt += 1) {
      const claim = await firstQueue.claimNext(now);
      assert.ok(claim);
      const failure = await firstQueue.markFailed(
        claim,
        "provider unavailable",
        now,
      );
      assert.equal(failure.applied, true);
      assert.equal(failure.exhausted, false);
      now = new Date(
        now.getTime() + airQualityAlertRetryDelayMs(attempt),
      );
    }

    const staleClaim = await firstQueue.claimNext(now);
    assert.ok(staleClaim);
    const reclaimAt = new Date(
      now.getTime() + AIR_QUALITY_ALERT_LEASE_MS + 1,
    );
    const winningClaim = await secondQueue.claimNext(reclaimAt);
    assert.equal(
      winningClaim?.notification.notificationId,
      trigger.notificationId,
    );
    assert.equal(
      await secondQueue.markDelivered(winningClaim!, reclaimAt),
      true,
    );

    const staleFailure = await firstQueue.markFailed(
      staleClaim!,
      "late provider failure",
      reclaimAt,
    );
    assert.deepEqual(staleFailure, {
      applied: false,
      exhausted: false,
      failedAttemptCount: AIR_QUALITY_ALERT_MAX_ATTEMPTS,
    });
    const resolutionClaim = await secondQueue.claimNext(reclaimAt);
    assert.equal(
      resolutionClaim?.notification.notificationId,
      resolution.notificationId,
    );
    assert.equal(
      await secondQueue.markDelivered(resolutionClaim!, reclaimAt),
      true,
    );
  });

  test("durable recovery without a sustained trigger is discarded after the race window", async (t) => {
    const queue = new PostgresAirQualityAlertQueue();
    const { resolution } = notifications();
    const ids = [resolution.notificationId];
    t.after(async () => {
      await db
        .delete(hexrunnerAirQualityAlertDeliveriesTable)
        .where(inArray(hexrunnerAirQualityAlertDeliveriesTable.id, ids));
    });
    let now = new Date(Date.now() + 1_000);
    const notifier = new AirQualityOperatorNotifier({
      logger: recordingLogger(),
      queue,
      autoStart: false,
      now: () => now,
    });
    notifier.record({
      event: "air_quality_upstream_recovered",
      recoveredAt: resolution.occurredAt,
      lastFailureAt: resolution.outageStartedAt,
      outageStartedAt: resolution.outageStartedAt,
      outageDurationMs: resolution.outageDurationMs,
      upstreamFailureCount: resolution.upstreamFailureCount,
      staleFallbackCount: resolution.staleFallbackCount,
    });
    await notifier.waitForIdle();

    let [pending] = await db
      .select()
      .from(hexrunnerAirQualityAlertDeliveriesTable)
      .where(inArray(hexrunnerAirQualityAlertDeliveriesTable.id, ids));
    assert.equal(pending?.discardedAt, null);
    now = new Date(
      now.getTime() + AIR_QUALITY_ALERT_ORPHAN_GRACE_MS + 1,
    );
    await notifier.processDue();

    [pending] = await db
      .select()
      .from(hexrunnerAirQualityAlertDeliveriesTable)
      .where(inArray(hexrunnerAirQualityAlertDeliveriesTable.id, ids));
    assert.ok(pending?.discardedAt instanceof Date);
    assert.equal(pending?.deliveredAt, null);
    assert.equal(pending?.exhaustedAt, null);
    assert.match(pending?.lastError ?? "", /No matching sustained trigger/);
    assert.equal(await queue.claimNext(now), null);
  });

  test("late trigger insertion reopens a resolution racing orphan cleanup", async (t) => {
    const firstQueue = new PostgresAirQualityAlertQueue();
    const secondQueue = new PostgresAirQualityAlertQueue();
    const { trigger, resolution } = notifications();
    const ids = [trigger.notificationId, resolution.notificationId];
    t.after(async () => {
      await db
        .delete(hexrunnerAirQualityAlertDeliveriesTable)
        .where(inArray(hexrunnerAirQualityAlertDeliveriesTable.id, ids));
    });
    await firstQueue.enqueue(resolution);
    const afterGrace = new Date(
      Date.now() + AIR_QUALITY_ALERT_ORPHAN_GRACE_MS + 2_000,
    );
    const [racingClaim] = await Promise.all([
      firstQueue.claimNext(afterGrace),
      secondQueue.enqueue(trigger),
    ]);

    const [savedResolution] = await db
      .select()
      .from(hexrunnerAirQualityAlertDeliveriesTable)
      .where(
        inArray(
          hexrunnerAirQualityAlertDeliveriesTable.id,
          [resolution.notificationId],
        ),
      );
    assert.equal(savedResolution?.discardedAt, null);

    const triggerClaim =
      racingClaim?.notification.notificationId === trigger.notificationId
        ? racingClaim
        : await secondQueue.claimNext(afterGrace);
    assert.equal(
      triggerClaim?.notification.notificationId,
      trigger.notificationId,
    );
    assert.equal(
      await secondQueue.markDelivered(triggerClaim!, afterGrace),
      true,
    );
    const resolutionClaim = await firstQueue.claimNext(afterGrace);
    assert.equal(
      resolutionClaim?.notification.notificationId,
      resolution.notificationId,
    );
    assert.equal(
      await firstQueue.markDelivered(resolutionClaim!, afterGrace),
      true,
    );
  });

  test("delivers persisted trigger before resolution after provider recovery", async (t) => {
    const queue = new PostgresAirQualityAlertQueue();
    const { trigger, resolution } = notifications();
    const ids = [trigger.notificationId, resolution.notificationId];
    t.after(async () => {
      await db
        .delete(hexrunnerAirQualityAlertDeliveriesTable)
        .where(inArray(hexrunnerAirQualityAlertDeliveriesTable.id, ids));
    });
    let now = new Date(Date.now() + 1_000);
    let providerAvailable = false;
    const delivered: AirQualityOperatorNotification["status"][] = [];
    const outageNotifier = new AirQualityOperatorNotifier({
      logger: recordingLogger(),
      queue,
      autoStart: false,
      now: () => now,
      deliver: async (notification) => {
        if (!providerAvailable) {
          throw new Error("provider unavailable");
        }
        delivered.push(notification.status);
      },
    });

    outageNotifier.record({
      event: "air_quality_outage_sustained",
      occurredAt: trigger.occurredAt,
      outageStartedAt: trigger.outageStartedAt,
      outageDurationMs: trigger.outageDurationMs,
      upstreamFailureCount: trigger.upstreamFailureCount,
      staleFallbackCount: trigger.staleFallbackCount,
    });
    await outageNotifier.waitForIdle();
    assert.equal(delivered.length, 0);

    providerAvailable = true;
    now = new Date(now.getTime() + airQualityAlertRetryDelayMs(1));
    const recoveryNotifier = new AirQualityOperatorNotifier({
      logger: recordingLogger(),
      queue: new PostgresAirQualityAlertQueue(),
      autoStart: false,
      now: () => now,
      deliver: async (notification) => {
        delivered.push(notification.status);
      },
    });
    recoveryNotifier.record({
      event: "air_quality_upstream_recovered",
      recoveredAt: resolution.occurredAt,
      lastFailureAt: trigger.occurredAt,
      outageStartedAt: resolution.outageStartedAt,
      outageDurationMs: resolution.outageDurationMs,
      upstreamFailureCount: resolution.upstreamFailureCount,
      staleFallbackCount: resolution.staleFallbackCount,
    });
    await recoveryNotifier.waitForIdle();
    assert.deepEqual(delivered, ["triggered", "resolved"]);

    const rows = await db
      .select()
      .from(hexrunnerAirQualityAlertDeliveriesTable)
      .where(inArray(hexrunnerAirQualityAlertDeliveriesTable.id, ids));
    assert.ok(rows.every((row) => row.deliveredAt instanceof Date));
    assert.ok(rows.every((row) => row.exhaustedAt === null));
  });

  test("record returns before durable persistence or provider delivery completes", async () => {
    let releaseEnqueue: (() => void) | undefined;
    let enqueueStarted = false;
    const queue = {
      enqueue: async () => {
        enqueueStarted = true;
        await new Promise<void>((resolve) => {
          releaseEnqueue = resolve;
        });
      },
      claimNext: async () => null,
      markDelivered: async () => true,
      markFailed: async () => ({
        applied: true,
        exhausted: false,
        failedAttemptCount: 1,
      }),
    };
    const notifier = new AirQualityOperatorNotifier({
      logger: recordingLogger(),
      queue,
      autoStart: false,
    });

    const returned = notifier.record({
      event: "air_quality_outage_sustained",
      occurredAt: "2026-08-25T10:05:00.000Z",
      outageStartedAt: "2026-08-25T10:00:00.000Z",
      outageDurationMs: 300_000,
      upstreamFailureCount: 4,
      staleFallbackCount: 7,
    });
    assert.equal(returned, undefined);
    await Promise.resolve();
    assert.equal(enqueueStarted, true);
    releaseEnqueue?.();
    await notifier.waitForIdle();
  });
});

describe("air-quality coarse-area cache", { concurrency: false }, () => {
  test("uses an opaque coarse area and center instead of exact runner coordinates", () => {
    const requestedLatitude = 12.9716;
    const requestedLongitude = 77.5946;
    const initialArea = coarseAirQualityArea(
      requestedLatitude,
      requestedLongitude,
    );
    const firstRunner = coarseAirQualityArea(
      initialArea.latitude + 0.0001,
      initialArea.longitude + 0.0001,
    );
    const secondRunner = coarseAirQualityArea(
      initialArea.latitude - 0.0001,
      initialArea.longitude - 0.0001,
    );

    assert.equal(firstRunner.key, secondRunner.key);
    assert.match(firstRunner.key, /^[0-9a-f]+$/);
    assert.equal(firstRunner.key.includes(requestedLatitude.toString()), false);
    assert.notEqual(initialArea.latitude, requestedLatitude);
    assert.notEqual(initialArea.longitude, requestedLongitude);
  });

  test("returns a cache hit without calling the loader again", async () => {
    let calls = 0;
    const cache = new AirQualityAreaCache<{ sequence: number }>(1_000);
    const loader = async () => ({ sequence: ++calls });

    const first = await cache.getOrLoad("area", loader);
    const second = await cache.getOrLoad("area", loader);

    assert.deepEqual(first, {
      value: { sequence: 1 },
      isFallback: false,
    });
    assert.strictEqual(second.value, first.value);
    assert.equal(second.isFallback, false);
    assert.equal(calls, 1);
  });

  test("shares one in-flight request for concurrent callers", async () => {
    let calls = 0;
    let release: ((value: { sequence: number }) => void) | undefined;
    const cache = new AirQualityAreaCache<{ sequence: number }>(1_000);
    const loader = async () => {
      calls += 1;
      return new Promise<{ sequence: number }>((resolve) => {
        release = resolve;
      });
    };

    const firstRequest = cache.getOrLoad("area", loader);
    const secondRequest = cache.getOrLoad("area", loader);
    await Promise.resolve();

    assert.equal(calls, 1);
    release?.({ sequence: 1 });
    const [first, second] = await Promise.all([firstRequest, secondRequest]);
    assert.strictEqual(first, second);
  });

  test("loads a fresh value when the cache entry expires", async () => {
    let now = 1_000;
    let calls = 0;
    const cache = new AirQualityAreaCache<{ sequence: number }>(100, {
      now: () => now,
    });
    const loader = async () => ({ sequence: ++calls });

    assert.deepEqual((await cache.getOrLoad("area", loader)).value, {
      sequence: 1,
    });
    now = 1_099;
    assert.deepEqual((await cache.getOrLoad("area", loader)).value, {
      sequence: 1,
    });
    now = 1_100;
    assert.deepEqual((await cache.getOrLoad("area", loader)).value, {
      sequence: 2,
    });
    assert.equal(calls, 2);
  });

  test("does not cache an upstream failure", async () => {
    let calls = 0;
    const cache = new AirQualityAreaCache<{ available: boolean }>(1_000);
    const loader = async () => {
      calls += 1;
      if (calls === 1) throw new Error("upstream unavailable");
      return { available: true };
    };

    await assert.rejects(
      cache.getOrLoad("area", loader),
      /upstream unavailable/,
    );
    assert.deepEqual((await cache.getOrLoad("area", loader)).value, {
      available: true,
    });
    assert.equal(calls, 2);
  });

  test("serves an expired snapshot only within the stale-if-error grace period", async () => {
    let now = 1_000;
    const cachedValue = { sequence: 1 };
    const cache = new AirQualityAreaCache<{ sequence: number }>(100, {
      staleIfErrorMs: 200,
      now: () => now,
    });

    assert.deepEqual(
      await cache.getOrLoad("area", async () => cachedValue),
      { value: cachedValue, isFallback: false },
    );

    now = 1_100;
    assert.deepEqual(
      await cache.getOrLoad("area", async () => {
        throw new Error("upstream unavailable");
      }),
      { value: cachedValue, isFallback: true },
    );

    now = 1_299;
    assert.equal(
      (
        await cache.getOrLoad("area", async () => {
          throw new Error("upstream unavailable");
        })
      ).isFallback,
      true,
    );

    now = 1_300;
    await assert.rejects(
      cache.getOrLoad("area", async () => {
        throw new Error("upstream unavailable");
      }),
      /upstream unavailable/,
    );
  });

  test("uses a bounded retry cooldown while a stale snapshot is eligible", async () => {
    let now = 1_000;
    let calls = 0;
    let refreshAttempts = 0;
    const cache = new AirQualityAreaCache<{ sequence: number }>(100, {
      staleIfErrorMs: 1_000,
      retryCooldownMs: 200,
      now: () => now,
    });

    await cache.getOrLoad("area", async () => ({ sequence: ++calls }));
    now = 1_100;
    const fallback = await cache.getOrLoad("area", async () => {
      refreshAttempts += 1;
      throw new Error("upstream unavailable");
    });
    now = 1_101;
    const duringCooldown = await cache.getOrLoad("area", async () => ({
      sequence: ++calls,
    }));

    assert.equal(fallback.isFallback, true);
    assert.deepEqual(duringCooldown, fallback);
    assert.equal(refreshAttempts, 1);
    assert.equal(calls, 1);

    now = 1_300;
    const recovered = await cache.getOrLoad("area", async () => ({
      sequence: ++calls,
    }));
    assert.deepEqual(recovered, {
      value: { sequence: 2 },
      isFallback: false,
    });
    assert.equal(calls, 2);
  });

  test("shares the failed refresh and cooldown fallback for concurrent callers", async () => {
    let now = 1_000;
    let calls = 0;
    let refreshAttempts = 0;
    let rejectLoad: ((error: Error) => void) | undefined;
    const cache = new AirQualityAreaCache<{ sequence: number }>(100, {
      staleIfErrorMs: 1_000,
      retryCooldownMs: 200,
      now: () => now,
    });

    await cache.getOrLoad("area", async () => ({ sequence: ++calls }));
    now = 1_100;
    const firstRequest = cache.getOrLoad(
      "area",
      () =>
        new Promise<{ sequence: number }>((_, reject) => {
          refreshAttempts += 1;
          rejectLoad = reject;
        }),
    );
    const secondRequest = cache.getOrLoad("area", async () => {
      refreshAttempts += 1;
      return { sequence: ++calls };
    });

    await Promise.resolve();
    assert.equal(refreshAttempts, 1);
    rejectLoad?.(new Error("upstream unavailable"));

    const [first, second] = await Promise.all([firstRequest, secondRequest]);
    assert.deepEqual(first, {
      value: { sequence: 1 },
      isFallback: true,
    });
    assert.strictEqual(second, first);
    assert.equal(calls, 1);
  });

  test("replaces a fallback as soon as the upstream source recovers", async () => {
    let now = 1_000;
    let calls = 0;
    const cache = new AirQualityAreaCache<{ sequence: number }>(100, {
      staleIfErrorMs: 200,
      now: () => now,
    });
    const initial = await cache.getOrLoad("area", async () => ({
      sequence: ++calls,
    }));

    now = 1_100;
    const fallback = await cache.getOrLoad("area", async () => {
      calls += 1;
      throw new Error("upstream unavailable");
    });
    now = 1_300;
    const recovered = await cache.getOrLoad("area", async () => ({
      sequence: ++calls,
    }));
    const cachedRecovery = await cache.getOrLoad("area", async () => ({
      sequence: ++calls,
    }));

    assert.deepEqual(initial, {
      value: { sequence: 1 },
      isFallback: false,
    });
    assert.deepEqual(fallback, {
      value: { sequence: 1 },
      isFallback: true,
    });
    assert.deepEqual(recovered, {
      value: { sequence: 3 },
      isFallback: false,
    });
    assert.strictEqual(cachedRecovery.value, recovered.value);
    assert.equal(calls, 3);
  });

  test("preserves upstream timestamps while marking fallback data stale", () => {
    const snapshot: AirQualitySnapshot = {
      fetchedAt: new Date("2026-08-25T10:05:00.000Z"),
      payload: {
        utc_offset_seconds: 0,
        current: {
          time: "2026-08-25T10:00",
          us_aqi: 120,
        },
        hourly: {
          time: ["2026-08-25T11:00", "2026-08-25T14:00"],
          us_aqi: [85, 65],
        },
      },
    };

    const freshResponse = buildAirQualityResponse(
      snapshot,
      new Date("2026-08-25T10:30:00.000Z"),
    );
    const laterResponse = buildAirQualityResponse(
      snapshot,
      new Date("2026-08-25T12:01:00.000Z"),
      true,
    );
    const afterForecastResponse = buildAirQualityResponse(
      snapshot,
      new Date("2026-08-25T14:01:00.000Z"),
      true,
    );

    assert.equal(
      freshResponse.observationTime.toISOString(),
      "2026-08-25T10:00:00.000Z",
    );
    assert.equal(
      freshResponse.fetchedAt.toISOString(),
      "2026-08-25T10:05:00.000Z",
    );
    assert.equal(
      laterResponse.fetchedAt.getTime(),
      snapshot.fetchedAt.getTime(),
    );
    assert.equal(
      laterResponse.observationTime.getTime(),
      freshResponse.observationTime.getTime(),
    );
    assert.equal(freshResponse.isStale, false);
    assert.equal(laterResponse.isStale, true);
    assert.equal(
      laterResponse.suggestedWindow?.startsAt.toISOString(),
      "2026-08-25T14:00:00.000Z",
    );
    assert.equal(laterResponse.suggestedWindow?.expectedAqi, 65);
    assert.equal(afterForecastResponse.suggestedWindow, null);
  });
});
