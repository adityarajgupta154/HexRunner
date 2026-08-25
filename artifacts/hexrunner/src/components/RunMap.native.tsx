import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MapStyleElement, Region } from 'react-native-maps';
import MapView from 'react-native-maps/lib/MapView';
import HexGrid from '@/src/components/HexGrid';
import { useColors } from '@/hooks/useColors';
import { hexesFromBoundingBox } from '@/src/services/hexEngine';

type RunPoint = {
  lat: number;
  lng: number;
  timestamp: number;
};

type RunMapProps = {
  currentPoint: RunPoint | null;
  claimedHexIndexes: ReadonlySet<string>;
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

function hexesForRegion(region: Region): string[] {
  return hexesFromBoundingBox({
    north: Math.min(90, region.latitude + region.latitudeDelta / 2),
    south: Math.max(-90, region.latitude - region.latitudeDelta / 2),
    east: region.longitude + region.longitudeDelta / 2,
    west: region.longitude - region.longitudeDelta / 2,
  });
}

function changedSignificantly(previous: Region, next: Region): boolean {
  const latitudeMovement =
    Math.abs(next.latitude - previous.latitude) / previous.latitudeDelta;
  const longitudeMovement =
    Math.abs(next.longitude - previous.longitude) / previous.longitudeDelta;
  const latitudeZoom =
    Math.abs(next.latitudeDelta - previous.latitudeDelta) /
    previous.latitudeDelta;
  const longitudeZoom =
    Math.abs(next.longitudeDelta - previous.longitudeDelta) /
    previous.longitudeDelta;

  return (
    latitudeMovement >= 0.18 ||
    longitudeMovement >= 0.18 ||
    latitudeZoom >= 0.15 ||
    longitudeZoom >= 0.15
  );
}

export default function RunMap({
  currentPoint,
  claimedHexIndexes,
}: RunMapProps) {
  const colors = useColors();
  const mapRef = useRef<MapView | null>(null);
  const lastHexRegionRef = useRef<Region | null>(null);
  const [visibleHexes, setVisibleHexes] = useState<string[]>([]);

  const updateVisibleHexes = useCallback((region: Region, force = false) => {
    const previous = lastHexRegionRef.current;
    if (!force && previous && !changedSignificantly(previous, region)) return;

    lastHexRegionRef.current = region;
    setVisibleHexes(hexesForRegion(region));
  }, []);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => updateVisibleHexes(region),
    [updateVisibleHexes],
  );

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
        onMapReady={() => updateVisibleHexes(initialRegion, true)}
        onRegionChangeComplete={handleRegionChangeComplete}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation
        toolbarEnabled={false}
      >
        <HexGrid
          hexIndexes={visibleHexes}
          claimedHexIndexes={claimedHexIndexes}
        />
      </MapView>
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
});