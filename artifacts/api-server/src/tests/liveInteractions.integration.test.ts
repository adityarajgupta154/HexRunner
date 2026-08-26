import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import {
  db,
  hexrunnerConnectionsTable,
  hexrunnerContestEventsTable,
  hexrunnerContestOccupancyTable,
  hexrunnerDiscoveryAnchorsTable,
  hexrunnerHexOwnershipTable,
  hexrunnerInteractionGrantsTable,
  hexrunnerLivePresenceTable,
  hexrunnerRunsTable,
  hexrunnerUsersTable,
  hexrunnerWavesTable,
  pool,
} from "@workspace/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { latLngToCell } from "h3-js";
import app from "../app";
import { cleanupExpiredInteractions } from "../lib/interactionCleanup";
import {
  hashEnrollmentSecret,
  issueAnonymousCredential,
} from "../lib/anonymousCredential";

process.env.SESSION_SECRET ||= "hexrunner-live-interaction-tests-only";

const namespace = randomUUID().replaceAll("-", "").slice(0, 12);
const users = Array.from(
  { length: 30 },
  (_, index) => `interact_${namespace}_${index}`,
);
const secret = "d".repeat(64);
const origin = { lat: 37.7749, lng: -122.4194 };
const h3Index = latLngToCell(origin.lat, origin.lng, 9);
const credentials = new Map<string, string>();
let server: Server;
let baseUrl: string;

type Result<T = unknown> = { status: number; body: T | null };

async function request<T>(
  method: string,
  path: string,
  userId?: string,
  body?: unknown,
): Promise<Result<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(userId
        ? { authorization: `Bearer ${credentials.get(userId)}` }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : (await response.json()) as T,
  };
}

async function enroll(userId: string): Promise<void> {
  await db
    .insert(hexrunnerUsersTable)
    .values({
      id: userId,
      enrollmentSecretHash: hashEnrollmentSecret(secret),
    })
    .onConflictDoNothing();
  credentials.set(userId, issueAnonymousCredential(userId));
}

async function setPresence(
  userId: string,
  latitude = origin.lat,
  longitude = origin.lng,
  cell = latLngToCell(latitude, longitude, 9),
): Promise<void> {
  const now = new Date();
  await db
    .insert(hexrunnerLivePresenceTable)
    .values({
      userId,
      clientRunId: `run_${userId}`,
      latitude,
      longitude,
      accuracyMeters: 5,
      h3Index: cell,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 30_000),
    })
    .onConflictDoUpdate({
      target: hexrunnerLivePresenceTable.userId,
      set: {
        clientRunId: `run_${userId}`,
        latitude,
        longitude,
        accuracyMeters: 5,
        h3Index: cell,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 30_000),
      },
    });
}

async function setAnchor(userId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(hexrunnerDiscoveryAnchorsTable)
    .values({
      userId,
      clientSessionId: `session_${userId}`,
      latitude: origin.lat,
      longitude: origin.lng,
      accuracyMeters: 5,
      h3Index,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 30_000),
    })
    .onConflictDoUpdate({
      target: hexrunnerDiscoveryAnchorsTable.userId,
      set: {
        clientSessionId: `session_${userId}`,
        latitude: origin.lat,
        longitude: origin.lng,
        accuracyMeters: 5,
        h3Index,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 30_000),
      },
    });
}

async function grantWave(viewerId: string, targetId: string, token: string) {
  const now = new Date();
  await db.insert(hexrunnerInteractionGrantsTable).values({
    viewerId,
    targetId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30_000),
  });
}

async function clearEphemeral(): Promise<void> {
  await db.delete(hexrunnerContestEventsTable).where(
    or(
      inArray(hexrunnerContestEventsTable.ownerId, users),
      inArray(hexrunnerContestEventsTable.actorId, users),
    ),
  );
  await db.delete(hexrunnerContestOccupancyTable).where(
    or(
      inArray(hexrunnerContestOccupancyTable.ownerId, users),
      inArray(hexrunnerContestOccupancyTable.actorId, users),
    ),
  );
  await db.delete(hexrunnerWavesTable).where(
    or(
      inArray(hexrunnerWavesTable.senderId, users),
      inArray(hexrunnerWavesTable.recipientId, users),
    ),
  );
  await db.delete(hexrunnerInteractionGrantsTable).where(
    or(
      inArray(hexrunnerInteractionGrantsTable.viewerId, users),
      inArray(hexrunnerInteractionGrantsTable.targetId, users),
    ),
  );
  await db.delete(hexrunnerConnectionsTable).where(
    or(
      inArray(hexrunnerConnectionsTable.userLowId, users),
      inArray(hexrunnerConnectionsTable.userHighId, users),
    ),
  );
  await db
    .delete(hexrunnerDiscoveryAnchorsTable)
    .where(inArray(hexrunnerDiscoveryAnchorsTable.userId, users));
  await db
    .delete(hexrunnerLivePresenceTable)
    .where(inArray(hexrunnerLivePresenceTable.userId, users));
}

async function cleanup(): Promise<void> {
  await clearEphemeral();
  await db
    .delete(hexrunnerHexOwnershipTable)
    .where(eq(hexrunnerHexOwnershipTable.h3Index, h3Index));
  await db
    .delete(hexrunnerRunsTable)
    .where(inArray(hexrunnerRunsTable.userId, users));
  await db.delete(hexrunnerUsersTable).where(inArray(hexrunnerUsersTable.id, users));
}

async function nearby(
  viewer: string,
  limit = 50,
  bypassIssuanceCadence = true,
) {
  if (bypassIssuanceCadence) {
    await db
      .update(hexrunnerInteractionGrantsTable)
      .set({ createdAt: new Date(Date.now() - 3_000) })
      .where(eq(hexrunnerInteractionGrantsTable.viewerId, viewer));
  }
  return request<{
    runners: Array<Record<string, unknown>>;
    ambientCount: number;
  }>(
    "GET",
    `/api/presence/nearby?radiusMeters=2000&limit=${limit}`,
    viewer,
  );
}

describe("live interactions integration", { concurrency: false }, () => {
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
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await pool.end();
  });

  test("requires authentication and active polling presence", async () => {
    assert.equal((await request("POST", "/api/waves", undefined, {})).status, 401);
    assert.equal((await request("GET", "/api/live-interactions")).status, 401);
    assert.equal(
      (
        await request("POST", "/api/live-interactions/ack", undefined, {
          contestEventIds: [],
          waveIds: [],
        })
      ).status,
      401,
    );
    assert.equal(
      (await request("GET", "/api/live-interactions", users[0])).status,
      400,
    );
  });

  test("issues opaque grants only for returned privacy-filtered markers", async () => {
    await clearEphemeral();
    await Promise.all([
      setPresence(users[0]!),
      setPresence(users[1]!, origin.lat + 0.0001),
      setPresence(users[2]!, origin.lat + 0.0002),
    ]);
    const result = await nearby(users[0]!, 1);
    assert.equal(result.status, 200);
    assert.equal(result.body?.runners.length, 1);
    const marker = result.body?.runners[0] ?? {};
    assert.equal(marker.visibility, "anonymous");
    assert.equal(marker.waveAvailable, true);
    assert.equal(typeof marker.interactionToken, "string");
    assert.equal("userId" in marker, false);
    const refreshed = await nearby(users[0]!, 1);
    const refreshedMarker = refreshed.body?.runners[0] ?? {};
    assert.notEqual(
      refreshedMarker.interactionToken,
      marker.interactionToken,
    );
    const grants = await db
      .select()
      .from(hexrunnerInteractionGrantsTable)
      .where(eq(hexrunnerInteractionGrantsTable.viewerId, users[0]!));
    assert.equal(grants.length, 2);
    assert.equal(grants[0]?.tokenHash.length, 64);
    assert.notEqual(grants[0]?.tokenHash, marker.interactionToken);
    assert.equal(
      (
        await request("POST", "/api/waves", users[0], {
          interactionToken: marker.interactionToken,
          idempotencyKey: "overlap-token",
        })
      ).status,
      201,
      "a refresh does not invalidate a marker action already open",
    );
    const hammer = await Promise.all(
      Array.from({ length: 8 }, () => nearby(users[0]!, 1, false)),
    );
    assert.equal(
      hammer.every((result) => result.status === 429),
      true,
      "concurrent refreshes are serialized and issuance-rate limited",
    );
    assert.equal(
      (
        await db
          .select()
          .from(hexrunnerInteractionGrantsTable)
          .where(eq(hexrunnerInteractionGrantsTable.viewerId, users[0]!))
      ).length,
      2,
      "hammer requests cannot amplify active grant rows",
    );
  });

  test("sends, replays, acknowledges, and expires one-way waves", async () => {
    await clearEphemeral();
    await Promise.all([setPresence(users[0]!), setPresence(users[1]!)]);
    const discovery = await nearby(users[0]!);
    const token = String(discovery.body?.runners[0]?.interactionToken);
    assert.equal(
      (
        await request("POST", "/api/waves", users[0], {
          interactionToken: "fake_token_that_is_long_enough",
          idempotencyKey: "fake",
        })
      ).status,
      403,
    );
    const first = await request<{ waveId: string; expiresAt: string }>(
      "POST",
      "/api/waves",
      users[0],
      { interactionToken: token, idempotencyKey: "one" },
    );
    assert.equal(first.status, 201);
    assert.ok(first.body);
    const replay = await request<{ waveId: string }>(
      "POST",
      "/api/waves",
      users[0],
      { interactionToken: token, idempotencyKey: "one" },
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.body?.waveId, first.body.waveId);
    const inbox = await request<{ events: Array<Record<string, unknown>> }>(
      "GET",
      "/api/live-interactions",
      users[1],
    );
    assert.equal(inbox.body?.events[0]?.copy, "A nearby runner waved");
    assert.equal("displayName" in (inbox.body?.events[0] ?? {}), false);
    assert.equal(
      (
        await request("POST", "/api/live-interactions/ack", users[0], {
          contestEventIds: [],
          waveIds: [first.body.waveId],
        })
      ).status,
      204,
    );
    assert.equal(
      (
        await request("POST", "/api/live-interactions/ack", users[1], {
          contestEventIds: [],
          waveIds: [first.body.waveId],
        })
      ).status,
      204,
    );
    const empty = await request<{ events: unknown[] }>(
      "GET",
      "/api/live-interactions",
      users[1],
    );
    assert.equal(empty.body?.events.length, 0);
    await db
      .update(hexrunnerWavesTable)
      .set({
        acknowledgedAt: null,
        createdAt: new Date(Date.now() - 2_000),
        expiresAt: new Date(Date.now() - 1_000),
      })
      .where(eq(hexrunnerWavesTable.id, first.body.waveId));
    const expired = await request<{ events: unknown[] }>(
      "GET",
      "/api/live-interactions",
      users[1],
    );
    assert.equal(expired.body?.events.length, 0);
  });

  test("serializes duplicate sends and enforces pair throttling", async () => {
    await clearEphemeral();
    await Promise.all([setPresence(users[0]!), setPresence(users[1]!)]);
    const token = String((await nearby(users[0]!)).body?.runners[0]?.interactionToken);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request("POST", "/api/waves", users[0], {
          interactionToken: token,
          idempotencyKey: "concurrent",
        }),
      ),
    );
    assert.equal(results.filter((result) => result.status === 201).length, 1);
    assert.equal(results.filter((result) => result.status === 200).length, 4);
    const rows = await db
      .select()
      .from(hexrunnerWavesTable)
      .where(eq(hexrunnerWavesTable.senderId, users[0]!));
    assert.equal(rows.length, 1);
    assert.equal(
      (
        await request("POST", "/api/waves", users[0], {
          interactionToken: token,
          idempotencyKey: "pair-limit",
        })
      ).status,
      429,
    );
  });

  test("enforces sender and recipient minute limits under concurrency", async () => {
    await clearEphemeral();
    const sender = users[0]!;
    const senderRecipients = users.slice(1, 7);
    await Promise.all([
      setPresence(sender),
      ...senderRecipients.map((recipient) => setPresence(recipient)),
    ]);
    const senderTokens = senderRecipients.map(
      (_, index) => `sender_limit_token_${namespace}_${index}`,
    );
    await Promise.all(
      senderRecipients.map((recipient, index) =>
        grantWave(sender, recipient, senderTokens[index]!),
      ),
    );
    const senderResults = await Promise.all(
      senderTokens.map((interactionToken, index) =>
        request("POST", "/api/waves", sender, {
          interactionToken,
          idempotencyKey: `sender-limit-${index}`,
        }),
      ),
    );
    assert.equal(senderResults.filter(({ status }) => status === 201).length, 5);
    assert.equal(senderResults.filter(({ status }) => status === 429).length, 1);

    await clearEphemeral();
    const recipient = users[0]!;
    const recipientSenders = users.slice(1, 22);
    await Promise.all([
      setPresence(recipient),
      ...recipientSenders.map((currentSender) => setPresence(currentSender)),
    ]);
    const recipientTokens = recipientSenders.map(
      (_, index) => `recipient_limit_token_${namespace}_${index}`,
    );
    await Promise.all(
      recipientSenders.map((currentSender, index) =>
        grantWave(currentSender, recipient, recipientTokens[index]!),
      ),
    );
    const recipientResults = await Promise.all(
      recipientSenders.map((currentSender, index) =>
        request("POST", "/api/waves", currentSender, {
          interactionToken: recipientTokens[index]!,
          idempotencyKey: `recipient-limit-${index}`,
        }),
      ),
    );
    assert.equal(
      recipientResults.filter(({ status }) => status === 201).length,
      20,
    );
    assert.equal(
      recipientResults.filter(({ status }) => status === 429).length,
      1,
    );
  });

  test("rejects moved, expired, inactive, and blocked wave attempts generically", async () => {
    await clearEphemeral();
    await Promise.all([setPresence(users[0]!), setPresence(users[1]!)]);
    let token = String((await nearby(users[0]!)).body?.runners[0]?.interactionToken);
    await db
      .update(hexrunnerInteractionGrantsTable)
      .set({
        createdAt: new Date(Date.now() - 1_000),
        expiresAt: new Date(Date.now() - 1),
      })
      .where(eq(hexrunnerInteractionGrantsTable.viewerId, users[0]!));
    assert.equal(
      (
        await request("POST", "/api/waves", users[0], {
          interactionToken: token,
          idempotencyKey: "expired",
        })
      ).status,
      403,
    );
    token = String((await nearby(users[0]!)).body?.runners[0]?.interactionToken);
    await setPresence(users[1]!, origin.lat + 0.03);
    assert.equal(
      (
        await request("POST", "/api/waves", users[0], {
          interactionToken: token,
          idempotencyKey: "moved",
        })
      ).status,
      403,
    );
    await setPresence(users[1]!);
    token = String((await nearby(users[0]!)).body?.runners[0]?.interactionToken);
    const low = users[0]! < users[1]! ? users[0]! : users[1]!;
    const high = users[0]! < users[1]! ? users[1]! : users[0]!;
    await db.insert(hexrunnerConnectionsTable).values({
      userLowId: low,
      userHighId: high,
      status: "blocked",
      requestedById: users[1]!,
      blockedById: users[1]!,
      updatedAt: new Date(),
    });
    assert.equal(
      (
        await request("POST", "/api/waves", users[0], {
          interactionToken: token,
          idempotencyKey: "blocked",
        })
      ).status,
      403,
    );
  });

  test("removes expired interaction rows without an interaction request", async () => {
    await clearEphemeral();
    const now = new Date();
    const createdAt = new Date(now.getTime() - 10 * 60_000);
    const expiresAt = new Date(now.getTime() - 6 * 60_000);
    await Promise.all([setPresence(users[0]!), setPresence(users[1]!)]);
    await db.insert(hexrunnerInteractionGrantsTable).values({
      viewerId: users[0]!,
      targetId: users[1]!,
      tokenHash: "a".repeat(64),
      createdAt,
      expiresAt,
    });
    await db.insert(hexrunnerContestOccupancyTable).values({
      ownerId: users[0]!,
      actorId: users[1]!,
      h3Index,
      ownershipRunId: "cleanup_run_0001",
      lastSeenAt: createdAt,
      expiresAt,
    });
    await db.insert(hexrunnerContestEventsTable).values({
      id: randomUUID(),
      ownerId: users[0]!,
      actorId: users[1]!,
      h3Index,
      createdAt,
      expiresAt,
    });
    await db.insert(hexrunnerWavesTable).values({
      id: randomUUID(),
      senderId: users[0]!,
      recipientId: users[1]!,
      idempotencyKey: "expired-cleanup",
      createdAt,
      expiresAt,
    });

    assert.equal(await cleanupExpiredInteractions(now), true);
    const remainingExpiredGrant = await db
      .select({
        tokenHash: hexrunnerInteractionGrantsTable.tokenHash,
        expiresAt: hexrunnerInteractionGrantsTable.expiresAt,
      })
      .from(hexrunnerInteractionGrantsTable)
      .where(
        and(
          eq(hexrunnerInteractionGrantsTable.viewerId, users[0]!),
          eq(hexrunnerInteractionGrantsTable.tokenHash, "a".repeat(64)),
        ),
      );
    assert.equal(
      remainingExpiredGrant.length,
      0,
      `expired grant survived cleanup: ${JSON.stringify(remainingExpiredGrant)}`,
    );
    assert.equal(
      (
        await db
          .select()
          .from(hexrunnerContestOccupancyTable)
          .where(
            or(
              inArray(hexrunnerContestOccupancyTable.ownerId, users),
              inArray(hexrunnerContestOccupancyTable.actorId, users),
            ),
          )
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(hexrunnerContestEventsTable)
          .where(
            or(
              inArray(hexrunnerContestEventsTable.ownerId, users),
              inArray(hexrunnerContestEventsTable.actorId, users),
            ),
          )
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(hexrunnerWavesTable)
          .where(
            or(
              inArray(hexrunnerWavesTable.senderId, users),
              inArray(hexrunnerWavesTable.recipientId, users),
            ),
          )
      ).length,
      0,
    );
  });

  test("creates one authoritative contest entry and applies naming and block at read time", async () => {
    await clearEphemeral();
    await Promise.all([setAnchor(users[0]!), setPresence(users[1]!)]);
    const now = new Date();
    await db.insert(hexrunnerRunsTable).values({
      id: `ownership_${namespace}`,
      userId: users[0]!,
      startedAt: new Date(now.getTime() - 60_000),
      endedAt: now,
      elapsedSeconds: 60,
      distanceKm: 1,
      pointCount: 0,
      hexCount: 1,
      claimedHexes: [h3Index],
    });
    await db.insert(hexrunnerHexOwnershipTable).values({
      h3Index,
      ownerId: users[0]!,
      lastRunId: `ownership_${namespace}`,
      claimedAt: now,
    });
    const [first, concurrent] = await Promise.all([
      request<{ events: Array<Record<string, unknown>> }>(
        "GET",
        "/api/live-interactions",
        users[0],
      ),
      request<{ events: Array<Record<string, unknown>> }>(
        "GET",
        "/api/live-interactions",
        users[0],
      ),
    ]);
    assert.equal(first.status, 200);
    assert.equal(concurrent.status, 200);
    const rows = await db.select().from(hexrunnerContestEventsTable);
    assert.equal(rows.length, 1);
    assert.equal(first.body?.events[0]?.copy, "A nearby runner entered your territory");
    const occupancy = await db.select().from(hexrunnerContestOccupancyTable);
    assert.equal(occupancy.length, 1);
    await request("GET", "/api/live-interactions", users[0]);
    assert.equal((await db.select().from(hexrunnerContestEventsTable)).length, 1);

    const low = users[0]! < users[1]! ? users[0]! : users[1]!;
    const high = users[0]! < users[1]! ? users[1]! : users[0]!;
    await db.insert(hexrunnerConnectionsTable).values({
      userLowId: low,
      userHighId: high,
      status: "accepted",
      requestedById: users[0]!,
      updatedAt: now,
    });
    await db
      .update(hexrunnerUsersTable)
      .set({ displayName: "Fast Friend" })
      .where(eq(hexrunnerUsersTable.id, users[1]!));
    const named = await request<{ events: Array<Record<string, unknown>> }>(
      "GET",
      "/api/live-interactions",
      users[0],
    );
    assert.equal(named.body?.events[0]?.displayName, "Fast Friend");
    await db
      .update(hexrunnerConnectionsTable)
      .set({
        status: "blocked",
        blockedById: users[1]!,
        requestedById: users[1]!,
      })
      .where(eq(hexrunnerConnectionsTable.userLowId, low));
    const hidden = await request<{ events: unknown[] }>(
      "GET",
      "/api/live-interactions",
      users[0],
    );
    assert.equal(hidden.body?.events.length, 0);
  });

  test("dedupes stationary and timed re-entry while allowing a new owner", async () => {
    await clearEphemeral();
    await Promise.all([
      setPresence(users[0]!),
      setPresence(users[1]!),
    ]);
    const first = await request<{ events: unknown[] }>(
      "GET",
      "/api/live-interactions",
      users[0],
    );
    assert.equal(first.status, 200);
    assert.equal((await db.select().from(hexrunnerContestEventsTable)).length, 1);

    await Promise.all([
      setPresence(users[0]!),
      setPresence(users[1]!),
      request("GET", "/api/live-interactions", users[0]),
    ]);
    assert.equal((await db.select().from(hexrunnerContestEventsTable)).length, 1);

    await db
      .delete(hexrunnerLivePresenceTable)
      .where(eq(hexrunnerLivePresenceTable.userId, users[1]!));
    await request("GET", "/api/live-interactions", users[0]);
    await setPresence(users[1]!);
    await request("GET", "/api/live-interactions", users[0]);
    assert.equal((await db.select().from(hexrunnerContestEventsTable)).length, 1);

    const overMinuteAgo = new Date(Date.now() - 61_000);
    await db
      .update(hexrunnerContestOccupancyTable)
      .set({
        lastSeenAt: new Date(overMinuteAgo.getTime() - 1_000),
        expiresAt: overMinuteAgo,
      });
    await db
      .update(hexrunnerContestEventsTable)
      .set({
        createdAt: new Date(overMinuteAgo.getTime() - 1_000),
        expiresAt: overMinuteAgo,
      });
    await request("GET", "/api/live-interactions", users[0]);
    assert.equal((await db.select().from(hexrunnerContestEventsTable)).length, 1);

    await db
      .delete(hexrunnerContestEventsTable)
      .where(eq(hexrunnerContestEventsTable.ownerId, users[0]!));
    await db
      .delete(hexrunnerContestOccupancyTable)
      .where(eq(hexrunnerContestOccupancyTable.ownerId, users[0]!));
    await setPresence(users[2]!);
    const transferRunId = `ownership_transfer_${namespace}`;
    const now = new Date();
    await db.insert(hexrunnerRunsTable).values({
      id: transferRunId,
      userId: users[2]!,
      startedAt: new Date(now.getTime() - 60_000),
      endedAt: now,
      elapsedSeconds: 60,
      distanceKm: 1,
      pointCount: 0,
      hexCount: 1,
      claimedHexes: [h3Index],
    });
    let losingOwnerPoll!: Promise<Result<{ events: unknown[] }>>;
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${h3Index}, 0))`,
      );
      await tx
        .update(hexrunnerHexOwnershipTable)
        .set({
          ownerId: users[2]!,
          lastRunId: transferRunId,
          claimedAt: now,
        })
        .where(eq(hexrunnerHexOwnershipTable.h3Index, h3Index));
      losingOwnerPoll = request(
        "GET",
        "/api/live-interactions",
        users[0],
      );
    });
    await losingOwnerPoll;
    assert.equal(
      (
        await db
          .select()
          .from(hexrunnerContestEventsTable)
          .where(eq(hexrunnerContestEventsTable.ownerId, users[0]!))
      ).length,
      0,
    );
    await db
      .delete(hexrunnerLivePresenceTable)
      .where(eq(hexrunnerLivePresenceTable.userId, users[0]!));
    const newOwner = await request<{ events: unknown[] }>(
      "GET",
      "/api/live-interactions",
      users[2],
    );
    assert.equal(newOwner.status, 200);
    assert.equal(
      (
        await db
          .select()
          .from(hexrunnerContestEventsTable)
          .where(eq(hexrunnerContestEventsTable.ownerId, users[2]!))
      ).length,
      1,
    );

    const returnRunId = `ownership_return_${namespace}`;
    const secondReturnRunId = `ownership_return_again_${namespace}`;
    await db.insert(hexrunnerRunsTable).values([
      {
        id: returnRunId,
        userId: users[2]!,
        startedAt: new Date(now.getTime() - 45_000),
        endedAt: new Date(now.getTime() + 1_000),
        elapsedSeconds: 46,
        distanceKm: 1,
        pointCount: 0,
        hexCount: 1,
        claimedHexes: [h3Index],
      },
      {
        id: secondReturnRunId,
        userId: users[2]!,
        startedAt: new Date(now.getTime() - 30_000),
        endedAt: new Date(now.getTime() + 2_000),
        elapsedSeconds: 32,
        distanceKm: 1,
        pointCount: 0,
        hexCount: 1,
        claimedHexes: [h3Index],
      },
    ]);
    const transfer = async (ownerId: string, runId: string) => {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${h3Index}, 0))`,
        );
        await tx
          .update(hexrunnerHexOwnershipTable)
          .set({ ownerId, lastRunId: runId, claimedAt: new Date() })
          .where(eq(hexrunnerHexOwnershipTable.h3Index, h3Index));
      });
    };
    await transfer(users[0]!, `ownership_${namespace}`);
    await transfer(users[2]!, returnRunId);
    await request("GET", "/api/live-interactions", users[2]);
    assert.equal(
      (
        await db
          .select()
          .from(hexrunnerContestEventsTable)
          .where(eq(hexrunnerContestEventsTable.ownerId, users[2]!))
      ).length,
      1,
      "ownership churn remains subject to the 60-second alert dedupe",
    );
    assert.equal(
      (
        await db
          .select()
          .from(hexrunnerContestOccupancyTable)
          .where(eq(hexrunnerContestOccupancyTable.ownerId, users[2]!))
          .limit(1)
      )[0]?.ownershipRunId,
      returnRunId,
      "occupancy advances to the reacquired ownership generation",
    );

    const expired = new Date(Date.now() - 61_000);
    await db
      .update(hexrunnerContestEventsTable)
      .set({
        createdAt: new Date(expired.getTime() - 1_000),
        expiresAt: expired,
      })
      .where(eq(hexrunnerContestEventsTable.ownerId, users[2]!));
    await transfer(users[0]!, `ownership_${namespace}`);
    await transfer(users[2]!, secondReturnRunId);
    await request("GET", "/api/live-interactions", users[2]);
    assert.equal(
      (
        await db
          .select()
          .from(hexrunnerContestEventsTable)
          .where(eq(hexrunnerContestEventsTable.ownerId, users[2]!))
      ).length,
      1,
      "a reacquisition after the dedupe window creates a fresh contest",
    );
  });
});