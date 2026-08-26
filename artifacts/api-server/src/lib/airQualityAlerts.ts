import type { Logger } from "pino";
import type { AirQualityOutageSignal } from "./airQuality";

const ALERT_TIMEOUT_MS = 5_000;

type AlertableAirQualitySignal = Extract<
  AirQualityOutageSignal,
  {
    event:
      | "air_quality_outage_sustained"
      | "air_quality_upstream_recovered";
  }
>;

export type AirQualityOperatorNotification = {
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

type AirQualityOperatorNotifierOptions = {
  logger: Logger;
  deliver?: AirQualityAlertDelivery;
};

export class AirQualityOperatorNotifier {
  private deliveryQueue = Promise.resolve();
  private activeAlertStartedAt: string | undefined;

  constructor(private readonly options: AirQualityOperatorNotifierOptions) {}

  record(signal: AirQualityOutageSignal): void {
    if (signal.event === "air_quality_outage_sustained") {
      if (this.activeAlertStartedAt === signal.outageStartedAt) return;
      this.activeAlertStartedAt = signal.outageStartedAt;
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
    return this.deliveryQueue;
  }

  private enqueue(signal: AlertableAirQualitySignal): void {
    const notification = toOperatorNotification(signal);
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
  return {
    alertType: "air_quality_upstream_outage",
    status:
      signal.event === "air_quality_outage_sustained"
        ? "triggered"
        : "resolved",
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