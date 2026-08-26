export type IntegrityPoint = { lat: number; lng: number; timestamp: number; speedMetersPerSecond?: number };

const VEHICLE_SPEED_METERS_PER_SECOND = 25 / 3.6;
const SUSTAINED_VEHICLE_SPEED_SECONDS = 30;
const IMPOSSIBLE_JUMP_DISTANCE_METERS = 250;
const IMPOSSIBLE_JUMP_SPEED_METERS_PER_SECOND = 120 / 3.6;

function distanceMeters(a: IntegrityPoint, b: IntegrityPoint): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

/** Server-only path integrity signal; client anti-spoof telemetry is advisory. */
export function getPathIntegrity(points: readonly IntegrityPoint[]): {
  flaggedSuspicious: boolean;
  suspiciousReason: string | null;
  maxSpeedMetersPerSecond: number | null;
} {
  let maxSpeed = 0;
  let sustainedOver25KmhSeconds = 0;
  let suspiciousReason: string | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const elapsed = (current.timestamp - previous.timestamp) / 1_000;
    if (elapsed <= 0) continue;
    const distance = distanceMeters(previous, current);
    const speed = distance / elapsed;
    maxSpeed = Math.max(maxSpeed, speed);
    if (
      distance >= IMPOSSIBLE_JUMP_DISTANCE_METERS &&
      speed > IMPOSSIBLE_JUMP_SPEED_METERS_PER_SECOND
    ) {
      suspiciousReason = `Impossible GPS jump (${Math.round(distance)} m in ${elapsed.toFixed(1)} s).`;
      break;
    }
    sustainedOver25KmhSeconds =
      speed > VEHICLE_SPEED_METERS_PER_SECOND
        ? sustainedOver25KmhSeconds + elapsed
        : 0;
    if (sustainedOver25KmhSeconds > SUSTAINED_VEHICLE_SPEED_SECONDS) {
      suspiciousReason = "Speed above 25 km/h sustained for more than 30 seconds.";
      break;
    }
  }
  for (const point of points) maxSpeed = Math.max(maxSpeed, point.speedMetersPerSecond ?? 0);
  return {
    flaggedSuspicious: suspiciousReason !== null,
    suspiciousReason,
    maxSpeedMetersPerSecond: points.length ? maxSpeed : null,
  };
}