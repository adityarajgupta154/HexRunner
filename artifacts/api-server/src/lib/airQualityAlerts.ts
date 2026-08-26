import { randomUUID, createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  hexrunnerAirQualityAlertDeliveriesTable,
} from "@workspace/db";
import type { Logger } from "pino";
import type { AirQualityOutageSignal } from "./airQuality";

const ALERT_TIMEOUT_MS = 5_000;
export const AIR_QUALITY_ALERT_MAX_ATTEMPTS = 8;
export const AIR_QUALITY_ALERT_RETRY_BASE_MS = 5_000;
export const AIR_QUALITY_ALERT_RETRY_MAX_MS = 5 * 60_000;
export const AIR_QUALITY_ALERT_LEASE_MS = 30_000;
export const AIR_QUALITY_ALERT_ORPHAN_GRACE_MS = 5 * 60_000;
const AIR_QUALITY_ALERT_POLL_MS = 1_000;

type AlertableAirQualitySignal = Extract<
  AirQualityOutageSignal,
  {
    event:
      | "air_quality_outage_sustained"
      | "air_quality_upstream_recovered";
  }
>;

export type AirQualityOperatorNotification = {
  notificationId: string;
  alertType: "air_quality_upstream_outage";
  status: "triggered" | "resolved";
  outageStartedAt: string;
  outageDurationMs: number;
  upstreamFailureCount: number;
  staleFallbackCount: number;
  occurredAt: string;
};

type AirQualityAlertDelivery = (
  notification: AirQualityOperatorNotification,
) => Promise<void>;

export type ClaimedAirQualityAlert = {
  notification: AirQualityOperatorNotification;
  attemptCount: number;
  lockToken: string;
};

export type AirQualityAlertFailureResult = {
  applied: boolean;
  exhausted: boolean;
  failedAttemptCount: number;
};

export interface AirQualityAlertQueue {
  enqueue(notification: AirQualityOperatorNotification): Promise<void>;
  claimNext(now: Date): Promise<ClaimedAirQualityAlert | null>;
  markDelivered(
    claim: ClaimedAirQualityAlert,
    deliveredAt: Date,
  ): Promise<boolean>;
  markFailed(
    claim: ClaimedAirQualityAlert,
    errorMessage: string,
    failedAt: Date,
  ): Promise<AirQualityAlertFailureResult>;
}

type AirQualityOperatorNotifierOptions = {
  logger: Logger;
  deliver?: AirQualityAlertDelivery;
  queue?: AirQualityAlertQueue;
  now?: () => Date;
  autoStart?: boolean;
  pollIntervalMs?: number;
};

export function airQualityAlertRetryDelayMs(failedAttemptCount: number): number {
  const exponent = Math.max(0, failedAttemptCount - 1);
  return Math.min(
    AIR_QUALITY_ALERT_RETRY_MAX_MS,
    AIR_QUALITY_ALERT_RETRY_BASE_MS * 2 ** exponent,
  );
}

export function airQualityNotificationId(
  status: AirQualityOperatorNotification["status"],
  outageStartedAt: string,
): string {
  return createHash("sha256")
    .update(`hexrunner-aqi-alert-v1\u0000${outageStartedAt}\u0000${status}`)
    .digest("hex");
}

export class PostgresAirQualityAlertQueue implements AirQualityAlertQueue {
  async enqueue(notification: AirQualityOperatorNotification): Promise<void> {
    await db.transaction(async (tx) => {
      const outageLockKey = `hexrunner-aqi-alert:${notification.outageStartedAt}`;
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${outageLockKey}, 0))`,
      );
      await tx
        .insert(hexrunnerAirQualityAlertDeliveriesTable)
        .values({
          id: notification.notificationId,
          status: notification.status,
          outageStartedAt: new Date(notification.outageStartedAt),
          outageDurationMs: notification.outageDurationMs,
          upstreamFailureCount: notification.upstreamFailureCount,
          staleFallbackCount: notification.staleFallbackCount,
          occurredAt: new Date(notification.occurredAt),
        })
        .onConflictDoNothing();

      if (notification.status === "triggered") {
        await tx.execute(sql`
          UPDATE hexrunner_air_quality_alert_deliveries
          SET discarded_at = NULL,
              last_error = NULL,
              updated_at = now()
          WHERE outage_started_at = ${new Date(notification.outageStartedAt)}
            AND status = 'resolved'
            AND delivered_at IS NULL
            AND exhausted_at IS NULL
            AND discarded_at IS NOT NULL
        `);
      } else {
        await tx.execute(sql`
          UPDATE hexrunner_air_quality_alert_deliveries AS resolution
          SET exhausted_at = trigger.exhausted_at,
              last_error = 'Matching trigger delivery exhausted before resolution.',
              updated_at = now()
          FROM hexrunner_air_quality_alert_deliveries AS trigger
          WHERE resolution.id = ${notification.notificationId}
            AND trigger.outage_started_at = resolution.outage_started_at
            AND trigger.status = 'triggered'
            AND trigger.delivered_at IS NULL
            AND trigger.exhausted_at IS NOT NULL
            AND resolution.delivered_at IS NULL
            AND resolution.exhausted_at IS NULL
        `);
      }
    });
  }

  async claimNext(now: Date): Promise<ClaimedAirQualityAlert | null> {
    return db.transaction(async (tx) => {
      const orphanResult = await tx.execute(sql`
        SELECT resolution.id, resolution.outage_started_at
        FROM hexrunner_air_quality_alert_deliveries AS resolution
        WHERE resolution.status = 'resolved'
          AND resolution.delivered_at IS NULL
          AND resolution.exhausted_at IS NULL
          AND resolution.discarded_at IS NULL
          AND resolution.created_at <= ${new Date(now.getTime() - AIR_QUALITY_ALERT_ORPHAN_GRACE_MS)}
          AND NOT EXISTS (
            SELECT 1
            FROM hexrunner_air_quality_alert_deliveries AS trigger
            WHERE trigger.outage_started_at = resolution.outage_started_at
              AND trigger.status = 'triggered'
          )
        ORDER BY resolution.created_at ASC
        LIMIT 1
      `);
      const orphan = orphanResult.rows[0] as
        | { id: string; outage_started_at: Date | string }
        | undefined;
      if (orphan) {
        const outageStartedAt = new Date(orphan.outage_started_at);
        const outageLockKey =
          `hexrunner-aqi-alert:${outageStartedAt.toISOString()}`;
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${outageLockKey}, 0))`,
        );
        // The lock is shared with trigger insertion. This new statement gets a
        // fresh READ COMMITTED snapshot after any earlier trigger transaction.
        await tx.execute(sql`
          UPDATE hexrunner_air_quality_alert_deliveries AS resolution
          SET discarded_at = ${now},
              last_error = 'No matching sustained trigger was observed.',
              updated_at = ${now}
          WHERE resolution.id = ${orphan.id}
            AND resolution.delivered_at IS NULL
            AND resolution.exhausted_at IS NULL
            AND resolution.discarded_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM hexrunner_air_quality_alert_deliveries AS trigger
              WHERE trigger.outage_started_at = ${outageStartedAt}
                AND trigger.status = 'triggered'
            )
        `);
      }
      const result = await tx.execute(sql`
        SELECT
          queued.id,
          queued.status,
          queued.outage_started_at,
          queued.outage_duration_ms,
          queued.upstream_failure_count,
          queued.stale_fallback_count,
          queued.occurred_at,
          queued.attempt_count
        FROM hexrunner_air_quality_alert_deliveries AS queued
        WHERE queued.delivered_at IS NULL
          AND queued.exhausted_at IS NULL
          AND queued.discarded_at IS NULL
          AND queued.next_attempt_at <= ${now}
          AND (queued.locked_until IS NULL OR queued.locked_until <= ${now})
          AND (
            queued.status = 'triggered'
            OR EXISTS (
              SELECT 1
              FROM hexrunner_air_quality_alert_deliveries AS trigger
              WHERE trigger.outage_started_at = queued.outage_started_at
                AND trigger.status = 'triggered'
                AND trigger.delivered_at IS NOT NULL
            )
          )
        ORDER BY
          queued.outage_started_at ASC,
          CASE queued.status WHEN 'triggered' THEN 0 ELSE 1 END ASC,
          queued.created_at ASC
        FOR UPDATE OF queued SKIP LOCKED
        LIMIT 1
      `);
      const row = result.rows[0] as
        | {
            id: string;
            status: "triggered" | "resolved";
            outage_started_at: Date | string;
            outage_duration_ms: string | number;
            upstream_failure_count: number;
            stale_fallback_count: number;
            occurred_at: Date | string;
            attempt_count: number;
          }
        | undefined;
      if (!row) return null;

      const lockToken = randomUUID();
      await tx
        .update(hexrunnerAirQualityAlertDeliveriesTable)
        .set({
          lockToken,
          lockedUntil: new Date(now.getTime() + AIR_QUALITY_ALERT_LEASE_MS),
          updatedAt: now,
        })
        .where(eq(hexrunnerAirQualityAlertDeliveriesTable.id, row.id));

      return {
        notification: {
          notificationId: row.id,
          alertType: "air_quality_upstream_outage",
          status: row.status,
          outageStartedAt: new Date(row.outage_started_at).toISOString(),
          outageDurationMs: Number(row.outage_duration_ms),
          upstreamFailureCount: row.upstream_failure_count,
          staleFallbackCount: row.stale_fallback_count,
          occurredAt: new Date(row.occurred_at).toISOString(),
        },
        attemptCount: row.attempt_count,
        lockToken,
      };
    });
  }

  async markDelivered(
    claim: ClaimedAirQualityAlert,
    deliveredAt: Date,
  ): Promise<boolean> {
    const updated = await db
      .update(hexrunnerAirQualityAlertDeliveriesTable)
      .set({
        deliveredAt,
        lockToken: null,
        lockedUntil: null,
        lastError: null,
        updatedAt: deliveredAt,
      })
      .where(
        and(
          eq(
            hexrunnerAirQualityAlertDeliveriesTable.id,
            claim.notification.notificationId,
          ),
          eq(hexrunnerAirQualityAlertDeliveriesTable.lockToken, claim.lockToken),
          isNull(hexrunnerAirQualityAlertDeliveriesTable.exhaustedAt),
          isNull(hexrunnerAirQualityAlertDeliveriesTable.discardedAt),
        ),
      )
      .returning({ id: hexrunnerAirQualityAlertDeliveriesTable.id });
    return updated.length === 1;
  }

  async markFailed(
    claim: ClaimedAirQualityAlert,
    errorMessage: string,
    failedAt: Date,
  ): Promise<AirQualityAlertFailureResult> {
    const failedAttemptCount = claim.attemptCount + 1;
    const exhausted = failedAttemptCount >= AIR_QUALITY_ALERT_MAX_ATTEMPTS;
    const applied = await db.transaction(async (tx) => {
      const updated = await tx
        .update(hexrunnerAirQualityAlertDeliveriesTable)
        .set({
          attemptCount: failedAttemptCount,
          nextAttemptAt: new Date(
            failedAt.getTime() +
              airQualityAlertRetryDelayMs(failedAttemptCount),
          ),
          lockToken: null,
          lockedUntil: null,
          exhaustedAt: exhausted ? failedAt : null,
          lastError: errorMessage.slice(0, 500),
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(
              hexrunnerAirQualityAlertDeliveriesTable.id,
              claim.notification.notificationId,
            ),
            eq(
              hexrunnerAirQualityAlertDeliveriesTable.lockToken,
              claim.lockToken,
            ),
            isNull(hexrunnerAirQualityAlertDeliveriesTable.deliveredAt),
            isNull(hexrunnerAirQualityAlertDeliveriesTable.exhaustedAt),
            isNull(hexrunnerAirQualityAlertDeliveriesTable.discardedAt),
          ),
        )
        .returning({ id: hexrunnerAirQualityAlertDeliveriesTable.id });

      if (
        updated.length === 1 &&
        exhausted &&
        claim.notification.status === "triggered"
      ) {
        await tx.execute(sql`
          UPDATE hexrunner_air_quality_alert_deliveries
          SET exhausted_at = ${failedAt},
              last_error = 'Matching trigger delivery exhausted before resolution.',
              updated_at = ${failedAt}
          WHERE outage_started_at = ${new Date(claim.notification.outageStartedAt)}
            AND status = 'resolved'
            AND delivered_at IS NULL
            AND exhausted_at IS NULL
        `);
      }
      return updated.length === 1;
    });
    return {
      applied,
      exhausted: applied && exhausted,
      failedAttemptCount,
    };
  }
}

export class AirQualityOperatorNotifier {
  private deliveryQueue = Promise.resolve();
  private persistenceQueue = Promise.resolve();
  private workerPromise: Promise<void> | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  private activeAlertStartedAt: string | undefined;

  constructor(private readonly options: AirQualityOperatorNotifierOptions) {
    if (options.queue && options.autoStart !== false) {
      this.pollTimer = setInterval(() => {
        void this.processDue();
      }, options.pollIntervalMs ?? AIR_QUALITY_ALERT_POLL_MS);
      this.pollTimer.unref();
      void this.processDue();
    }
  }

  record(signal: AirQualityOutageSignal): void {
    if (signal.event === "air_quality_outage_sustained") {
      if (this.activeAlertStartedAt === signal.outageStartedAt) return;
      this.activeAlertStartedAt = signal.outageStartedAt;
      this.enqueue(signal);
      return;
    }

    if (
      signal.event === "air_quality_upstream_recovered" &&
      this.options.queue
    ) {
      this.activeAlertStartedAt = undefined;
      this.enqueue(signal);
      return;
    }

    if (
      signal.event === "air_quality_upstream_recovered" &&
      this.activeAlertStartedAt === signal.outageStartedAt
    ) {
      this.activeAlertStartedAt = undefined;
      this.enqueue(signal);
    }
  }

  waitForIdle(): Promise<void> {
    return this.waitUntilIdle();
  }

  private enqueue(signal: AlertableAirQualitySignal): void {
    const notification = toOperatorNotification(signal);
    if (this.options.queue) {
      this.persistenceQueue = this.persistenceQueue.then(async () => {
        try {
          await this.options.queue!.enqueue(notification);
          void this.processDue();
        } catch (error) {
          this.options.logger.error(
            {
              err: error,
              notificationId: notification.notificationId,
              alertType: notification.alertType,
              alertStatus: notification.status,
              outageStartedAt: notification.outageStartedAt,
            },
            "Failed to persist air-quality operator notification",
          );
        }
      });
      return;
    }

    this.deliveryQueue = this.deliveryQueue.then(async () => {
      try {
        if (!this.options.deliver) {
          throw new Error("AQI operator alert webhook is not configured.");
        }
        await this.options.deliver(notification);
        this.options.logger.info(
          {
            alertType: notification.alertType,
            alertStatus: notification.status,
            outageStartedAt: notification.outageStartedAt,
            outageDurationMs: notification.outageDurationMs,
            upstreamFailureCount: notification.upstreamFailureCount,
            staleFallbackCount: notification.staleFallbackCount,
          },
          "Delivered air-quality operator notification",
        );
      } catch (error) {
        this.options.logger.error(
          {
            err: error,
            alertType: notification.alertType,
            alertStatus: notification.status,
            outageStartedAt: notification.outageStartedAt,
            outageDurationMs: notification.outageDurationMs,
            upstreamFailureCount: notification.upstreamFailureCount,
            staleFallbackCount: notification.staleFallbackCount,
          },
          "Failed to deliver air-quality operator notification",
        );
      }
    });
  }

  async processDue(): Promise<void> {
    if (!this.options.queue) return;
    if (!this.workerPromise) {
      this.workerPromise = this.drainDue().finally(() => {
        this.workerPromise = undefined;
      });
    }
    await this.workerPromise;
  }

  dispose(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  private async waitUntilIdle(): Promise<void> {
    await this.persistenceQueue;
    await this.processDue();
    await this.workerPromise;
    await this.deliveryQueue;
  }

  private async drainDue(): Promise<void> {
    const queue = this.options.queue;
    if (!queue) return;
    try {
      while (true) {
        const claim = await queue.claimNext(this.now());
        if (!claim) return;
        const notification = claim.notification;
        try {
          if (!this.options.deliver) {
            throw new Error("AQI operator alert webhook is not configured.");
          }
          await this.options.deliver(notification);
          const deliveredAt = this.now();
          const applied = await queue.markDelivered(claim, deliveredAt);
          if (!applied) {
            this.options.logger.warn(
              {
                notificationId: notification.notificationId,
                alertStatus: notification.status,
                outageStartedAt: notification.outageStartedAt,
              },
              "Ignored delivery completion after air-quality alert lease changed",
            );
            continue;
          }
          this.options.logger.info(
            {
              notificationId: notification.notificationId,
              alertType: notification.alertType,
              alertStatus: notification.status,
              outageStartedAt: notification.outageStartedAt,
              outageDurationMs: notification.outageDurationMs,
              upstreamFailureCount: notification.upstreamFailureCount,
              staleFallbackCount: notification.staleFallbackCount,
            },
            "Delivered queued air-quality operator notification",
          );
        } catch (error) {
          const failedAt = this.now();
          const failure = await queue.markFailed(
            claim,
            deliveryErrorMessage(error),
            failedAt,
          );
          if (!failure.applied) {
            this.options.logger.warn(
              {
                notificationId: notification.notificationId,
                alertStatus: notification.status,
                outageStartedAt: notification.outageStartedAt,
              },
              "Ignored delivery failure after air-quality alert lease changed",
            );
            continue;
          }
          const context = {
            err: error,
            notificationId: notification.notificationId,
            alertType: notification.alertType,
            alertStatus: notification.status,
            outageStartedAt: notification.outageStartedAt,
            attemptCount: failure.failedAttemptCount,
            maxAttempts: AIR_QUALITY_ALERT_MAX_ATTEMPTS,
            ...(failure.exhausted
              ? {}
              : {
                  nextAttemptAt: new Date(
                    failedAt.getTime() +
                      airQualityAlertRetryDelayMs(failure.failedAttemptCount),
                  ).toISOString(),
                }),
          };
          if (failure.exhausted) {
            this.options.logger.error(
              context,
              "Air-quality operator notification retry exhausted",
            );
          } else {
            this.options.logger.warn(
              context,
              "Queued air-quality operator notification for retry",
            );
          }
        }
      }
    } catch (error) {
      this.options.logger.error(
        { err: error },
        "Air-quality operator notification worker failed",
      );
    }
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

export function createAirQualityWebhookDelivery(
  webhookUrl: string | undefined,
): AirQualityAlertDelivery | undefined {
  const normalizedUrl = webhookUrl?.trim();
  if (!normalizedUrl) return undefined;

  return async (notification) => {
    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.protocol !== "https:") {
      throw new Error("AQI operator alert webhook URL must use HTTPS.");
    }
    const response = await fetch(parsedUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(notification),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `AQI operator alert webhook returned HTTP ${response.status}.`,
      );
    }
  };
}

function toOperatorNotification(
  signal: AlertableAirQualitySignal,
): AirQualityOperatorNotification {
  const status =
    signal.event === "air_quality_outage_sustained"
      ? "triggered"
      : "resolved";
  return {
    notificationId: airQualityNotificationId(status, signal.outageStartedAt),
    alertType: "air_quality_upstream_outage",
    status,
    outageStartedAt: signal.outageStartedAt,
    outageDurationMs: signal.outageDurationMs,
    upstreamFailureCount: signal.upstreamFailureCount,
    staleFallbackCount: signal.staleFallbackCount,
    occurredAt:
      signal.event === "air_quality_outage_sustained"
        ? signal.occurredAt
        : signal.recoveredAt,
  };
}

function deliveryErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return "Unknown notification delivery failure.";
}