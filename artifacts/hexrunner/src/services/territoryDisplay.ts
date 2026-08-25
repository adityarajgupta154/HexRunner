import { hexToCenter, type PolygonCoordinate } from './hexEngine';

export type TerritoryOwnerKind = 'mine' | 'rival' | 'claim-ready';

export type TerritoryPaintSpot = {
  id: string;
  center: PolygonCoordinate;
  ownerKind: TerritoryOwnerKind;
  radiusMeters: number;
};

export type TerritoryRoutePoint = {
  lat: number;
  lng: number;
  timestamp: number;
};

export const TERRITORY_PAINT_RADIUS_METERS = 155;

export function routeToMapCoordinates(
  pathPoints: readonly TerritoryRoutePoint[],
): PolygonCoordinate[] {
  return pathPoints.map(({ lat, lng }) => ({
    latitude: lat,
    longitude: lng,
  }));
}

export function buildTerritoryPaintSpots(
  claimedHexIndexes: ReadonlySet<string> | undefined,
  otherHexIndexes: ReadonlySet<string> | undefined,
  claimReadyHexIndexes?: ReadonlySet<string>,
): TerritoryPaintSpot[] {
  const spots: TerritoryPaintSpot[] = [];

  const append = (
    indexes: ReadonlySet<string> | undefined,
    ownerKind: TerritoryOwnerKind,
    radiusMeters: number,
  ) => {
    indexes?.forEach((h3Index) => {
      spots.push({
        id: `${ownerKind}:${h3Index}`,
        center: hexToCenter(h3Index),
        ownerKind,
        radiusMeters,
      });
    });
  };

  // Rivals render first so the runner's paint stays visually dominant.
  append(otherHexIndexes, 'rival', TERRITORY_PAINT_RADIUS_METERS);
  append(claimedHexIndexes, 'mine', TERRITORY_PAINT_RADIUS_METERS);
  append(claimReadyHexIndexes, 'claim-ready', 42);

  return spots;
}