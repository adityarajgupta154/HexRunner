import React, { useMemo } from 'react';
import { Circle, Polyline } from 'react-native-maps';
import { useColors } from '@/hooks/useColors';
import {
  buildTerritoryPaintSpots,
  routeToMapCoordinates,
  type TerritoryRoutePoint,
} from '@/src/services/territoryDisplay';

export type TerritoryPaintProps = {
  center?: { latitude: number; longitude: number };
  claimedHexIndexes?: ReadonlySet<string>;
  otherHexIndexes?: ReadonlySet<string>;
  claimReadyHexIndexes?: ReadonlySet<string>;
  routePoints?: readonly TerritoryRoutePoint[];
};

function hexToRgba(hex: string, alpha: number): string {
  let color = hex.replace('#', '');
  if (color.length === 3) {
    color = color
      .split('')
      .map((character) => character + character)
      .join('');
  }
  const red = Number.parseInt(color.substring(0, 2), 16);
  const green = Number.parseInt(color.substring(2, 4), 16);
  const blue = Number.parseInt(color.substring(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export default function TerritoryPaint({
  claimedHexIndexes,
  otherHexIndexes,
  claimReadyHexIndexes,
  routePoints = [],
}: TerritoryPaintProps) {
  const colors = useColors();
  const spots = useMemo(
    () =>
      buildTerritoryPaintSpots(
        claimedHexIndexes,
        otherHexIndexes,
        claimReadyHexIndexes,
      ),
    [claimReadyHexIndexes, claimedHexIndexes, otherHexIndexes],
  );
  const routeCoordinates = useMemo(
    () => routeToMapCoordinates(routePoints),
    [routePoints],
  );

  return (
    <>
      {spots.map((spot) => {
        const isRival = spot.ownerKind === 'rival';
        const isClaimReady = spot.ownerKind === 'claim-ready';
        const paintColor = isRival
          ? colors.destructive
          : isClaimReady
            ? colors.primary
            : colors.primary;

        return (
          <Circle
            key={spot.id}
            center={spot.center}
            radius={spot.radiusMeters}
            fillColor={hexToRgba(paintColor, isRival ? 0.23 : isClaimReady ? 0.2 : 0.28)}
            strokeColor={hexToRgba(paintColor, isRival ? 0.48 : 0.64)}
            strokeWidth={isClaimReady ? 5 : 16}
            zIndex={isRival ? 1 : isClaimReady ? 4 : 2}
          />
        );
      })}

      {routeCoordinates.length >= 2 ? (
        <>
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={hexToRgba(colors.primary, 0.2)}
            strokeWidth={30}
            lineCap="round"
            lineJoin="round"
            zIndex={5}
          />
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={hexToRgba(colors.primary, 0.86)}
            strokeWidth={15}
            lineCap="round"
            lineJoin="round"
            zIndex={6}
          />
        </>
      ) : null}
    </>
  );
}