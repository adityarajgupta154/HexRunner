import { Router, type IRouter } from "express";
import { GetAirQualityQueryParams } from "@workspace/api-zod";
import {
  AIR_QUALITY_CACHE_TTL_MS,
  AIR_QUALITY_RETRY_COOLDOWN_MS,
  AIR_QUALITY_STALE_IF_ERROR_MS,
  AirQualityAreaCache,
  AirQualityOutageTracker,
  buildAirQualityResponse,
  coarseAirQualityArea,
  type AirQualityOutageSignal,
  type AirQualitySnapshot,
  type OpenMeteoAirQuality,
} from "../lib/airQuality";
import {
  AirQualityOperatorNotifier,
  createAirQualityWebhookDelivery,
} from "../lib/airQualityAlerts";
import {
  airQualityAlertLogger,
  airQualityOperationsLogger,
} from "../lib/logger";

const router: IRouter = Router();

const sourceCache = new AirQualityAreaCache<AirQualitySnapshot>(
  AIR_QUALITY_CACHE_TTL_MS,
  {
    staleIfErrorMs: AIR_QUALITY_STALE_IF_ERROR_MS,
    retryCooldownMs: AIR_QUALITY_RETRY_COOLDOWN_MS,
  },
);
const outageTracker = new AirQualityOutageTracker();
const operatorNotifier = new AirQualityOperatorNotifier({
  logger: airQualityAlertLogger,
  deliver: createAirQualityWebhookDelivery(
    process.env.AIR_QUALITY_OPERATOR_ALERT_WEBHOOK_URL,
  ),
});

class AirQualitySourceError extends Error {
  constructor(
    readonly kind: "unavailable" | "missing-observation",
    readonly status?: number,
  ) {
    super(kind);
  }
}

function sourceFailureDetails(error: unknown): {
  sourceFailure:
    | "unavailable"
    | "missing-observation"
    | "timeout"
    | "request-error";
  sourceStatus?: number;
} {
  if (error instanceof AirQualitySourceError) {
    return {
      sourceFailure: error.kind,
      ...(error.status === undefined ? {} : { sourceStatus: error.status }),
    };
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return { sourceFailure: "timeout" };
  }
  return { sourceFailure: "request-error" };
}

function recordOperationalSignals(signals: AirQualityOutageSignal[]): void {
  for (const signal of signals) {
    operatorNotifier.record(signal);
    switch (signal.event) {
      case "air_quality_upstream_recovered":
        airQualityOperationsLogger.info(
          signal,
          "Open-Meteo air-quality source recovered",
        );
        break;
      case "air_quality_outage_sustained":
        airQualityOperationsLogger.error(
          signal,
          "Open-Meteo air-quality outage is sustained",
        );
        break;
      case "air_quality_stale_fallback":
        airQualityOperationsLogger.warn(
          signal,
          "Serving stale air-quality guidance during an upstream outage",
        );
        break;
      case "air_quality_upstream_failure":
        airQualityOperationsLogger.warn(
          signal,
          "Open-Meteo air-quality request failed",
        );
        break;
    }
  }
}

async function fetchAirQualitySnapshot(
  latitude: number,
  longitude: number,
): Promise<AirQualitySnapshot> {
  const query = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: "us_aqi",
    hourly: "us_aqi",
    forecast_days: "2",
    timezone: "auto",
  });
  const sourceResponse = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?${query}`,
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!sourceResponse.ok) {
    throw new AirQualitySourceError("unavailable", sourceResponse.status);
  }

  const payload = (await sourceResponse.json()) as OpenMeteoAirQuality;
  const rawAqi = payload.current?.us_aqi;
  const rawObservationTime = payload.current?.time;
  if (
    typeof rawAqi !== "number" ||
    !Number.isFinite(rawAqi) ||
    !rawObservationTime
  ) {
    throw new AirQualitySourceError("missing-observation");
  }

  return {
    payload,
    fetchedAt: new Date(),
  };
}

router.get("/air-quality", async (req, res): Promise<void> => {
  const parsed = GetAirQualityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Valid latitude and longitude are required." });
    return;
  }

  const area = coarseAirQualityArea(
    parsed.data.latitude,
    parsed.data.longitude,
  );

  try {
    const cacheResult = await sourceCache.getOrLoad(area.key, async () => {
      try {
        const snapshot = await fetchAirQualitySnapshot(
          area.latitude,
          area.longitude,
        );
        recordOperationalSignals(outageTracker.recordRecovery());
        return snapshot;
      } catch (error) {
        const failure = sourceFailureDetails(error);
        recordOperationalSignals(
          outageTracker.recordFailure(
            failure.sourceFailure,
            failure.sourceStatus,
          ),
        );
        throw error;
      }
    });
    if (cacheResult.isFallback) {
      recordOperationalSignals(
        outageTracker.recordStaleFallback(cacheResult.value.fetchedAt),
      );
    }
    res.json(
      buildAirQualityResponse(
        cacheResult.value,
        new Date(),
        cacheResult.isFallback,
      ),
    );
  } catch (error) {
    if (error instanceof AirQualitySourceError) {
      req.log.warn(
        { sourceStatus: error.status, sourceFailure: error.kind },
        "Air-quality source returned no usable observation",
      );
      res.status(503).json({
        error:
          error.kind === "missing-observation"
            ? "No current AQI is available for this location."
            : "Air-quality source is unavailable.",
      });
      return;
    }
    req.log.warn(
      sourceFailureDetails(error),
      "Air-quality source request failed",
    );
    res
      .status(503)
      .json({ error: "Air-quality data is temporarily unavailable." });
  }
});

export default router;
