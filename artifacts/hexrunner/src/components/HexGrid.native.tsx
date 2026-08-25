import React, { useMemo } from 'react';
import { Polygon } from 'react-native-maps';
import { hexToPolygon } from '@/src/services/hexEngine';
import { useColors } from '@/hooks/useColors';

export type HexGridProps = {
  hexIndexes: string[];
  claimedHexIndexes?: ReadonlySet<string>;
  otherHexIndexes?: ReadonlySet<string>;
};

// Helper to convert hex to rgba.
function hexToRgba(hex: string, alpha: number) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function HexGrid({
  hexIndexes,
  claimedHexIndexes,
  otherHexIndexes,
}: HexGridProps) {
  const colors = useColors();

  const GRID_OUTLINE = hexToRgba(colors.foreground, 0.4);
  const TRANSPARENT_FILL = 'transparent';

  const CLAIMED_OUTLINE = colors.primary;
  const CLAIMED_FILL = hexToRgba(colors.primary, 0.4);

  const OTHER_OUTLINE = colors.destructive;
  const OTHER_FILL = hexToRgba(colors.destructive, 0.3);

  const polygons = useMemo(
    () =>
      hexIndexes.map((h3Index) => {
        const isMine = claimedHexIndexes?.has(h3Index) ?? false;
        const isOther = otherHexIndexes?.has(h3Index) ?? false;
        return {
          h3Index,
          coordinates: hexToPolygon(h3Index),
          isMine,
          isOther,
        };
      }),
    [claimedHexIndexes, otherHexIndexes, hexIndexes],
  );

  return (
    <>
      {polygons.map(({ h3Index, coordinates, isMine, isOther }) => {
        let fillColor = TRANSPARENT_FILL;
        let strokeColor = GRID_OUTLINE;
        let strokeWidth = 1;
        let zIndex = 1;

        if (isMine) {
          fillColor = CLAIMED_FILL;
          strokeColor = CLAIMED_OUTLINE;
          strokeWidth = 2;
          zIndex = 3;
        } else if (isOther) {
          fillColor = OTHER_FILL;
          strokeColor = OTHER_OUTLINE;
          strokeWidth = 2;
          zIndex = 2;
        }

        return (
          <Polygon
            key={h3Index}
            coordinates={coordinates}
            fillColor={fillColor}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            tappable={false}
            zIndex={zIndex}
          />
        );
      })}
    </>
  );
}