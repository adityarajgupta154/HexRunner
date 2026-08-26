import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import {
  db,
  hexrunnerCivicUploadGrantsTable,
  hexrunnerEquityContributionsTable,
  hexrunnerEquityEvaluationsTable,
  hexrunnerEquityTiersTable,
  hexrunnerHexOwnershipTable,
  hexrunnerLivePresenceTable,
  hexrunnerRunPointsTable,
  hexrunnerRunsTable,
  hexrunnerUsersTable,
  pool,
} from "@workspace/db";
import { eq, inArray, or, sql } from "drizzle-orm";
import { cellToLatLng, cellToParent, gridDisk, latLngToCell } from "h3-js";
import app from "../app";
import { cleanupExpiredCivicData } from "../routes/civic";
import { issueAnonymousCredential } from "../lib/anonymousCredential";
import { equityDailyAreaKey, equityRunKey } from "../lib/equityZones";
import { getPathIntegrity } from "../lib/pathIntegrity";
import { getLoopCapture } from "../lib/loopCapture";

process.env.SESSION_SECRET ||= "hexrunner-run-saving-tests-only";

const TEST_NAMESPACE = randomUUID().replaceAll("-", "").slice(0, 12);
const TEST_USERS = {
  success: `device_test_success_${TEST_NAMESPACE}`,
  rollback: `device_test_rollback_${TEST_NAMESPACE}`,
  validation: `device_test_validation_${TEST_NAMESPACE}`,
  owner: `device_test_owner_${TEST_NAMESPACE}`,
  thief: `device_test_thief_${TEST_NAMESPACE}`,
  newer: `device_test_newer_${TEST_NAMESPACE}`,
  older: `device_test_older_${TEST_NAMESPACE}`,
  cleanup: `device_test_cleanup_${TEST_NAMESPACE}`,
  equity: `device_test_equity_${TEST_NAMESPACE}`,
  exclusion: `device_test_exclusion_${TEST_NAMESPACE}`,
  budget: `device_test_budget_${TEST_NAMESPACE}`,
  cap: `device_test_cap_${TEST_NAMESPACE}`,
  repeatOne: `device_test_repeat_one_${TEST_NAMESPACE}`,
  repeatTwo: `device_test_repeat_two_${TEST_NAMESPACE}`,
  retention: `device_test_retention_${TEST_NAMESPACE}`,
};
const TEST_RUNS = {
  success: `run_test_success_${TEST_NAMESPACE}`,
  rollback: `run_test_rollback_${TEST_NAMESPACE}`,
  invalidPath: `run_test_path_${TEST_NAMESPACE}`,
  future: `run_test_future_${TEST_NAMESPACE}`,
  owner: `run_test_owner_${TEST_NAMESPACE}`,
  thief: `run_test_thief_${TEST_NAMESPACE}`,
  newer: `run_test_newer_${TEST_NAMESPACE}`,
  older: `run_test_older_${TEST_NAMESPACE}`,
  equity: `run_test_equity_${TEST_NAMESPACE}`,
  suspicious: `run_test_suspicious_${TEST_NAMESPACE}`,
  mocked: `run_test_mocked_${TEST_NAMESPACE}`,
  forgedPhysics: `run_test_forged_physics_${TEST_NAMESPACE}`,
  budgetFixture: `run_test_budget_fixture_${TEST_NAMESPACE}`,
  budget: `run_test_budget_${TEST_NAMESPACE}`,
  capFixture: `run_test_cap_fixture_${TEST_NAMESPACE}`,
  capOne: `run_test_cap_one_${TEST_NAMESPACE}`,
  capTwo: `run_test_cap_two_${TEST_NAMESPACE}`,
  repeatOne: `run_test_repeat_one_${TEST_NAMESPACE}`,
  repeatTwo: `run_test_repeat_two_${TEST_NAMESPACE}`,
  repeatOther: `run_test_repeat_other_${TEST_NAMESPACE}`,
  historical: `run_test_historical_${TEST_NAMESPACE}`,
  retentionFixture: `run_test_retention_fixture_${TEST_NAMESPACE}`,
  pausedValid: `run_test_paused_valid_${TEST_NAMESPACE}`,
  pausedForged: `run_test_paused_forged_${TEST_NAMESPACE}`,
  pausedLegacy: `run_test_paused_legacy_${TEST_NAMESPACE}`,
};
const TEST_USER_IDS = Object.values(TEST_USERS);
const TEST_RUN_IDS = Object.values(TEST_RUNS);
const TEST_CITIES = new Set<string>();
const ENROLLMENT_SECRET = "a".repeat(64);

let server: Server;
let baseUrl: string;

type JsonResponse<T> = {
  status: number;
  body: T;
};

type SaveResponse = {
  runId: string;
  saved: boolean;
  idempotent: boolean;
  newHexes: number;
  stolenHexes: number;
  claimedHexes: number;
};

async function cleanupTestData(): Promise<void> {
  if (TEST_CITIES.size) {
    await db.delete(hexrunnerEquityTiersTable).where(inArray(hexrunnerEquityTiersTable.cityH3, [...TEST_CITIES]));
    await db.delete(hexrunnerEquityEvaluationsTable).where(inArray(hexrunnerEquityEvaluationsTable.cityH3, [...TEST_CITIES]));
  }
  await db.delete(hexrunnerEquityContributionsTable).where(inArray(hexrunnerEquityContributionsTable.runKey, TEST_RUN_IDS.map(equityRunKey)));
  await db.delete(hexrunnerLivePresenceTable).where(inArray(hexrunnerLivePresenceTable.userId, TEST_USER_IDS));
  await db
    .delete(hexrunnerHexOwnershipTable)
    .where(
      or(
        inArray(hexrunnerHexOwnershipTable.ownerId, TEST_USER_IDS),
        inArray(hexrunnerHexOwnershipTable.lastRunId, TEST_RUN_IDS),
      ),
    );
  await db
    .delete(hexrunnerRunPointsTable)
    .where(inArray(hexrunnerRunPointsTable.runId, TEST_RUN_IDS));
  await db
    .delete(hexrunnerRunsTable)
    .where(inArray(hexrunnerRunsTable.id, TEST_RUN_IDS));
  await db
    .delete(hexrunnerUsersTable)
    .where(inArray(hexrunnerUsersTable.id, TEST_USER_IDS));
}

async function unusedPoint(slot: number): Promise<{
  lat: number;
  lng: number;
  h3Index: string;
}> {
  const latitudeSeed = Number.parseInt(TEST_NAMESPACE.slice(0, 6), 16);
  const longitudeSeed = Number.parseInt(TEST_NAMESPACE.slice(6, 12), 16);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const lat =
      -75 + ((latitudeSeed + slot * 131 + attempt * 17) % 3_000) / 100;
    const lng =
      -170 + ((longitudeSeed + slot * 197 + attempt * 29) % 34_000) / 100;
    const h3Index = latLngToCell(lat, lng, 9);
    const [ownership] = await db
      .select({ h3Index: hexrunnerHexOwnershipTable.h3Index })
      .from(hexrunnerHexOwnershipTable)
      .where(eq(hexrunnerHexOwnershipTable.h3Index, h3Index));
    if (!ownership) return { lat, lng, h3Index };
  }

  throw new Error("Unable to allocate an unused H3 cell for testing.");
}

async function waitForAdvisoryWaiter(clientRunId: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  const applicationName = `hexrunner-run:${clientRunId}`;

  while (Date.now() < deadline) {
    const result = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM pg_stat_activity
      WHERE application_name = $1
        AND wait_event_type = 'Lock'
        AND LOWER(COALESCE(wait_event, '')) = 'advisory'
    `, [applicationName]);
    if (Number(result.rows[0]?.count ?? 0) === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(
    `Timed out waiting for advisory lock waiter ${clientRunId}.`,
  );
}

async function postJson<T>(
  path: string,
  body: unknown,
  credential?: string,
): Promise<JsonResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(credential ? { authorization: `Bearer ${credential}` } : {}),
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function getJson<T>(path: string, credential?: string): Promise<JsonResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: credential ? { authorization: `Bearer ${credential}` } : {},
  });
  return { status: response.status, body: await response.json() as T };
}

async function enroll(userId: string): Promise<string> {
  const response = await postJson<{ credential: string }>(
    "/api/anonymous-identities",
    {
      requestedUserId: userId,
      enrollmentSecret: ENROLLMENT_SECRET,
    },
  );

  assert.ok(
    response.status === 200 || response.status === 201,
    `identity enrollment returned ${response.status}`,
  );
  assert.match(response.body.credential, /^hr1\./);
  return response.body.credential;
}

async function testCredential(userId: string): Promise<string> {
  await db.insert(hexrunnerUsersTable).values({ id: userId }).onConflictDoNothing();
  return issueAnonymousCredential(userId);
}

function runPayload({
  clientRunId,
  lat,
  lng,
  startedAt,
  endedAt,
  pointTimestamp = endedAt.getTime(),
  claimedHexes = [latLngToCell(lat, lng, 9)],
}: {
  clientRunId: string;
  lat: number;
  lng: number;
  startedAt: Date;
  endedAt: Date;
  pointTimestamp?: number;
  claimedHexes?: string[];
}) {
  return {
    clientRunId,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    elapsedSeconds: Math.max(
      0,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1_000),
    ),
    distanceKm: 1.25,
    points: [
      {
        lat,
        lng,
        timestamp: pointTimestamp - 6_000,
        accuracyMeters: 8,
        speedMetersPerSecond: 2,
      },
      {
        lat,
        lng,
        timestamp: pointTimestamp,
        accuracyMeters: 8,
        speedMetersPerSecond: 2,
      },
    ],
    claimedHexes,
  };
}

async function seedColdTier(h3Index: string, day: Date): Promise<void> {
  const cityH3 = cellToParent(h3Index, 4);
  TEST_CITIES.add(cityH3);
  await db.insert(hexrunnerEquityEvaluationsTable).values({
    cityH3, evaluationDay: day, availability: "available", evaluatedAt: new Date(),
  }).onConflictDoNothing();
  await db.insert(hexrunnerEquityTiersTable).values({
    cityH3, evaluationDay: day, areaH3: cellToParent(h3Index, 7), tier: "cold",
  }).onConflictDoNothing();
}

async function insertFixtureRun(
  id: string,
  userId: string,
  endedAt: Date,
  values: Partial<{ hexCount: number; bonusCredit: number }> = {},
): Promise<void> {
  await db.insert(hexrunnerRunsTable).values({
    id, userId, startedAt: new Date(endedAt.getTime() - 60_000), endedAt,
    elapsedSeconds: 60, distanceKm: 0, pointCount: 0, claimedHexes: [],
    hexCount: values.hexCount ?? 0, bonusCredit: values.bonusCredit ?? 0,
  });
}

describe("run-saving integration", { concurrency: false }, () => {
  before(async () => {
    await cleanupTestData();
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await cleanupTestData();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  });

  test("derives bounded interiors only from simple closed paths", () => {
    const square = [
      { lat: 37.770, lng: -122.425, timestamp: 0 },
      { lat: 37.770, lng: -122.415, timestamp: 10_000 },
      { lat: 37.780, lng: -122.415, timestamp: 20_000 },
      { lat: 37.780, lng: -122.425, timestamp: 30_000 },
      { lat: 37.770, lng: -122.425, timestamp: 40_000 },
    ];
    const captured = getLoopCapture(square);
    assert.equal(captured.loopDetected, true);
    assert.ok(captured.interiorHexes.length > 0);
    assert.deepEqual(getLoopCapture([...square.slice(0, -1), {
      lat: 37.790, lng: -122.400, timestamp: 40_000,
    }]), { loopDetected: false, interiorHexes: [] });
    assert.deepEqual(getLoopCapture([
      square[0]!, square[2]!, square[1]!, square[3]!, square[0]!,
    ]), { loopDetected: false, interiorHexes: [] });
    assert.deepEqual(getLoopCapture([
      { lat: 0, lng: 0, timestamp: 0 },
      { lat: 0, lng: 2, timestamp: 1 },
      { lat: 2, lng: 2, timestamp: 2 },
      { lat: 2, lng: 0, timestamp: 3 },
      { lat: 0, lng: 0, timestamp: 4 },
    ]), { loopDetected: false, interiorHexes: [] });
  });

  test("saves atomically and retries the same run idempotently", async () => {
    const credential = await enroll(TEST_USERS.success);
    const point = await unusedPoint(1);
    const endedAt = new Date(Date.now() - 60_000);
    const payload = runPayload({
      clientRunId: TEST_RUNS.success,
      lat: point.lat,
      lng: point.lng,
      startedAt: new Date(endedAt.getTime() - 600_000),
      endedAt,
    });

    const unauthorized = await postJson<{ error: string }>(
      "/api/runs",
      payload,
    );
    assert.equal(unauthorized.status, 401);

    const first = await postJson<SaveResponse>(
      "/api/runs",
      payload,
      credential,
    );
    assert.equal(first.status, 201);
    assert.deepEqual(
      {
        saved: first.body.saved,
        idempotent: first.body.idempotent,
        newHexes: first.body.newHexes,
        stolenHexes: first.body.stolenHexes,
      },
      {
        saved: true,
        idempotent: false,
        newHexes: 1,
        stolenHexes: 0,
      },
    );

    const retry = await postJson<SaveResponse>(
      "/api/runs",
      payload,
      credential,
    );
    assert.equal(retry.status, 200);
    assert.equal(retry.body.idempotent, true);
    assert.equal(retry.body.newHexes, first.body.newHexes);

    const [user] = await db
      .select({ totalHexesOwned: hexrunnerUsersTable.totalHexesOwned })
      .from(hexrunnerUsersTable)
      .where(eq(hexrunnerUsersTable.id, TEST_USERS.success));
    const points = await db
      .select()
      .from(hexrunnerRunPointsTable)
      .where(eq(hexrunnerRunPointsTable.runId, TEST_RUNS.success));
    assert.equal(user?.totalHexesOwned, 1);
    assert.equal(points.length, 2);
  });

  test("awards a frozen cold tier once and keeps credit responses idempotent", async () => {
    const credential = await enroll(TEST_USERS.equity);
    const point = await unusedPoint(40);
    const cityH3 = cellToParent(point.h3Index, 4);
    const areaH3 = cellToParent(point.h3Index, 7);
    TEST_CITIES.add(cityH3);
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    await db.insert(hexrunnerEquityEvaluationsTable).values({
      cityH3, evaluationDay: day, availability: "available", evaluatedAt: new Date(),
    });
    await db.insert(hexrunnerEquityTiersTable).values({
      cityH3, evaluationDay: day, areaH3, tier: "cold",
    });
    const endedAt = new Date(Date.now() - 60_000);
    const payload = {
      ...runPayload({ clientRunId: TEST_RUNS.equity, lat: point.lat, lng: point.lng, startedAt: new Date(endedAt.getTime() - 600_000), endedAt }),
      // Unknown request fields are deliberately not part of SaveRunRequest.
      multiplier: 99, bonusCredit: 999, totalCredit: 999,
    };
    const first = await postJson<SaveResponse & Record<string, number>>("/api/runs", payload, credential);
    assert.equal(first.status, 201);
    assert.deepEqual(
      { base: first.body.baseCredit, bonus: first.body.bonusCredit, total: first.body.totalCredit, cold: first.body.coldZoneHexes, daily: first.body.dailyBonusCredit, cap: first.body.dailyBonusCap },
      { base: 1, bonus: 1, total: 2, cold: 1, daily: 1, cap: 5 },
    );
    const retry = await postJson<SaveResponse & Record<string, number>>("/api/runs", payload, credential);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.bonusCredit, 1);
    assert.equal(retry.body.totalCredit, 2);
    const contributions = await db.select().from(hexrunnerEquityContributionsTable)
      .where(eq(hexrunnerEquityContributionsTable.runKey, equityRunKey(TEST_RUNS.equity)));
    assert.notEqual(contributions[0]?.runKey, TEST_RUNS.equity);
    assert.equal(contributions.length, 1);
    const [ownership] = await db.select().from(hexrunnerHexOwnershipTable)
      .where(eq(hexrunnerHexOwnershipTable.h3Index, point.h3Index));
    assert.equal(ownership?.ownerId, TEST_USERS.equity);
    const stats = await getJson<{
      totals: { totalCredits: number; totalBonusCredits: number; todayBonusCredits: number };
      recentRuns: Array<{ totalCredit: number; bonusCredit: number }>;
    }>(`/api/users/${TEST_USERS.equity}/stats`);
    assert.deepEqual({
      totalCredits: stats.body.totals.totalCredits,
      totalBonusCredits: stats.body.totals.totalBonusCredits,
      todayBonusCredits: stats.body.totals.todayBonusCredits,
    }, {
      totalCredits: 2, totalBonusCredits: 1, todayBonusCredits: 1,
    });
    assert.deepEqual(
      { totalCredit: stats.body.recentRuns[0]?.totalCredit, bonusCredit: stats.body.recentRuns[0]?.bonusCredit },
      { totalCredit: 2, bonusCredit: 1 },
    );
    const leaderboard = await getJson<{ users: Array<{
      totalCredits: number; totalBonusCredits: number; totalHexesOwned: number;
    }> }>("/api/leaderboard");
    const entry = leaderboard.body.users.find((candidate) => candidate.totalCredits === 2);
    assert.deepEqual(
      entry && { totalCredits: entry.totalCredits, totalBonusCredits: entry.totalBonusCredits, totalHexesOwned: entry.totalHexesOwned },
      { totalCredits: 2, totalBonusCredits: 1, totalHexesOwned: 1 },
    );
  });

  test("returns only privacy-safe equity status from live presence", async () => {
    const credential = await enroll(TEST_USERS.equity);
    const unauthenticated = await getJson<{ error: string }>("/api/equity-zones/current");
    assert.equal(unauthenticated.status, 401);
    const noPresence = await getJson<Record<string, unknown>>("/api/equity-zones/current", credential);
    assert.equal(noPresence.status, 200);
    assert.equal(noPresence.body.availability, "unavailable");
    const point = await unusedPoint(41);
    const cityH3 = cellToParent(point.h3Index, 4);
    const areaH3 = cellToParent(point.h3Index, 7);
    TEST_CITIES.add(cityH3);
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    await db.insert(hexrunnerLivePresenceTable).values({
      userId: TEST_USERS.equity, clientRunId: "presence_equity_test",
      latitude: point.lat, longitude: point.lng, accuracyMeters: 5, h3Index: point.h3Index,
      updatedAt: new Date(), expiresAt: new Date(Date.now() + 30_000),
    });
    await db.insert(hexrunnerEquityEvaluationsTable).values({
      cityH3, evaluationDay: day, availability: "available", evaluatedAt: new Date(),
    }).onConflictDoNothing();
    const sparse = await getJson<Record<string, unknown>>("/api/equity-zones/current", credential);
    assert.equal(sparse.body.availability, "insufficient_data");
    assert.equal(sparse.body.tier, null);
    assert.equal(sparse.body.multiplier, 1);
    assert.equal(Object.keys(sparse.body).some((key) => /h3|count|area|city/i.test(key)), false);
    await db.insert(hexrunnerEquityTiersTable).values({
      cityH3, evaluationDay: day, areaH3, tier: "cold",
    }).onConflictDoNothing();
    const cold = await getJson<Record<string, unknown>>("/api/equity-zones/current", credential);
    assert.equal(cold.body.tier, "cold");
    assert.equal(cold.body.multiplier, 2);
  });

  test("excludes suspicious and point-mocked valid claims from bonuses and contributions", async () => {
    const credential = await testCredential(TEST_USERS.exclusion);
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const suspiciousPoint = await unusedPoint(50);
    const mockedPoint = await unusedPoint(51);
    await seedColdTier(suspiciousPoint.h3Index, day);
    await seedColdTier(mockedPoint.h3Index, day);
    const endedAt = new Date(Date.now() - 60_000);
    const suspicious = await postJson<SaveResponse & { bonusCredit: number }>(
      "/api/runs",
      { ...runPayload({ clientRunId: TEST_RUNS.suspicious, lat: suspiciousPoint.lat, lng: suspiciousPoint.lng, startedAt: new Date(endedAt.getTime() - 600_000), endedAt }), antiSpoof: { flaggedSuspicious: true } },
      credential,
    );
    assert.equal(suspicious.status, 201);
    assert.equal(suspicious.body.bonusCredit, 0);
    const mockedPayload = runPayload({
      clientRunId: TEST_RUNS.mocked, lat: mockedPoint.lat, lng: mockedPoint.lng,
      startedAt: new Date(endedAt.getTime() - 1_200_000), endedAt: new Date(endedAt.getTime() - 600_000),
    });
    mockedPayload.points.forEach((point) => { Object.assign(point, { mocked: true }); });
    const mocked = await postJson<SaveResponse & { bonusCredit: number; antiSpoof: { mockLocationDetected: boolean | null } }>(
      "/api/runs", mockedPayload, credential,
    );
    assert.equal(mocked.status, 201);
    assert.equal(mocked.body.antiSpoof.mockLocationDetected, true);
    assert.equal(mocked.body.bonusCredit, 0);
    const contributions = await db.select().from(hexrunnerEquityContributionsTable).where(
      inArray(hexrunnerEquityContributionsTable.runKey, [equityRunKey(TEST_RUNS.suspicious), equityRunKey(TEST_RUNS.mocked)]),
    );
    assert.equal(contributions.length, 0);
  });

  test("server path physics overrides forged favorable client telemetry", async () => {
    const credential = await testCredential(TEST_USERS.exclusion);
    const first = await unusedPoint(52);
    const second = await unusedPoint(53);
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    await seedColdTier(first.h3Index, day);
    await seedColdTier(second.h3Index, day);
    const endedAt = new Date(Date.now() - 60_000);
    const payload = {
      clientRunId: TEST_RUNS.forgedPhysics,
      startedAt: new Date(endedAt.getTime() - 13_000).toISOString(),
      endedAt: endedAt.toISOString(),
      elapsedSeconds: 13,
      distanceKm: 1,
      points: [
        { lat: first.lat, lng: first.lng, timestamp: endedAt.getTime() - 13_000, accuracyMeters: 8 },
        { lat: first.lat, lng: first.lng, timestamp: endedAt.getTime() - 7_000, accuracyMeters: 8 },
        { lat: second.lat, lng: second.lng, timestamp: endedAt.getTime() - 6_000, accuracyMeters: 8 },
        { lat: second.lat, lng: second.lng, timestamp: endedAt.getTime(), accuracyMeters: 8 },
      ],
      claimedHexes: [first.h3Index, second.h3Index],
      antiSpoof: {
        flaggedSuspicious: false,
        maxSpeedMetersPerSecond: 0,
        averageAccuracyMeters: 1,
      },
    };
    const saved = await postJson<SaveResponse & {
      bonusCredit: number;
      antiSpoof: {
        flaggedSuspicious: boolean;
        reason: string | null;
        maxSpeedMetersPerSecond: number | null;
      };
    }>("/api/runs", payload, credential);
    assert.equal(saved.status, 201);
    assert.equal(saved.body.antiSpoof.flaggedSuspicious, true);
    assert.match(saved.body.antiSpoof.reason ?? "", /Impossible GPS jump/);
    assert.ok((saved.body.antiSpoof.maxSpeedMetersPerSecond ?? 0) > 120 / 3.6);
    assert.equal(saved.body.bonusCredit, 0);
    const contributions = await db.select().from(hexrunnerEquityContributionsTable).where(
      eq(hexrunnerEquityContributionsTable.runKey, equityRunKey(TEST_RUNS.forgedPhysics)),
    );
    assert.equal(contributions.length, 0);
  });

  test("aggregates a traversed area once even when the territory budget withholds a claim", async () => {
    const credential = await testCredential(TEST_USERS.budget);
    await db.update(hexrunnerUsersTable).set({ activityLevel: "beginner" })
      .where(eq(hexrunnerUsersTable.id, TEST_USERS.budget));
    const first = await unusedPoint(60);
    const secondCell = gridDisk(first.h3Index, 1).find((cell) =>
      cell !== first.h3Index && cellToParent(cell, 7) === cellToParent(first.h3Index, 7));
    assert.ok(secondCell, "a resolution-9 neighbor must share its resolution-7 parent");
    const [firstLat, firstLng] = cellToLatLng(first.h3Index);
    const [secondLat, secondLng] = cellToLatLng(secondCell!);
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    await seedColdTier(first.h3Index, day);
    const endedAt = new Date(Date.now() - 60_000);
    await insertFixtureRun(TEST_RUNS.budgetFixture, TEST_USERS.budget, endedAt, { hexCount: 5 });
    const payload = {
      clientRunId: TEST_RUNS.budget,
      startedAt: new Date(endedAt.getTime() - 90_000).toISOString(),
      endedAt: endedAt.toISOString(), elapsedSeconds: 90, distanceKm: 1,
      points: [
        { lat: firstLat, lng: firstLng, timestamp: endedAt.getTime() - 90_000, accuracyMeters: 8 },
        { lat: firstLat, lng: firstLng, timestamp: endedAt.getTime() - 80_000, accuracyMeters: 8 },
        { lat: secondLat, lng: secondLng, timestamp: endedAt.getTime() - 20_000, accuracyMeters: 8 },
        { lat: secondLat, lng: secondLng, timestamp: endedAt.getTime() - 10_000, accuracyMeters: 8 },
      ],
      claimedHexes: [first.h3Index, secondCell],
    };
    assert.equal(
      getPathIntegrity(payload.points).flaggedSuspicious,
      false,
      `budget fixture must remain a plausible human path: ${JSON.stringify({
        integrity: getPathIntegrity(payload.points),
        points: payload.points,
      })}`,
    );
    const saved = await postJson<SaveResponse & { bonusCredit: number }>(
      "/api/runs", payload, credential,
    );
    assert.equal(saved.status, 201);
    assert.equal(saved.body.claimedHexes, 1);
    assert.equal(
      saved.body.bonusCredit,
      1,
      `expected one accepted cold claim to earn one bonus: ${JSON.stringify(saved.body)}`,
    );
    const contributions = await db.select().from(hexrunnerEquityContributionsTable)
      .where(eq(hexrunnerEquityContributionsTable.runKey, equityRunKey(TEST_RUNS.budget)));
    assert.equal(
      contributions.length,
      1,
      `expected one coarse-area contribution for the validated traversal: ${JSON.stringify(saved.body)}`,
    );
    assert.equal(contributions[0]?.areaH3, cellToParent(first.h3Index, 7));
  });

  test("serializes concurrent same-user cold bonuses at the remaining daily cap", async () => {
    const credential = await testCredential(TEST_USERS.cap);
    const one = await unusedPoint(70);
    const two = await unusedPoint(71);
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    await seedColdTier(one.h3Index, day); await seedColdTier(two.h3Index, day);
    const endedAt = new Date(Date.now() - 60_000);
    await insertFixtureRun(TEST_RUNS.capFixture, TEST_USERS.cap, endedAt, { bonusCredit: 4 });
    const [first, second] = await Promise.all([
      postJson<SaveResponse & { bonusCredit: number }>("/api/runs", runPayload({
        clientRunId: TEST_RUNS.capOne, lat: one.lat, lng: one.lng,
        startedAt: new Date(endedAt.getTime() - 600_000), endedAt,
      }), credential),
      postJson<SaveResponse & { bonusCredit: number }>("/api/runs", runPayload({
        clientRunId: TEST_RUNS.capTwo, lat: two.lat, lng: two.lng,
        startedAt: new Date(endedAt.getTime() - 1_200_000), endedAt: new Date(endedAt.getTime() - 600_000),
      }), credential),
    ]);
    assert.equal(first.status, 201); assert.equal(second.status, 201);
    assert.equal(first.body.bonusCredit + second.body.bonusCredit, 1);
    const [usage] = await db.select({
      bonus: sql<number>`coalesce(sum(${hexrunnerRunsTable.bonusCredit}), 0)::int`,
    }).from(hexrunnerRunsTable).where(eq(hexrunnerRunsTable.userId, TEST_USERS.cap));
    assert.equal(Number(usage?.bonus), 5);
    const ownership = await db.select().from(hexrunnerHexOwnershipTable).where(
      inArray(hexrunnerHexOwnershipTable.h3Index, [one.h3Index, two.h3Index]),
    );
    assert.equal(ownership.length, 2);
    const contributionsBeforeRetry = await db.select().from(hexrunnerEquityContributionsTable).where(
      inArray(hexrunnerEquityContributionsTable.runKey, [equityRunKey(TEST_RUNS.capOne), equityRunKey(TEST_RUNS.capTwo)]),
    );
    assert.equal(contributionsBeforeRetry.length, 2);
    const retries = await Promise.all([
      postJson<SaveResponse & { bonusCredit: number }>("/api/runs", runPayload({
        clientRunId: TEST_RUNS.capOne, lat: one.lat, lng: one.lng,
        startedAt: new Date(endedAt.getTime() - 600_000), endedAt,
      }), credential),
      postJson<SaveResponse & { bonusCredit: number }>("/api/runs", runPayload({
        clientRunId: TEST_RUNS.capTwo, lat: two.lat, lng: two.lng,
        startedAt: new Date(endedAt.getTime() - 1_200_000), endedAt: new Date(endedAt.getTime() - 600_000),
      }), credential),
    ]);
    assert.ok(retries.every((result) => result.status === 200 && result.body.idempotent));
    const [afterRetry] = await db.select({
      bonus: sql<number>`coalesce(sum(${hexrunnerRunsTable.bonusCredit}), 0)::int`,
    }).from(hexrunnerRunsTable).where(eq(hexrunnerRunsTable.userId, TEST_USERS.cap));
    assert.equal(Number(afterRetry?.bonus), 5);
    const contributionsAfterRetry = await db.select().from(hexrunnerEquityContributionsTable).where(
      inArray(hexrunnerEquityContributionsTable.runKey, [equityRunKey(TEST_RUNS.capOne), equityRunKey(TEST_RUNS.capTwo)]),
    );
    assert.equal(contributionsAfterRetry.length, 2);
  });

  test("daily area nullifier dedupes repeated routes without retaining runner identity", async () => {
    const firstCredential = await testCredential(TEST_USERS.repeatOne);
    const otherCredential = await testCredential(TEST_USERS.repeatTwo);
    const first = await unusedPoint(80);
    const secondCell = gridDisk(first.h3Index, 1).find((cell) =>
      cell !== first.h3Index && cellToParent(cell, 7) === cellToParent(first.h3Index, 7));
    assert.ok(secondCell);
    const [secondLat, secondLng] = cellToLatLng(secondCell!);
    const endedAt = new Date(Date.now() - 60_000);
    const secondPayload = {
      clientRunId: TEST_RUNS.repeatTwo,
      startedAt: new Date(endedAt.getTime() - 90_000).toISOString(), endedAt: endedAt.toISOString(),
      elapsedSeconds: 90, distanceKm: 1,
      points: [
        { lat: secondLat, lng: secondLng, timestamp: endedAt.getTime() - 90_000, accuracyMeters: 8 },
        { lat: secondLat, lng: secondLng, timestamp: endedAt.getTime() - 80_000, accuracyMeters: 8 },
      ],
      claimedHexes: [secondCell],
    };
    const firstSave = await postJson<SaveResponse>("/api/runs", runPayload({
      clientRunId: TEST_RUNS.repeatOne, lat: first.lat, lng: first.lng,
      startedAt: new Date(endedAt.getTime() - 600_000), endedAt,
    }), firstCredential);
    const secondSave = await postJson<SaveResponse>("/api/runs", secondPayload, firstCredential);
    assert.equal(firstSave.status, 201); assert.equal(secondSave.status, 201);
    const area = cellToParent(first.h3Index, 7);
    let rows = await db.select().from(hexrunnerEquityContributionsTable)
      .where(eq(hexrunnerEquityContributionsTable.areaH3, area));
    assert.equal(rows.length, 1);
    const otherSave = await postJson<SaveResponse>("/api/runs", runPayload({
      clientRunId: TEST_RUNS.repeatOther, lat: first.lat, lng: first.lng,
      startedAt: new Date(endedAt.getTime() - 1_200_000), endedAt: new Date(endedAt.getTime() - 600_000),
    }), otherCredential);
    assert.equal(otherSave.status, 201);
    rows = await db.select().from(hexrunnerEquityContributionsTable)
      .where(eq(hexrunnerEquityContributionsTable.areaH3, area));
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.notEqual(row.runKey, TEST_RUNS.repeatOne);
      assert.notEqual(row.runKey, TEST_RUNS.repeatTwo);
      assert.equal("userId" in row, false);
      assert.equal("latitude" in row, false);
      assert.equal("longitude" in row, false);
    }
  });

  test("prunes expired inputs on evaluation and rejects late historical baseline contributions", async () => {
    const credential = await testCredential(TEST_USERS.retention);
    const point = await unusedPoint(90);
    const now = new Date();
    const oldDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 36));
    const city = cellToParent(point.h3Index, 4);
    TEST_CITIES.add(city);
    const oldArea = cellToParent(point.h3Index, 7);
    await db.insert(hexrunnerEquityContributionsTable).values({
      runKey: equityRunKey(TEST_RUNS.retentionFixture),
      dailyAreaKey: equityDailyAreaKey(TEST_USERS.retention, oldDay, oldArea),
      areaH3: oldArea, cityH3: city, windowStart: oldDay, createdAt: now,
    });
    await db.insert(hexrunnerLivePresenceTable).values({
      userId: TEST_USERS.retention, clientRunId: "retention_presence",
      latitude: point.lat, longitude: point.lng, accuracyMeters: 5, h3Index: point.h3Index,
      updatedAt: now, expiresAt: new Date(now.getTime() + 30_000),
    });
    const status = await getJson<Record<string, unknown>>("/api/equity-zones/current", credential);
    assert.equal(status.status, 200);
    const expired = await db.select().from(hexrunnerEquityContributionsTable)
      .where(eq(hexrunnerEquityContributionsTable.runKey, equityRunKey(TEST_RUNS.retentionFixture)));
    assert.equal(expired.length, 0);
    const historicalEnd = new Date(now.getTime() - 2 * 86_400_000);
    const historical = await postJson<SaveResponse>("/api/runs", runPayload({
      clientRunId: TEST_RUNS.historical, lat: point.lat, lng: point.lng,
      startedAt: new Date(historicalEnd.getTime() - 600_000), endedAt: historicalEnd,
    }), credential);
    assert.equal(historical.status, 201);
    const late = await db.select().from(hexrunnerEquityContributionsTable)
      .where(eq(hexrunnerEquityContributionsTable.runKey, equityRunKey(TEST_RUNS.historical)));
    assert.equal(late.length, 0);
    const [savedRun] = await db.select({ id: hexrunnerRunsTable.id })
      .from(hexrunnerRunsTable).where(eq(hexrunnerRunsTable.id, TEST_RUNS.historical));
    assert.equal(savedRun?.id, TEST_RUNS.historical);
  });

  test("rejects out-of-window GPS timestamps before persistence", async () => {
    const credential = await enroll(TEST_USERS.rollback);
    const point = await unusedPoint(2);
    const endedAt = new Date(Date.now() - 60_000);
    const payload = runPayload({
      clientRunId: TEST_RUNS.rollback,
      lat: point.lat,
      lng: point.lng,
      startedAt: new Date(endedAt.getTime() - 600_000),
      endedAt,
      pointTimestamp: 8_640_000_000_000_001,
    });

    const response = await postJson<{ error: string }>(
      "/api/runs",
      payload,
      credential,
    );
    assert.equal(response.status, 400);

    const [run] = await db
      .select()
      .from(hexrunnerRunsTable)
      .where(eq(hexrunnerRunsTable.id, TEST_RUNS.rollback));
    const points = await db
      .select()
      .from(hexrunnerRunPointsTable)
      .where(eq(hexrunnerRunPointsTable.runId, TEST_RUNS.rollback));
    const [ownership] = await db
      .select()
      .from(hexrunnerHexOwnershipTable)
      .where(
        eq(
          hexrunnerHexOwnershipTable.h3Index,
          payload.claimedHexes[0]!,
        ),
      );
    const [user] = await db
      .select({ totalHexesOwned: hexrunnerUsersTable.totalHexesOwned })
      .from(hexrunnerUsersTable)
      .where(eq(hexrunnerUsersTable.id, TEST_USERS.rollback));

    assert.equal(run, undefined);
    assert.equal(points.length, 0);
    assert.equal(ownership, undefined);
    assert.equal(user?.totalHexesOwned, 0);
  });

  test("rejects path/hex mismatches and future runs before persistence", async () => {
    const credential = await enroll(TEST_USERS.validation);
    const pathPoint = await unusedPoint(3);
    const mismatchedPoint = await unusedPoint(4);
    const endedAt = new Date(Date.now() - 60_000);
    const mismatchedPayload = runPayload({
      clientRunId: TEST_RUNS.invalidPath,
      lat: pathPoint.lat,
      lng: pathPoint.lng,
      startedAt: new Date(endedAt.getTime() - 600_000),
      endedAt,
      claimedHexes: [mismatchedPoint.h3Index],
    });
    const mismatch = await postJson<{ error: string }>(
      "/api/runs",
      mismatchedPayload,
      credential,
    );
    assert.equal(mismatch.status, 400);

    const futureEndedAt = new Date(Date.now() + 10 * 60_000);
    const futurePoint = await unusedPoint(5);
    const futurePayload = runPayload({
      clientRunId: TEST_RUNS.future,
      lat: futurePoint.lat,
      lng: futurePoint.lng,
      startedAt: new Date(futureEndedAt.getTime() - 60_000),
      endedAt: futureEndedAt,
    });
    const future = await postJson<{ error: string }>(
      "/api/runs",
      futurePayload,
      credential,
    );
    assert.equal(future.status, 400);

    const persisted = await db
      .select({ id: hexrunnerRunsTable.id })
      .from(hexrunnerRunsTable)
      .where(
        inArray(hexrunnerRunsTable.id, [
          TEST_RUNS.invalidPath,
          TEST_RUNS.future,
        ]),
      );
    assert.equal(persisted.length, 0);
  });

  test("validates paused wall time while preserving active elapsed time and legacy omission", async () => {
    const credential = await enroll(TEST_USERS.validation);
    const validPoint = await unusedPoint(150);
    const forgedPoint = await unusedPoint(151);
    const legacyPoint = await unusedPoint(152);
    const endedAt = new Date(Date.now() - 60_000);
    const paused = {
      ...runPayload({
        clientRunId: TEST_RUNS.pausedValid,
        lat: validPoint.lat,
        lng: validPoint.lng,
        startedAt: new Date(endedAt.getTime() - 600_000),
        endedAt,
      }),
      elapsedSeconds: 480,
      pausedSeconds: 120,
    };
    const saved = await postJson<SaveResponse>("/api/runs", paused, credential);
    assert.equal(saved.status, 201);
    const [stored] = await db
      .select({ elapsedSeconds: hexrunnerRunsTable.elapsedSeconds })
      .from(hexrunnerRunsTable)
      .where(eq(hexrunnerRunsTable.id, TEST_RUNS.pausedValid));
    assert.equal(stored?.elapsedSeconds, 480);

    const forged = await postJson<{ error: string }>("/api/runs", {
      ...runPayload({
        clientRunId: TEST_RUNS.pausedForged,
        lat: forgedPoint.lat,
        lng: forgedPoint.lng,
        startedAt: new Date(endedAt.getTime() - 1_200_000),
        endedAt: new Date(endedAt.getTime() - 600_000),
      }),
      pausedSeconds: 120,
    }, credential);
    assert.equal(forged.status, 400);

    const legacy = await postJson<SaveResponse>("/api/runs", runPayload({
      clientRunId: TEST_RUNS.pausedLegacy,
      lat: legacyPoint.lat,
      lng: legacyPoint.lng,
      startedAt: new Date(endedAt.getTime() - 1_800_000),
      endedAt: new Date(endedAt.getTime() - 1_200_000),
    }), credential);
    assert.equal(legacy.status, 201);
  });

  test("serializes concurrent claims so a late older run cannot win", async () => {
    const newerCredential = await enroll(TEST_USERS.newer);
    const olderCredential = await enroll(TEST_USERS.older);
    const point = await unusedPoint(6);
    const newerEndedAt = new Date(Date.now() - 60_000);
    const olderEndedAt = new Date(Date.now() - 30 * 60_000);
    const newerPayload = runPayload({
      clientRunId: TEST_RUNS.newer,
      lat: point.lat,
      lng: point.lng,
      startedAt: new Date(newerEndedAt.getTime() - 600_000),
      endedAt: newerEndedAt,
    });
    const olderPayload = runPayload({
      clientRunId: TEST_RUNS.older,
      lat: point.lat,
      lng: point.lng,
      startedAt: new Date(olderEndedAt.getTime() - 600_000),
      endedAt: olderEndedAt,
    });

    const blocker = await pool.connect();
    const completions: string[] = [];
    let blockerInTransaction = false;

    let newer: JsonResponse<SaveResponse>;
    let older: JsonResponse<SaveResponse>;
    try {
      await blocker.query("BEGIN");
      blockerInTransaction = true;
      await blocker.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [point.h3Index],
      );

      const newerRequest = postJson<SaveResponse>(
        "/api/runs",
        newerPayload,
        newerCredential,
      ).then((response) => {
        completions.push("newer");
        return response;
      });
      await waitForAdvisoryWaiter(TEST_RUNS.newer);

      const olderRequest = postJson<SaveResponse>(
        "/api/runs",
        olderPayload,
        olderCredential,
      ).then((response) => {
        completions.push("older");
        return response;
      });
      await waitForAdvisoryWaiter(TEST_RUNS.older);

      await blocker.query("COMMIT");
      blockerInTransaction = false;
      [newer, older] = await Promise.all([newerRequest, olderRequest]);
    } finally {
      if (blockerInTransaction) {
        await blocker.query("ROLLBACK");
      }
      blocker.release();
    }

    assert.equal(newer.status, 201);
    assert.equal(newer.body.newHexes, 1);
    assert.equal(older.status, 201);
    assert.equal(older.body.newHexes, 0);
    assert.equal(older.body.stolenHexes, 0);
    assert.deepEqual(completions, ["newer", "older"]);

    const [olderUser] = await db
      .select({ totalHexesOwned: hexrunnerUsersTable.totalHexesOwned })
      .from(hexrunnerUsersTable)
      .where(eq(hexrunnerUsersTable.id, TEST_USERS.older));
    assert.equal(olderUser?.totalHexesOwned, 0);

    const [ownership] = await db
      .select({
        ownerId: hexrunnerHexOwnershipTable.ownerId,
        lastRunId: hexrunnerHexOwnershipTable.lastRunId,
      })
      .from(hexrunnerHexOwnershipTable)
      .where(
        eq(
          hexrunnerHexOwnershipTable.h3Index,
          point.h3Index,
        ),
      );
    assert.deepEqual(ownership, {
      ownerId: TEST_USERS.newer,
      lastRunId: TEST_RUNS.newer,
    });
  });

  test("transfers a claimed hex to a later runner and refreshes claimedAt", async () => {
    const ownerCredential = await enroll(TEST_USERS.owner);
    const thiefCredential = await enroll(TEST_USERS.thief);
    const point = await unusedPoint(7);
    const ownerEndedAt = new Date(Date.now() - 2 * 60_000);
    const thiefEndedAt = new Date(Date.now() - 60_000);

    const ownerResponse = await postJson<SaveResponse>(
      "/api/runs",
      runPayload({
        clientRunId: TEST_RUNS.owner,
        lat: point.lat,
        lng: point.lng,
        startedAt: new Date(ownerEndedAt.getTime() - 10 * 60_000),
        endedAt: ownerEndedAt,
      }),
      ownerCredential,
    );
    assert.equal(ownerResponse.status, 201);
    assert.equal(ownerResponse.body.newHexes, 1);
    assert.equal(ownerResponse.body.stolenHexes, 0);

    const [beforeSteal] = await db
      .select({
        ownerId: hexrunnerHexOwnershipTable.ownerId,
        claimedAt: hexrunnerHexOwnershipTable.claimedAt,
      })
      .from(hexrunnerHexOwnershipTable)
      .where(eq(hexrunnerHexOwnershipTable.h3Index, point.h3Index));
    assert.equal(beforeSteal?.ownerId, TEST_USERS.owner);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const thiefResponse = await postJson<SaveResponse>(
      "/api/runs",
      runPayload({
        clientRunId: TEST_RUNS.thief,
        lat: point.lat,
        lng: point.lng,
        startedAt: new Date(thiefEndedAt.getTime() - 10 * 60_000),
        endedAt: thiefEndedAt,
      }),
      thiefCredential,
    );
    assert.equal(thiefResponse.status, 201);
    assert.equal(thiefResponse.body.newHexes, 0);
    assert.equal(thiefResponse.body.stolenHexes, 1);

    const [afterSteal] = await db
      .select({
        ownerId: hexrunnerHexOwnershipTable.ownerId,
        lastRunId: hexrunnerHexOwnershipTable.lastRunId,
        claimedAt: hexrunnerHexOwnershipTable.claimedAt,
      })
      .from(hexrunnerHexOwnershipTable)
      .where(eq(hexrunnerHexOwnershipTable.h3Index, point.h3Index));
    assert.deepEqual(
      {
        ownerId: afterSteal?.ownerId,
        lastRunId: afterSteal?.lastRunId,
      },
      {
        ownerId: TEST_USERS.thief,
        lastRunId: TEST_RUNS.thief,
      },
    );
    assert.ok(
      beforeSteal &&
        afterSteal &&
        afterSteal.claimedAt.getTime() > beforeSteal.claimedAt.getTime(),
      "Stealing a hex must refresh its claimedAt timestamp.",
    );
  });

  test("cleanup cannot let consumed grants starve expired drafts", async () => {
    await db.insert(hexrunnerUsersTable).values({ id: TEST_USERS.cleanup });
    const expiredAt = new Date(Date.now() - 60_000);
    await db.insert(hexrunnerCivicUploadGrantsTable).values([
      ...Array.from({ length: 101 }, (_, index) => ({
        objectPath: `/civic-photos/${TEST_NAMESPACE}-consumed-${index}`,
        ownerId: TEST_USERS.cleanup,
        contentType: "image/png" as const,
        sizeBytes: 1,
        expiresAt: expiredAt,
        consumedAt: expiredAt,
      })),
      {
        objectPath: `/civic-photos/${TEST_NAMESPACE}-unconsumed`,
        ownerId: TEST_USERS.cleanup,
        contentType: "image/png" as const,
        sizeBytes: 1,
        expiresAt: expiredAt,
      },
    ]);

    await cleanupExpiredCivicData(async () => undefined);

    const [unconsumed] = await db
      .select({ objectPath: hexrunnerCivicUploadGrantsTable.objectPath })
      .from(hexrunnerCivicUploadGrantsTable)
      .where(
        eq(
          hexrunnerCivicUploadGrantsTable.objectPath,
          `/civic-photos/${TEST_NAMESPACE}-unconsumed`,
        ),
      );
    assert.equal(unconsumed, undefined);

    const afterFirstBatch = await db
      .select({
        stagingCleanedAt:
          hexrunnerCivicUploadGrantsTable.stagingCleanedAt,
      })
      .from(hexrunnerCivicUploadGrantsTable)
      .where(eq(hexrunnerCivicUploadGrantsTable.ownerId, TEST_USERS.cleanup));
    assert.equal(
      afterFirstBatch.filter((grant) => grant.stagingCleanedAt).length,
      100,
    );

    await cleanupExpiredCivicData(async () => undefined);
    const afterSecondBatch = await db
      .select({
        stagingCleanedAt:
          hexrunnerCivicUploadGrantsTable.stagingCleanedAt,
      })
      .from(hexrunnerCivicUploadGrantsTable)
      .where(eq(hexrunnerCivicUploadGrantsTable.ownerId, TEST_USERS.cleanup));
    assert.equal(
      afterSecondBatch.filter((grant) => grant.stagingCleanedAt).length,
      101,
    );
  });

  test("cleans every integration-test row", async () => {
    await cleanupTestData();

    const users = await db
      .select({ id: hexrunnerUsersTable.id })
      .from(hexrunnerUsersTable)
      .where(inArray(hexrunnerUsersTable.id, TEST_USER_IDS));
    const runs = await db
      .select({ id: hexrunnerRunsTable.id })
      .from(hexrunnerRunsTable)
      .where(inArray(hexrunnerRunsTable.id, TEST_RUN_IDS));
    assert.equal(users.length, 0);
    assert.equal(runs.length, 0);
  });
});