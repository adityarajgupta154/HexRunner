import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Circle, Polyline, Marker } from 'react-native-maps';
import { useColors } from '@/hooks/useColors';
import {
  buildTerritoryPaintSpots,
  routeToMapCoordinates,
  type TerritoryRoutePoint,
} from '@/src/services/territoryDisplay';
import type {
  CivicAreaSignal,
  SafetyAreaSignal,
  ExactPresence,
  AnonymousPresence,
} from '@workspace/api-client-react';
import { hexToCenter } from '@/src/services/hexEngine';

export type TerritoryPaintProps = {
  center?: { latitude: number; longitude: number };
  claimedHexIndexes?: ReadonlySet<string>;
  otherHexIndexes?: ReadonlySet<string>;
  claimReadyHexIndexes?: ReadonlySet<string>;
  showOwnershipPaint?: boolean;
  routePoints?: readonly TerritoryRoutePoint[];
  safetyAreas?: readonly SafetyAreaSignal[];
  civicAreas?: readonly CivicAreaSignal[];
  caretakerH3Indexes?: ReadonlySet<string>;
  exactRunners?: readonly ExactPresence[];
  anonymousRunners?: readonly AnonymousPresence[];
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
  showOwnershipPaint = true,
  routePoints = [],
  safetyAreas = [],
  civicAreas = [],
  caretakerH3Indexes,
  exactRunners = [],
  anonymousRunners = [],
}: TerritoryPaintProps) {
  const colors = useColors();
  const spots = useMemo(
    () =>
      showOwnershipPaint
        ? buildTerritoryPaintSpots(
            claimedHexIndexes,
            otherHexIndexes,
            claimReadyHexIndexes,
          )
        : [],
    [claimReadyHexIndexes, claimedHexIndexes, otherHexIndexes, showOwnershipPaint],
  );
  const routeCoordinates = useMemo(
    () => routeToMapCoordinates(routePoints),
    [routePoints],
  );

  return (
    <>
      {safetyAreas
        .filter((area) => area.concernScore !== null)
        .map((area) => (
          <Circle
            key={`safety:${area.areaH3Index}`}
            center={hexToCenter(area.areaH3Index)}
            radius={430}
            fillColor={hexToRgba(colors.destructive, 0.1)}
            strokeColor={hexToRgba(colors.destructive, 0.48)}
            strokeWidth={3}
            zIndex={0}
          />
        ))}
      {civicAreas.map((area) => (
        <Circle
          key={`civic:${area.areaH3Index}`}
          center={hexToCenter(area.areaH3Index)}
          radius={85}
          fillColor={hexToRgba(colors.accentForeground, 0.72)}
          strokeColor={hexToRgba(colors.card, 0.92)}
          strokeWidth={4}
          zIndex={3}
        />
      ))}
      {[...(caretakerH3Indexes ?? [])].map((h3Index) => (
        <Circle
          key={`caretaker:${h3Index}`}
          center={hexToCenter(h3Index)}
          radius={105}
          fillColor={hexToRgba(colors.primary, 0.04)}
          strokeColor={hexToRgba(colors.primary, 0.92)}
          strokeWidth={4}
          zIndex={3}
        />
      ))}
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

      {exactRunners.map((runner) => (
        <Marker
          key={`exact-${runner.userId}`}
          coordinate={{ latitude: runner.lat, longitude: runner.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={10}
        >
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: colors.foreground,
                borderWidth: 2,
                borderColor: colors.background,
              }}
            />
            <View style={{ marginTop: 4, backgroundColor: colors.background, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: colors.foreground }}>
                {runner.displayName.toUpperCase()}
              </Text>
            </View>
          </View>
        </Marker>
      ))}

      {anonymousRunners.map((runner, i) => {
        const formattedDistance = runner.distanceBandMeters >= 1000
          ? `~${(runner.distanceBandMeters / 1000).toFixed(1)} km`
          : `~${runner.distanceBandMeters} m`;
        return (
          <Marker
            key={`anon-${i}`}
            coordinate={{ latitude: runner.lat, longitude: runner.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={9}
          >
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: colors.accent,
                  borderWidth: 1.5,
                  borderColor: colors.accentForeground,
                  opacity: 0.8,
                }}
              />
              <View style={{ marginTop: 4, backgroundColor: colors.card, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, opacity: 0.9, borderColor: colors.border, borderWidth: 1 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 9, color: colors.mutedForeground }}>
                  {formattedDistance}
                </Text>
              </View>
            </View>
          </Marker>
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