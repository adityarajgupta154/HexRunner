import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { hexToPolygon } from '@/src/services/hexEngine';

export type HexGridProps = {
  center?: { latitude: number; longitude: number };
  hexIndexes: string[];
  claimedHexIndexes?: ReadonlySet<string>;
  otherHexIndexes?: ReadonlySet<string>;
};

type CanvasPoint = { x: number; y: number };

const CANVAS_SIZE = 800;
const METERS_PER_CANVAS = 1_100;

function project(
  latitude: number,
  longitude: number,
  center: { latitude: number; longitude: number },
): CanvasPoint {
  const latitudeMeters = (latitude - center.latitude) * 111_320;
  const longitudeMeters =
    (longitude - center.longitude) *
    111_320 *
    Math.cos((center.latitude * Math.PI) / 180);
  const scale = CANVAS_SIZE / METERS_PER_CANVAS;
  return {
    x: CANVAS_SIZE / 2 + longitudeMeters * scale,
    y: CANVAS_SIZE / 2 - latitudeMeters * scale,
  };
}

export default function HexGrid({
  center,
  hexIndexes,
  claimedHexIndexes,
  otherHexIndexes,
}: HexGridProps) {
  const colors = useColors();
  const polygons = useMemo(() => {
    if (!center) return [];
    return hexIndexes.map(h3Index => ({
      h3Index,
      points: hexToPolygon(h3Index)
        .map(coordinate => project(coordinate.latitude, coordinate.longitude, center))
        .map(point => `${point.x},${point.y}`)
        .join(' '),
      isMine: claimedHexIndexes?.has(h3Index) ?? false,
      isOther: otherHexIndexes?.has(h3Index) ?? false,
    }));
  }, [center, claimedHexIndexes, hexIndexes, otherHexIndexes]);

  if (!center) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Svg
        accessibilityLabel="Visible territory grid"
        width="100%"
        height="100%"
        viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
        preserveAspectRatio="xMidYMid slice"
      >
        {polygons.map(({ h3Index, points, isMine, isOther }) => (
          <Polygon
            key={h3Index}
            points={points}
            fill={isMine ? colors.primary : isOther ? colors.destructive : 'transparent'}
            fillOpacity={isMine ? 0.32 : isOther ? 0.26 : 0}
            stroke={isMine ? colors.primary : isOther ? colors.destructive : colors.foreground}
            strokeOpacity={isMine || isOther ? 0.92 : 0.34}
            strokeWidth={isMine || isOther ? 3 : 1.4}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
});