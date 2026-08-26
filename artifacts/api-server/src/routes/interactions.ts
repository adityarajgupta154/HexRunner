import { createHash, randomUUID } from "node:crypto";
import {
  Router,
  type ErrorRequestHandler,
  type IRouter,
  type Request,
  type Response,
} from "express";
import {
  AcknowledgeLiveInteractionsBody,
  GetLiveInteractionsResponse,
  SendWaveBody,
  SendWaveResponse,
} from "@workspace/api-zod";
import {
  db,
  hexrunnerConnectionsTable,
  hexrunnerContestEventsTable,
  hexrunnerContestOccupancyTable,
  hexrunnerDiscoveryAnchorsTable,
  hexrunnerHexOwnershipTable,
  hexrunnerInteractionGrantsTable,
  hexrunnerLivePresenceTable,
  hexrunnerUsersTable,
  hexrunnerWavesTable,
} from "@workspace/db";
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { verifyAnonymousCredential } from "../lib/anonymousCredential";
import { cleanupExpiredInteractions } from "../lib/interactionCleanup";

const router: IRouter = Router();
const WAVE_TTL_MS = 15_000;
const EVENT_TTL_MS = 60_000;
const OCCUPANCY_TTL_MS = 60_000;
const MAX_WAVE_DISTANCE_METERS = 2_000;

function requireUser(req: Request, res: Response): string | null {
  const authorization = req.get("authorization");
  const credential = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const userId = credential ? verifyAnonymousCredential(credential) : null;
  if (!userId) {
    res.status(401).json({ error: "A valid device credential is required." });
    return null;
  }
  return userId;
}

function orderedPair(a: string, b: string): { low: string; high: string } {
  return a < b ? { low: a, high: b } : { low: b, high: a };
}

function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const radians = Math.PI / 180;
  const dLat = (bLat - aLat) * radians;
  const dLng = (bLng - aLng) * radians;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * radians) *
      Math.cos(bLat * radians) *
      Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function acquireLocks(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  keys: string[],
): Promise<void> {
  for (const key of [...new Set(keys)].sort()) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  }
}

async function acquireContestLocks(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  h3Index: string,
  userIds: string[],
): Promise<void> {
  // Global order shared with run ownership writes: raw H3 lock first, followed
  // only by lexicographically sorted interaction-user locks.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${h3Index}, 0))`,
  );
  await acquireLocks(
    tx,
    userIds.map((userId) => `interaction-user:${userId}`),
  );
}

async function blocked(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  a: string,
  b: string,
): Promise<boolean> {
  const pair = orderedPair(a, b);
  const [row] = await tx
    .select({ status: hexrunnerConnectionsTable.status })
    .from(hexrunnerConnectionsTable)
    .where(
      and(
        eq(hexrunnerConnectionsTable.userLowId, pair.low),
        eq(hexrunnerConnectionsTable.userHighId, pair.high),
        eq(hexrunnerConnectionsTable.status, "blocked"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function activeCenter(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  now: Date,
) {
  const [presence] = await tx
    .select()
    .from(hexrunnerLivePresenceTable)
    .where(
      and(
        eq(hexrunnerLivePresenceTable.userId, userId),
        gt(hexrunnerLivePresenceTable.expiresAt, now),
      ),
    )
    .limit(1);
  if (presence) return presence;
  const [anchor] = await tx
    .select()
    .from(hexrunnerDiscoveryAnchorsTable)
    .where(
      and(
        eq(hexrunnerDiscoveryAnchorsTable.userId, userId),
        gt(hexrunnerDiscoveryAnchorsTable.expiresAt, now),
      ),
    )
    .limit(1);
  return anchor ?? null;
}

router.post("/waves", async (req, res): Promise<void> => {
  const senderId = requireUser(req, res);
  if (!senderId) return;
  const parsed = SendWaveBody.safeParse(req.body);
  const waveBodyKeys =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? Object.keys(req.body)
      : [];
  if (
    !parsed.success ||
    waveBodyKeys.length !== 2 ||
    !waveBodyKeys.includes("interactionToken") ||
    !waveBodyKeys.includes("idempotencyKey")
  ) {
    res.status(400).json({ error: "Invalid wave request." });
    return;
  }
  const now = new Date();
  await cleanupExpiredInteractions(now);
  const tokenHash = createHash("sha256")
    .update(parsed.data.interactionToken)
    .digest("hex");
  const result = await db.transaction(async (tx) => {
    const [grant] = await tx
      .select()
      .from(hexrunnerInteractionGrantsTable)
      .where(
        and(
          eq(hexrunnerInteractionGrantsTable.viewerId, senderId),
          eq(hexrunnerInteractionGrantsTable.tokenHash, tokenHash),
        ),
      )
      .limit(1);
    if (!grant || grant.targetId === senderId) return { kind: "unavailable" } as const;
    const recipientId = grant.targetId;
    await acquireLocks(tx, [
      `interaction-user:${senderId}`,
      `interaction-user:${recipientId}`,
      `interaction-wave:${senderId}:${recipientId}`,
    ]);

    const [replay] = await tx
      .select()
      .from(hexrunnerWavesTable)
      .where(
        and(
          eq(hexrunnerWavesTable.senderId, senderId),
          eq(hexrunnerWavesTable.idempotencyKey, parsed.data.idempotencyKey),
        ),
      )
      .limit(1);
    if (replay) {
      return replay.recipientId === recipientId
        ? { kind: "replay", wave: replay } as const
        : { kind: "conflict" } as const;
    }

    const [latestGrant] = await tx
      .select()
      .from(hexrunnerInteractionGrantsTable)
      .where(
        and(
          eq(hexrunnerInteractionGrantsTable.viewerId, senderId),
          eq(hexrunnerInteractionGrantsTable.targetId, recipientId),
          eq(hexrunnerInteractionGrantsTable.tokenHash, tokenHash),
          gt(hexrunnerInteractionGrantsTable.expiresAt, now),
        ),
      )
      .limit(1);
    const center = await activeCenter(tx, senderId, now);
    const [target] = await tx
      .select()
      .from(hexrunnerLivePresenceTable)
      .where(
        and(
          eq(hexrunnerLivePresenceTable.userId, recipientId),
          gt(hexrunnerLivePresenceTable.expiresAt, now),
        ),
      )
      .limit(1);
    if (
      !latestGrant ||
      !center ||
      !target ||
      (await blocked(tx, senderId, recipientId)) ||
      haversineMeters(
        center.latitude,
        center.longitude,
        target.latitude,
        target.longitude,
      ) > MAX_WAVE_DISTANCE_METERS
    ) {
      return { kind: "unavailable" } as const;
    }

    const tenSecondsAgo = new Date(now.getTime() - 10_000);
    const minuteAgo = new Date(now.getTime() - 60_000);
    const limitsResult = await tx.execute<{
      pending: string;
      pair_recent: string;
      sender_recent: string;
      recipient_recent: string;
    }>(sql`
      SELECT
        count(*) FILTER (
          WHERE sender_id = ${senderId} AND recipient_id = ${recipientId}
            AND expires_at > ${now} AND acknowledged_at IS NULL
        ) AS pending,
        count(*) FILTER (
          WHERE sender_id = ${senderId} AND recipient_id = ${recipientId}
            AND created_at >= ${tenSecondsAgo}
        ) AS pair_recent,
        count(*) FILTER (
          WHERE sender_id = ${senderId} AND created_at >= ${minuteAgo}
        ) AS sender_recent,
        count(*) FILTER (
          WHERE recipient_id = ${recipientId} AND created_at >= ${minuteAgo}
        ) AS recipient_recent
      FROM hexrunner_waves
    `);
    const limits = limitsResult.rows[0];
    if (
      Number(limits?.pending ?? 0) >= 1 ||
      Number(limits?.pair_recent ?? 0) >= 1 ||
      Number(limits?.sender_recent ?? 0) >= 5 ||
      Number(limits?.recipient_recent ?? 0) >= 20
    ) {
      return { kind: "throttled" } as const;
    }

    const expiresAt = new Date(now.getTime() + WAVE_TTL_MS);
    const [wave] = await tx
      .insert(hexrunnerWavesTable)
      .values({
        id: randomUUID(),
        senderId,
        recipientId,
        idempotencyKey: parsed.data.idempotencyKey,
        createdAt: now,
        expiresAt,
      })
      .returning();
    if (!wave) throw new Error("Wave insert returned no row.");
    return { kind: "created", wave } as const;
  });

  if (result.kind === "unavailable") {
    res.status(403).json({ error: "This interaction is unavailable." });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "The idempotency key is already in use." });
    return;
  }
  if (result.kind === "throttled") {
    res.status(429).json({ error: "Wave limit reached. Try again later." });
    return;
  }
  res
    .status(result.kind === "created" ? 201 : 200)
    .json(
      SendWaveResponse.parse({
        waveId: result.wave.id,
        expiresAt: result.wave.expiresAt,
      }),
    );
});

router.get("/live-interactions", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const now = new Date();
  await cleanupExpiredInteractions(now);
  const [liveCenter] = await db
    .select()
    .from(hexrunnerLivePresenceTable)
    .where(
      and(
        eq(hexrunnerLivePresenceTable.userId, ownerId),
        gt(hexrunnerLivePresenceTable.expiresAt, now),
      ),
    )
    .limit(1);
  const [anchorCenter] = liveCenter
    ? []
    : await db
        .select()
        .from(hexrunnerDiscoveryAnchorsTable)
        .where(
          and(
            eq(hexrunnerDiscoveryAnchorsTable.userId, ownerId),
            gt(hexrunnerDiscoveryAnchorsTable.expiresAt, now),
          ),
        )
        .limit(1);
  const center = liveCenter ?? anchorCenter;
  if (!center) {
    res.status(400).json({ error: "Current app activity is required." });
    return;
  }

  const candidates = await db
    .select({
      actorId: hexrunnerLivePresenceTable.userId,
      h3Index: hexrunnerLivePresenceTable.h3Index,
    })
    .from(hexrunnerLivePresenceTable)
    .innerJoin(
      hexrunnerHexOwnershipTable,
      eq(
        hexrunnerHexOwnershipTable.h3Index,
        hexrunnerLivePresenceTable.h3Index,
      ),
    )
    .where(
      and(
        eq(hexrunnerHexOwnershipTable.ownerId, ownerId),
        gt(hexrunnerLivePresenceTable.expiresAt, now),
        sql`${hexrunnerLivePresenceTable.userId} <> ${ownerId}`,
      ),
    );

  for (const candidate of candidates) {
    await db.transaction(async (tx) => {
      await acquireContestLocks(tx, candidate.h3Index, [
        ownerId,
        candidate.actorId,
      ]);
      const lockedNow = new Date();
      const currentOwnerCenter = await activeCenter(tx, ownerId, lockedNow);
      const [current] = await tx
        .select({
          expiresAt: hexrunnerLivePresenceTable.expiresAt,
          ownershipRunId: hexrunnerHexOwnershipTable.lastRunId,
        })
        .from(hexrunnerLivePresenceTable)
        .innerJoin(
          hexrunnerHexOwnershipTable,
          eq(
            hexrunnerHexOwnershipTable.h3Index,
            hexrunnerLivePresenceTable.h3Index,
          ),
        )
        .where(
          and(
            eq(hexrunnerLivePresenceTable.userId, candidate.actorId),
            eq(hexrunnerLivePresenceTable.h3Index, candidate.h3Index),
            gt(hexrunnerLivePresenceTable.expiresAt, lockedNow),
            eq(hexrunnerHexOwnershipTable.ownerId, ownerId),
          ),
        )
        .limit(1);
      if (
        !currentOwnerCenter ||
        !current ||
        (await blocked(tx, ownerId, candidate.actorId))
      ) {
        return;
      }
      const [occupancy] = await tx
        .select()
        .from(hexrunnerContestOccupancyTable)
        .where(
          and(
            eq(hexrunnerContestOccupancyTable.ownerId, ownerId),
            eq(hexrunnerContestOccupancyTable.actorId, candidate.actorId),
            eq(hexrunnerContestOccupancyTable.h3Index, candidate.h3Index),
          ),
        )
        .limit(1);
      const isEntry =
        !occupancy ||
        occupancy.expiresAt <= lockedNow ||
        occupancy.ownershipRunId !== current.ownershipRunId;
      const occupancyExpiresAt = new Date(
        lockedNow.getTime() + OCCUPANCY_TTL_MS,
      );
      await tx
        .insert(hexrunnerContestOccupancyTable)
        .values({
          ownerId,
          actorId: candidate.actorId,
          h3Index: candidate.h3Index,
          ownershipRunId: current.ownershipRunId,
          lastSeenAt: lockedNow,
          expiresAt: occupancyExpiresAt,
        })
        .onConflictDoUpdate({
          target: [
            hexrunnerContestOccupancyTable.ownerId,
            hexrunnerContestOccupancyTable.actorId,
            hexrunnerContestOccupancyTable.h3Index,
          ],
          set: {
            lastSeenAt: lockedNow,
            expiresAt: occupancyExpiresAt,
            ownershipRunId: current.ownershipRunId,
          },
        });
      if (!isEntry) return;
      const [recent] = await tx
        .select({ id: hexrunnerContestEventsTable.id })
        .from(hexrunnerContestEventsTable)
        .where(
          and(
            eq(hexrunnerContestEventsTable.ownerId, ownerId),
            eq(hexrunnerContestEventsTable.actorId, candidate.actorId),
            eq(hexrunnerContestEventsTable.h3Index, candidate.h3Index),
            gte(
              hexrunnerContestEventsTable.createdAt,
              new Date(lockedNow.getTime() - EVENT_TTL_MS),
            ),
          ),
        )
        .limit(1);
      if (!recent) {
        await tx.insert(hexrunnerContestEventsTable).values({
          id: randomUUID(),
          ownerId,
          actorId: candidate.actorId,
          h3Index: candidate.h3Index,
          createdAt: lockedNow,
          expiresAt: new Date(lockedNow.getTime() + EVENT_TTL_MS),
        });
      }
    });
  }

  const contestRows = await db
    .select()
    .from(hexrunnerContestEventsTable)
    .where(
      and(
        eq(hexrunnerContestEventsTable.ownerId, ownerId),
        isNull(hexrunnerContestEventsTable.acknowledgedAt),
        gt(hexrunnerContestEventsTable.expiresAt, now),
      ),
    )
    .orderBy(desc(hexrunnerContestEventsTable.createdAt))
    .limit(100);
  const waveRows = await db
    .select()
    .from(hexrunnerWavesTable)
    .where(
      and(
        eq(hexrunnerWavesTable.recipientId, ownerId),
        isNull(hexrunnerWavesTable.acknowledgedAt),
        gt(hexrunnerWavesTable.expiresAt, now),
      ),
    )
    .orderBy(desc(hexrunnerWavesTable.createdAt))
    .limit(100);
  const actorIds = [
    ...new Set([
      ...contestRows.map((row) => row.actorId),
      ...waveRows.map((row) => row.senderId),
    ]),
  ];
  const relationships =
    actorIds.length === 0
      ? []
      : await db
          .select()
          .from(hexrunnerConnectionsTable)
          .where(
            or(
              and(
                eq(hexrunnerConnectionsTable.userLowId, ownerId),
                inArray(hexrunnerConnectionsTable.userHighId, actorIds),
              ),
              and(
                eq(hexrunnerConnectionsTable.userHighId, ownerId),
                inArray(hexrunnerConnectionsTable.userLowId, actorIds),
              ),
            ),
          );
  const accepted = new Set(
    relationships
      .filter((row) => row.status === "accepted")
      .map((row) =>
        row.userLowId === ownerId ? row.userHighId : row.userLowId,
      ),
  );
  const blockedIds = new Set(
    relationships
      .filter((row) => row.status === "blocked")
      .map((row) =>
        row.userLowId === ownerId ? row.userHighId : row.userLowId,
      ),
  );
  const acceptedIds = actorIds.filter((id) => accepted.has(id));
  const users =
    acceptedIds.length === 0
      ? []
      : await db
          .select({
            id: hexrunnerUsersTable.id,
            displayName: hexrunnerUsersTable.displayName,
          })
          .from(hexrunnerUsersTable)
          .where(inArray(hexrunnerUsersTable.id, acceptedIds));
  const names = new Map(
    users.map((user) => [user.id, user.displayName?.trim() || "Runner"]),
  );
  const events = [
    ...contestRows
      .filter((row) => !blockedIds.has(row.actorId))
      .map((row) => ({
        id: row.id,
        kind: "contest" as const,
        copy: accepted.has(row.actorId)
          ? `${names.get(row.actorId) ?? "Runner"} entered your territory`
          : "A nearby runner entered your territory",
        ...(accepted.has(row.actorId)
          ? { displayName: names.get(row.actorId) ?? "Runner" }
          : {}),
        h3Index: row.h3Index,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      })),
    ...waveRows
      .filter((row) => !blockedIds.has(row.senderId))
      .map((row) => ({
        id: row.id,
        kind: "wave" as const,
        copy: accepted.has(row.senderId)
          ? `${names.get(row.senderId) ?? "Runner"} waved`
          : "A nearby runner waved",
        ...(accepted.has(row.senderId)
          ? { displayName: names.get(row.senderId) ?? "Runner" }
          : {}),
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 100);
  res.json(GetLiveInteractionsResponse.parse({ events }));
});

router.post("/live-interactions/ack", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const parsed = AcknowledgeLiveInteractionsBody.safeParse(req.body);
  const ackBodyKeys =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? Object.keys(req.body)
      : [];
  if (
    !parsed.success ||
    ackBodyKeys.length !== 2 ||
    !ackBodyKeys.includes("contestEventIds") ||
    !ackBodyKeys.includes("waveIds") ||
    (parsed.success &&
      (new Set(parsed.data.contestEventIds).size !==
        parsed.data.contestEventIds.length ||
        new Set(parsed.data.waveIds).size !== parsed.data.waveIds.length))
  ) {
    res.status(400).json({ error: "Invalid acknowledgement." });
    return;
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    const contests =
      parsed.data.contestEventIds.length === 0
        ? []
        : await tx
            .select({ id: hexrunnerContestEventsTable.id, actorId: hexrunnerContestEventsTable.actorId })
            .from(hexrunnerContestEventsTable)
            .where(
              and(
                eq(hexrunnerContestEventsTable.ownerId, ownerId),
                gt(hexrunnerContestEventsTable.expiresAt, now),
                inArray(hexrunnerContestEventsTable.id, parsed.data.contestEventIds),
              ),
            );
    const waves =
      parsed.data.waveIds.length === 0
        ? []
        : await tx
            .select({ id: hexrunnerWavesTable.id, senderId: hexrunnerWavesTable.senderId })
            .from(hexrunnerWavesTable)
            .where(
              and(
                eq(hexrunnerWavesTable.recipientId, ownerId),
                gt(hexrunnerWavesTable.expiresAt, now),
                inArray(hexrunnerWavesTable.id, parsed.data.waveIds),
              ),
            );
    const permittedContestIds: string[] = [];
    for (const row of contests) {
      if (!(await blocked(tx, ownerId, row.actorId))) permittedContestIds.push(row.id);
    }
    const permittedWaveIds: string[] = [];
    for (const row of waves) {
      if (!(await blocked(tx, ownerId, row.senderId))) permittedWaveIds.push(row.id);
    }
    if (permittedContestIds.length > 0) {
      await tx
        .update(hexrunnerContestEventsTable)
        .set({ acknowledgedAt: now })
        .where(inArray(hexrunnerContestEventsTable.id, permittedContestIds));
    }
    if (permittedWaveIds.length > 0) {
      await tx
        .update(hexrunnerWavesTable)
        .set({ acknowledgedAt: now })
        .where(inArray(hexrunnerWavesTable.id, permittedWaveIds));
    }
  });
  res.sendStatus(204);
});

const interactionErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  // Never log request bodies, grant tokens, IDs, coordinates, or SQL parameters.
  req.log.error(
    { errorType: error instanceof Error ? error.name : "UnknownError" },
    "Live interaction request failed",
  );
  if (!res.headersSent) {
    res.status(500).json({ error: "Unable to complete the live interaction request." });
  }
};
router.use(interactionErrorHandler);

export default router;