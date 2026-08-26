import React, { useMemo } from 'react';
import { Polygon } from 'react-native-maps';
import { useColors } from '@/hooks/useColors';
import { hexToPolygon } from '@/src/services/hexEngine';

export type HexGridProps = {
  center?: { latitude: number; longitude: number };
  hexIndexes: string[];
  claimedHexIndexes?: ReadonlySet<string>;
  otherHexIndexes?: ReadonlySet<string>;
  myColor?: string;
  otherColors?: ReadonlyMap<string, string>;
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
  myColor,
  otherColors,
}: HexGridProps) {
  const colors = useColors();
  const polygons = useMemo(
    () =>
      hexIndexes.map(h3Index => {
        const isMine = claimedHexIndexes?.has(h3Index) ?? false;
        const isOther = otherHexIndexes?.has(h3Index) ?? false;

        let hexColor = isMine ? (myColor ?? colors.primary) : (isOther ? (otherColors?.get(h3Index) ?? colors.destructive) : 'transparent');
        let strokeColor = isMine ? (myColor ?? colors.primary) : (isOther ? (otherColors?.get(h3Index) ?? colors.destructive) : colors.foreground);

        return {
          h3Index,
          coordinates: hexToPolygon(h3Index),
          isMine,
          isOther,
          hexColor,
          strokeColor,
        };
      }),
    [claimedHexIndexes, hexIndexes, otherHexIndexes, myColor, otherColors, colors],
  );

  return (
    <>
      {polygons.map(({ h3Index, coordinates, isMine, isOther, hexColor, strokeColor }) => {
        const fillColor = isMine
          ? hexToRgba(hexColor, 0.32)
          : isOther
            ? hexToRgba(hexColor, 0.26)
            : 'transparent';
        const finalStrokeColor = isMine || isOther ? strokeColor : hexToRgba(strokeColor, 0.34);

        return (
          <Polygon
            key={h3Index}
            coordinates={coordinates}
            fillColor={fillColor}
            strokeColor={finalStrokeColor}
            strokeWidth={isMine || isOther ? 2 : 1}
            lineDashPattern={isOther ? [6, 4] : undefined}
            tappable={false}
            zIndex={isMine ? 3 : isOther ? 2 : 1}
          />
        );
      })}
    </>
  );
}