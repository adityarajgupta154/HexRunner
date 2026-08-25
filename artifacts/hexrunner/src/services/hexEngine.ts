import { cellToBoundary, latLngToCell, polygonToCells } from 'h3-js';

const HEX_RESOLUTION = 9;

export type PathPoint = {
  lat: number;
  lng: number;
};

export type PolygonCoordinate = {
  latitude: number;
  longitude: number;
};

export type GeographicBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
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

/** Returns all resolution-9 H3 cells whose centers fall inside map bounds. */
export function hexesFromBoundingBox({
  north,
  south,
  east,
  west,
}: GeographicBounds): string[] {
  const boundingPolygon = [
    [south, west],
    [north, west],
    [north, east],
    [south, east],
    [south, west],
  ];

  return polygonToCells(boundingPolygon, HEX_RESOLUTION);
}