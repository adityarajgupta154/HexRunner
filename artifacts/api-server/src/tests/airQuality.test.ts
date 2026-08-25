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

    assert.deepEqual(first, { sequence: 1 });
    assert.strictEqual(second, first);
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
    const cache = new AirQualityAreaCache<{ sequence: number }>(100, () => now);
    const loader = async () => ({ sequence: ++calls });

    assert.deepEqual(await cache.getOrLoad("area", loader), { sequence: 1 });
    now = 1_099;
    assert.deepEqual(await cache.getOrLoad("area", loader), { sequence: 1 });
    now = 1_100;
    assert.deepEqual(await cache.getOrLoad("area", loader), { sequence: 2 });
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
    assert.deepEqual(await cache.getOrLoad("area", loader), {
      available: true,
    });
    assert.equal(calls, 2);
  });

  test("preserves fetch time while recomputing stale state and future windows", () => {
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
    assert.equal(freshResponse.isStale, false);
    assert.equal(laterResponse.isStale, true);
    assert.equal(
      laterResponse.suggestedWindow?.startsAt.toISOString(),
      "2026-08-25T14:00:00.000Z",
    );
    assert.equal(laterResponse.suggestedWindow?.expectedAqi, 65);
  });
});
