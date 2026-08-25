import { Router, type IRouter } from "express";
import {
  GetAirQualityQueryParams,
  GetAirQualityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const SOURCE_URL = "https://open-meteo.com/en/docs/air-quality-api";
const STALE_AFTER_MS = 2 * 60 * 60 * 1_000;

type OpenMeteoAirQuality = {
  utc_offset_seconds?: number;
  current?: { time?: string; us_aqi?: number | null };
  hourly?: {
    time?: string[];
    us_aqi?: Array<number | null>;
  };
};

function sourceTimeToDate(value: string, offsetSeconds: number): Date {
  return new Date(Date.parse(`${value}Z`) - offsetSeconds * 1_000);
}

function classifyAqi(aqi: number): {
  level:
    | "good"
    | "moderate"
    | "unhealthy_sensitive"
    | "unhealthy"
    | "very_unhealthy"
    | "hazardous";
  healthContext: string;
} {
  if (aqi <= 50) {
    return {
      level: "good",
      healthContext: "Air quality is generally suitable for outdoor exercise.",
    };
  }
  if (aqi <= 100) {
    return {
      level: "moderate",
      healthContext:
        "Most people can exercise outdoors; unusually sensitive runners may prefer an easier effort.",
    };
  }
  if (aqi <= 150) {
    return {
      level: "unhealthy_sensitive",
      healthContext:
        "Sensitive runners should reduce prolonged or intense outdoor effort.",
    };
  }
  if (aqi <= 200) {
    return {
      level: "unhealthy",
      healthContext:
        "Consider moving exercise indoors or keeping outdoor activity short and easy.",
    };
  }
  if (aqi <= 300) {
    return {
      level: "very_unhealthy",
      healthContext:
        "Avoid strenuous outdoor exercise and consider an indoor alternative.",
    };
  }
  return {
    level: "hazardous",
    healthContext:
      "Avoid outdoor exercise while these conditions persist.",
  };
}

function suggestedExerciseWindow(
  payload: OpenMeteoAirQuality,
  currentAqi: number,
  observationTime: Date,
): {
  startsAt: Date;
  endsAt: Date;
  expectedAqi: number;
  reason: string;
} | null {
  const times = payload.hourly?.time ?? [];
  const values = payload.hourly?.us_aqi ?? [];
  const offsetSeconds = payload.utc_offset_seconds ?? 0;
  const candidates = times
    .map((time, index) => {
      const aqi = values[index];
      if (typeof aqi !== "number" || !Number.isFinite(aqi)) return null;
      const startsAt = sourceTimeToDate(time, offsetSeconds);
      const hoursAway =
        (startsAt.getTime() - observationTime.getTime()) / (60 * 60 * 1_000);
      return hoursAway >= 1 && hoursAway <= 18
        ? { startsAt, aqi: Math.round(aqi) }
        : null;
    })
    .filter(
      (candidate): candidate is { startsAt: Date; aqi: number } =>
        candidate !== null,
    )
    .sort((first, second) => first.aqi - second.aqi);

  const best = candidates[0];
  if (
    !best ||
    (best.aqi > currentAqi - 10 && !(currentAqi > 100 && best.aqi <= 100))
  ) {
    return null;
  }
  return {
    startsAt: best.startsAt,
    endsAt: new Date(best.startsAt.getTime() + 60 * 60 * 1_000),
    expectedAqi: best.aqi,
    reason: `Forecast AQI is about ${Math.max(0, currentAqi - best.aqi)} points lower than now.`,
  };
}

router.get("/air-quality", async (req, res): Promise<void> => {
  const parsed = GetAirQualityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid latitude and longitude are required." });
    return;
  }

  const query = new URLSearchParams({
    latitude: parsed.data.latitude.toString(),
    longitude: parsed.data.longitude.toString(),
    current: "us_aqi",
    hourly: "us_aqi",
    forecast_days: "2",
    timezone: "auto",
  });

  try {
    const sourceResponse = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${query}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!sourceResponse.ok) {
      res.status(503).json({ error: "Air-quality source is unavailable." });
      return;
    }
    const payload = (await sourceResponse.json()) as OpenMeteoAirQuality;
    const rawAqi = payload.current?.us_aqi;
    const rawObservationTime = payload.current?.time;
    if (
      typeof rawAqi !== "number" ||
      !Number.isFinite(rawAqi) ||
      !rawObservationTime
    ) {
      res
        .status(503)
        .json({ error: "No current AQI is available for this location." });
      return;
    }

    const fetchedAt = new Date();
    const observationTime = sourceTimeToDate(
      rawObservationTime,
      payload.utc_offset_seconds ?? 0,
    );
    const aqi = Math.max(0, Math.min(500, Math.round(rawAqi)));
    const classification = classifyAqi(aqi);
    res.json(
      GetAirQualityResponse.parse({
        aqi,
        ...classification,
        observationTime,
        fetchedAt,
        isStale:
          fetchedAt.getTime() - observationTime.getTime() > STALE_AFTER_MS,
        sourceName: "Open-Meteo Air Quality",
        sourceUrl: SOURCE_URL,
        suggestedWindow: suggestedExerciseWindow(
          payload,
          aqi,
          observationTime,
        ),
        disclaimer:
          "AQI guidance is informational, not medical advice, and does not block a run.",
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Air-quality source request failed");
    res.status(503).json({ error: "Air-quality data is temporarily unavailable." });
  }
});

export default router;
