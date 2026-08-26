import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, {
  type MapStyleElement,
  type Region,
} from 'react-native-maps';
import TerritoryPaint from '@/src/components/TerritoryPaint';
import { useColors } from '@/hooks/useColors';
import type { TerritoryRoutePoint } from '@/src/services/territoryDisplay';
import type { ExactPresence, AnonymousPresence } from '@workspace/api-client-react';

type RunPoint = {
  lat: number;
  lng: number;
  timestamp: number;
};

type RunMapProps = {
  currentPoint: RunPoint | null;
  pathPoints: readonly TerritoryRoutePoint[];
  claimedHexIndexes: ReadonlySet<string>;
  contestedHexIndexes?: ReadonlySet<string>;
  exactRunners?: readonly ExactPresence[];
  anonymousRunners?: readonly AnonymousPresence[];
};

const RUN_MAP_DELTA = {
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
};

const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#14212B' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9FB4C0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0F14' }] },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#2A3C49' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#12332C' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#071D2B' }],
  },
];

export default function RunMap({
  currentPoint,
  pathPoints,
  claimedHexIndexes,
  contestedHexIndexes,
  exactRunners,
  anonymousRunners,
}: RunMapProps) {
  const colors = useColors();
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    if (!currentPoint) return;

    mapRef.current?.animateToRegion(
      {
        latitude: currentPoint.lat,
        longitude: currentPoint.lng,
        ...RUN_MAP_DELTA,
      },
      400,
    );
  }, [currentPoint]);

  if (!currentPoint) {
    return (
      <View
        style={[
          styles.loading,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Acquiring GPS position…
        </Text>
      </View>
    );
  }

  const initialRegion: Region = {
    latitude: currentPoint.lat,
    longitude: currentPoint.lng,
    ...RUN_MAP_DELTA,
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        customMapStyle={DARK_MAP_STYLE}
        minZoomLevel={14}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation
        toolbarEnabled={false}
      >
        <TerritoryPaint
          center={{
            latitude: currentPoint.lat,
            longitude: currentPoint.lng,
          }}
          routePoints={pathPoints}
          otherHexIndexes={contestedHexIndexes}
          claimReadyHexIndexes={claimedHexIndexes}
          exactRunners={exactRunners}
          anonymousRunners={anonymousRunners}
        />
      </MapView>
      <View
        pointerEvents="none"
        style={[
          styles.paintBadge,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={[styles.paintDot, { backgroundColor: colors.primary }]} />
        <Text style={[styles.paintText, { color: colors.foreground }]}>
          PAINTING LIVE
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 18,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 18,
  },
  loadingText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  paintBadge: {
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
  paintDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  paintText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.1,
  },
});