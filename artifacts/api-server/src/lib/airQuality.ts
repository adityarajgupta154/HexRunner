import { cellToLatLng, latLngToCell } from "h3-js";
import { GetAirQualityResponse } from "@workspace/api-zod";

export const AIR_QUALITY_CACHE_TTL_MS = 10 * 60 * 1_000;
export const AIR_QUALITY_STALE_IF_ERROR_MS = 30 * 60 * 1_000;

const AIR_QUALITY_AREA_RESOLUTION = 7;
const STALE_AFTER_MS = 2 * 60 * 60 * 1_000;
const SOURCE_URL = "https://open-meteo.com/en/docs/air-quality-api";

export type OpenMeteoAirQuality = {
  utc_offset_seconds?: number;
  current?: { time?: string; us_aqi?: number | null };
  hourly?: {
    time?: string[];
    us_aqi?: Array<number | null>;
  };
};

export type AirQualitySnapshot = {
  payload: OpenMeteoAirQuality;
  fetchedAt: Date;
};

export type CoarseAirQualityArea = {
  key: string;
  latitude: number;
  longitude: number;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  discardAt: number;
};

export type AirQualityCacheResult<T> = {
  value: T;
  isFallback: boolean;
};

type AirQualityAreaCacheOptions = {
  staleIfErrorMs?: number;
  now?: () => number;
  maxEntries?: number;
};

export class AirQualityAreaCache<T> {
  private readonly values = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<
    string,
    Promise<AirQualityCacheResult<T>>
  >();
  private readonly staleIfErrorMs: number;
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(
    private readonly ttlMs: number,
    options: AirQualityAreaCacheOptions = {},
  ) {
    this.staleIfErrorMs = options.staleIfErrorMs ?? 0;
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? 512;
    if (ttlMs <= 0) throw new Error("Cache TTL must be positive.");
    if (this.staleIfErrorMs < 0) {
      throw new Error("Cache stale-if-error period cannot be negative.");
    }
    if (this.maxEntries <= 0) {
      throw new Error("Cache capacity must be positive.");
    }
  }

  getOrLoad(
    key: string,
    loader: () => Promise<T>,
  ): Promise<AirQualityCacheResult<T>> {
    const now = this.now();
    this.pruneDiscarded(now);

    const cached = this.values.get(key);
    if (cached && cached.expiresAt > now) {
      return Promise.resolve({ value: cached.value, isFallback: false });
    }

    const existingRequest = this.inFlight.get(key);
    if (existingRequest) return existingRequest;

    let request: Promise<AirQualityCacheResult<T>>;
    request = Promise.resolve()
      .then(loader)
      .then((value) => {
        const loadedAt = this.now();
        this.pruneDiscarded(loadedAt);
        if (!this.values.has(key) && this.values.size >= this.maxEntries) {
          const oldestKey = this.values.keys().next().value as
            string | undefined;
          if (oldestKey) this.values.delete(oldestKey);
        }
        const expiresAt = loadedAt + this.ttlMs;
        this.values.set(key, {
          value,
          expiresAt,
          discardAt: expiresAt + this.staleIfErrorMs,
        });
        return { value, isFallback: false };
      })
      .catch((error: unknown) => {
        const failedAt = this.now();
        const fallback = this.values.get(key);
        if (
          fallback &&
          fallback.expiresAt <= failedAt &&
          fallback.discardAt > failedAt
        ) {
          return { value: fallback.value, isFallback: true };
        }
        throw error;
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) {
          this.inFlight.delete(key);
        }
      });

    this.inFlight.set(key, request);
    return request;
  }

  private pruneDiscarded(now: number): void {
    for (const [key, entry] of this.values) {
      if (entry.discardAt <= now) this.values.delete(key);
    }
  }
}

export function coarseAirQualityArea(
  latitude: number,
  longitude: number,
): CoarseAirQualityArea {
  const key = latLngToCell(latitude, longitude, AIR_QUALITY_AREA_RESOLUTION);
  const [areaLatitude, areaLongitude] = cellToLatLng(key);
  return {
    key,
    latitude: areaLatitude,
    longitude: areaLongitude,
  };
}

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
    healthContext: "Avoid outdoor exercise while these conditions persist.",
  };
}

function suggestedExerciseWindow(
  payload: OpenMeteoAirQuality,
  currentAqi: number,
  servedAt: Date,
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
        (startsAt.getTime() - servedAt.getTime()) / (60 * 60 * 1_000);
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

export function buildAirQualityResponse(
  snapshot: AirQualitySnapshot,
  servedAt = new Date(),
  isFallback = false,
) {
  const rawAqi = snapshot.payload.current?.us_aqi;
  const rawObservationTime = snapshot.payload.current?.time;
  if (
    typeof rawAqi !== "number" ||
    !Number.isFinite(rawAqi) ||
    !rawObservationTime
  ) {
    throw new Error("Air-quality snapshot has no current observation.");
  }

  const observationTime = sourceTimeToDate(
    rawObservationTime,
    snapshot.payload.utc_offset_seconds ?? 0,
  );
  const aqi = Math.max(0, Math.min(500, Math.round(rawAqi)));
  const classification = classifyAqi(aqi);

  return GetAirQualityResponse.parse({
    aqi,
    ...classification,
    observationTime,
    fetchedAt: snapshot.fetchedAt,
    isStale:
      isFallback ||
      servedAt.getTime() - observationTime.getTime() > STALE_AFTER_MS,
    sourceName: "Open-Meteo Air Quality",
    sourceUrl: SOURCE_URL,
    suggestedWindow: suggestedExerciseWindow(snapshot.payload, aqi, servedAt),
    disclaimer:
      "AQI guidance is informational, not medical advice, and does not block a run.",
  });
}
