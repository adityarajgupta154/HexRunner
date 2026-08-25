import type * as H3 from 'h3-js';

declare const require: (moduleName: string) => unknown;

function loadH3(): typeof H3 {
  const globalObject = globalThis as typeof globalThis & {
    TextDecoder?: typeof TextDecoder;
  };
  const Decoder = globalObject.TextDecoder;

  if (!Decoder) {
    return require('h3-js') as typeof H3;
  }

  try {
    new Decoder('utf-16le');
    return require('h3-js') as typeof H3;
  } catch {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalObject,
      'TextDecoder',
    );

    try {
      Object.defineProperty(globalObject, 'TextDecoder', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      return require('h3-js') as typeof H3;
    } finally {
      if (descriptor) {
        Object.defineProperty(globalObject, 'TextDecoder', descriptor);
      } else {
        Reflect.deleteProperty(globalObject, 'TextDecoder');
      }
    }
  }
}

const { cellToBoundary, latLngToCell, polygonToCells } = loadH3();

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