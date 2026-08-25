import React, { useMemo } from 'react';
import { Polygon } from 'react-native-maps';
import { useColors } from '@/hooks/useColors';
import { hexToPolygon } from '@/src/services/hexEngine';

export type HexGridProps = {
  center?: { latitude: number; longitude: number };
  hexIndexes: string[];
  claimedHexIndexes?: ReadonlySet<string>;
  otherHexIndexes?: ReadonlySet<string>;
};

function hexToRgba(hex: string, alpha: number): string {
  let color = hex.replace('#', '');
  if (color.length === 3) {
    color = color
      .split('')
      .map(character => character + character)
      .join('');
  }
  const red = Number.parseInt(color.substring(0, 2), 16);
  const green = Number.parseInt(color.substring(2, 4), 16);
  const blue = Number.parseInt(color.substring(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export default function HexGrid({
  hexIndexes,
  claimedHexIndexes,
  otherHexIndexes,
}: HexGridProps) {
  const colors = useColors();
  const polygons = useMemo(
    () =>
      hexIndexes.map(h3Index => ({
        h3Index,
        coordinates: hexToPolygon(h3Index),
        isMine: claimedHexIndexes?.has(h3Index) ?? false,
        isOther: otherHexIndexes?.has(h3Index) ?? false,
      })),
    [claimedHexIndexes, hexIndexes, otherHexIndexes],
  );

  return (
    <>
      {polygons.map(({ h3Index, coordinates, isMine, isOther }) => {
        const fillColor = isMine
          ? hexToRgba(colors.primary, 0.32)
          : isOther
            ? hexToRgba(colors.destructive, 0.26)
            : 'transparent';
        const strokeColor = isMine
          ? colors.primary
          : isOther
            ? colors.destructive
            : hexToRgba(colors.foreground, 0.34);

        return (
          <Polygon
            key={h3Index}
            coordinates={coordinates}
            fillColor={fillColor}
            strokeColor={strokeColor}
            strokeWidth={isMine || isOther ? 2 : 1}
            tappable={false}
            zIndex={isMine ? 3 : isOther ? 2 : 1}
          />
        );
      })}
    </>
  );
}