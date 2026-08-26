import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  GetLeaderboardResponse,
  GetUserStatsParams,
  GetUserStatsResponse,
  UpdateUserBaselineBody,
  UpdateUserBaselineParams,
  UpdateUserBaselineResponse,
} from "@workspace/api-zod";
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import {
  db,
  hexrunnerHexOwnershipTable,
  hexrunnerRunsTable,
  hexrunnerTakeoverEventsTable,
  hexrunnerUsersTable,
} from "@workspace/db";
import { verifyAnonymousCredential } from "../lib/anonymousCredential";
import { dailyBudgetForActivity } from "../lib/fitnessBudget";
import { calculateRunStreak } from "../lib/runStreak";

const router: IRouter = Router();
const leaderboardScopes = ["global", "city", "friends"] as const;
const fitnessTiers = ["beginner", "casual", "regular", "trained"] as const;

function isFitnessTier(
  value: string | null,
): value is (typeof fitnessTiers)[number] {
  return value !== null && fitnessTiers.includes(value as (typeof fitnessTiers)[number]);
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

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
  const requestedScope =
    typeof req.query.scope === "string" ? req.query.scope : "global";
  const scope = leaderboardScopes.includes(
    requestedScope as (typeof leaderboardScopes)[number],
  )
    ? (requestedScope as (typeof leaderboardScopes)[number])
    : null;

  if (!scope) {
    res.status(400).json({ error: "Invalid leaderboard scope." });
    return;
  }
  if (scope !== "global" && !currentUserId) {
    res.status(400).json({
      error: "A runner is required for city and friends leaderboards.",
    });
    return;
  }

  try {
    let scopedUserIds: string[] | null = null;
    let city: string | null = null;

    if (scope === "city") {
      const [currentUser] = await db
        .select({ city: hexrunnerUsersTable.city })
        .from(hexrunnerUsersTable)
        .where(eq(hexrunnerUsersTable.id, currentUserId!))
        .limit(1);
      city = currentUser?.city?.trim() || null;
      if (!city) {
        res.json(GetLeaderboardResponse.parse({ scope, users: [] }));
        return;
      }
    }

    if (scope === "friends") {
      const events = await db
        .select({
          previousOwnerId: hexrunnerTakeoverEventsTable.previousOwnerId,
          newOwnerId: hexrunnerTakeoverEventsTable.newOwnerId,
        })
        .from(hexrunnerTakeoverEventsTable)
        .where(
          or(
            eq(hexrunnerTakeoverEventsTable.previousOwnerId, currentUserId!),
            eq(hexrunnerTakeoverEventsTable.newOwnerId, currentUserId!),
          ),
        );
      scopedUserIds = [
        ...new Set(
          events.flatMap((event) => [
            event.previousOwnerId,
            event.newOwnerId,
          ]),
        ),
      ];
      if (!scopedUserIds.includes(currentUserId!)) {
        scopedUserIds.push(currentUserId!);
      }
    }

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
        totalBonusCredits:
          sql<number>`coalesce(sum(${hexrunnerRunsTable.bonusCredit}), 0)::int`.as("total_bonus_credits"),
        totalCredits:
          sql<number>`coalesce(sum(${hexrunnerRunsTable.hexCount} + ${hexrunnerRunsTable.bonusCredit}), 0)::int`.as("total_credits"),
      })
      .from(hexrunnerRunsTable)
      .groupBy(hexrunnerRunsTable.userId)
      .as("run_totals");
    const leaderboard = db
      .select({
        id: hexrunnerUsersTable.id,
        displayName: hexrunnerUsersTable.displayName,
        activityLevel: hexrunnerUsersTable.activityLevel,
        city: hexrunnerUsersTable.city,
        baselineCompletedAt: hexrunnerUsersTable.baselineCompletedAt,
        totalHexesOwned: hexrunnerUsersTable.totalHexesOwned,
        totalRuns: sql<number>`coalesce(${runTotals.totalRuns}, 0)::int`,
        totalDistanceKm:
          sql<number>`coalesce(${runTotals.totalDistanceKm}, 0)::float8`,
        totalBonusCredits: sql<number>`coalesce(${runTotals.totalBonusCredits}, 0)::int`,
        totalCredits: sql<number>`coalesce(${runTotals.totalCredits}, 0)::int`,
      })
      .from(hexrunnerUsersTable)
      .leftJoin(runTotals, eq(runTotals.userId, hexrunnerUsersTable.id));
    const scopeFilter =
      scope === "city"
        ? eq(hexrunnerUsersTable.city, city!)
        : scope === "friends"
          ? inArray(hexrunnerUsersTable.id, scopedUserIds!)
          : undefined;
    const users = await leaderboard
      .where(scopeFilter)
      .orderBy(
        desc(sql`coalesce(${runTotals.totalCredits}, 0)`),
        desc(sql`coalesce(${runTotals.totalDistanceKm}, 0)`),
        desc(sql`coalesce(${runTotals.totalRuns}, 0)`),
        asc(hexrunnerUsersTable.id),
      )
      .limit(20);

    res.json(
      GetLeaderboardResponse.parse({
        scope,
        users: users.map((user, index) => ({
          rank: index + 1,
          displayName: safeDisplayName(user.id, user.displayName),
          totalHexesOwned: user.totalHexesOwned,
          totalCredits: user.totalCredits,
          totalBonusCredits: user.totalBonusCredits,
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

router.patch("/users/:userId/baseline", async (req, res) => {
  const parsedParams = UpdateUserBaselineParams.safeParse(req.params);
  const parsedBody = UpdateUserBaselineBody.safeParse(req.body);
  const authorization = req.get("authorization");
  const credential = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const credentialUserId = credential
    ? verifyAnonymousCredential(credential)
    : null;

  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Invalid baseline details." });
    return;
  }
  if (!credentialUserId) {
    res.status(401).json({ error: "A valid device credential is required." });
    return;
  }
  if (credentialUserId !== parsedParams.data.userId) {
    res.status(403).json({ error: "This baseline belongs to another runner." });
    return;
  }

  const activityLevel = parsedBody.data.activityLevel;
  const city = parsedBody.data.city.trim().replace(/\s+/g, " ");
  const displayName = parsedBody.data.displayName?.trim().replace(/\s+/g, " ");
  const now = new Date();

  try {
    const [user] = await db
      .insert(hexrunnerUsersTable)
      .values({
        id: credentialUserId,
        displayName: displayName || null,
        city,
        activityLevel,
        baselineCompletedAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: hexrunnerUsersTable.id,
        set: {
          displayName: displayName || sql`${hexrunnerUsersTable.displayName}`,
          city,
          activityLevel,
          baselineCompletedAt: now,
          lastSeenAt: now,
        },
      })
      .returning({
        id: hexrunnerUsersTable.id,
        displayName: hexrunnerUsersTable.displayName,
        city: hexrunnerUsersTable.city,
        activityLevel: hexrunnerUsersTable.activityLevel,
        baselineCompletedAt: hexrunnerUsersTable.baselineCompletedAt,
      });

    if (
      !user ||
      !user.city ||
      !user.activityLevel ||
      !user.baselineCompletedAt
    ) {
      throw new Error("Baseline save did not return complete data.");
    }

    res.json(
      UpdateUserBaselineResponse.parse({
        displayName: safeDisplayName(user.id, user.displayName),
        city: user.city,
        activityLevel: user.activityLevel,
        completedAt: user.baselineCompletedAt,
      }),
    );
  } catch (error) {
    req.log.error({ error, userId: credentialUserId }, "Failed to save baseline");
    res.status(500).json({ error: "Unable to save your baseline." });
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
        activityLevel: hexrunnerUsersTable.activityLevel,
        city: hexrunnerUsersTable.city,
        baselineCompletedAt: hexrunnerUsersTable.baselineCompletedAt,
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
            totalCredits: 0,
            totalBonusCredits: 0,
            currentStreak: 0,
            todayClaimedHexes: 0,
            dailyBudget: 10,
            todayBonusCredits: 0,
            dailyBonusCap: 5,
          },
          recentRuns: [],
          baseline: null,
          takeoverAlerts: [],
        }),
      );
      return;
    }

    const utcDayStart = startOfUtcDay(new Date());
    const utcDayEnd = new Date(utcDayStart.getTime() + 86_400_000);
    const [[totals], recentRuns, [ownershipTotals], runDates, [todayUsage], takeoverAlerts] =
      await Promise.all([
      db
        .select({
          totalRuns: sql<number>`count(*)::int`,
          totalDistanceKm: sql<number>`coalesce(sum(${hexrunnerRunsTable.distanceKm}), 0)::float8`,
          totalElapsedSeconds: sql<number>`coalesce(sum(${hexrunnerRunsTable.elapsedSeconds}), 0)::int`,
          totalClaimedHexes: sql<number>`coalesce(sum(${hexrunnerRunsTable.hexCount}), 0)::int`,
          totalNewHexes: sql<number>`coalesce(sum(${hexrunnerRunsTable.newHexCount}), 0)::int`,
          totalStolenHexes: sql<number>`coalesce(sum(${hexrunnerRunsTable.stolenHexCount}), 0)::int`,
          totalBonusCredits: sql<number>`coalesce(sum(${hexrunnerRunsTable.bonusCredit}), 0)::int`,
          totalCredits: sql<number>`coalesce(sum(${hexrunnerRunsTable.hexCount} + ${hexrunnerRunsTable.bonusCredit}), 0)::int`,
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
          bonusCredit: hexrunnerRunsTable.bonusCredit,
          totalCredit: sql<number>`${hexrunnerRunsTable.hexCount} + ${hexrunnerRunsTable.bonusCredit}`,
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
      db
        .select({ endedAt: hexrunnerRunsTable.endedAt })
        .from(hexrunnerRunsTable)
        .where(eq(hexrunnerRunsTable.userId, user.id)),
      db
        .select({
          claimed: sql<number>`coalesce(sum(${hexrunnerRunsTable.hexCount}), 0)::int`,
          bonus: sql<number>`coalesce(sum(${hexrunnerRunsTable.bonusCredit}), 0)::int`,
        })
        .from(hexrunnerRunsTable)
        .where(
          and(
            eq(hexrunnerRunsTable.userId, user.id),
            gte(hexrunnerRunsTable.endedAt, utcDayStart),
            lt(hexrunnerRunsTable.endedAt, utcDayEnd),
          ),
        ),
      db
        .select({
          h3Index: hexrunnerTakeoverEventsTable.h3Index,
          happenedAt: hexrunnerTakeoverEventsTable.occurredAt,
        })
        .from(hexrunnerTakeoverEventsTable)
        .where(eq(hexrunnerTakeoverEventsTable.previousOwnerId, user.id))
        .orderBy(desc(hexrunnerTakeoverEventsTable.occurredAt))
        .limit(3),
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
          currentStreak: calculateRunStreak(
            runDates.map((saved) => saved.endedAt),
          ),
          todayClaimedHexes: Number(todayUsage?.claimed ?? 0),
          dailyBudget: dailyBudgetForActivity(
            isFitnessTier(user.activityLevel) ? user.activityLevel : "casual",
          ),
          todayBonusCredits: Number(todayUsage?.bonus ?? 0),
          dailyBonusCap: 5,
        },
        recentRuns,
        baseline:
          user.city && user.activityLevel && user.baselineCompletedAt
            ? {
                displayName: safeDisplayName(user.id, user.displayName),
                city: user.city,
                activityLevel: user.activityLevel,
                completedAt: user.baselineCompletedAt,
              }
            : null,
        takeoverAlerts,
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