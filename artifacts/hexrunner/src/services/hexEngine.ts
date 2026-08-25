import { cellToBoundary, latLngToCell } from 'h3-js';

const HEX_RESOLUTION = 9;

export type PathPoint = {
  lat: number;
  lng: number;
};

export type PolygonCoordinate = {
  latitude: number;
  longitude: number;
};

/** Converts a latitude/longitude point to its resolution-9 H3 cell index. */
export function pointToHex(lat: number, lng: number): string {
  return latLngToCell(lat, lng, HEX_RESOLUTION);
}

/**
 * Converts an H3 cell boundary to coordinates accepted by
 * react-native-maps' Polygon component.
 */
export function hexToPolygon(h3Index: string): PolygonCoordinate[] {
  return cellToBoundary(h3Index).map(([latitude, longitude]) => ({
    latitude,
    longitude,
  }));
}

/**
 * Converts path points into unique H3 cells, preserving first-seen order.
 */
export function hexesFromPath(pathPoints: PathPoint[]): string[] {
  return [
    ...new Set(pathPoints.map(({ lat, lng }) => pointToHex(lat, lng))),
  ];
}