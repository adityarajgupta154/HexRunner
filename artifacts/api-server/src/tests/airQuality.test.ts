import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AirQualityAreaCache,
  buildAirQualityResponse,
  coarseAirQualityArea,
  type AirQualitySnapshot,
} from "../lib/airQuality";

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
