import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Polyline,
  Stop,
} from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import {
  buildTerritoryPaintSpots,
  type TerritoryRoutePoint,
} from '@/src/services/territoryDisplay';

export type TerritoryPaintProps = {
  center?: { latitude: number; longitude: number };
  claimedHexIndexes?: ReadonlySet<string>;
  otherHexIndexes?: ReadonlySet<string>;
  claimReadyHexIndexes?: ReadonlySet<string>;
  routePoints?: readonly TerritoryRoutePoint[];
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

export default function TerritoryPaint({
  center,
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
  const origin =
    center ??
    (routePoints.length > 0
      ? {
          latitude: routePoints[routePoints.length - 1]!.lat,
          longitude: routePoints[routePoints.length - 1]!.lng,
        }
      : undefined);

  if (!origin) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.card }]}>
        <Feather name="navigation" size={25} color={colors.primary} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          Finding your paint position
        </Text>
        <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
          Your live route will appear here when GPS is ready.
        </Text>
      </View>
    );
  }

  const route = routePoints.map((point) =>
    project(point.lat, point.lng, origin),
  );
  const routeValue = route.map(({ x, y }) => `${x},${y}`).join(' ');
  const spotScale = CANVAS_SIZE / METERS_PER_CANVAS;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Svg
        accessibilityLabel="Painted territory map"
        width="100%"
        height="100%"
        viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <LinearGradient id="mapBackdrop" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.card} />
            <Stop offset="1" stopColor={colors.background} />
          </LinearGradient>
        </Defs>
        <Path
          d="M0 0H800V800H0Z"
          fill="url(#mapBackdrop)"
        />
        <Path
          d="M-40 190 C130 235 225 155 390 208 S650 298 850 235"
          stroke={colors.border}
          strokeWidth={32}
          opacity={0.42}
          fill="none"
        />
        <Path
          d="M90 -30 C170 160 160 310 270 440 S470 640 535 840"
          stroke={colors.border}
          strokeWidth={24}
          opacity={0.34}
          fill="none"
        />
        <Path
          d="M-30 615 C170 520 365 560 835 470"
          stroke={colors.border}
          strokeWidth={18}
          opacity={0.28}
          fill="none"
        />

        {spots.map((spot) => {
          const point = project(
            spot.center.latitude,
            spot.center.longitude,
            origin,
          );
          const isRival = spot.ownerKind === 'rival';
          return (
            <Circle
              key={spot.id}
              cx={point.x}
              cy={point.y}
              r={Math.max(14, spot.radiusMeters * spotScale)}
              fill={isRival ? colors.destructive : colors.primary}
              fillOpacity={isRival ? 0.22 : 0.3}
              stroke={isRival ? colors.destructive : colors.primary}
              strokeOpacity={0.62}
              strokeWidth={10}
            />
          );
        })}

        {route.length >= 2 ? (
          <>
            <Polyline
              points={routeValue}
              fill="none"
              stroke={colors.primary}
              strokeOpacity={0.18}
              strokeWidth={34}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Polyline
              points={routeValue}
              fill="none"
              stroke={colors.primary}
              strokeOpacity={0.9}
              strokeWidth={16}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : null}

        <Circle
          cx={CANVAS_SIZE / 2}
          cy={CANVAS_SIZE / 2}
          r={13}
          fill={colors.primary}
          stroke={colors.primaryForeground}
          strokeWidth={5}
        />
      </Svg>
      <View
        pointerEvents="none"
        style={[
          styles.webBadge,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={[styles.webDot, { backgroundColor: colors.primary }]} />
        <Text style={[styles.webBadgeText, { color: colors.foreground }]}>
          LIVE PAINT
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    textAlign: 'center',
  },
  emptyCopy: {
    maxWidth: 260,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  webBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 999,
  },
  webDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  webBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.2,
  },
});