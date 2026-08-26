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
import { useFocusEffect, useRouter } from 'expo-router';
import HexGrid from '@/src/components/HexGrid';
import TerritoryPaint from '@/src/components/TerritoryPaint';
import PresenceOverlay from '@/src/components/PresenceOverlay';
import { useLivePresence } from '@/src/hooks/useLivePresence';
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
  type ExactPresence,
  type AnonymousPresence,
} from '@workspace/api-client-react';
import { pointToHex } from '@/src/services/hexEngine';
import { useLiveInteractions } from '@/src/hooks/useLiveInteractions';
import { LiveInteractionsOverlay } from '@/src/components/LiveInteractionsOverlay';
import { WaveActionModal } from '@/src/components/WaveActionModal';
import { CoachTour } from '@/src/components/CoachTour';
import { getTerritoryColor } from '@/src/services/territoryColor';
import GlobeArrival from '@/src/components/GlobeArrival';
import { useReducedMotion } from 'react-native-reanimated';

const MAP_DELTA = {
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
};

const SIGNIFICANT_CENTER_MOVEMENT = 0.18;
const SIGNIFICANT_ZOOM_CHANGE = 0.15;
const MAX_HEX_REGION_DELTA = 0.12;
const HEX_REFRESH_INTERVAL = 15000;
let hasShownGlobeArrivalThisSession = false;

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
  { elementType: 'geometry', stylers: [{ color: '#0B171C' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#AFC2BC' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#071015' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#294148' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#102126' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#10251F' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#183039' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#091216' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#254A52' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#173039' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#061016' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#769792' }] },
];

export default function HomeScreen() {
  return <LiveMap />;
}

function LiveMap() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { uid } = useAuth();
  const router = useRouter();

  const mapRef = useRef<MapView | null>(null);
  const lastHexRegionRef = useRef<Region | null>(null);
  const [location, setLocation] = useState<LocationObject | null>(null);
  const [showGlobeArrival, setShowGlobeArrival] = useState(
    () => !hasShownGlobeArrivalThisSession,
  );
  const [visibleHexes, setVisibleHexes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOwnership, setHasLoadedOwnership] = useState(false);
  const [territoryComputationError, setTerritoryComputationError] =
    useState<string | null>(null);

  const [myHexes, setMyHexes] = useState<Set<string>>(new Set());
  const [otherHexes, setOtherHexes] = useState<Set<string>>(new Set());
  const [otherColors, setOtherColors] = useState<Map<string, string>>(new Map());
  const [territoryFreshness, setTerritoryFreshness] = useState<number | null>(null);
  const [safetyAreas, setSafetyAreas] = useState<SafetyAreaSignal[]>([]);
  const [civicAreas, setCivicAreas] = useState<CivicAreaSignal[]>([]);
  const [caretakerHexes, setCaretakerHexes] = useState<Set<string>>(new Set());
  const [showCivicLayer, setShowCivicLayer] = useState(true);
  const [cityIntelExpanded, setCityIntelExpanded] = useState(false);
  const [communityExpanded, setCommunityExpanded] = useState(false);
  const [mapMode, setMapMode] = useState<'live' | 'target'>('live');
  const [civicNotice, setCivicNotice] = useState<string | null>(null);

  const lookupMutation = useLookupHexOwnership();
  const safetyLookup = useLookupSafetyAreas();
  const civicLookup = useLookupCivicMap();
  const adoptZone = useAdoptCivicZone();
  const flagCivicReport = useFlagCivicReport();

  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const presenceLocation = location ? {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy || 100,
    mocked: location.mocked || false
  } : null;

  const presence = useLivePresence({
    enabled: isFocused,
    location: presenceLocation,
    mode: 'home'
  });

  const interactions = useLiveInteractions(isFocused, presence.hasSnapshot);
  const [selectedRunner, setSelectedRunner] = useState<ExactPresence | AnonymousPresence | null>(null);

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
          const newOtherColors = new Map<string, string>();
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
              if (hex.ownerTerritoryColor) {
                const colorHex = getTerritoryColor(hex.ownerTerritoryColor);
                if (colorHex) newOtherColors.set(hex.h3Index, colorHex);
              }
            }
          });

          setMyHexes(newMyHexes);
          setOtherHexes(newOtherHexes);
          setOtherColors(newOtherColors);
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
      if (
        region.latitudeDelta > MAX_HEX_REGION_DELTA ||
        region.longitudeDelta > MAX_HEX_REGION_DELTA
      ) {
        return;
      }

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
      if (showGlobeArrival) return;
      calculateVisibleHexes(region);
    },
    [calculateVisibleHexes, showGlobeArrival],
  );

  const recenterMap = useCallback(() => {
    if (!location) return;
    const localRegion = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      ...MAP_DELTA,
    };
    if (reducedMotion) {
      mapRef.current?.animateToRegion(localRegion, 240);
      calculateVisibleHexes(localRegion, true);
      return;
    }
    setShowGlobeArrival(true);
    if (Platform.OS !== 'web') {
      mapRef.current?.animateToRegion(
        {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 70,
          longitudeDelta: 70,
        },
        420,
      );
    }
  }, [calculateVisibleHexes, location, reducedMotion]);

  const startGlobeDescent = useCallback(() => {
    if (Platform.OS === 'web' || !location || reducedMotion) return;
    mapRef.current?.animateToRegion(
      {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        ...MAP_DELTA,
      },
      1200,
    );
  }, [location, reducedMotion]);

  const completeGlobeArrival = useCallback(() => {
    hasShownGlobeArrivalThisSession = true;
    setShowGlobeArrival(false);
    if (location) {
      const localRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        ...MAP_DELTA,
      };
      if (Platform.OS !== 'web' && reducedMotion) {
        mapRef.current?.animateToRegion(localRegion, 240);
      }
      calculateVisibleHexes(localRegion, true);
    }
  }, [calculateVisibleHexes, location, reducedMotion]);

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
  const initialRegion = showGlobeArrival && Platform.OS !== 'web' && !reducedMotion
    ? { latitude: coordinate.latitude, longitude: coordinate.longitude, latitudeDelta: 70, longitudeDelta: 70 }
    : { ...coordinate, ...MAP_DELTA };
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

  const myColor = getTerritoryColor(userStats?.baseline?.territoryColor);

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <View style={StyleSheet.absoluteFill}>
          <TerritoryPaint
            center={coordinate}
            claimedHexIndexes={myHexes}
            otherHexIndexes={otherHexes}
            myColor={myColor}
            otherColors={otherColors}
            showOwnershipPaint={false}
            safetyAreas={safetyAreas}
            civicAreas={showCivicLayer ? civicAreas : []}
            caretakerH3Indexes={
              showCivicLayer ? caretakerHexes : undefined
            }
            exactRunners={presence.exactRunners}
            anonymousRunners={presence.anonymousRunners}
            onRunnerPress={setSelectedRunner}
          />
          <HexGrid
            center={coordinate}
            hexIndexes={visibleHexes}
            claimedHexIndexes={myHexes}
            otherHexIndexes={otherHexes}
            myColor={myColor}
            otherColors={otherColors}
          />
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          customMapStyle={DARK_MAP_STYLE}
          minZoomLevel={showGlobeArrival ? 2 : 14}
          onMapReady={() => {
            if (!showGlobeArrival) calculateVisibleHexes(initialRegion, true);
          }}
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
            myColor={myColor}
            otherColors={otherColors}
          />
          <TerritoryPaint
            center={coordinate}
            claimedHexIndexes={myHexes}
            otherHexIndexes={otherHexes}
            myColor={myColor}
            otherColors={otherColors}
            showOwnershipPaint={false}
            safetyAreas={safetyAreas}
            civicAreas={showCivicLayer ? civicAreas : []}
            caretakerH3Indexes={
              showCivicLayer ? caretakerHexes : undefined
            }
            exactRunners={presence.exactRunners}
            anonymousRunners={presence.anonymousRunners}
            onRunnerPress={setSelectedRunner}
          />
        </MapView>
      )}

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 14 }]}>
        {/* Top Left: Territory Area */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open territory profile"
          onPress={() => router.push('/profile')}
          style={[styles.pill, { backgroundColor: colors.card, flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 6 }]}
        >
          <Text style={styles.territoryLabel}>YOUR TERRITORY</Text>
          <Text style={[styles.territoryValue, { color: '#F1F4EA' }]}><Text style={{ color: '#9CF04A' }}>{((userStats?.totals.totalHexesOwned ?? 0) * 0.01).toFixed(2)}</Text> KM²</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 3, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 2, backgroundColor: colors.primary }} />
              <Text style={{ fontSize: 9, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground }}>YOU</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 2, borderWidth: 1, borderColor: colors.destructive, borderStyle: 'dashed' }} />
              <Text style={{ fontSize: 9, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground }}>RIVAL</Text>
            </View>
          </View>
        </Pressable>

        {/* Top Center: Segmented Controls */}
        <View style={[styles.segmentedPill, { backgroundColor: '#161920' }]}>
           <Pressable
             accessibilityRole="tab"
             accessibilityState={{ selected: mapMode === 'live' }}
             onPress={() => setMapMode('live')}
             style={[styles.segmentOption, mapMode === 'live' && { backgroundColor: colors.primary }]}
           >
              <Text style={[styles.segmentText, { color: mapMode === 'live' ? colors.primaryForeground : colors.foreground }]}>LIVE</Text>
           </Pressable>
           <Pressable
             accessibilityRole="tab"
             accessibilityState={{ selected: mapMode === 'target' }}
             onPress={() => setMapMode('target')}
             style={[styles.segmentOption, mapMode === 'target' && { backgroundColor: colors.primary }]}
           >
              <Text style={[styles.segmentText, { color: mapMode === 'target' ? colors.primaryForeground : colors.foreground }]}>TARGET</Text>
           </Pressable>
        </View>

        {/* Top Right: Modes */}
        <View style={[styles.pill, { backgroundColor: colors.sheet }]}>
          <Feather name="activity" size={14} color={colors.sheetForeground} />
          <Text style={[styles.pillText, { color: colors.sheetForeground, marginLeft: 5 }]}>RUN</Text>
        </View>
      </View>

      {mapMode === 'target' ? (
        <View
          style={[
            styles.targetPreview,
            {
              top: insets.top + 72,
              backgroundColor: colors.card,
              borderColor: colors.primary,
            },
          ]}
        >
          <View style={styles.targetPreviewCopy}>
            <Text style={[styles.targetPreviewLabel, { color: colors.primary }]}>SCOUTING TARGET</Text>
            <Text style={[styles.targetPreviewText, { color: colors.foreground }]}>
              Pan to a zone. This is a static intention marker, not turn-by-turn navigation.
            </Text>
          </View>
          <Pressable accessibilityLabel="Scout this target area" onPress={() => {
            const currentCenter = lastHexRegionRef.current || coordinate;
            router.push({
              pathname: '/run',
              params: {
                targetLatitude: currentCenter.latitude,
                targetLongitude: currentCenter.longitude
              }
            });
          }}>
            <Feather name="arrow-up-right" size={22} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.aqiPanel, { top: insets.top + 62 }]}>
        <AirQualityCard
          latitude={coordinate.latitude}
          longitude={coordinate.longitude}
          expanded={cityIntelExpanded}
          onToggle={() => setCityIntelExpanded((current) => !current)}
        />
      </View>

      {!cityIntelExpanded && territoryFreshness !== null && territoryFreshness < 60 ? (
        <View
          pointerEvents="none"
          style={[
            styles.freshnessBadge,
            {
              top: insets.top + 126,
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

      {!cityIntelExpanded &&
      (presence.isOffline ||
        presence.isStale ||
        presence.nearestExactRunner ||
        presence.anonymousRunners.length > 0) ? (
        <View pointerEvents="box-none" style={[styles.presenceContainer, { top: insets.top + 126 }]}>
          <PresenceOverlay
            isLoading={presence.isLoading}
            hasSnapshot={presence.hasSnapshot}
            isOffline={presence.isOffline}
            isStale={presence.isStale}
            ambientCount={presence.ambientCount}
            nearestExactRunner={presence.nearestExactRunner}
            targetDirection={presence.targetDirection}
            anonymousCount={presence.anonymousRunners.length}
          />
        </View>
      ) : null}

      <View
        style={[
          styles.communityControls,
          {
            bottom: Math.max(insets.bottom, 12) + 150,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${communityExpanded ? 'Collapse' : 'Expand'} community and safety controls`}
          accessibilityState={{ expanded: communityExpanded }}
          onPress={() => setCommunityExpanded((current) => !current)}
          style={styles.communityHeader}
        >
          <View style={[styles.communityIcon, { backgroundColor: colors.accent }]}>
            <Feather name="shield" size={16} color={colors.primary} />
          </View>
          <View style={styles.communityHeaderCopy}>
            <Text style={[styles.communityHeaderLabel, { color: colors.mutedForeground }]}>
              COMMUNITY
            </Text>
            <Text numberOfLines={1} style={[styles.communityHeaderValue, { color: colors.foreground }]}>
              {safetyLookup.isError
                ? 'Signals unavailable'
                : civicAreas.length > 0
                  ? `${civicAreas.reduce((sum, area) => sum + area.totalReports, 0)} nearby report${civicAreas.reduce((sum, area) => sum + area.totalReports, 0) === 1 ? '' : 's'}`
                  : `Civic layer ${showCivicLayer ? 'on' : 'off'}`}
            </Text>
          </View>
          <Feather
            name={communityExpanded ? 'chevron-down' : 'chevron-up'}
            size={18}
            color={colors.mutedForeground}
          />
        </Pressable>

        {communityExpanded ? (
          <>
            <View style={[styles.safetyAdvisory, { borderTopColor: colors.border }]}>
              <Feather name="shield" size={15} color={colors.destructive} />
              <View style={styles.safetyAdvisoryCopy}>
                <Text style={[styles.safetyAdvisoryTitle, { color: colors.foreground }]}>
                  {safetyLookup.isPending
                    ? 'Loading safety signals…'
                    : safetyLookup.isError
                      ? 'Safety signals unavailable'
                      : safetyAreas.some((area) => area.concernScore !== null)
                        ? 'Crowdsourced caution nearby'
                        : 'No reviewed caution nearby'}
                </Text>
                <Text style={[styles.safetyAdvisoryText, { color: colors.mutedForeground }]}>
                  Community signals are coarse and may be unreviewed.
                </Text>
              </View>
            </View>
            <View style={styles.communityActionsRow}>
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
          </>
        ) : null}
      </View>
      {civicNotice ? (
        <View
          pointerEvents="none"
          style={[
            styles.civicNotice,
            {
              bottom: Math.max(insets.bottom, 12) + 278,
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
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Recenter map on current position"
        onPress={recenterMap}
        style={({ pressed }) => [
          styles.recenterButton,
          {
            bottom: Math.max(insets.bottom, 12) + 216,
            backgroundColor: 'rgba(8,16,19,0.92)',
            borderColor: 'rgba(184,211,199,0.25)',
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <Feather name="crosshair" size={22} color={colors.foreground} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/run')}
        style={({ pressed }) => [
          styles.startButton,
          {
            bottom: Math.max(insets.bottom, 12) + 82,
            opacity: pressed ? 0.82 : 1,
          }
        ]}
      >
        <Feather name="play" size={19} color="#081013" />
        <Text style={styles.startButtonText}>ARM RUN</Text>
      </Pressable>

      {showGlobeArrival ? (
        <GlobeArrival
          latitude={coordinate.latitude}
          longitude={coordinate.longitude}
          onZoomStart={startGlobeDescent}
          onComplete={completeGlobeArrival}
        />
      ) : null}

      <LiveInteractionsOverlay events={interactions.events} onDismiss={interactions.dismiss} />
      <WaveActionModal runner={selectedRunner} onClose={() => setSelectedRunner(null)} />

      {userStats && !userStats.baseline ? <BaselineOnboarding /> : null}

      <CoachTour />
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
  presenceContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  communityControls: {
    position: 'absolute',
    left: 16,
    right: 78,
    padding: 6,
    borderWidth: 1,
    borderRadius: 3,
  },
  communityHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
  },
  communityIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  communityHeaderCopy: {
    flex: 1,
  },
  communityHeaderLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.7,
  },
  communityHeaderValue: {
    marginTop: 2,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  communityActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: 6,
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
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 8,
    borderTopWidth: 1,
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
  targetPreview: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  targetPreviewCopy: {
    flex: 1,
  },
  targetPreviewLabel: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  targetPreviewText: {
    marginTop: 3,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
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
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: 1,
  },
  pill: {
    minHeight: 38,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(184,211,199,0.18)',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  pillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  territoryLabel: { color: '#A5B7B0', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  territoryValue: { marginTop: 1, fontFamily: 'Inter_700Bold', fontSize: 22, fontStyle: 'italic', letterSpacing: -1 },
  segmentedPill: {
    height: 38,
    borderRadius: 3,
    flexDirection: 'row',
    padding: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  segmentOption: {
    paddingHorizontal: 12,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  startButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 58,
    paddingHorizontal: 32,
    backgroundColor: '#9CF04A',
    borderRadius: 0,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  startButtonText: {
    color: '#081013',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 16,
    textTransform: 'uppercase',
  }
});
