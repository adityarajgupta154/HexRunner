import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import {
  db,
  hexrunnerConnectionsTable,
  hexrunnerLivePresenceTable,
  hexrunnerPresenceTerminationsTable,
  hexrunnerUsersTable,
  pool,
} from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";
import app from "../app";

process.env.SESSION_SECRET ||= "hexrunner-live-presence-tests-only";

const namespace = randomUUID().replaceAll("-", "").slice(0, 12);
const users = Array.from({ length: 6 }, (_, index) => `presence_${namespace}_${index}`);
const secret = "b".repeat(64);
const origin = { lat: 37.7749, lng: -122.4194 };
let server: Server;
let baseUrl: string;
const credentials = new Map<string, string>();
const lastHeartbeatAt = new Map<string, number>();

type Result<T = unknown> = { status: number; body: T | null };

async function request<T>(
  method: string,
  path: string,
  credential?: string,
  body?: unknown,
): Promise<Result<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(credential ? { authorization: `Bearer ${credential}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json() as T,
  };
}

function credential(userId: string): string {
  const value = credentials.get(userId);
  assert.ok(value);
  return value;
}

async function heartbeat(
  userId: string,
  lat = origin.lat,
  lng = origin.lng,
  extra: Record<string, unknown> = {},
): Promise<Result> {
  const previous = lastHeartbeatAt.get(userId) ?? 0;
  const waitMs = Math.max(0, 275 - (Date.now() - previous));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const result = await request("POST", "/api/presence/heartbeat", credential(userId), {
    clientRunId: `run_${userId}`,
    lat,
    lng,
    accuracyMeters: 8,
    mocked: false,
    ...extra,
  });
  if (result.status === 200) lastHeartbeatAt.set(userId, Date.now());
  return result;
}

async function enroll(userId: string): Promise<void> {
  const result = await request<{ credential: string }>(
    "POST",
    "/api/anonymous-identities",
    undefined,
    { requestedUserId: userId, enrollmentSecret: secret },
  );
  assert.ok(result.status === 200 || result.status === 201);
  assert.ok(result.body);
  credentials.set(userId, result.body.credential);
}

async function cleanup(): Promise<void> {
  await db.delete(hexrunnerConnectionsTable).where(or(
    inArray(hexrunnerConnectionsTable.userLowId, users),
    inArray(hexrunnerConnectionsTable.userHighId, users),
  ));
  await db.delete(hexrunnerLivePresenceTable).where(
    inArray(hexrunnerLivePresenceTable.userId, users),
  );
  await db.delete(hexrunnerUsersTable).where(inArray(hexrunnerUsersTable.id, users));
}

describe("live presence and connections integration", { concurrency: false }, () => {
  before(async () => {
    await cleanup();
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;
    for (const userId of users) await enroll(userId);
  });

  after(async () => {
    await cleanup();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
    await pool.end();
  });

  test("requires authentication for heartbeat, end, and nearby", async () => {
    assert.equal((await request("POST", "/api/presence/heartbeat", undefined, {})).status, 401);
    assert.equal((await request("POST", "/api/presence/end")).status, 401);
    assert.equal((await request("GET", "/api/presence/nearby?radiusMeters=500")).status, 401);
  });

  test("derives ownership from auth and upserts one current row", async () => {
    const first = await heartbeat(users[0]!, origin.lat, origin.lng, { userId: users[1] });
    assert.equal(first.status, 200);
    await db.update(hexrunnerLivePresenceTable)
      .set({ updatedAt: new Date(Date.now() - 4_000) })
      .where(eq(hexrunnerLivePresenceTable.userId, users[0]!));
    const second = await heartbeat(users[0]!, origin.lat + 0.0001, origin.lng);
    assert.equal(second.status, 200);
    const rows = await db.select().from(hexrunnerLivePresenceTable)
      .where(eq(hexrunnerLivePresenceTable.userId, users[0]!));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.clientRunId, `run_${users[0]}`);
    assert.equal(rows[0]?.userId, users[0]);
  });

  test("rejects mocked and invalid heartbeat payloads", async () => {
    assert.equal((await heartbeat(users[0]!, origin.lat, origin.lng, { mocked: true })).status, 400);
    assert.equal((await heartbeat(users[0]!, 91, origin.lng)).status, 400);
    assert.equal((await heartbeat(users[0]!, origin.lat, origin.lng, { accuracyMeters: 251 })).status, 400);
    assert.equal((await heartbeat(users[0]!, origin.lat, origin.lng, { clientRunId: "bad run!" })).status, 400);
  });

  test("binds one live row to its run and rejects delayed old operations", async () => {
    const userId = users[5]!;
    const oldRun = "old_run";
    const newRun = "new_run";
    const body = (clientRunId: string, lat = origin.lat) => ({
      clientRunId, lat, lng: origin.lng, accuracyMeters: 8, mocked: false,
    });
    assert.equal((await request("POST", "/api/presence/heartbeat", credential(userId), body(oldRun))).status, 200);
    assert.equal((await request("POST", "/api/presence/heartbeat", credential(userId), body(newRun))).status, 409);
    assert.equal((await request("POST", "/api/presence/end", credential(userId), { clientRunId: oldRun })).status, 204);
    assert.equal((await request("POST", "/api/presence/heartbeat", credential(userId), body(newRun))).status, 200);
    assert.equal((await request("POST", "/api/presence/heartbeat", credential(userId), body(oldRun))).status, 409);
    assert.equal((await request("POST", "/api/presence/end", credential(userId), { clientRunId: oldRun })).status, 204);
    let rows = await db.select().from(hexrunnerLivePresenceTable).where(eq(hexrunnerLivePresenceTable.userId, userId));
    assert.equal(rows[0]?.clientRunId, newRun);

    await db.update(hexrunnerLivePresenceTable).set({
      updatedAt: new Date(Date.now() - 2_000),
      expiresAt: new Date(Date.now() - 1_000),
    }).where(eq(hexrunnerLivePresenceTable.userId, userId));
    // The old terminal marker survives a stale newer row and blocks resurrection.
    assert.equal((await request("POST", "/api/presence/heartbeat", credential(userId), body(oldRun))).status, 409);
    await db.update(hexrunnerPresenceTerminationsTable).set({
      endedAt: new Date(Date.now() - 2_000),
      expiresAt: new Date(Date.now() - 1_000),
    }).where(and(
      eq(hexrunnerPresenceTerminationsTable.userId, userId),
      eq(hexrunnerPresenceTerminationsTable.clientRunId, oldRun),
    ));
    assert.equal((await request("POST", "/api/presence/heartbeat", credential(userId), body(oldRun))).status, 200);
    rows = await db.select().from(hexrunnerLivePresenceTable).where(eq(hexrunnerLivePresenceTable.userId, userId));
    assert.equal(rows[0]?.clientRunId, oldRun);

    // Same-run bursts and relocation are constrained using only server times.
    assert.equal((await request("POST", "/api/presence/heartbeat", credential(userId), body(oldRun))).status, 429);
    await new Promise((resolve) => setTimeout(resolve, 3_050));
    assert.equal((await request("POST", "/api/presence/heartbeat", credential(userId), body(oldRun, origin.lat + 1))).status, 400);
    await request("POST", "/api/presence/end", credential(userId), { clientRunId: oldRun });

    const raceRun = "race_run";
    assert.equal((await request("POST", "/api/presence/heartbeat", credential(userId), body(raceRun))).status, 200);
    const [ended, delayedHeartbeat] = await Promise.all([
      request("POST", "/api/presence/end", credential(userId), { clientRunId: raceRun }),
      request("POST", "/api/presence/heartbeat", credential(userId), body(raceRun)),
    ]);
    assert.equal(ended.status, 204);
    assert.ok(delayedHeartbeat.status === 200 || delayedHeartbeat.status === 409 || delayedHeartbeat.status === 429);
    const afterRace = await db.select().from(hexrunnerLivePresenceTable)
      .where(eq(hexrunnerLivePresenceTable.userId, userId));
    assert.equal(afterRace.length, 0);
    assert.equal((await request("POST", "/api/presence/end", credential(userId), {
      clientRunId: raceRun,
    })).status, 204);
  });

  test("expires stale rows and excludes self and out-of-radius runners", async () => {
    await heartbeat(users[0]!);
    await heartbeat(users[1]!, origin.lat + 0.0004);
    await heartbeat(users[2]!, origin.lat + 0.02);
    await db.update(hexrunnerLivePresenceTable)
      .set({
        updatedAt: new Date(Date.now() - 2_000),
        expiresAt: new Date(Date.now() - 1_000),
      })
      .where(eq(hexrunnerLivePresenceTable.userId, users[1]!));
    const result = await request<{ runners: unknown[]; ambientCount: number }>(
      "GET", "/api/presence/nearby?radiusMeters=500", credential(users[0]!),
    );
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { runners: [], ambientCount: 0 });
    const stale = await db.select().from(hexrunnerLivePresenceTable)
      .where(eq(hexrunnerLivePresenceTable.userId, users[1]!));
    assert.equal(stale.length, 0);
  });

  test("finds a max-radius runner across an H3 cell boundary", async () => {
    await request("POST", "/api/presence/end", credential(users[2]!), {
      clientRunId: `run_${users[2]}`,
    });
    await heartbeat(users[3]!, origin.lat + 0.0445, origin.lng + 0.0007);
    const result = await request<{ runners: Array<Record<string, unknown>> }>(
      "GET", "/api/presence/nearby?radiusMeters=5000&limit=100", credential(users[0]!),
    );
    assert.equal(result.status, 200);
    assert.ok(result.body?.runners.some((runner) => runner.visibility === "anonymous"));
    await request("POST", "/api/presence/end", credential(users[3]!), {
      clientRunId: `run_${users[3]}`,
    });
  });

  test("bounds query inputs and response limit", async () => {
    // Earlier lifecycle tests intentionally terminated fixtures; reset only
    // their short-lived test tombstones before reusing the fixture run IDs.
    await db.delete(hexrunnerPresenceTerminationsTable).where(
      inArray(hexrunnerPresenceTerminationsTable.userId, users.slice(1, 5)),
    );
    await heartbeat(users[0]!);
    await Promise.all(users.slice(1, 5).map((userId, index) =>
      heartbeat(userId, origin.lat + (index + 1) * 0.0001),
    ));
    assert.equal((await request("GET", "/api/presence/nearby?radiusMeters=5001", credential(users[0]!))).status, 400);
    assert.equal((await request("GET", "/api/presence/nearby?radiusMeters=500&limit=101", credential(users[0]!))).status, 400);
    const limited = await request<{ runners: unknown[]; ambientCount: number }>(
      "GET", "/api/presence/nearby?radiusMeters=500&limit=2", credential(users[0]!),
    );
    assert.equal(limited.status, 200);
    assert.equal(limited.body?.runners.length, 2);
    assert.equal(limited.body?.ambientCount, 4);
    await Promise.all(users.slice(2, 5).map((userId) =>
      request("POST", "/api/presence/end", credential(userId), { clientRunId: `run_${userId}` }),
    ));
  });

  test("returns strangers anonymously without identity or exact-location source fields", async () => {
    await heartbeat(users[0]!);
    await heartbeat(users[1]!, origin.lat + 0.0001);
    const result = await request<{ runners: Array<Record<string, unknown>>; ambientCount: number }>(
      "GET", "/api/presence/nearby?radiusMeters=500", credential(users[0]!),
    );
    assert.equal(result.status, 200);
    assert.equal(result.body?.ambientCount, 1);
    const runner = result.body?.runners[0];
    assert.equal(runner?.visibility, "anonymous");
    assert.ok(Number(runner?.distanceBandMeters) >= 250);
    assert.deepEqual(Object.keys(runner ?? {}).sort(), [
      "distanceBandMeters", "lat", "lng", "visibility",
    ]);
    for (const forbidden of ["userId", "uid", "displayName", "clientRunId", "distanceMeters", "latitude", "longitude"]) {
      assert.equal(forbidden in (runner ?? {}), false);
    }
  });

  test("supports reject, accepted exact visibility, and anonymous downgrade on remove", async () => {
    assert.equal((await request("POST", `/api/connections/${users[0]}/request`, credential(users[0]!))).status, 400);
    assert.equal((await request("POST", `/api/connections/missing_${namespace}/request`, credential(users[0]!))).status, 400);
    assert.equal((await request("POST", `/api/connections/${users[1]}/request`, credential(users[0]!))).status, 200);
    assert.equal((await request("POST", `/api/connections/${users[0]}/reject`, credential(users[1]!))).status, 204);
    assert.equal((await request("POST", `/api/connections/${users[0]}/accept`, credential(users[1]!))).status, 400);

    assert.equal((await request("POST", `/api/connections/${users[1]}/request`, credential(users[0]!))).status, 200);
    assert.equal((await request("POST", `/api/connections/${users[0]}/accept`, credential(users[1]!))).status, 200);
    const exact = await request<{ runners: Array<Record<string, unknown>> }>(
      "GET", "/api/presence/nearby?radiusMeters=500", credential(users[0]!),
    );
    assert.equal(exact.body?.runners[0]?.visibility, "exact");
    assert.equal(exact.body?.runners[0]?.userId, users[1]);
    assert.equal(typeof exact.body?.runners[0]?.displayName, "string");
    assert.equal(exact.body?.runners[0]?.lat, origin.lat + 0.0001);

    assert.equal((await request("DELETE", `/api/connections/${users[1]}`, credential(users[0]!))).status, 204);
    const downgraded = await request<{ runners: Array<Record<string, unknown>> }>(
      "GET", "/api/presence/nearby?radiusMeters=500", credential(users[0]!),
    );
    assert.equal(downgraded.body?.runners[0]?.visibility, "anonymous");
    assert.equal("userId" in (downgraded.body?.runners[0] ?? {}), false);
  });

  test("block immediately excludes both parties and ambient counts", async () => {
    assert.equal((await request("POST", `/api/connections/${users[1]}/request`, credential(users[0]!))).status, 200);
    assert.equal((await request("POST", `/api/connections/${users[0]}/accept`, credential(users[1]!))).status, 200);
    assert.equal((await request("POST", `/api/connections/${users[1]}/block`, credential(users[0]!))).status, 200);
    for (const viewer of [users[0]!, users[1]!]) {
      const result = await request<{ runners: unknown[]; ambientCount: number }>(
        "GET", "/api/presence/nearby?radiusMeters=500", credential(viewer),
      );
      assert.deepEqual(result.body, { runners: [], ambientCount: 0 });
    }
    // The blocked party cannot remove somebody else's block.
    assert.equal((await request("DELETE", `/api/connections/${users[0]}`, credential(users[1]!))).status, 204);
    const stillBlocked = await request<{ ambientCount: number }>(
      "GET", "/api/presence/nearby?radiusMeters=500", credential(users[1]!),
    );
    assert.equal(stillBlocked.body?.ambientCount, 0);
  });

  test("end deletes only the authenticated caller's row", async () => {
    await heartbeat(users[0]!);
    await heartbeat(users[1]!);
    assert.equal((await request("POST", "/api/presence/end", credential(users[0]!), {
      userId: users[1], clientRunId: `run_${users[0]}`,
    })).status, 204);
    const rows = await db.select({ userId: hexrunnerLivePresenceTable.userId })
      .from(hexrunnerLivePresenceTable).where(inArray(hexrunnerLivePresenceTable.userId, [users[0]!, users[1]!]));
    assert.deepEqual(rows, [{ userId: users[1] }]);
  });

  test("cleans every fixture", async () => {
    await cleanup();
    assert.equal((await db.select().from(hexrunnerUsersTable).where(inArray(hexrunnerUsersTable.id, users))).length, 0);
  });
});