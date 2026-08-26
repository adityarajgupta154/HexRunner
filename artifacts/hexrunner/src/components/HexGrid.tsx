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
  myColor?: string;
  otherColors?: ReadonlyMap<string, string>;
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
  myColor,
  otherColors,
}: HexGridProps) {
  const colors = useColors();
  const polygons = useMemo(() => {
    if (!center) return [];
    return hexIndexes.map(h3Index => {
      const isMine = claimedHexIndexes?.has(h3Index) ?? false;
      const isOther = otherHexIndexes?.has(h3Index) ?? false;

      let hexColor = isMine ? (myColor ?? colors.primary) : (isOther ? (otherColors?.get(h3Index) ?? colors.destructive) : 'transparent');
      let strokeColor = isMine ? (myColor ?? colors.primary) : (isOther ? (otherColors?.get(h3Index) ?? colors.destructive) : colors.foreground);

      return {
        h3Index,
        points: hexToPolygon(h3Index)
          .map(coordinate => project(coordinate.latitude, coordinate.longitude, center))
          .map(point => `${point.x},${point.y}`)
          .join(' '),
        isMine,
        isOther,
        hexColor,
        strokeColor,
      };
    });
  }, [center, claimedHexIndexes, hexIndexes, otherHexIndexes, myColor, otherColors, colors]);

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
        {polygons.map(({ h3Index, points, isMine, isOther, hexColor, strokeColor }) => (
          <Polygon
            key={h3Index}
            points={points}
            fill={hexColor}
            fillOpacity={isMine ? 0.32 : isOther ? 0.26 : 0}
            stroke={strokeColor}
            strokeOpacity={isMine || isOther ? 0.92 : 0.34}
            strokeWidth={isMine || isOther ? 3 : 1.4}
            strokeDasharray={isOther ? "6, 4" : undefined}
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