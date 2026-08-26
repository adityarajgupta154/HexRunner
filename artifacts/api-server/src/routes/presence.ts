import {
  Router,
  type ErrorRequestHandler,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { createHash, randomBytes } from "node:crypto";
import {
  AcceptConnectionParams,
  AcceptConnectionResponse,
  BlockConnectionParams,
  BlockConnectionResponse,
  EndDiscoveryAnchorBody,
  UpdateDiscoveryAnchorBody,
  UpdateDiscoveryAnchorResponse,
  EndPresenceBody,
  GetNearbyPresenceQueryParams,
  GetNearbyPresenceResponse,
  HeartbeatPresenceBody,
  HeartbeatPresenceResponse,
  ListConnectionsResponse,
  RejectConnectionParams,
  RemoveConnectionParams,
  RequestConnectionParams,
  RequestConnectionResponse,
} from "@workspace/api-zod";
import {
  db,
  hexrunnerConnectionsTable,
  hexrunnerDiscoveryAnchorContinuityTable,
  hexrunnerDiscoveryAnchorTerminationsTable,
  hexrunnerDiscoveryAnchorsTable,
  hexrunnerLivePresenceTable,
  hexrunnerInteractionGrantsTable,
  hexrunnerPresenceTerminationsTable,
  hexrunnerUsersTable,
} from "@workspace/db";
import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import { verifyAnonymousCredential } from "../lib/anonymousCredential";

const router: IRouter = Router();
const PRESENCE_TTL_MS = 30_000;
const GRANT_ISSUANCE_MIN_INTERVAL_MS = 2_000;
const TERMINATION_TTL_MS = 60 * 60 * 1_000;
const PRESENCE_H3_RESOLUTION = 9;
const MIN_HEARTBEAT_INTERVAL_MS = 3_000;
const MAX_RUNNING_METERS_PER_SECOND = 15;
const RELOCATION_JITTER_METERS = 50;

function authenticatedUserId(req: { get(name: string): string | undefined }): string | null {
  const authorization = req.get("authorization");
  const credential = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  return credential ? verifyAnonymousCredential(credential) : null;
}

function pair(a: string, b: string): { low: string; high: string } {
  return a < b ? { low: a, high: b } : { low: b, high: a };
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const radians = Math.PI / 180;
  const dLat = (bLat - aLat) * radians;
  const dLng = (bLng - aLng) * radians;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * radians) * Math.cos(bLat * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function purgeExpiredPresence(now: Date): Promise<void> {
  await db.delete(hexrunnerLivePresenceTable).where(
    // expiry exactly now is not live either
    or(eq(hexrunnerLivePresenceTable.expiresAt, now), lt(hexrunnerLivePresenceTable.expiresAt, now)),
  );
}

async function purgeExpiredDiscoveryAnchors(now: Date): Promise<void> {
  await db.delete(hexrunnerDiscoveryAnchorsTable).where(
    or(eq(hexrunnerDiscoveryAnchorsTable.expiresAt, now), lt(hexrunnerDiscoveryAnchorsTable.expiresAt, now)),
  );
}

async function purgeExpiredDiscoveryAnchorSecurityRows(now: Date): Promise<void> {
  await db.delete(hexrunnerDiscoveryAnchorTerminationsTable).where(
    or(
      eq(hexrunnerDiscoveryAnchorTerminationsTable.expiresAt, now),
      lt(hexrunnerDiscoveryAnchorTerminationsTable.expiresAt, now),
    ),
  );
  await db.delete(hexrunnerDiscoveryAnchorContinuityTable).where(
    or(
      eq(hexrunnerDiscoveryAnchorContinuityTable.expiresAt, now),
      lt(hexrunnerDiscoveryAnchorContinuityTable.expiresAt, now),
    ),
  );
}

async function purgeExpiredTerminations(now: Date): Promise<void> {
  await db.delete(hexrunnerPresenceTerminationsTable).where(
    or(
      eq(hexrunnerPresenceTerminationsTable.expiresAt, now),
      lt(hexrunnerPresenceTerminationsTable.expiresAt, now),
    ),
  );
}

function requireUser(req: Request, res: Response): string | null {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "A valid device credential is required." });
    return null;
  }
  return userId;
}

router.post("/presence/heartbeat", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const parsed = HeartbeatPresenceBody.safeParse(req.body);
  if (!parsed.success || parsed.data.mocked) {
    res.status(400).json({ error: "Invalid live presence data." });
    return;
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PRESENCE_TTL_MS);
  const data = parsed.data;
  await purgeExpiredPresence(now);
  await purgeExpiredTerminations(now);
  const h3Index = latLngToCell(data.lat, data.lng, PRESENCE_H3_RESOLUTION);
  const result = await db.transaction(async (tx) => {
    // Serialize one runner's run lifecycle. This is DB-local and prevents two
    // concurrent clients from both deciding they own the one live row.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`hexrunner-presence:${userId}`}, 0))`);
    await tx.delete(hexrunnerPresenceTerminationsTable).where(and(
      eq(hexrunnerPresenceTerminationsTable.userId, userId),
      lt(hexrunnerPresenceTerminationsTable.expiresAt, now),
    ));
    const [termination] = await tx.select({ userId: hexrunnerPresenceTerminationsTable.userId })
      .from(hexrunnerPresenceTerminationsTable)
      .where(and(
        eq(hexrunnerPresenceTerminationsTable.userId, userId),
        eq(hexrunnerPresenceTerminationsTable.clientRunId, data.clientRunId),
        gt(hexrunnerPresenceTerminationsTable.expiresAt, now),
      )).limit(1);
    if (termination) return "terminated" as const;
    await tx.delete(hexrunnerLivePresenceTable).where(and(
      eq(hexrunnerLivePresenceTable.userId, userId),
      lt(hexrunnerLivePresenceTable.expiresAt, now),
    ));
    const [existing] = await tx.select().from(hexrunnerLivePresenceTable)
      .where(eq(hexrunnerLivePresenceTable.userId, userId)).limit(1);
    if (existing && existing.expiresAt > now) {
      if (existing.clientRunId !== data.clientRunId) return "conflict" as const;
      const elapsedMs = now.getTime() - existing.updatedAt.getTime();
      if (elapsedMs < MIN_HEARTBEAT_INTERVAL_MS) return "rate" as const;
      // Expo cannot hardware-attest the first fix. Once a run has a server
      // timestamp, continuity prevents it being repurposed to scan arbitrary areas.
      const permittedDistance =
        RELOCATION_JITTER_METERS +
        Math.max(existing.accuracyMeters, data.accuracyMeters) +
        (elapsedMs / 1_000) * MAX_RUNNING_METERS_PER_SECOND;
      if (haversineMeters(existing.latitude, existing.longitude, data.lat, data.lng) > permittedDistance) {
        return "relocation" as const;
      }
      const updated = await tx.update(hexrunnerLivePresenceTable).set({
        latitude: data.lat, longitude: data.lng, accuracyMeters: data.accuracyMeters,
        h3Index, updatedAt: now, expiresAt,
      }).where(and(eq(hexrunnerLivePresenceTable.userId, userId), eq(hexrunnerLivePresenceTable.clientRunId, data.clientRunId)))
        .returning({ userId: hexrunnerLivePresenceTable.userId });
      if (updated.length !== 1) throw new Error("Live presence update lost its lifecycle row.");
      return "updated" as const;
    }
    const created = await tx.insert(hexrunnerLivePresenceTable).values({
      userId, clientRunId: data.clientRunId, latitude: data.lat, longitude: data.lng,
      accuracyMeters: data.accuracyMeters, h3Index, updatedAt: now, expiresAt,
    }).onConflictDoNothing().returning({ userId: hexrunnerLivePresenceTable.userId });
    if (created.length !== 1) throw new Error("Live presence create lost its lifecycle row.");
    return "created" as const;
  });
  if (result === "conflict") {
    res.status(409).json({ error: "Another live run is active." });
    return;
  }
  if (result === "terminated") {
    res.status(409).json({ error: "This live run has ended." });
    return;
  }
  if (result === "rate") {
    res.status(429).json({ error: "Heartbeat frequency is too high." });
    return;
  }
  if (result === "relocation") {
    res.status(400).json({ error: "Invalid live presence data." });
    return;
  }
  res.json(HeartbeatPresenceResponse.parse({ expiresAt }));
});

router.post("/presence/end", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const parsed = EndPresenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid live presence end data." });
    return;
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TERMINATION_TTL_MS);
  await purgeExpiredTerminations(now);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`hexrunner-presence:${userId}`}, 0))`);
    await tx.delete(hexrunnerPresenceTerminationsTable).where(and(
      eq(hexrunnerPresenceTerminationsTable.userId, userId),
      lt(hexrunnerPresenceTerminationsTable.expiresAt, now),
    ));
    await tx.insert(hexrunnerPresenceTerminationsTable).values({
      userId,
      clientRunId: parsed.data.clientRunId,
      endedAt: now,
      expiresAt,
    }).onConflictDoNothing();
    await tx.delete(hexrunnerLivePresenceTable).where(and(
      eq(hexrunnerLivePresenceTable.userId, userId),
      eq(hexrunnerLivePresenceTable.clientRunId, parsed.data.clientRunId),
    ));
  });
  res.sendStatus(204);
});

router.post("/presence/discovery-anchor", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const parsed = UpdateDiscoveryAnchorBody.safeParse(req.body);
  if (!parsed.success || parsed.data.mocked) {
    res.status(400).json({ error: "Invalid discovery anchor data." });
    return;
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PRESENCE_TTL_MS);
  const data = parsed.data;
  const h3Index = latLngToCell(data.lat, data.lng, PRESENCE_H3_RESOLUTION);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`hexrunner-discovery-anchor:${userId}`}, 0))`);
    await tx.delete(hexrunnerDiscoveryAnchorTerminationsTable).where(and(
      eq(hexrunnerDiscoveryAnchorTerminationsTable.userId, userId),
      lt(hexrunnerDiscoveryAnchorTerminationsTable.expiresAt, now),
    ));
    await tx.delete(hexrunnerDiscoveryAnchorContinuityTable).where(and(
      eq(hexrunnerDiscoveryAnchorContinuityTable.userId, userId),
      lt(hexrunnerDiscoveryAnchorContinuityTable.expiresAt, now),
    ));
    await tx.delete(hexrunnerDiscoveryAnchorsTable).where(and(
      eq(hexrunnerDiscoveryAnchorsTable.userId, userId),
      lt(hexrunnerDiscoveryAnchorsTable.expiresAt, now),
    ));
    const [termination] = await tx.select({
      userId: hexrunnerDiscoveryAnchorTerminationsTable.userId,
    }).from(hexrunnerDiscoveryAnchorTerminationsTable).where(and(
      eq(hexrunnerDiscoveryAnchorTerminationsTable.userId, userId),
      eq(hexrunnerDiscoveryAnchorTerminationsTable.clientSessionId, data.clientSessionId),
      gt(hexrunnerDiscoveryAnchorTerminationsTable.expiresAt, now),
    )).limit(1);
    if (termination) return "terminated" as const;
    const [continuity] = await tx.select().from(hexrunnerDiscoveryAnchorContinuityTable)
      .where(and(
        eq(hexrunnerDiscoveryAnchorContinuityTable.userId, userId),
        gt(hexrunnerDiscoveryAnchorContinuityTable.expiresAt, now),
      )).limit(1);
    const [activeAnchor] = continuity ? [] : await tx.select()
      .from(hexrunnerDiscoveryAnchorsTable)
      .where(eq(hexrunnerDiscoveryAnchorsTable.userId, userId))
      .limit(1);
    const continuityReference = continuity ?? activeAnchor;
    if (continuityReference) {
      const elapsedMs = now.getTime() - continuityReference.updatedAt.getTime();
      if (elapsedMs < MIN_HEARTBEAT_INTERVAL_MS) return "rate" as const;
      const permittedDistance = RELOCATION_JITTER_METERS +
        Math.max(continuityReference.accuracyMeters, data.accuracyMeters) +
        (elapsedMs / 1_000) * MAX_RUNNING_METERS_PER_SECOND;
      if (haversineMeters(
        continuityReference.latitude,
        continuityReference.longitude,
        data.lat,
        data.lng,
      ) > permittedDistance) {
        return "relocation" as const;
      }
    }
    const continuityExpiresAt = new Date(now.getTime() + TERMINATION_TTL_MS);
    await tx.insert(hexrunnerDiscoveryAnchorContinuityTable).values({
      userId, latitude: data.lat, longitude: data.lng,
      accuracyMeters: data.accuracyMeters, h3Index, updatedAt: now,
      expiresAt: continuityExpiresAt,
    }).onConflictDoUpdate({
      target: hexrunnerDiscoveryAnchorContinuityTable.userId,
      set: {
        latitude: data.lat, longitude: data.lng,
        accuracyMeters: data.accuracyMeters, h3Index, updatedAt: now,
        expiresAt: continuityExpiresAt,
      },
    });
    await tx.insert(hexrunnerDiscoveryAnchorsTable).values({
      userId, clientSessionId: data.clientSessionId,
      latitude: data.lat, longitude: data.lng, accuracyMeters: data.accuracyMeters,
      h3Index, updatedAt: now, expiresAt,
    }).onConflictDoUpdate({
      target: hexrunnerDiscoveryAnchorsTable.userId,
      set: {
        clientSessionId: data.clientSessionId,
        latitude: data.lat, longitude: data.lng,
        accuracyMeters: data.accuracyMeters, h3Index, updatedAt: now, expiresAt,
      },
    });
    return "accepted" as const;
  });
  if (result === "terminated") {
    res.status(409).json({ error: "This discovery session has ended." });
    return;
  }
  if (result === "rate") {
    res.status(429).json({ error: "Discovery anchor updates are too frequent." });
    return;
  }
  if (result === "relocation") {
    res.status(400).json({ error: "Invalid discovery anchor data." });
    return;
  }
  res.json(UpdateDiscoveryAnchorResponse.parse({ expiresAt }));
});

router.post("/presence/discovery-anchor/end", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const parsed = EndDiscoveryAnchorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid discovery anchor end data." });
    return;
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TERMINATION_TTL_MS);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`hexrunner-discovery-anchor:${userId}`}, 0))`);
    await tx.delete(hexrunnerDiscoveryAnchorTerminationsTable).where(and(
      eq(hexrunnerDiscoveryAnchorTerminationsTable.userId, userId),
      lt(hexrunnerDiscoveryAnchorTerminationsTable.expiresAt, now),
    ));
    await tx.insert(hexrunnerDiscoveryAnchorTerminationsTable).values({
      userId,
      clientSessionId: parsed.data.clientSessionId,
      endedAt: now,
      expiresAt,
    }).onConflictDoUpdate({
      target: [
        hexrunnerDiscoveryAnchorTerminationsTable.userId,
        hexrunnerDiscoveryAnchorTerminationsTable.clientSessionId,
      ],
      set: { endedAt: now, expiresAt },
    });
    await tx.delete(hexrunnerDiscoveryAnchorsTable).where(and(
      eq(hexrunnerDiscoveryAnchorsTable.userId, userId),
      eq(hexrunnerDiscoveryAnchorsTable.clientSessionId, parsed.data.clientSessionId),
    ));
  });
  res.sendStatus(204);
});

router.get("/presence/nearby", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const query = GetNearbyPresenceQueryParams.safeParse(req.query);
  // Search centers are always caller-owned server records; coordinates in a
  // GET request would turn discovery into arbitrary-area scanning.
  if (!query.success || "lat" in req.query || "lng" in req.query) {
    res.status(400).json({ error: "Invalid nearby query." }); return;
  }
  const now = new Date();
  await purgeExpiredPresence(now);
  await purgeExpiredDiscoveryAnchors(now);
  await purgeExpiredDiscoveryAnchorSecurityRows(now);
  const [self] = await db.select().from(hexrunnerLivePresenceTable)
    .where(and(eq(hexrunnerLivePresenceTable.userId, userId), gt(hexrunnerLivePresenceTable.expiresAt, now))).limit(1);
  const [anchor] = self ? [] : await db.select().from(hexrunnerDiscoveryAnchorsTable)
    .where(and(eq(hexrunnerDiscoveryAnchorsTable.userId, userId), gt(hexrunnerDiscoveryAnchorsTable.expiresAt, now))).limit(1);
  const searchCenter = self ?? anchor;
  if (!searchCenter) { res.status(400).json({ error: "A current location is required before searching nearby." }); return; }
  // Resolution 9 cells are roughly 200m across; this conservative ring bounds
  // the DB candidate list while Haversine below remains authoritative.
  const ring = Math.min(35, Math.ceil(query.data.radiusMeters / 150) + 2);
  const cells = gridDisk(searchCenter.h3Index, ring);
  const candidates = await db.select({
    userId: hexrunnerLivePresenceTable.userId, latitude: hexrunnerLivePresenceTable.latitude,
    longitude: hexrunnerLivePresenceTable.longitude, expiresAt: hexrunnerLivePresenceTable.expiresAt,
    displayName: hexrunnerUsersTable.displayName,
  }).from(hexrunnerLivePresenceTable).innerJoin(hexrunnerUsersTable, eq(hexrunnerUsersTable.id, hexrunnerLivePresenceTable.userId))
    .where(and(inArray(hexrunnerLivePresenceTable.h3Index, cells), gt(hexrunnerLivePresenceTable.expiresAt, now)));
  const nearby = candidates.filter((candidate) => candidate.userId !== userId)
    .map((candidate) => ({ ...candidate, distance: haversineMeters(searchCenter.latitude, searchCenter.longitude, candidate.latitude, candidate.longitude) }))
    .filter((candidate) => candidate.distance <= query.data.radiusMeters)
    .sort((a, b) => a.distance - b.distance);
  const relationships = await db.select().from(hexrunnerConnectionsTable).where(
    or(eq(hexrunnerConnectionsTable.userLowId, userId), eq(hexrunnerConnectionsTable.userHighId, userId)),
  );
  const accepted = new Set(relationships
    .filter((connection) => connection.status === "accepted")
    .map((connection) => connection.userLowId === userId ? connection.userHighId : connection.userLowId));
  const blocked = new Set(relationships
    .filter((connection) => connection.status === "blocked")
    .map((connection) => connection.userLowId === userId ? connection.userHighId : connection.userLowId));
  // Blocking is symmetric for discovery and ambient counts, so the count
  // cannot become a presence side channel for either party.
  const visibleNearby = nearby.filter((candidate) => !blocked.has(candidate.userId));
  const returnedCandidates = visibleNearby.slice(0, query.data.limit);
  const grants = returnedCandidates.map((candidate) => {
    const interactionToken = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Math.min(
      now.getTime() + 30_000,
      searchCenter.expiresAt.getTime(),
      candidate.expiresAt.getTime(),
    ));
    return {
      candidate,
      interactionToken,
      tokenHash: createHash("sha256").update(interactionToken).digest("hex"),
      expiresAt,
    };
  });
  if (grants.length > 0) {
    let issuanceThrottled = false;
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`presence-grants:${userId}`}, 0))`,
      );
      const [latestGrant] = await tx
        .select({ createdAt: hexrunnerInteractionGrantsTable.createdAt })
        .from(hexrunnerInteractionGrantsTable)
        .where(eq(hexrunnerInteractionGrantsTable.viewerId, userId))
        .orderBy(desc(hexrunnerInteractionGrantsTable.createdAt))
        .limit(1);
      if (
        latestGrant &&
        latestGrant.createdAt.getTime() >
          now.getTime() - GRANT_ISSUANCE_MIN_INTERVAL_MS
      ) {
        issuanceThrottled = true;
        return;
      }
      await tx
        .delete(hexrunnerInteractionGrantsTable)
        .where(
          and(
            eq(hexrunnerInteractionGrantsTable.viewerId, userId),
            lt(hexrunnerInteractionGrantsTable.expiresAt, now),
          ),
        );
      for (const grant of grants) {
        await tx.insert(hexrunnerInteractionGrantsTable).values({
          viewerId: userId,
          targetId: grant.candidate.userId,
          tokenHash: grant.tokenHash,
          createdAt: now,
          expiresAt: grant.expiresAt,
        }).onConflictDoNothing({
          target: hexrunnerInteractionGrantsTable.tokenHash,
        });
      }
    });
    if (issuanceThrottled) {
      res.status(429).json({ error: "Nearby refresh is too frequent." });
      return;
    }
  }
  const runners = grants.map(({ candidate, interactionToken }) => {
    if (accepted.has(candidate.userId)) {
      return { visibility: "exact" as const, userId: candidate.userId,
        displayName: candidate.displayName?.trim() || "Runner", lat: candidate.latitude, lng: candidate.longitude,
        distanceMeters: Math.round(candidate.distance), interactionToken, waveAvailable: true };
    }
    const [lat, lng] = cellToLatLng(latLngToCell(candidate.latitude, candidate.longitude, 10));
    return {
      visibility: "anonymous" as const,
      lat,
      lng,
      distanceBandMeters: Math.min(5_000, Math.max(250, Math.ceil(candidate.distance / 250) * 250)),
      interactionToken,
      waveAvailable: true,
    };
  });
  res.json(GetNearbyPresenceResponse.parse({ runners, ambientCount: visibleNearby.length }));
});

type UserIdParamsResult =
  | { success: true; data: { userId: string } }
  | { success: false };

async function target(
  req: Request,
  res: Response,
  schema: { safeParse(value: unknown): UserIdParamsResult },
): Promise<{ me: string; other: string } | null> {
  const me = requireUser(req, res); if (!me) return null;
  const parsed = schema.safeParse(req.params);
  if (!parsed.success || parsed.data.userId === me) { res.status(400).json({ error: "Invalid connection action." }); return null; }
  return { me, other: parsed.data.userId };
}

router.get("/connections", async (req, res): Promise<void> => {
  const me = requireUser(req, res); if (!me) return;
  const rows = await db.select().from(hexrunnerConnectionsTable).where(or(eq(hexrunnerConnectionsTable.userLowId, me), eq(hexrunnerConnectionsTable.userHighId, me)));
  res.json(ListConnectionsResponse.parse(rows.map((row) => ({
    userId: row.userLowId === me ? row.userHighId : row.userLowId,
    status: row.status === "pending" ? (row.requestedById === me ? "pending_outgoing" : "pending_incoming") : row.status,
    updatedAt: row.updatedAt,
  }))));
});

router.post("/connections/:userId/request", async (req, res): Promise<void> => {
  const action = await target(req, res, RequestConnectionParams); if (!action) return;
  const [other] = await db.select({ id: hexrunnerUsersTable.id }).from(hexrunnerUsersTable).where(eq(hexrunnerUsersTable.id, action.other)).limit(1);
  if (!other) { res.status(400).json({ error: "Unknown user." }); return; }
  const ids = pair(action.me, action.other); const now = new Date();
  const [row] = await db.insert(hexrunnerConnectionsTable).values({ userLowId: ids.low, userHighId: ids.high, status: "pending", requestedById: action.me, updatedAt: now })
    .onConflictDoNothing().returning();
  if (!row) { res.status(400).json({ error: "Connection already exists or is blocked." }); return; }
  res.json(RequestConnectionResponse.parse({ userId: action.other, status: "pending_outgoing", updatedAt: now }));
});

router.post("/connections/:userId/accept", async (req, res): Promise<void> => {
  const action = await target(req, res, AcceptConnectionParams); if (!action) return;
  const ids = pair(action.me, action.other); const now = new Date();
  const [row] = await db.update(hexrunnerConnectionsTable).set({ status: "accepted", updatedAt: now })
    .where(and(eq(hexrunnerConnectionsTable.userLowId, ids.low), eq(hexrunnerConnectionsTable.userHighId, ids.high), eq(hexrunnerConnectionsTable.status, "pending"), eq(hexrunnerConnectionsTable.requestedById, action.other))).returning();
  if (!row) { res.status(400).json({ error: "No incoming request to accept." }); return; }
  res.json(AcceptConnectionResponse.parse({ userId: action.other, status: "accepted", updatedAt: now }));
});

router.post("/connections/:userId/reject", async (req, res): Promise<void> => {
  const action = await target(req, res, RejectConnectionParams); if (!action) return;
  const ids = pair(action.me, action.other);
  await db.delete(hexrunnerConnectionsTable).where(and(eq(hexrunnerConnectionsTable.userLowId, ids.low), eq(hexrunnerConnectionsTable.userHighId, ids.high), eq(hexrunnerConnectionsTable.status, "pending"), eq(hexrunnerConnectionsTable.requestedById, action.other)));
  res.sendStatus(204);
});
router.delete("/connections/:userId", async (req, res): Promise<void> => {
  const action = await target(req, res, RemoveConnectionParams); if (!action) return;
  const ids = pair(action.me, action.other);
  // A blocked party must not be able to remove the blocker’s protection.
  await db.delete(hexrunnerConnectionsTable).where(and(
    eq(hexrunnerConnectionsTable.userLowId, ids.low),
    eq(hexrunnerConnectionsTable.userHighId, ids.high),
    or(
      eq(hexrunnerConnectionsTable.status, "pending"),
      eq(hexrunnerConnectionsTable.status, "accepted"),
      eq(hexrunnerConnectionsTable.blockedById, action.me),
    ),
  ));
  res.sendStatus(204);
});
router.post("/connections/:userId/block", async (req, res): Promise<void> => {
  const action = await target(req, res, BlockConnectionParams); if (!action) return;
  const [other] = await db.select({ id: hexrunnerUsersTable.id }).from(hexrunnerUsersTable)
    .where(eq(hexrunnerUsersTable.id, action.other)).limit(1);
  if (!other) { res.status(400).json({ error: "Unknown user." }); return; }
  const ids = pair(action.me, action.other); const now = new Date();
  const [row] = await db.insert(hexrunnerConnectionsTable).values({ userLowId: ids.low, userHighId: ids.high, status: "blocked", requestedById: action.me, blockedById: action.me, updatedAt: now })
    .onConflictDoUpdate({ target: [hexrunnerConnectionsTable.userLowId, hexrunnerConnectionsTable.userHighId], set: { status: "blocked", blockedById: action.me, requestedById: action.me, updatedAt: now } }).returning();
  if (!row) {
    throw new Error("Blocked connection upsert returned no row.");
  }
  res.json(BlockConnectionResponse.parse({ userId: action.other, status: "blocked", updatedAt: row.updatedAt }));
});

const presenceErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  // Never log bodies, query values, SQL parameters, or coordinates.
  req.log.error(
    { errorType: error instanceof Error ? error.name : "UnknownError" },
    "Live presence request failed",
  );
  if (!res.headersSent) {
    res.status(500).json({ error: "Unable to complete the live presence request." });
  }
};
router.use(presenceErrorHandler);

export default router;