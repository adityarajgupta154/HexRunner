import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  GetLeaderboardResponse,
  GetUserStatsParams,
  GetUserStatsResponse,
} from "@workspace/api-zod";
import { asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  hexrunnerHexOwnershipTable,
  hexrunnerRunsTable,
  hexrunnerUsersTable,
} from "@workspace/db";

const router: IRouter = Router();

function safeDisplayName(
  userId: string,
  displayName: string | null,
): string {
  const normalized = displayName?.trim().replace(/\s+/g, " ").slice(0, 40);
  if (normalized) return normalized;

  const suffix = createHash("sha256")
    .update(userId)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  return `Runner ${suffix}`;
}

router.get("/leaderboard", async (req, res) => {
  const currentUserIdValue = req.query.currentUserId;
  const parsedCurrentUser =
    currentUserIdValue === undefined
      ? null
      : GetUserStatsParams.safeParse({ userId: currentUserIdValue });

  if (parsedCurrentUser && !parsedCurrentUser.success) {
    res.status(400).json({ error: "Invalid current user ID." });
    return;
  }

  const currentUserId = parsedCurrentUser?.data.userId ?? null;

  try {
    const runTotals = db
      .select({
        userId: hexrunnerRunsTable.userId,
        totalRuns: sql<number>`count(${hexrunnerRunsTable.id})::int`.as(
          "total_runs",
        ),
        totalDistanceKm:
          sql<number>`coalesce(sum(${hexrunnerRunsTable.distanceKm}), 0)::float8`.as(
            "total_distance_km",
          ),
      })
      .from(hexrunnerRunsTable)
      .groupBy(hexrunnerRunsTable.userId)
      .as("run_totals");
    const users = await db
      .select({
        id: hexrunnerUsersTable.id,
        displayName: hexrunnerUsersTable.displayName,
        totalHexesOwned: hexrunnerUsersTable.totalHexesOwned,
        totalRuns: sql<number>`coalesce(${runTotals.totalRuns}, 0)::int`,
        totalDistanceKm:
          sql<number>`coalesce(${runTotals.totalDistanceKm}, 0)::float8`,
      })
      .from(hexrunnerUsersTable)
      .leftJoin(runTotals, eq(runTotals.userId, hexrunnerUsersTable.id))
      .orderBy(
        desc(hexrunnerUsersTable.totalHexesOwned),
        desc(sql`coalesce(${runTotals.totalDistanceKm}, 0)`),
        desc(sql`coalesce(${runTotals.totalRuns}, 0)`),
        asc(hexrunnerUsersTable.id),
      )
      .limit(20);

    res.json(
      GetLeaderboardResponse.parse({
        users: users.map((user, index) => ({
          rank: index + 1,
          displayName: safeDisplayName(user.id, user.displayName),
          totalHexesOwned: user.totalHexesOwned,
          totalRuns: user.totalRuns,
          totalDistanceKm: user.totalDistanceKm,
          isCurrentUser: user.id === currentUserId,
        })),
      }),
    );
  } catch (error) {
    req.log.error({ error }, "Failed to load leaderboard");
    res.status(500).json({ error: "Unable to load the leaderboard." });
  }
});

router.get("/users/:userId/stats", async (req, res) => {
  const parsed = GetUserStatsParams.safeParse(req.params);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user ID." });
    return;
  }

  try {
    const [user] = await db
      .select({
        id: hexrunnerUsersTable.id,
        displayName: hexrunnerUsersTable.displayName,
      })
      .from(hexrunnerUsersTable)
      .where(eq(hexrunnerUsersTable.id, parsed.data.userId))
      .limit(1);

    if (!user) {
      res.json(
        GetUserStatsResponse.parse({
          userId: parsed.data.userId,
          displayName: safeDisplayName(parsed.data.userId, null),
          totals: {
            totalRuns: 0,
            totalDistanceKm: 0,
            totalElapsedSeconds: 0,
            averagePaceMinPerKm: null,
            totalHexesOwned: 0,
            totalClaimedHexes: 0,
            totalNewHexes: 0,
            totalStolenHexes: 0,
          },
          recentRuns: [],
        }),
      );
      return;
    }

    const [[totals], recentRuns, [ownershipTotals]] = await Promise.all([
      db
        .select({
          totalRuns: sql<number>`count(*)::int`,
          totalDistanceKm: sql<number>`coalesce(sum(${hexrunnerRunsTable.distanceKm}), 0)::float8`,
          totalElapsedSeconds: sql<number>`coalesce(sum(${hexrunnerRunsTable.elapsedSeconds}), 0)::int`,
          totalClaimedHexes: sql<number>`coalesce(sum(${hexrunnerRunsTable.hexCount}), 0)::int`,
          totalNewHexes: sql<number>`coalesce(sum(${hexrunnerRunsTable.newHexCount}), 0)::int`,
          totalStolenHexes: sql<number>`coalesce(sum(${hexrunnerRunsTable.stolenHexCount}), 0)::int`,
        })
        .from(hexrunnerRunsTable)
        .where(eq(hexrunnerRunsTable.userId, user.id)),
      db
        .select({
          runId: hexrunnerRunsTable.id,
          distanceKm: hexrunnerRunsTable.distanceKm,
          averagePaceMinPerKm: hexrunnerRunsTable.avgPaceMinPerKm,
          startedAt: hexrunnerRunsTable.startedAt,
          endedAt: hexrunnerRunsTable.endedAt,
          claimedHexes: hexrunnerRunsTable.hexCount,
          newHexes: hexrunnerRunsTable.newHexCount,
          stolenHexes: hexrunnerRunsTable.stolenHexCount,
        })
        .from(hexrunnerRunsTable)
        .where(eq(hexrunnerRunsTable.userId, user.id))
        .orderBy(
          desc(hexrunnerRunsTable.endedAt),
          desc(hexrunnerRunsTable.id),
        )
        .limit(5),
      db
        .select({
          totalHexesOwned: sql<number>`count(*)::int`,
        })
        .from(hexrunnerHexOwnershipTable)
        .where(eq(hexrunnerHexOwnershipTable.ownerId, user.id)),
    ]);
    const averagePaceMinPerKm =
      totals.totalDistanceKm >= 0.01
        ? totals.totalElapsedSeconds / 60 / totals.totalDistanceKm
        : null;

    res.json(
      GetUserStatsResponse.parse({
        userId: user.id,
        displayName: safeDisplayName(user.id, user.displayName),
        totals: {
          ...totals,
          averagePaceMinPerKm,
          totalHexesOwned: ownershipTotals.totalHexesOwned,
        },
        recentRuns,
      }),
    );
  } catch (error) {
    req.log.error(
      { error, userId: parsed.data.userId },
      "Failed to load user stats",
    );
    res.status(500).json({ error: "Unable to load user stats." });
  }
});

export default router;