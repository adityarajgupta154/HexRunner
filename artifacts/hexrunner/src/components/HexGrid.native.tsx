import React, { useMemo } from 'react';
import { Polygon } from 'react-native-maps';
import { hexToPolygon } from '@/src/services/hexEngine';

type HexGridProps = {
  hexIndexes: string[];
};

const GRID_OUTLINE = 'rgba(244, 250, 248, 0.62)';
const TRANSPARENT_FILL = 'rgba(45, 224, 176, 0)';

export default function HexGrid({ hexIndexes }: HexGridProps) {
  const polygons = useMemo(
    () =>
      hexIndexes.map((h3Index) => ({
        h3Index,
        coordinates: hexToPolygon(h3Index),
      })),
    [hexIndexes],
  );

  return (
    <>
      {polygons.map(({ h3Index, coordinates }) => (
        <Polygon
          key={h3Index}
          coordinates={coordinates}
          fillColor={TRANSPARENT_FILL}
          strokeColor={GRID_OUTLINE}
          strokeWidth={1}
          tappable={false}
        />
      ))}
    </>
  );
}