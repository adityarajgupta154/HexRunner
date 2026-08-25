import { Router, type IRouter } from "express";
import { GetAirQualityQueryParams } from "@workspace/api-zod";
import {
  AIR_QUALITY_CACHE_TTL_MS,
  AIR_QUALITY_RETRY_COOLDOWN_MS,
  AIR_QUALITY_STALE_IF_ERROR_MS,
  AirQualityAreaCache,
  buildAirQualityResponse,
  coarseAirQualityArea,
  type AirQualitySnapshot,
  type OpenMeteoAirQuality,
} from "../lib/airQuality";

const router: IRouter = Router();

const sourceCache = new AirQualityAreaCache<AirQualitySnapshot>(
  AIR_QUALITY_CACHE_TTL_MS,
  {
    staleIfErrorMs: AIR_QUALITY_STALE_IF_ERROR_MS,
    retryCooldownMs: AIR_QUALITY_RETRY_COOLDOWN_MS,
  },
);

class AirQualitySourceError extends Error {
  constructor(
    readonly kind: "unavailable" | "missing-observation",
    readonly status?: number,
  ) {
    super(kind);
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
    const cacheResult = await sourceCache.getOrLoad(area.key, () =>
      fetchAirQualitySnapshot(area.latitude, area.longitude),
    );
    if (cacheResult.isFallback) {
      req.log.warn(
        {
          fetchedAt: cacheResult.value.fetchedAt,
          staleIfErrorMs: AIR_QUALITY_STALE_IF_ERROR_MS,
        },
        "Serving last-known air quality after an upstream failure",
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
    req.log.warn({ error }, "Air-quality source request failed");
    res
      .status(503)
      .json({ error: "Air-quality data is temporarily unavailable." });
  }
});

export default router;
