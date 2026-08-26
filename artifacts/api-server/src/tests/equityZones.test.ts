import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { classifyEquityAreas } from "../lib/equityZones";
import { getPathIntegrity } from "../lib/pathIntegrity";

describe("cold-zone classifier", () => {
  test("keeps an all-tie baseline medium", () => {
    assert.deepEqual(
      [...classifyEquityAreas(["a", "b", "c", "d"].map((areaH3) => ({ areaH3, contributionCount: 3 }))).values()],
      ["medium", "medium", "medium", "medium"],
    );
  });

  test("classifies quartile boundaries as whole tied groups", () => {
    const tiers = classifyEquityAreas([
      { areaH3: "a", contributionCount: 1 },
      { areaH3: "b", contributionCount: 1 },
      { areaH3: "c", contributionCount: 2 },
      { areaH3: "d", contributionCount: 3 },
      { areaH3: "e", contributionCount: 3 },
      { areaH3: "f", contributionCount: 4 },
      { areaH3: "g", contributionCount: 5 },
      { areaH3: "h", contributionCount: 5 },
    ]);
    assert.equal(tiers.get("a"), "cold");
    assert.equal(tiers.get("b"), "cold");
    assert.equal(tiers.get("e"), "medium");
    assert.equal(tiers.get("g"), "hot");
    assert.equal(tiers.get("h"), "hot");
  });
});

describe("server path integrity", () => {
  const pointAtDistance = (distanceMeters: number, timestamp: number) => ({
    lat: 0,
    lng: distanceMeters / 6_371_000 * 180 / Math.PI,
    timestamp,
  });

  test("does not accept favorable client telemetry over an impossible jump", () => {
    const integrity = getPathIntegrity([
      { lat: 0, lng: 0, timestamp: 0 },
      { lat: 1, lng: 1, timestamp: 6_000 },
    ]);
    assert.equal(integrity.flaggedSuspicious, true);
    assert.ok((integrity.maxSpeedMetersPerSecond ?? 0) > 15);
  });

  test("does not punish a short legitimate sprint but flags sustained vehicle speed", () => {
    const shortSprint = getPathIntegrity([
      { lat: 0, lng: 0, timestamp: 0 },
      { lat: 0, lng: 0.00063, timestamp: 10_000 },
    ]);
    assert.equal(shortSprint.flaggedSuspicious, false);

    const sustained = getPathIntegrity([
      { lat: 0, lng: 0, timestamp: 0 },
      { lat: 0, lng: 0.00063, timestamp: 10_000 },
      { lat: 0, lng: 0.00126, timestamp: 20_000 },
      { lat: 0, lng: 0.00189, timestamp: 30_000 },
      { lat: 0, lng: 0.00252, timestamp: 40_000 },
    ]);
    assert.equal(sustained.flaggedSuspicious, true);
    assert.match(sustained.suspiciousReason ?? "", /25 km\/h/);
  });

  test("keeps exact motion thresholds accepted and rejects values just beyond them", () => {
    const exactThirtySeconds = getPathIntegrity([
      { lat: 0, lng: 0, timestamp: 0 },
      pointAtDistance(240, 30_000),
    ]);
    assert.equal(exactThirtySeconds.flaggedSuspicious, false);

    const overThirtySeconds = getPathIntegrity([
      { lat: 0, lng: 0, timestamp: 0 },
      pointAtDistance(248, 31_000),
    ]);
    assert.equal(overThirtySeconds.flaggedSuspicious, true);
    assert.match(overThirtySeconds.suspiciousReason ?? "", /25 km\/h/);

    const belowImpossibleSpeed = getPathIntegrity([
      { lat: 0, lng: 0, timestamp: 0 },
      pointAtDistance(250, 7_507),
    ]);
    assert.equal(belowImpossibleSpeed.flaggedSuspicious, false);

    const overImpossibleSpeed = getPathIntegrity([
      { lat: 0, lng: 0, timestamp: 0 },
      pointAtDistance(251, 7_500),
    ]);
    assert.equal(overImpossibleSpeed.flaggedSuspicious, true);
    assert.match(overImpossibleSpeed.suspiciousReason ?? "", /Impossible GPS jump/);
  });
});