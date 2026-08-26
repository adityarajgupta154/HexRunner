import { Router, type IRouter } from "express";
import { SaveRunBody, SaveRunResponse } from "@workspace/api-zod";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  hexrunnerHexOwnershipTable,
  hexrunnerRunPointsTable,
  hexrunnerRunsTable,
  hexrunnerTakeoverEventsTable,
  hexrunnerUsersTable,
} from "@workspace/db";
import { verifyAnonymousCredential } from "../lib/anonymousCredential";
import { getClaimQualitySnapshot } from "../lib/claimQuality";
import { dailyBudgetForActivity } from "../lib/fitnessBudget";
import { calculateRunStreak } from "../lib/runStreak";
import { consumeRateLimit } from "../lib/rateLimit";
import { getPathIntegrity } from "../lib/pathIntegrity";
import { getLoopCapture } from "../lib/loopCapture";
import {
  addEquityContributions,
  EQUITY_DAILY_BONUS_CAP,
  ensureEquityEvaluation,
  equityAreaForHex,
  equityCityForHex,
} from "../lib/equityZones";

const router: IRouter = Router();
const RUN_POINT_INSERT_BATCH_SIZE = 5_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const fitnessTiers = ["beginner", "casual", "regular", "trained"] as const;

function isFitnessTier(value: string | null): value is (typeof fitnessTiers)[number] {
  return value !== null && fitnessTiers.includes(value as (typeof fitnessTiers)[number]);
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

router.post("/runs", async (req, res): Promise<void> => {
  if (!consumeRateLimit("run-save-ip", req.ip ?? "unknown", 60, 60 * 60 * 1_000)) {
    res.status(429).json({ error: "Too many run submissions. Try again later." });
    return;
  }
  const authorization = req.get("authorization");
  const credential =
    authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
  const userId = credential
    ? verifyAnonymousCredential(credential)
    : null;

  if (!userId) {
    res.status(401).json({ error: "A valid device credential is required." });
    return;
  }

  const parsed = SaveRunBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid run data." });
    return;
  }

  const run = parsed.data;
  const uniqueClaimedHexes = new Set(run.claimedHexes);
  const quality = getClaimQualitySnapshot(run.points);
  const pathIntegrity = getPathIntegrity(run.points);
  const loopCapture = pathIntegrity.flaggedSuspicious
    ? { loopDetected: false, interiorHexes: [] }
    : getLoopCapture(run.points);
  const eligiblePathHexes = new Set(quality.eligibleHexes);
  const authoritativeClaimHexes = [
    ...eligiblePathHexes,
    ...loopCapture.interiorHexes.filter((h3Index) => !eligiblePathHexes.has(h3Index)),
  ];
  // Older clients submit dwell-qualified path cells only. A newer client may
  // include the complete server-derivable set, but can never add its own cell.
  const matchesSet = (expected: readonly string[]) =>
    expected.length === uniqueClaimedHexes.size &&
    expected.every((h3Index) => uniqueClaimedHexes.has(h3Index));
  const claimedHexesMatchQuality =
    matchesSet(quality.eligibleHexes) || matchesSet(authoritativeClaimHexes);
  const runWindowMs = run.endedAt.getTime() - run.startedAt.getTime();
  // Pauses are client-reported validation metadata. Persisted elapsed time
  // remains active movement time so pace and credits cannot be inflated by a
  // stopped clock; omitted values retain legacy zero-pause semantics.
  const pausedSeconds = run.pausedSeconds ?? 0;
  const durationMatchesWindow =
    Math.abs(
      runWindowMs - (run.elapsedSeconds + pausedSeconds) * 1_000,
    ) <= 5_000;
  const pointsAreChronological = run.points.every(
    (point, index) =>
      index === 0 || point.timestamp >= run.points[index - 1]!.timestamp,
  );
  const pointsFallWithinRunWindow = run.points.every(
    (point) =>
      point.timestamp >= run.startedAt.getTime() &&
      point.timestamp <= run.endedAt.getTime(),
  );

  if (
    runWindowMs < 0 ||
    run.endedAt.getTime() > Date.now() + MAX_CLOCK_SKEW_MS ||
    !durationMatchesWindow ||
    !pointsAreChronological ||
    !pointsFallWithinRunWindow ||
    uniqueClaimedHexes.size !== run.claimedHexes.length ||
    !claimedHexesMatchQuality
  ) {
    res.status(400).json({ error: "Invalid run data." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const now = new Date();

      if (authoritativeClaimHexes.length > 0) {
        const requestApplicationName = `hexrunner-run:${run.clientRunId}`;
        const lockRows = sql.join(
          authoritativeClaimHexes.map((h3Index) => sql`(${h3Index})`),
          sql`, `,
        );
        await tx.execute(
          sql`SELECT set_config('application_name', ${requestApplicationName}, true)`,
        );
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(hashtextextended(ordered_hex.h3_index, 0))
          FROM (
            SELECT lock_input.h3_index
            FROM (VALUES ${lockRows}) AS lock_input(h3_index)
            ORDER BY lock_input.h3_index
          ) AS ordered_hex
        `);
      }

      await tx
        .insert(hexrunnerUsersTable)
        .values({
          id: userId,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: hexrunnerUsersTable.id,
          set: { lastSeenAt: now },
        });

      const [runner] = await tx
        .select({ activityLevel: hexrunnerUsersTable.activityLevel })
        .from(hexrunnerUsersTable)
        .where(eq(hexrunnerUsersTable.id, userId))
        .limit(1);
      const savedActivityLevel = runner?.activityLevel ?? null;
      const activityLevel: (typeof fitnessTiers)[number] = isFitnessTier(
        savedActivityLevel,
      )
        ? savedActivityLevel
        : "casual";
      const dailyBudget = dailyBudgetForActivity(activityLevel);
      const utcDayStart = startOfUtcDay(run.endedAt);
      const utcDayEnd = new Date(utcDayStart.getTime() + 86_400_000);
      const dailyBudgetLockKey = `hexrunner-budget:${userId}:${utcDayStart
        .toISOString()
        .slice(0, 10)}`;
      // Separate cells can be claimed concurrently, but the daily allowance
      // must have one serialized reader/writer for each runner and UTC day.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${dailyBudgetLockKey}, 0))`,
      );
      const [dailyUsage] = await tx
        .select({
          claimed: sql<number>`coalesce(sum(${hexrunnerRunsTable.hexCount}), 0)`,
          bonus: sql<number>`coalesce(sum(${hexrunnerRunsTable.bonusCredit}), 0)`,
        })
        .from(hexrunnerRunsTable)
        .where(
          and(
            eq(hexrunnerRunsTable.userId, userId),
            gte(hexrunnerRunsTable.endedAt, utcDayStart),
            lt(hexrunnerRunsTable.endedAt, utcDayEnd),
          ),
        );
      const claimedEarlierToday = Number(dailyUsage?.claimed ?? 0);
      const bonusEarlierToday = Number(dailyUsage?.bonus ?? 0);

      const existingOwnership =
        authoritativeClaimHexes.length === 0
          ? []
          : await tx
              .select({
                h3Index: hexrunnerHexOwnershipTable.h3Index,
                ownerId: hexrunnerHexOwnershipTable.ownerId,
                lastRunId: hexrunnerHexOwnershipTable.lastRunId,
              })
              .from(hexrunnerHexOwnershipTable)
              .where(
                inArray(
                  hexrunnerHexOwnershipTable.h3Index,
                  authoritativeClaimHexes,
                ),
              );
      const existingOwnershipByHex = new Map(
        existingOwnership.map((ownership) => [
          ownership.h3Index,
          ownership,
        ]),
      );
      const previousRunIds = [
        ...new Set(existingOwnership.map((ownership) => ownership.lastRunId)),
      ];
      const previousRuns =
        previousRunIds.length === 0
          ? []
          : await tx
              .select({
                id: hexrunnerRunsTable.id,
                endedAt: hexrunnerRunsTable.endedAt,
              })
              .from(hexrunnerRunsTable)
              .where(inArray(hexrunnerRunsTable.id, previousRunIds));
      const previousRunEndedAt = new Map(
        previousRuns.map((previousRun) => [
          previousRun.id,
          previousRun.endedAt,
        ]),
      );
      const claimableHexes = authoritativeClaimHexes.filter((h3Index) => {
        const ownership = existingOwnershipByHex.get(h3Index);
        if (!ownership) return true;

        const currentClaimEndedAt = previousRunEndedAt.get(
          ownership.lastRunId,
        );
        return (
          currentClaimEndedAt !== undefined &&
          run.endedAt.getTime() > currentClaimEndedAt.getTime()
        );
      });
      const allowedClaimableHexes = claimableHexes.slice(
        0,
        Math.max(0, dailyBudget - claimedEarlierToday),
      );
      const budgetSkippedHexCount =
        claimableHexes.length - allowedClaimableHexes.length;
      const newHexCount = allowedClaimableHexes.reduce(
        (count, h3Index) =>
          count + (existingOwnershipByHex.has(h3Index) ? 0 : 1),
        0,
      );
      const stolenHexCount = allowedClaimableHexes.reduce(
        (count, h3Index) => {
          const ownerId = existingOwnershipByHex.get(h3Index)?.ownerId;
          return count + (ownerId && ownerId !== userId ? 1 : 0);
        },
        0,
      );
      const pointAccuracies = run.points.flatMap((point) =>
        point.accuracyMeters === undefined ? [] : [point.accuracyMeters],
      );
      // Mock evidence comes from the recorded points, never from a client
      // summary field. A suspicious run cannot earn or train equity rewards.
      const mockLocationDetected = run.points.some((point) => point.mocked);
      const flaggedSuspicious = (run.antiSpoof?.flaggedSuspicious ?? false) || pathIntegrity.flaggedSuspicious;
      const equityEligible = !flaggedSuspicious && !mockLocationDetected;
      const coldClaimedHexes = new Set<string>();
      if (equityEligible && allowedClaimableHexes.length > 0) {
        const evaluationDay = utcDayStart;
        const cities = [...new Set(allowedClaimableHexes.map(equityCityForHex))].sort();
        const tiersByCity = new Map<string, Map<string, "cold" | "medium" | "hot">>();
        // Sorted city keys ensure multiple-area runs acquire snapshot locks in
        // one deterministic order, separate from the already sorted hex locks.
        for (const city of cities) {
          tiersByCity.set(city, (await ensureEquityEvaluation(tx, city, evaluationDay)).tiers);
        }
        for (const hex of allowedClaimableHexes) {
          if (tiersByCity.get(equityCityForHex(hex))?.get(equityAreaForHex(hex)) === "cold") {
            coldClaimedHexes.add(hex);
          }
        }
      }
      const bonusCredit = equityEligible
        ? Math.min(coldClaimedHexes.size, Math.max(0, EQUITY_DAILY_BONUS_CAP - bonusEarlierToday))
        : 0;

      const insertedRuns = await tx
        .insert(hexrunnerRunsTable)
        .values({
          id: run.clientRunId,
          userId,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          elapsedSeconds: run.elapsedSeconds,
          distanceKm: run.distanceKm,
          paceSecondsPerKm:
            run.distanceKm >= 0.01
              ? run.elapsedSeconds / run.distanceKm
              : null,
          avgPaceMinPerKm:
            run.distanceKm >= 0.01
              ? run.elapsedSeconds / 60 / run.distanceKm
              : null,
          pointCount: run.points.length,
          hexCount: allowedClaimableHexes.length,
          claimedHexes: allowedClaimableHexes,
          newHexCount,
          stolenHexCount,
          budgetSkippedHexCount,
          dailyBudget,
          bonusCredit,
          coldZoneHexCount: coldClaimedHexes.size,
          dailyBonusCap: EQUITY_DAILY_BONUS_CAP,
          flaggedSuspicious,
          suspiciousReason:
            pathIntegrity.suspiciousReason ??
            (run.antiSpoof?.flaggedSuspicious
              ? run.antiSpoof.reason ?? "Client integrity checks flagged this run."
              : null),
          mockLocationDetected: mockLocationDetected || null,
          averageAccuracyMeters:
            pointAccuracies.length > 0
              ? pointAccuracies.reduce((sum, accuracy) => sum + accuracy, 0) /
                pointAccuracies.length
              : null,
          maxSpeedMetersPerSecond: pathIntegrity.maxSpeedMetersPerSecond,
        })
        .onConflictDoNothing()
        .returning({ id: hexrunnerRunsTable.id });

      if (insertedRuns.length === 0) {
        const [existingRun] = await tx
          .select({
            userId: hexrunnerRunsTable.userId,
            newHexCount: hexrunnerRunsTable.newHexCount,
            stolenHexCount: hexrunnerRunsTable.stolenHexCount,
            hexCount: hexrunnerRunsTable.hexCount,
            budgetSkippedHexCount: hexrunnerRunsTable.budgetSkippedHexCount,
            dailyBudget: hexrunnerRunsTable.dailyBudget,
            bonusCredit: hexrunnerRunsTable.bonusCredit,
            coldZoneHexCount: hexrunnerRunsTable.coldZoneHexCount,
            dailyBonusCap: hexrunnerRunsTable.dailyBonusCap,
            flaggedSuspicious: hexrunnerRunsTable.flaggedSuspicious,
            suspiciousReason: hexrunnerRunsTable.suspiciousReason,
          mockLocationDetected: hexrunnerRunsTable.mockLocationDetected,
            averageAccuracyMeters:
              hexrunnerRunsTable.averageAccuracyMeters,
            maxSpeedMetersPerSecond:
              hexrunnerRunsTable.maxSpeedMetersPerSecond,
          })
          .from(hexrunnerRunsTable)
          .where(eq(hexrunnerRunsTable.id, run.clientRunId))
          .limit(1);

        if (!existingRun) {
          throw new Error("Conflicting run could not be loaded.");
        }
        if (existingRun.userId !== userId) {
          throw new Error("A run with this client ID belongs to another runner.");
        }

        const [currentDailyUsage] = await tx
          .select({
            claimed: sql<number>`coalesce(sum(${hexrunnerRunsTable.hexCount}), 0)`,
            bonus: sql<number>`coalesce(sum(${hexrunnerRunsTable.bonusCredit}), 0)`,
          })
          .from(hexrunnerRunsTable)
          .where(
            and(
              eq(hexrunnerRunsTable.userId, userId),
              gte(hexrunnerRunsTable.endedAt, utcDayStart),
              lt(hexrunnerRunsTable.endedAt, utcDayEnd),
            ),
          );
        const runDates = await tx
          .select({ endedAt: hexrunnerRunsTable.endedAt })
          .from(hexrunnerRunsTable)
          .where(eq(hexrunnerRunsTable.userId, userId));

        return {
          idempotent: true,
          ...existingRun,
          dailyClaimedHexes: Number(currentDailyUsage?.claimed ?? 0),
          dailyBonusCredit: Number(currentDailyUsage?.bonus ?? 0),
          currentStreak: calculateRunStreak(runDates.map((saved) => saved.endedAt)),
        };
      }

      for (
        let offset = 0;
        offset < run.points.length;
        offset += RUN_POINT_INSERT_BATCH_SIZE
      ) {
        const batch = run.points.slice(
          offset,
          offset + RUN_POINT_INSERT_BATCH_SIZE,
        );

        await tx.insert(hexrunnerRunPointsTable).values(
          batch.map((point, batchIndex) => ({
            runId: run.clientRunId,
            sequence: offset + batchIndex,
            latitude: point.lat,
            longitude: point.lng,
            recordedAt: new Date(point.timestamp),
          })),
        );
      }

      if (equityEligible && utcDayStart.getTime() === startOfUtcDay(now).getTime()) {
        await addEquityContributions(
          tx,
          run.clientRunId,
          userId,
          // Contributions describe validated traversal, not territory awards.
          // A daily ownership budget can withhold claims but must not erase
          // legitimate aggregate activity from the equity baseline.
           quality.eligibleHexes,
          utcDayStart,
          now,
        );
      }

      const takeoverEvents = allowedClaimableHexes.flatMap((h3Index) => {
        const previousOwnerId =
          existingOwnershipByHex.get(h3Index)?.ownerId ?? null;
        return previousOwnerId && previousOwnerId !== userId
          ? [
              {
                runId: run.clientRunId,
                h3Index,
                previousOwnerId,
                newOwnerId: userId,
                occurredAt: now,
              },
            ]
          : [];
      });

      if (takeoverEvents.length > 0) {
        await tx.insert(hexrunnerTakeoverEventsTable).values(takeoverEvents);
      }

      if (allowedClaimableHexes.length > 0) {
        await tx
          .insert(hexrunnerHexOwnershipTable)
          .values(
            allowedClaimableHexes.map((h3Index) => ({
              h3Index,
              ownerId: userId,
              lastRunId: run.clientRunId,
              claimedAt: now,
            })),
          )
          .onConflictDoUpdate({
            target: hexrunnerHexOwnershipTable.h3Index,
            set: {
              ownerId: userId,
              lastRunId: run.clientRunId,
              claimedAt: now,
            },
          });
      }

      if (allowedClaimableHexes.length > 0) {
        await tx
          .update(hexrunnerUsersTable)
          .set({
            // Product contract: this is a cumulative submitted-claims metric,
            // incremented once per unique run, not a live ownership count.
            totalHexesOwned: sql`${hexrunnerUsersTable.totalHexesOwned} + ${allowedClaimableHexes.length}`,
          })
          .where(eq(hexrunnerUsersTable.id, userId));
      }

      const runDates = await tx
        .select({ endedAt: hexrunnerRunsTable.endedAt })
        .from(hexrunnerRunsTable)
        .where(eq(hexrunnerRunsTable.userId, userId));

      return {
        idempotent: false,
        newHexCount,
        stolenHexCount,
        hexCount: allowedClaimableHexes.length,
        budgetSkippedHexCount,
        dailyBudget,
        bonusCredit,
        coldZoneHexCount: coldClaimedHexes.size,
        dailyBonusCap: EQUITY_DAILY_BONUS_CAP,
        dailyBonusCredit: bonusEarlierToday + bonusCredit,
        dailyClaimedHexes: claimedEarlierToday + allowedClaimableHexes.length,
        currentStreak: calculateRunStreak(runDates.map((saved) => saved.endedAt)),
        flaggedSuspicious,
        suspiciousReason:
          pathIntegrity.suspiciousReason ??
          (run.antiSpoof?.flaggedSuspicious
            ? run.antiSpoof.reason ?? "Client integrity checks flagged this run."
            : null),
        mockLocationDetected: mockLocationDetected || null,
        averageAccuracyMeters:
          pointAccuracies.length > 0
            ? pointAccuracies.reduce((sum, accuracy) => sum + accuracy, 0) /
              pointAccuracies.length
            : null,
        maxSpeedMetersPerSecond: pathIntegrity.maxSpeedMetersPerSecond,
      };
    });

    const response = SaveRunResponse.parse({
      runId: run.clientRunId,
      saved: true,
      idempotent: result.idempotent,
      newHexes: result.newHexCount,
      stolenHexes: result.stolenHexCount,
      claimedHexes: result.hexCount,
      budgetSkippedHexes: result.budgetSkippedHexCount,
      dailyClaimedHexes: result.dailyClaimedHexes,
      dailyBudget: result.dailyBudget,
      baseCredit: result.hexCount,
      bonusCredit: result.bonusCredit,
      totalCredit: result.hexCount + result.bonusCredit,
      coldZoneHexes: result.coldZoneHexCount,
      dailyBonusCredit: result.dailyBonusCredit,
      dailyBonusCap: result.dailyBonusCap,
      currentStreak: result.currentStreak,
      antiSpoof: {
        flaggedSuspicious: result.flaggedSuspicious,
        reason: result.suspiciousReason,
        mockLocationDetected: result.mockLocationDetected,
        averageAccuracyMeters: result.averageAccuracyMeters,
        maxSpeedMetersPerSecond: result.maxSpeedMetersPerSecond,
      },
      loopDetected: loopCapture.loopDetected,
      interiorHexes: loopCapture.interiorHexes.length,
    });

    res.status(result.idempotent ? 200 : 201).json(response);
  } catch (error) {
    req.log.error({ error, runId: run.clientRunId }, "Failed to save run");
    res.status(500).json({ error: "Unable to save this run." });
  }
});

export default router;
