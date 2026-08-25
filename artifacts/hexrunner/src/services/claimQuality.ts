import { pointToHex } from '@/src/services/hexEngine';

export const MIN_CLAIM_SAMPLES = 2;
export const MIN_CLAIM_DWELL_MS = 6_000;
export const MAX_CLAIM_ACCURACY_METERS = 80;

export type ClaimQualityPoint = {
  lat: number;
  lng: number;
  timestamp: number;
  accuracyMeters?: number;
};

type Observation = {
  firstTimestamp: number;
  lastTimestamp: number;
  samples: number;
  inaccurateSamples: number;
};

/** Mirrors the API's deterministic GPS coverage rule for live feedback. */
export function getClaimQualitySnapshot(points: readonly ClaimQualityPoint[]) {
  const observations = new Map<string, Observation>();

  for (const point of points) {
    const h3Index = pointToHex(point.lat, point.lng);
    const observation = observations.get(h3Index) ?? {
      firstTimestamp: point.timestamp,
      lastTimestamp: point.timestamp,
      samples: 0,
      inaccurateSamples: 0,
    };
    const usable =
      point.accuracyMeters === undefined ||
      point.accuracyMeters <= MAX_CLAIM_ACCURACY_METERS;
    if (usable) {
      observation.samples += 1;
      observation.firstTimestamp = Math.min(observation.firstTimestamp, point.timestamp);
      observation.lastTimestamp = Math.max(observation.lastTimestamp, point.timestamp);
    } else {
      observation.inaccurateSamples += 1;
    }
    observations.set(h3Index, observation);
  }

  const eligibleHexes: string[] = [];
  const pendingHexes: string[] = [];
  const rejectedAccuracyHexes: string[] = [];
  for (const [h3Index, observation] of observations) {
    if (
      observation.samples >= MIN_CLAIM_SAMPLES &&
      observation.lastTimestamp - observation.firstTimestamp >= MIN_CLAIM_DWELL_MS
    ) {
      eligibleHexes.push(h3Index);
    } else if (observation.samples === 0 && observation.inaccurateSamples > 0) {
      rejectedAccuracyHexes.push(h3Index);
    } else {
      pendingHexes.push(h3Index);
    }
  }
  return { eligibleHexes, pendingHexes, rejectedAccuracyHexes };
}