export type LocationPoint = {
  lat: number;
  lng: number;
  timestamp: number;
};

export type AntiSpoofResult = {
  suspicious: boolean;
  reason: string | null;
};

const EARTH_RADIUS_KM = 6_371;
const VEHICLE_SPEED_KMH = 25;
const SUSTAINED_SECONDS = 30;
const MIN_MEANINGFUL_DISTANCE_KM = 0.02;
const IMPOSSIBLE_JUMP_DISTANCE_KM = 0.25;
const IMPOSSIBLE_JUMP_SPEED_KMH = 120;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceBetweenKm(
  from: Pick<LocationPoint, 'lat' | 'lng'>,
  to: Pick<LocationPoint, 'lat' | 'lng'>,
): number {
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const fromLatitude = radians(from.lat);
  const toLatitude = radians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    2 *
    EARTH_RADIUS_KM *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
  );
}

export function checkForSpoofing(
  points: readonly LocationPoint[],
): AntiSpoofResult {
  let sustainedHighSpeedSeconds = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      !Number.isFinite(previous.lat) ||
      !Number.isFinite(previous.lng) ||
      !Number.isFinite(previous.timestamp) ||
      !Number.isFinite(current.lat) ||
      !Number.isFinite(current.lng) ||
      !Number.isFinite(current.timestamp)
    ) {
      sustainedHighSpeedSeconds = 0;
      continue;
    }

    const elapsedSeconds = (current.timestamp - previous.timestamp) / 1_000;
    // Duplicate and out-of-order samples carry no trustworthy speed signal.
    if (elapsedSeconds <= 0) continue;

    const distanceKm = distanceBetweenKm(previous, current);
    // Ignore ordinary GPS jitter; tiny distances over tiny intervals otherwise
    // produce misleadingly large instantaneous speeds.
    if (distanceKm < MIN_MEANINGFUL_DISTANCE_KM) continue;

    const speedKmh = distanceKm / (elapsedSeconds / 3_600);
    if (
      distanceKm >= IMPOSSIBLE_JUMP_DISTANCE_KM &&
      speedKmh > IMPOSSIBLE_JUMP_SPEED_KMH
    ) {
      return {
        suspicious: true,
        reason: `Impossible GPS jump (${distanceKm.toFixed(2)} km in ${elapsedSeconds.toFixed(1)} s).`,
      };
    }

    if (speedKmh > VEHICLE_SPEED_KMH) {
      sustainedHighSpeedSeconds += elapsedSeconds;
      if (sustainedHighSpeedSeconds > SUSTAINED_SECONDS) {
        return {
          suspicious: true,
          reason: `Speed above ${VEHICLE_SPEED_KMH} km/h sustained for more than ${SUSTAINED_SECONDS} seconds.`,
        };
      }
    } else {
      sustainedHighSpeedSeconds = 0;
    }
  }

  return { suspicious: false, reason: null };
}