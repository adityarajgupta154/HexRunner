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
import TerritoryPaint from '@/src/components/TerritoryPaint';
import { useColors } from '@/hooks/useColors';
import { hexesFromBoundingBox, hexToParent } from '@/src/services/hexEngine';
import { startWatching, stopWatching } from '@/src/services/locationTracker';
import { useAuth } from '@/src/context/AuthContext';
import { useLookupHexOwnership, useLookupSafetyAreas, useGetUserStats, getGetUserStatsQueryKey, type SafetyAreaSignal } from '@workspace/api-client-react';
import { predictFitnessProfile } from '@/src/services/fitnessModel';
import BaselineOnboarding from '@/src/components/BaselineOnboarding';
import AirQualityCard from '@/src/components/AirQualityCard';
import {
  type CivicAreaSignal,
  useAdoptCivicZone,
  useFlagCivicReport,
  useLookupCivicMap,
} from '@workspace/api-client-react';
import { pointToHex } from '@/src/services/hexEngine';

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
  { elementType: 'geometry', stylers: [{ color: '#24201e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d6c8b8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#151414' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#554944' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#2d2825' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#342d29' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#443a35' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1c1918' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#634139' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#39312e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#211c1b' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#b8aca0' }] },
];

export default function HomeScreen() {
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
  const [territoryComputationError, setTerritoryComputationError] =
    useState<string | null>(null);

  const [myHexes, setMyHexes] = useState<Set<string>>(new Set());
  const [otherHexes, setOtherHexes] = useState<Set<string>>(new Set());
  const [territoryFreshness, setTerritoryFreshness] = useState<number | null>(null);
  const [safetyAreas, setSafetyAreas] = useState<SafetyAreaSignal[]>([]);
  const [civicAreas, setCivicAreas] = useState<CivicAreaSignal[]>([]);
  const [caretakerHexes, setCaretakerHexes] = useState<Set<string>>(new Set());
  const [showCivicLayer, setShowCivicLayer] = useState(true);
  const [civicNotice, setCivicNotice] = useState<string | null>(null);

  const lookupMutation = useLookupHexOwnership();
  const safetyLookup = useLookupSafetyAreas();
  const civicLookup = useLookupCivicMap();
  const adoptZone = useAdoptCivicZone();
  const flagCivicReport = useFlagCivicReport();

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
    return predictFitnessProfile(
      userStats.recentRuns,
      userStats.baseline?.activityLevel ?? 'casual',
    );
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
          const freshnessScores: number[] = [];

          if (!Array.isArray(res.ownership)) {
            console.error(
              '[HexRunner] Ownership lookup returned an invalid response.',
              res,
            );
            setHasLoadedOwnership(true);
            return;
          }

          res.ownership.forEach(hex => {
            if (!hex.ownerId) return;
            if (hex.ownerId === uid) {
              newMyHexes.add(hex.h3Index);
              if (hex.freshnessScore !== null) freshnessScores.push(hex.freshnessScore);
            } else {
              newOtherHexes.add(hex.h3Index);
            }
          });

          setMyHexes(newMyHexes);
          setOtherHexes(newOtherHexes);
          setTerritoryFreshness(
            freshnessScores.length
              ? Math.round(freshnessScores.reduce((sum, score) => sum + score, 0) / freshnessScores.length)
              : null,
          );
          setHasLoadedOwnership(true);
        },
      }
    );
  }, [lookupMutation.mutate, uid]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshHexes(visibleHexes);
    }, HEX_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refreshHexes, visibleHexes]);

  useEffect(() => {
    if (!visibleHexes.length) return;
    let areaH3Indexes: string[];
    try {
      areaH3Indexes = [...new Set(visibleHexes.map((index) => hexToParent(index, 8)))].slice(0, 500);
    } catch {
      return;
    }
    safetyLookup.mutate(
      { data: { areaH3Indexes } },
      { onSuccess: (result) => setSafetyAreas(result.areas) },
    );
    civicLookup.mutate(
      { data: { areaH3Indexes, h3Indexes: visibleHexes.slice(0, 1000) } },
      {
        onSuccess: (result) => {
          setCivicAreas(result.areas);
          setCaretakerHexes(
            new Set(result.caretakers.map((caretaker) => caretaker.h3Index)),
          );
        },
      },
    );
  }, [visibleHexes]);

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
      try {
        const hexes = hexesForRegion(region);
        setTerritoryComputationError(null);
        setVisibleHexes(hexes);
        refreshHexes(hexes);
      } catch (hexError) {
        console.error(
          '[HexRunner] Unable to calculate the visible H3 grid.',
          hexError,
        );
        setTerritoryComputationError(
          'The territory grid could not be calculated.',
        );
        setHasLoadedOwnership(true);
      }
    },
    [refreshHexes],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || !location) return;
    calculateVisibleHexes(
      {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        ...MAP_DELTA,
      },
      true,
    );
  }, [calculateVisibleHexes, location]);

  const retryTerritoryData = useCallback(() => {
    void refetchStats();
    const currentRegion = lastHexRegionRef.current;
    if (currentRegion) {
      calculateVisibleHexes(currentRegion, true);
    } else {
      refreshHexes(visibleHexes);
    }
  }, [calculateVisibleHexes, refetchStats, refreshHexes, visibleHexes]);

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
  const currentH3Index = pointToHex(coordinate.latitude, coordinate.longitude);
  const canAdoptCurrentZone = myHexes.has(currentH3Index);
  const currentZoneIsAdopted = caretakerHexes.has(currentH3Index);
  const latestCivicArea = civicAreas[0] ?? null;

  const adoptCurrentZone = () => {
    setCivicNotice(null);
    adoptZone.mutate(
      { data: { h3Index: currentH3Index } },
      {
        onSuccess: (result) => {
          setCaretakerHexes((current) => new Set(current).add(result.h3Index));
          setCivicNotice('Zone informally adopted. This grants no authority.');
        },
        onError: () => setCivicNotice('This zone could not be adopted.'),
      },
    );
  };

  const moderateLatestCivicReport = (
    reason: 'duplicate' | 'inappropriate' | 'confirmed_valid',
  ) => {
    if (!latestCivicArea) return;
    setCivicNotice(null);
    flagCivicReport.mutate(
      { reportId: latestCivicArea.latestReportId, data: { reason } },
      {
        onSuccess: () => setCivicNotice('Thanks. Your flag was recorded for review.'),
        onError: () => setCivicNotice('This report could not be flagged.'),
      },
    );
  };
  const territoryIsLoading =
    isStatsLoading || (lookupMutation.isPending && !hasLoadedOwnership);
  const territoryFailed =
    isStatsError ||
    lookupMutation.isError ||
    territoryComputationError !== null;
  const hasNoTerritory =
    !!uid &&
    hasLoadedOwnership &&
    !territoryIsLoading &&
    !territoryFailed &&
    (userStats?.totals.totalHexesOwned ?? 0) === 0;

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <View style={StyleSheet.absoluteFill}>
          <TerritoryPaint
            center={coordinate}
            claimedHexIndexes={myHexes}
            otherHexIndexes={otherHexes}
            showOwnershipPaint={false}
            safetyAreas={safetyAreas}
            civicAreas={showCivicLayer ? civicAreas : []}
            caretakerH3Indexes={
              showCivicLayer ? caretakerHexes : undefined
            }
          />
          <HexGrid
            center={coordinate}
            hexIndexes={visibleHexes}
            claimedHexIndexes={myHexes}
            otherHexIndexes={otherHexes}
          />
        </View>
      ) : (
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
          <HexGrid
            center={coordinate}
            hexIndexes={visibleHexes}
            claimedHexIndexes={myHexes}
            otherHexIndexes={otherHexes}
          />
          <TerritoryPaint
            center={coordinate}
            claimedHexIndexes={myHexes}
            otherHexIndexes={otherHexes}
            showOwnershipPaint={false}
            safetyAreas={safetyAreas}
            civicAreas={showCivicLayer ? civicAreas : []}
            caretakerH3Indexes={
              showCivicLayer ? caretakerHexes : undefined
            }
          />
        </MapView>
      )}

      <View pointerEvents="none" style={[styles.topBar, { top: insets.top + 14 }]}>
        <View style={[styles.liveBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.liveText, { color: colors.foreground }]}>CITY / LIVE</Text>
        </View>

        <View
          accessibilityLabel={`Today's target: ${userStats?.totals.todayClaimedHexes ?? 0} of ${userStats?.totals.dailyBudget ?? 10} territory zones`}
          style={[styles.tierBadge, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="target" size={14} color={colors.primary} />
          <Text style={[styles.tierText, { color: colors.foreground }]}>
            {userStats?.totals.todayClaimedHexes ?? 0}/{userStats?.totals.dailyBudget ?? 10} MARKS
          </Text>
        </View>
      </View>

      <View style={[styles.aqiPanel, { top: insets.top + 62 }]}>
        <AirQualityCard
          latitude={coordinate.latitude}
          longitude={coordinate.longitude}
        />
      </View>

      {territoryFreshness !== null ? (
        <View
          pointerEvents="none"
          style={[
            styles.freshnessBadge,
            {
              top: insets.top + 108,
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Feather name="clock" size={14} color={colors.primary} />
          <Text style={[styles.freshnessText, { color: colors.foreground }]}>
            Territory freshness {territoryFreshness}%
          </Text>
        </View>
      ) : null}

      <View
        pointerEvents="none"
        style={[
          styles.safetyAdvisory,
          {
            bottom: Math.max(insets.bottom, 12) + 82,
            backgroundColor: colors.card,
            borderColor: safetyLookup.isError ? colors.destructive : colors.border,
          },
        ]}
      >
        <Feather name="shield" size={15} color={colors.destructive} />
        <View style={styles.safetyAdvisoryCopy}>
          <Text style={[styles.safetyAdvisoryTitle, { color: colors.foreground }]}>
            {safetyLookup.isPending
              ? 'Loading safety signals…'
              : safetyLookup.isError
                ? 'Safety signals unavailable'
                : safetyAreas.some((area) => area.concernScore !== null)
                  ? 'Crowdsourced caution nearby'
                   : civicAreas.length > 0
                     ? `${civicAreas.reduce((sum, area) => sum + area.totalReports, 0)} civic issue${civicAreas.reduce((sum, area) => sum + area.totalReports, 0) === 1 ? '' : 's'} nearby`
                     : 'Not enough safety data nearby'}
          </Text>
          <Text style={[styles.safetyAdvisoryText, { color: colors.mutedForeground }]}>
            {civicAreas.length > 0
              ? 'Coarse community reports · may be unreviewed'
              : 'Coarse community signals · not a safety guarantee'}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.communityControls,
          {
            bottom: Math.max(insets.bottom, 12) + 146,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: showCivicLayer }}
          onPress={() => setShowCivicLayer((current) => !current)}
          style={[
            styles.communityAction,
            {
              backgroundColor: showCivicLayer ? colors.accent : colors.muted,
            },
          ]}
        >
          <Feather name="map-pin" size={15} color={colors.primary} />
          <Text style={[styles.communityActionText, { color: colors.foreground }]}>
            Civic {showCivicLayer ? 'on' : 'off'}
          </Text>
        </Pressable>
        {canAdoptCurrentZone && !currentZoneIsAdopted ? (
          <Pressable
            accessibilityRole="button"
            disabled={adoptZone.isPending}
            onPress={adoptCurrentZone}
            style={[styles.communityAction, { backgroundColor: colors.muted }]}
          >
            {adoptZone.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="heart" size={15} color={colors.primary} />
            )}
            <Text style={[styles.communityActionText, { color: colors.foreground }]}>
              Adopt zone
            </Text>
          </Pressable>
        ) : null}
        {latestCivicArea ? (
          <>
            <Pressable
              accessibilityLabel="Confirm latest civic report as valid community information"
              onPress={() => moderateLatestCivicReport('confirmed_valid')}
              style={[styles.iconAction, { backgroundColor: colors.muted }]}
            >
              <Feather name="check" size={15} color={colors.primary} />
            </Pressable>
            <Pressable
              accessibilityLabel="Flag latest civic report as a duplicate"
              onPress={() => moderateLatestCivicReport('duplicate')}
              style={[styles.iconAction, { backgroundColor: colors.muted }]}
            >
              <Feather name="copy" size={15} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              accessibilityLabel="Flag latest civic report as inappropriate"
              onPress={() => moderateLatestCivicReport('inappropriate')}
              style={[styles.iconAction, { backgroundColor: colors.muted }]}
            >
              <Feather name="flag" size={15} color={colors.destructive} />
            </Pressable>
          </>
        ) : null}
      </View>
      {civicNotice ? (
        <View
          pointerEvents="none"
          style={[
            styles.civicNotice,
            {
              bottom: Math.max(insets.bottom, 12) + 202,
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.civicNoticeText, { color: colors.foreground }]}>
            {civicNotice}
          </Text>
        </View>
      ) : null}

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
           <Feather name="edit-3" size={18} color={colors.primary} />
          <View style={styles.territoryNoticeCopy}>
            <Text style={[styles.territoryNoticeText, { color: colors.foreground }]}>
               Your city is waiting
            </Text>
            <Text style={[styles.territoryNoticeSub, { color: colors.mutedForeground }]}>
               Start a run and paint your first route.
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
      {userStats && !userStats.baseline ? <BaselineOnboarding /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  aqiPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  communityControls: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 6,
    borderWidth: 1,
    borderRadius: 3,
  },
  communityAction: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 11,
  },
  communityActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  iconAction: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  civicNotice: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 12,
  },
  civicNoticeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textAlign: 'center',
  },
  safetyAdvisory: {
    position: 'absolute',
    left: 16,
    right: 118,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 3,
  },
  safetyAdvisoryCopy: { flex: 1 },
  safetyAdvisoryTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  safetyAdvisoryText: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 2 },
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
    borderRadius: 3,
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
    borderRadius: 3,
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
    borderRadius: 3,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  freshnessBadge: {
    position: 'absolute',
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
  },
  freshnessText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
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
