import { polygonToCells } from "h3-js";
import {
  CLAIM_H3_RESOLUTION,
  MAX_CLAIM_ACCURACY_METERS,
} from "./claimQuality";

export type LoopCapturePoint = {
  lat: number;
  lng: number;
  timestamp: number;
  accuracyMeters?: number;
};

export type LoopCapture = {
  loopDetected: boolean;
  interiorHexes: string[];
};

const MIN_LOOP_POINTS = 4;
const MAX_LOOP_POINTS = 1_000;
const MIN_LOOP_DURATION_MS = 30_000;
const MAX_CLOSE_DISTANCE_METERS = 150;
const MAX_LOOP_AREA_SQUARE_METERS = 4_000_000;
const MAX_INTERIOR_HEXES = 500;

function distanceMeters(a: LoopCapturePoint, b: LoopCapturePoint): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) *
      Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

// Equirectangular coordinates are adequate for the deliberately small bounded
// loops accepted here, and avoid adding a geometry dependency.
function projected(point: LoopCapturePoint, origin: LoopCapturePoint): [number, number] {
  const radians = Math.PI / 180;
  return [
    (point.lng - origin.lng) * radians * 6_371_000 * Math.cos(origin.lat * radians),
    (point.lat - origin.lat) * radians * 6_371_000,
  ];
}

function signedArea(points: readonly [number, number][]): number {
  return points.reduce(
    (area, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return area + point[0] * next[1] - next[0] * point[1];
    },
    0,
  ) / 2;
}

function orientation(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function isSimplePolygon(points: readonly [number, number][]): boolean {
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    for (let other = index + 1; other < points.length; other += 1) {
      const otherNext = (other + 1) % points.length;
      if (index === other || next === other || otherNext === index) continue;
      if (segmentsIntersect(points[index]!, points[next]!, points[other]!, points[otherNext]!)) return false;
    }
  }
  return true;
}

/** Returns a small, server-derived H3 fill only for a simple closed route. */
export function getLoopCapture(points: readonly LoopCapturePoint[]): LoopCapture {
  if (points.length < MIN_LOOP_POINTS || points.length > MAX_LOOP_POINTS) {
    return { loopDetected: false, interiorHexes: [] };
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (
    last.timestamp - first.timestamp < MIN_LOOP_DURATION_MS ||
    points.filter(
      (point) =>
        point.accuracyMeters === undefined ||
        point.accuracyMeters <= MAX_CLAIM_ACCURACY_METERS,
    ).length < MIN_LOOP_POINTS ||
    points.some((point, index) =>
      index > 0 && point.timestamp < points[index - 1]!.timestamp,
    )
  ) {
    return { loopDetected: false, interiorHexes: [] };
  }
  if (distanceMeters(first, last) > MAX_CLOSE_DISTANCE_METERS) {
    return { loopDetected: false, interiorHexes: [] };
  }
  // Do not include a near-duplicate closing point as a polygon vertex.
  const ring = points.slice(0, -1);
  if (ring.length < 3) return { loopDetected: false, interiorHexes: [] };
  const xy = ring.map((point) => projected(point, first));
  const area = Math.abs(signedArea(xy));
  if (area < 1 || area > MAX_LOOP_AREA_SQUARE_METERS || !isSimplePolygon(xy)) {
    return { loopDetected: false, interiorHexes: [] };
  }
  try {
    const interiorHexes = polygonToCells(ring.map((point) => [point.lat, point.lng]), CLAIM_H3_RESOLUTION)
      .slice(0, MAX_INTERIOR_HEXES);
    // A capped fill is not a safe representation of an oversized polygon.
    if (interiorHexes.length >= MAX_INTERIOR_HEXES) {
      return { loopDetected: false, interiorHexes: [] };
    }
    return { loopDetected: true, interiorHexes };
  } catch {
    return { loopDetected: false, interiorHexes: [] };
  }
}