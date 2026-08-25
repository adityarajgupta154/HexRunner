import { Router, type IRouter } from "express";
import { SaveRunBody, SaveRunResponse } from "@workspace/api-zod";
import { eq, inArray, sql } from "drizzle-orm";
import { latLngToCell } from "h3-js";
import {
  db,
  hexrunnerHexOwnershipTable,
  hexrunnerRunPointsTable,
  hexrunnerRunsTable,
  hexrunnerUsersTable,
} from "@workspace/db";

const router: IRouter = Router();
const RUN_POINT_INSERT_BATCH_SIZE = 5_000;
const H3_RESOLUTION = 9;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

router.post("/runs", async (req, res) => {
  const parsed = SaveRunBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid run data." });
    return;
  }

  const run = parsed.data;
  const uniqueClaimedHexes = new Set(run.claimedHexes);
  const pathHexes = new Set(
    run.points.map((point) =>
      latLngToCell(point.lat, point.lng, H3_RESOLUTION),
    ),
  );
  const claimedHexesMatchPath =
    pathHexes.size === uniqueClaimedHexes.size &&
    [...pathHexes].every((h3Index) => uniqueClaimedHexes.has(h3Index));

  if (
    run.endedAt.getTime() < run.startedAt.getTime() ||
    run.endedAt.getTime() > Date.now() + MAX_CLOCK_SKEW_MS ||
    uniqueClaimedHexes.size !== run.claimedHexes.length ||
    !claimedHexesMatchPath
  ) {
    res.status(400).json({ error: "Invalid run data." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const now = new Date();

      await tx
        .insert(hexrunnerUsersTable)
        .values({
          id: run.userId,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: hexrunnerUsersTable.id,
          set: { lastSeenAt: now },
        });

      const existingOwnership =
        run.claimedHexes.length === 0
          ? []
          : await tx
              .select({
                h3Index: hexrunnerHexOwnershipTable.h3Index,
                ownerId: hexrunnerHexOwnershipTable.ownerId,
              })
              .from(hexrunnerHexOwnershipTable)
              .where(
                inArray(
                  hexrunnerHexOwnershipTable.h3Index,
                  run.claimedHexes,
                ),
              );
      const existingOwnerByHex = new Map(
        existingOwnership.map((ownership) => [
          ownership.h3Index,
          ownership.ownerId,
        ]),
      );
      const newHexCount = run.claimedHexes.reduce(
        (count, h3Index) =>
          count + (existingOwnerByHex.has(h3Index) ? 0 : 1),
        0,
      );
      const stolenHexCount = run.claimedHexes.reduce(
        (count, h3Index) => {
          const ownerId = existingOwnerByHex.get(h3Index);
          return count + (ownerId && ownerId !== run.userId ? 1 : 0);
        },
        0,
      );
      const pointAccuracies = run.points.flatMap((point) =>
        point.accuracyMeters === undefined ? [] : [point.accuracyMeters],
      );
      const pointSpeeds = run.points.flatMap((point) =>
        point.speedMetersPerSecond === undefined
          ? []
          : [point.speedMetersPerSecond],
      );

      const insertedRuns = await tx
        .insert(hexrunnerRunsTable)
        .values({
          id: run.clientRunId,
          userId: run.userId,
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
          hexCount: run.claimedHexes.length,
          claimedHexes: run.claimedHexes,
          newHexCount,
          stolenHexCount,
          flaggedSuspicious:
            run.antiSpoof?.flaggedSuspicious ?? false,
          suspiciousReason: run.antiSpoof?.reason ?? null,
          mockLocationDetected:
            run.antiSpoof?.mockLocationDetected ??
            (run.points.some((point) => point.mocked) || null),
          averageAccuracyMeters:
            run.antiSpoof?.averageAccuracyMeters ??
            (pointAccuracies.length > 0
              ? pointAccuracies.reduce((sum, accuracy) => sum + accuracy, 0) /
                pointAccuracies.length
              : null),
          maxSpeedMetersPerSecond:
            run.antiSpoof?.maxSpeedMetersPerSecond ??
            (pointSpeeds.length > 0 ? Math.max(...pointSpeeds) : null),
        })
        .onConflictDoNothing()
        .returning({ id: hexrunnerRunsTable.id });

      if (insertedRuns.length === 0) {
        const [existingRun] = await tx
          .select({
            newHexCount: hexrunnerRunsTable.newHexCount,
            stolenHexCount: hexrunnerRunsTable.stolenHexCount,
            hexCount: hexrunnerRunsTable.hexCount,
            flaggedSuspicious: hexrunnerRunsTable.flaggedSuspicious,
            suspiciousReason: hexrunnerRunsTable.suspiciousReason,
            mockLocationDetected:
              hexrunnerRunsTable.mockLocationDetected,
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

        return { idempotent: true, ...existingRun };
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

      if (run.claimedHexes.length > 0) {
        await tx
          .insert(hexrunnerHexOwnershipTable)
          .values(
            run.claimedHexes.map((h3Index) => ({
              h3Index,
              ownerId: run.userId,
              lastRunId: run.clientRunId,
              claimedAt: now,
            })),
          )
          .onConflictDoUpdate({
            target: hexrunnerHexOwnershipTable.h3Index,
            set: {
              ownerId: run.userId,
              lastRunId: run.clientRunId,
              claimedAt: now,
            },
          });

        await tx
          .update(hexrunnerUsersTable)
          .set({
            totalHexesOwned: sql`${hexrunnerUsersTable.totalHexesOwned} + ${run.claimedHexes.length}`,
          })
          .where(eq(hexrunnerUsersTable.id, run.userId));
      }

      return {
        idempotent: false,
        newHexCount,
        stolenHexCount,
        hexCount: run.claimedHexes.length,
        flaggedSuspicious: run.antiSpoof?.flaggedSuspicious ?? false,
        suspiciousReason: run.antiSpoof?.reason ?? null,
        mockLocationDetected:
          run.antiSpoof?.mockLocationDetected ??
          (run.points.some((point) => point.mocked) || null),
        averageAccuracyMeters:
          run.antiSpoof?.averageAccuracyMeters ??
          (pointAccuracies.length > 0
            ? pointAccuracies.reduce((sum, accuracy) => sum + accuracy, 0) /
              pointAccuracies.length
            : null),
        maxSpeedMetersPerSecond:
          run.antiSpoof?.maxSpeedMetersPerSecond ??
          (pointSpeeds.length > 0 ? Math.max(...pointSpeeds) : null),
      };
    });

    const response = SaveRunResponse.parse({
      runId: run.clientRunId,
      saved: true,
      idempotent: result.idempotent,
      newHexes: result.newHexCount,
      stolenHexes: result.stolenHexCount,
      claimedHexes: result.hexCount,
      antiSpoof: {
        flaggedSuspicious: result.flaggedSuspicious,
        reason: result.suspiciousReason,
        mockLocationDetected: result.mockLocationDetected,
        averageAccuracyMeters: result.averageAccuracyMeters,
        maxSpeedMetersPerSecond: result.maxSpeedMetersPerSecond,
      },
    });

    res.status(result.idempotent ? 200 : 201).json(response);
  } catch (error) {
    req.log.error({ error, runId: run.clientRunId }, "Failed to save run");
    res.status(500).json({ error: "Unable to save this run." });
  }
});

export default router;