import {
  db,
  hexrunnerContestEventsTable,
  hexrunnerContestOccupancyTable,
  hexrunnerInteractionGrantsTable,
  hexrunnerWavesTable,
} from "@workspace/db";
import { lte, sql } from "drizzle-orm";
import { logger } from "./logger";

const CLEANUP_INTERVAL_MS = 60_000;
const WAVE_IDEMPOTENCY_RETENTION_MS = 5 * 60_000;
let stopActiveWorker: (() => void) | null = null;

export async function cleanupExpiredInteractions(now = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ acquired: boolean }>(sql`
      SELECT pg_try_advisory_xact_lock(
        hashtextextended('hexrunner:interaction-cleanup', 0)
      ) AS acquired
    `);
    if (!lockResult.rows[0]?.acquired) return false;

    await tx
      .delete(hexrunnerInteractionGrantsTable)
      .where(lte(hexrunnerInteractionGrantsTable.expiresAt, now));
    await tx
      .delete(hexrunnerContestOccupancyTable)
      .where(lte(hexrunnerContestOccupancyTable.expiresAt, now));
    await tx
      .delete(hexrunnerContestEventsTable)
      .where(lte(hexrunnerContestEventsTable.expiresAt, now));
    await tx
      .delete(hexrunnerWavesTable)
      .where(
        lte(
          hexrunnerWavesTable.expiresAt,
          new Date(now.getTime() - WAVE_IDEMPOTENCY_RETENTION_MS),
        ),
      );
    return true;
  });
}

export function startInteractionCleanupWorker(): () => void {
  if (stopActiveWorker) return stopActiveWorker;

  let running = false;
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      await cleanupExpiredInteractions();
    } catch (error) {
      // Never include row values or SQL parameters in cleanup logs.
      logger.error(
        { errorType: error instanceof Error ? error.name : "UnknownError" },
        "Live interaction cleanup failed",
      );
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), CLEANUP_INTERVAL_MS);
  timer.unref();
  void tick();

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    if (stopActiveWorker === stop) stopActiveWorker = null;
  };
  stopActiveWorker = stop;
  return stop;
}