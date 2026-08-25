import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
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
import { useFocusEffect } from 'expo-router';
import HexGrid from '@/src/components/HexGrid';
import PlaceholderScreen from '@/src/components/PlaceholderScreen';
import { useColors } from '@/hooks/useColors';
import { hexesFromBoundingBox } from '@/src/services/hexEngine';
import { startWatching, stopWatching } from '@/src/services/locationTracker';
import { useAuth } from '@/src/context/AuthContext';
import { useLookupHexOwnership, useGetUserStats, getGetUserStatsQueryKey } from '@workspace/api-client-react';
import { predictFitnessProfile } from '@/src/services/fitnessModel';

const MAP_DELTA = {
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
};

const SIGNIFICANT_CENTER_MOVEMENT = 0.18;
const SIGNIFICANT_ZOOM_CHANGE = 0.15;
const HEX_REFRESH_INTERVAL = 15000;

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
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#31424F' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#182832' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#12332C' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#283A47' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#101A22' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#39505E' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#20323E' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#071D2B' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6B92A8' }] },
];

export default function HomeScreen() {
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
  const { uid } = useAuth();

  const mapRef = useRef<MapView | null>(null);
  const lastHexRegionRef = useRef<Region | null>(null);
  const [location, setLocation] = useState<LocationObject | null>(null);
  const [visibleHexes, setVisibleHexes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOwnership, setHasLoadedOwnership] = useState(false);

  const [myHexes, setMyHexes] = useState<Set<string>>(new Set());
  const [otherHexes, setOtherHexes] = useState<Set<string>>(new Set());

  const lookupMutation = useLookupHexOwnership();

  const {
    data: userStats,
    isLoading: isStatsLoading,
    isError: isStatsError,
    refetch: refetchStats,
  } = useGetUserStats(uid ?? '', {
    query: { enabled: !!uid, queryKey: getGetUserStatsQueryKey(uid ?? '') },
  });

  const fitnessProfile = useMemo(() => {
    if (!userStats?.recentRuns) return predictFitnessProfile([]);
    return predictFitnessProfile(userStats.recentRuns, 'casual');
  }, [userStats]);

  const refreshHexes = useCallback((hexes: string[]) => {
    if (!hexes.length) return;
    const h3Indexes = hexes.slice(0, 1000);
    lookupMutation.mutate(
      { data: { h3Indexes } },
      {
        onSuccess: (res) => {
          const newMyHexes = new Set<string>();
          const newOtherHexes = new Set<string>();

          res.ownership.forEach(hex => {
            if (!hex.ownerId) return;
            if (hex.ownerId === uid) {
              newMyHexes.add(hex.h3Index);
            } else {
              newOtherHexes.add(hex.h3Index);
            }
          });

          setMyHexes(newMyHexes);
          setOtherHexes(newOtherHexes);
          setHasLoadedOwnership(true);
        },
      }
    );
  }, [lookupMutation.mutate, uid]);

  const retryTerritoryData = useCallback(() => {
    void refetchStats();
    refreshHexes(visibleHexes);
  }, [refetchStats, refreshHexes, visibleHexes]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshHexes(visibleHexes);
    }, HEX_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refreshHexes, visibleHexes]);

  const beginWatching = useCallback(() => {
    setError(null);
    startWatching((nextLocation) => {
      setLocation(nextLocation);
    }).catch((watchError: unknown) => {
      const message = watchError instanceof Error ? watchError.message : 'Unable to start location tracking.';
      setError(message);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      beginWatching();
      return stopWatching;
    }, [beginWatching]),
  );

  const calculateVisibleHexes = useCallback(
    (region: Region, force = false) => {
      const previous = lastHexRegionRef.current;
      if (!force && previous && !regionChangedSignificantly(previous, region)) {
        return;
      }

      lastHexRegionRef.current = region;
      const hexes = hexesForRegion(region);
      setVisibleHexes(hexes);
      refreshHexes(hexes);
    },
    [refreshHexes],
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
            <View style={[styles.statusIcon, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="map-pin" size={28} color={colors.destructive} />
            </View>
            <Text style={[styles.statusTitle, { color: colors.foreground }]}>Location unavailable</Text>
            <Text style={[styles.statusMessage, { color: colors.mutedForeground }]}>
              Allow foreground location access to show your live position.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={beginWatching}
              style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 }]}
            >
              <Text style={[styles.retryButtonText, { color: colors.primaryForeground }]}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.statusTitle, { color: colors.foreground }]}>Finding your location</Text>
            <Text style={[styles.statusMessage, { color: colors.mutedForeground }]}>
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
  const territoryIsLoading =
    isStatsLoading || (lookupMutation.isPending && !hasLoadedOwnership);
  const territoryFailed = isStatsError || lookupMutation.isError;
  const hasNoTerritory =
    !!uid &&
    hasLoadedOwnership &&
    !territoryIsLoading &&
    !territoryFailed &&
    (userStats?.totals.totalHexesOwned ?? 0) === 0;

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
        <HexGrid hexIndexes={visibleHexes} claimedHexIndexes={myHexes} otherHexIndexes={otherHexes} />
      </MapView>

      <View pointerEvents="none" style={[styles.topBar, { top: insets.top + 14 }]}>
        <View style={[styles.liveBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.liveText, { color: colors.foreground }]}>LIVE GPS</Text>
        </View>

        <View
          accessibilityLabel={`Today's target: ${fitnessProfile.budget} hexes`}
          style={[styles.tierBadge, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="target" size={14} color={colors.primary} />
          <Text style={[styles.tierText, { color: colors.foreground }]}>
            Today&apos;s target: {fitnessProfile.budget} hexes
          </Text>
        </View>
      </View>

      {territoryIsLoading ? (
        <View
          accessibilityLabel="Loading territory data"
          style={[
            styles.territoryNotice,
            {
              top: insets.top + 64,
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.territoryNoticeText, { color: colors.foreground }]}>
            Loading territory…
          </Text>
        </View>
      ) : territoryFailed ? (
        <View
          style={[
            styles.territoryNotice,
            {
              top: insets.top + 64,
              backgroundColor: colors.card,
              borderColor: colors.destructive,
            },
          ]}
        >
          <Feather name="wifi-off" size={17} color={colors.destructive} />
          <View style={styles.territoryNoticeCopy}>
            <Text style={[styles.territoryNoticeText, { color: colors.foreground }]}>
              Territory data unavailable
            </Text>
            <Text style={[styles.territoryNoticeSub, { color: colors.mutedForeground }]}>
              Your map is still usable.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading territory data"
            onPress={retryTerritoryData}
            style={({ pressed }) => [
              styles.territoryRetry,
              { backgroundColor: colors.muted, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Feather name="refresh-cw" size={16} color={colors.primary} />
          </Pressable>
        </View>
      ) : hasNoTerritory ? (
        <View
          style={[
            styles.territoryNotice,
            {
              top: insets.top + 64,
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Feather name="hexagon" size={18} color={colors.primary} />
          <View style={styles.territoryNoticeCopy}>
            <Text style={[styles.territoryNoticeText, { color: colors.foreground }]}>
              No hexes owned yet
            </Text>
            <Text style={[styles.territoryNoticeSub, { color: colors.mutedForeground }]}>
              Start a run to claim your first territory.
            </Text>
          </View>
        </View>
      ) : null}

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
        <Text style={[styles.recenterText, { color: colors.foreground }]}>Recenter</Text>
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
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveBadge: {
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
  tierBadge: {
    minHeight: 38,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 19,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  tierText: {
    flexShrink: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.1,
  },
  territoryNotice: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  territoryNoticeCopy: {
    flex: 1,
  },
  territoryNoticeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  territoryNoticeSub: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  territoryRetry: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
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
