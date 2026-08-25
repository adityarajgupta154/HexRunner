import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { LocationObject } from 'expo-location';
import type { MapStyleElement, Region } from 'react-native-maps';
import MapView from 'react-native-maps/lib/MapView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HexGrid from '@/src/components/HexGrid';
import PlaceholderScreen from '@/src/components/PlaceholderScreen';
import { useColors } from '@/hooks/useColors';
import { hexesFromBoundingBox } from '@/src/services/hexEngine';
import {
  startWatching,
  stopWatching,
} from '@/src/services/locationTracker';

const MAP_DELTA = {
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
};

const SIGNIFICANT_CENTER_MOVEMENT = 0.18;
const SIGNIFICANT_ZOOM_CHANGE = 0.15;

function regionChangedSignificantly(previous: Region, next: Region): boolean {
  const latitudeThreshold =
    previous.latitudeDelta * SIGNIFICANT_CENTER_MOVEMENT;
  const longitudeThreshold =
    previous.longitudeDelta * SIGNIFICANT_CENTER_MOVEMENT;
  const latitudeZoomChange =
    Math.abs(next.latitudeDelta - previous.latitudeDelta) /
    previous.latitudeDelta;
  const longitudeZoomChange =
    Math.abs(next.longitudeDelta - previous.longitudeDelta) /
    previous.longitudeDelta;

  return (
    Math.abs(next.latitude - previous.latitude) >= latitudeThreshold ||
    Math.abs(next.longitude - previous.longitude) >= longitudeThreshold ||
    latitudeZoomChange >= SIGNIFICANT_ZOOM_CHANGE ||
    longitudeZoomChange >= SIGNIFICANT_ZOOM_CHANGE
  );
}

function hexesForRegion(region: Region): string[] {
  return hexesFromBoundingBox({
    north: Math.min(90, region.latitude + region.latitudeDelta / 2),
    south: Math.max(-90, region.latitude - region.latitudeDelta / 2),
    east: region.longitude + region.longitudeDelta / 2,
    west: region.longitude - region.longitudeDelta / 2,
  });
}

const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#14212B' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9FB4C0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0F14' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#31424F' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#182832' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#12332C' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#283A47' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#101A22' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#39505E' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#20323E' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#071D2B' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6B92A8' }],
  },
];

export default function HomeScreen() {
  // react-native-maps is native-only. Keep Replit's browser preview useful
  // while Expo Go renders the real map on the phone.
  if (Platform.OS === 'web') {
    return (
      <PlaceholderScreen
        title="Home"
        subtitle="Open this project in Expo Go to view your live GPS map."
        icon="map"
      />
    );
  }

  return <LiveMap />;
}

function LiveMap() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const lastHexRegionRef = useRef<Region | null>(null);
  const [location, setLocation] = useState<LocationObject | null>(null);
  const [visibleHexes, setVisibleHexes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const beginWatching = useCallback(() => {
    setError(null);

    startWatching((nextLocation) => {
      console.log('[HexRunner] Location update', {
        latitude: nextLocation.coords.latitude,
        longitude: nextLocation.coords.longitude,
      });
      setLocation(nextLocation);
    }).catch((watchError: unknown) => {
      const message =
        watchError instanceof Error
          ? watchError.message
          : 'Unable to start location tracking.';
      console.warn('[HexRunner] Location watcher unavailable:', message);
      setError(message);
    });
  }, []);

  useEffect(() => {
    beginWatching();
    return stopWatching;
  }, [beginWatching]);

  const calculateVisibleHexes = useCallback(
    (region: Region, force = false) => {
      const previous = lastHexRegionRef.current;

      if (
        !force &&
        previous &&
        !regionChangedSignificantly(previous, region)
      ) {
        return;
      }

      lastHexRegionRef.current = region;
      setVisibleHexes(hexesForRegion(region));
    },
    [],
  );

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      calculateVisibleHexes(region);
    },
    [calculateVisibleHexes],
  );

  const recenterMap = useCallback(() => {
    if (!location) return;

    mapRef.current?.animateToRegion(
      {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        ...MAP_DELTA,
      },
      450,
    );
  }, [location]);

  if (!location) {
    return (
      <View style={[styles.statusScreen, { backgroundColor: colors.background }]}>
        {error ? (
          <>
            <View
              style={[
                styles.statusIcon,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather
                name="map-pin"
                size={28}
                color={colors.destructive}
              />
            </View>
            <Text style={[styles.statusTitle, { color: colors.foreground }]}>
              Location unavailable
            </Text>
            <Text
              style={[styles.statusMessage, { color: colors.mutedForeground }]}
            >
              Allow foreground location access to show your live position.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={beginWatching}
              style={({ pressed }) => [
                styles.retryButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.retryButtonText,
                  { color: colors.primaryForeground },
                ]}
              >
                Try again
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.statusTitle, { color: colors.foreground }]}>
              Finding your location
            </Text>
            <Text
              style={[styles.statusMessage, { color: colors.mutedForeground }]}
            >
              Keep GPS enabled while HexRunner locks onto your position.
            </Text>
          </>
        )}
      </View>
    );
  }

  const coordinate = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
  const initialRegion = { ...coordinate, ...MAP_DELTA };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        customMapStyle={DARK_MAP_STYLE}
        minZoomLevel={14}
        onMapReady={() => calculateVisibleHexes(initialRegion, true)}
        onRegionChangeComplete={handleRegionChangeComplete}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation
        toolbarEnabled={false}
      >
        <HexGrid hexIndexes={visibleHexes} />
      </MapView>

      <View
        pointerEvents="none"
        style={[
          styles.liveBadge,
          {
            top: insets.top + 14,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
        <Text style={[styles.liveText, { color: colors.foreground }]}>
          LIVE GPS
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Recenter map on current position"
        onPress={recenterMap}
        style={({ pressed }) => [
          styles.recenterButton,
          {
            bottom: Math.max(insets.bottom, 12) + 82,
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <Feather name="crosshair" size={22} color={colors.primary} />
        <Text style={[styles.recenterText, { color: colors.foreground }]}>
          Recenter
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 72,
    gap: 14,
  },
  statusIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 4,
  },
  statusTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 23,
    textAlign: 'center',
  },
  statusMessage: {
    maxWidth: 310,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    minWidth: 140,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  liveBadge: {
    position: 'absolute',
    left: 16,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 19,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 0.7,
  },
  recenterButton: {
    position: 'absolute',
    right: 16,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  recenterText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
});