import React, { useMemo } from 'react';
import { Polygon } from 'react-native-maps';
import { hexToPolygon } from '@/src/services/hexEngine';

type HexGridProps = {
  hexIndexes: string[];
  claimedHexIndexes?: ReadonlySet<string>;
};

const GRID_OUTLINE = 'rgba(244, 250, 248, 0.62)';
const TRANSPARENT_FILL = 'rgba(45, 224, 176, 0)';
const CLAIMED_OUTLINE = 'rgba(45, 224, 176, 1)';
const CLAIMED_FILL = 'rgba(45, 224, 176, 0.4)';

export default function HexGrid({
  hexIndexes,
  claimedHexIndexes,
}: HexGridProps) {
  const polygons = useMemo(
    () =>
      hexIndexes.map((h3Index) => ({
        h3Index,
        coordinates: hexToPolygon(h3Index),
        claimed: claimedHexIndexes?.has(h3Index) ?? false,
      })),
    [claimedHexIndexes, hexIndexes],
  );

  return (
    <>
      {polygons.map(({ h3Index, coordinates, claimed }) => (
        <Polygon
          key={h3Index}
          coordinates={coordinates}
          fillColor={claimed ? CLAIMED_FILL : TRANSPARENT_FILL}
          strokeColor={claimed ? CLAIMED_OUTLINE : GRID_OUTLINE}
          strokeWidth={claimed ? 2 : 1}
          tappable={false}
          zIndex={claimed ? 2 : 1}
        />
      ))}
    </>
  );
}