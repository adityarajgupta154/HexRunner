import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import {
  db,
  hexrunnerHexOwnershipTable,
  hexrunnerRunPointsTable,
  hexrunnerRunsTable,
  hexrunnerUsersTable,
  pool,
} from "@workspace/db";
import { eq, inArray, or } from "drizzle-orm";
import { latLngToCell } from "h3-js";
import app from "../app";

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
};
const TEST_USER_IDS = Object.values(TEST_USERS);
const TEST_RUN_IDS = Object.values(TEST_RUNS);
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