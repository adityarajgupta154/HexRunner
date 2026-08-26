import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForegroundPermissions, type LocationObject } from 'expo-location';
import RunMap from '@/src/components/RunMap';
import PresenceOverlay from '@/src/components/PresenceOverlay';
import { useLivePresence } from '@/src/hooks/useLivePresence';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/src/context/AuthContext';
import { getClaimQualitySnapshot } from '@/src/services/claimQuality';
import {
  startWatching,
  stopWatching,
} from '@/src/services/locationTracker';
import {
  createClientRunId,
  type PendingRun,
  queueRunForSave,
} from '@/src/services/runStorage';
import { checkSession } from '@/src/services/antiSpoof';
import { runPresence } from '@/src/services/runPresence';
import { useLookupHexOwnership, useLookupSafetyAreas, useGetUserStats, getGetUserStatsQueryKey, type ExactPresence, type AnonymousPresence } from '@workspace/api-client-react';
import SafetyTools from '@/src/components/SafetyTools';
import CivicReportTools from '@/src/components/CivicReportTools';
import { useLiveInteractions } from '@/src/hooks/useLiveInteractions';
import { LiveInteractionsOverlay } from '@/src/components/LiveInteractionsOverlay';
import { WaveActionModal } from '@/src/components/WaveActionModal';
import { useQueryClient } from '@tanstack/react-query';
import { useGetCurrentEquityZone, getGetCurrentEquityZoneQueryKey } from '@workspace/api-client-react';
import { getEquityZoneDisplayState } from '@/src/services/equityZoneDisplay';
import { pointToSafetyArea } from '@/src/services/hexEngine';
import { voiceCompanion } from '@/src/services/voiceCompanion';
import { isCurrentSafetyAnnouncement } from '@/src/services/voiceCompanionController';
import { getTerritoryColor } from '@/src/services/territoryColor';

type RunPoint = {
  lat: number;
  lng: number;
  timestamp: number;
  accuracyMeters?: number;
  speedMetersPerSecond?: number;
  mocked?: boolean;
};

const EARTH_RADIUS_KM = 6_371;
const MIN_PACE_DISTANCE_KM = 0.01;
const CLAIM_RECALCULATION_INTERVAL = 3;

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceKm(from: RunPoint, to: RunPoint): number {
  const latitudeDelta = degreesToRadians(to.lat - from.lat);
  const longitudeDelta = degreesToRadians(to.lng - from.lng);
  const fromLatitude = degreesToRadians(from.lat);
  const toLatitude = degreesToRadians(to.lat);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_KM *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((unit) => unit.toString().padStart(2, '0'))
    .join(':');
}

function formatPace(elapsedSeconds: number, distanceKm: number): string {
  if (distanceKm < MIN_PACE_DISTANCE_KM) return '--:--';

  const paceSeconds = Math.round(elapsedSeconds / distanceKm);
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = paceSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function RunSessionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const targetLatitude = params.targetLatitude ? Number(params.targetLatitude) : null;
  const targetLongitude = params.targetLongitude ? Number(params.targetLongitude) : null;

  const {
    uid,
    loading: identityLoading,
    error: identityError,
    notice: identityNotice,
    dismissNotice: dismissIdentityNotice,
  } = useAuth();
  const startTimeRef = useRef<number | null>(null);
  const clientRunIdRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const lastPointRef = useRef<RunPoint | null>(null);
  const distanceKmRef = useRef(0);
  const totalPausedMsRef = useRef(0);
  const pauseStartTimeRef = useRef<number | null>(null);
  const locationCallbackRef = useRef<((location: LocationObject) => void) | null>(null);
  const announcedKilometreRef = useRef(0);
  const observedSafetyAreaRef = useRef<string | null>(null);
  const announcedPresenceRef = useRef(false);
  const voiceEnabledRef = useRef(false);
  const voicePreferenceLoadedRef = useRef(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [pathPoints, setPathPoints] = useState<RunPoint[]>([]);
  const [claimedHexes, setClaimedHexes] = useState<Set<string>>(new Set());
  const [pendingCoverageHexes, setPendingCoverageHexes] = useState(0);
  const [poorAccuracyHexes, setPoorAccuracyHexes] = useState(0);
  const [contestedHexes, setContestedHexes] = useState<Set<string>>(new Set());
  const [runAwaitingCache, setRunAwaitingCache] =
    useState<PendingRun | null>(null);
  const [isCachingRun, setIsCachingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voicePreferenceLoaded, setVoicePreferenceLoaded] = useState(false);
  const ownershipLookup = useLookupHexOwnership();
  const safetyLookup = useLookupSafetyAreas();
  const queryClient = useQueryClient();
  const [appStateStatus, setAppStateStatus] = useState<AppStateStatus>(
    AppState.currentState,
  );
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [locationPermission, requestLocationPermission] = useForegroundPermissions();

  const { data: userStats } = useGetUserStats(uid ?? '', {
    query: { enabled: !!uid, queryKey: getGetUserStatsQueryKey(uid ?? '') },
  });
  const myColor = getTerritoryColor(userStats?.baseline?.territoryColor);

  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const currentPoint = pathPoints[pathPoints.length - 1] ?? null;
  const presenceLocation = currentPoint ? {
    latitude: currentPoint.lat,
    longitude: currentPoint.lng,
    accuracy: currentPoint.accuracyMeters || 100,
    mocked: currentPoint.mocked || false
  } : null;

  const presence = useLivePresence({
    enabled: isFocused && isRunning && !isPaused,
    location: presenceLocation,
    mode: 'run'
  });
  const shouldPollEquity =
    isFocused &&
    isRunning &&
    !isPaused &&
    appStateStatus === 'active' &&
    !!uid &&
    presence.hasSnapshot;
  const {
    data: equityStatus,
    isFetching: isFetchingEquity,
    isError: isErrorEquity,
  } = useGetCurrentEquityZone({
    query: {
      enabled: shouldPollEquity,
      refetchInterval: shouldPollEquity ? 10_000 : false,
      queryKey: getGetCurrentEquityZoneQueryKey(),
    },
  });

  const interactions = useLiveInteractions(isFocused && isRunning && !isPaused, presence.hasSnapshot);
  const [selectedRunner, setSelectedRunner] = useState<ExactPresence | AnonymousPresence | null>(null);

  useEffect(() => {
    let mounted = true;
    void voiceCompanion.loadPreference().then((enabled) => {
      if (mounted) {
        voiceEnabledRef.current = enabled;
        voicePreferenceLoadedRef.current = true;
        setVoiceEnabled(enabled);
        setVoicePreferenceLoaded(true);
      }
    });
    return () => {
      mounted = false;
      voiceCompanion.endRun();
    };
  }, []);

  useEffect(() => {
    if (!isRunning || !voiceEnabled) return;
    const fullKilometres = Math.floor(distanceKm);
    for (
      let kilometre = announcedKilometreRef.current + 1;
      kilometre <= fullKilometres;
      kilometre += 1
    ) {
      voiceCompanion.announce({
        id: `kilometre:${kilometre}`,
        text: `${kilometre} kilometre${kilometre === 1 ? '' : 's'} complete.`,
        priority: 10,
      });
    }
    announcedKilometreRef.current = Math.max(
      announcedKilometreRef.current,
      fullKilometres,
    );
  }, [distanceKm, isRunning, voiceEnabled]);

  useEffect(() => {
    if (!isRunning || !voiceEnabled) return;
    interactions.events
      .filter((event) => event.kind === 'contest')
      .forEach((contestEvent) => {
        voiceCompanion.announce({
          id: `contest:${contestEvent.id}`,
          text: 'A nearby territory contest is active.',
          priority: 20,
        });
      });
  }, [interactions.events, isRunning, voiceEnabled]);

  useEffect(() => {
    if (!isRunning || !voiceEnabled || announcedPresenceRef.current) return;
    if (presence.nearestExactRunner || presence.anonymousRunners.length > 0) {
      announcedPresenceRef.current = true;
      voiceCompanion.announce({
        id: 'nearby-runner:first',
        text: 'Ghost Race activity is nearby.',
        priority: 5,
      });
    }
  }, [
    isRunning,
    presence.anonymousRunners.length,
    presence.nearestExactRunner,
    voiceEnabled,
  ]);

  useEffect(() => {
    if (!isRunning) return;

    const updateElapsed = () => {
      if (startTimeRef.current === null) return;
      const now = Date.now();
      const currentPauseMs = isPausedRef.current && pauseStartTimeRef.current !== null
        ? (now - pauseStartTimeRef.current)
        : 0;
      setElapsedSeconds(
        Math.floor((now - startTimeRef.current - totalPausedMsRef.current - currentPauseMs) / 1_000)
      );
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1_000);
    return () => clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      setAppStateStatus(nextState);
      const clientRunId = clientRunIdRef.current;
      if (!clientRunId || !runningRef.current) return;

      if (nextState === 'active') {
        if (!isPausedRef.current) {
          runPresence.resumeRun(clientRunId);
          voiceCompanion.resume();
        }
      } else {
        runPresence.pauseRun(clientRunId);
        voiceCompanion.pause();
      }
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
      stopWatching();
      voiceCompanion.endRun();
      const clientRunId = clientRunIdRef.current;
      if (clientRunId) {
        runPresence.endRun(clientRunId);
      }
      runningRef.current = false;
    };
  }, []);

  const startSession = useCallback(async () => {
    if (runAwaitingCache) {
      setError('Save the completed run before starting another one.');
      return;
    }

    if (!uid) {
      setError(
        identityError ?? 'Your local HexRunner identity is not ready yet.',
      );
      return;
    }

    setIsStarting(true);
    setError(null);
    setElapsedSeconds(0);
    setDistanceKm(0);
    setPathPoints([]);
    setClaimedHexes(new Set());
    setPendingCoverageHexes(0);
    setPoorAccuracyHexes(0);
    setContestedHexes(new Set());
    announcedKilometreRef.current = 0;
    observedSafetyAreaRef.current = null;
    announcedPresenceRef.current = false;
    distanceKmRef.current = 0;
    totalPausedMsRef.current = 0;
    pauseStartTimeRef.current = null;
    const clientRunId = createClientRunId();
    clientRunIdRef.current = clientRunId;
    queryClient.removeQueries({ queryKey: getGetCurrentEquityZoneQueryKey() });
    runningRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;
    runPresence.beginRun(clientRunId, AppState.currentState === 'active');
    voiceCompanion.beginRun();
    lastPointRef.current = null;
    startTimeRef.current = null;

    locationCallbackRef.current = (location) => {
      if (clientRunIdRef.current !== clientRunId) return;

      runPresence.publishLocation(clientRunId, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        mocked: location.mocked,
      });
      if (startTimeRef.current === null) {
        startTimeRef.current = location.timestamp;
      }
      const nextPoint: RunPoint = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        timestamp: location.timestamp,
        accuracyMeters: location.coords.accuracy ?? undefined,
        speedMetersPerSecond: location.coords.speed ?? undefined,
        mocked: location.mocked ?? undefined,
      };
      const safetyArea = pointToSafetyArea(nextPoint.lat, nextPoint.lng);
      if (
        voicePreferenceLoadedRef.current &&
        voiceEnabledRef.current &&
        observedSafetyAreaRef.current !== safetyArea
      ) {
        observedSafetyAreaRef.current = safetyArea;
        safetyLookup.mutate(
          { data: { areaH3Indexes: [safetyArea] } },
          {
            onSuccess: (result) => {
              if (
                !isCurrentSafetyAnnouncement({
                  requestedRunId: clientRunId,
                  requestedAreaId: safetyArea,
                  currentRunId: clientRunIdRef.current,
                  currentAreaId: observedSafetyAreaRef.current,
                  isRunning: runningRef.current,
                })
              ) {
                return;
              }
              const advisory = result.areas[0];
              if (
                advisory?.concernScore !== null &&
                advisory.concernScore >= 50 &&
                advisory.confidence !== 'insufficient'
              ) {
                voiceCompanion.announce({
                  id: `safety-area:${advisory.areaH3Index}`,
                  text: 'A coarse community advisory exists for this area. Stay aware of your surroundings.',
                  priority: 100,
                  cooldownKey: 'safety-advisory',
                });
              }
            },
          },
        );
      }
      const previousPoint = lastPointRef.current;

      if (previousPoint) {
        distanceKmRef.current += haversineDistanceKm(
          previousPoint,
          nextPoint,
        );
        setDistanceKm(distanceKmRef.current);
      }

      lastPointRef.current = nextPoint;
      setPathPoints((currentPath) => {
        const nextPath = [...currentPath, nextPoint];

        if (
          nextPath.length === 1 ||
          nextPath.length % CLAIM_RECALCULATION_INTERVAL === 0
        ) {
          try {
            const quality = getClaimQualitySnapshot(nextPath);
            setClaimedHexes(new Set(quality.eligibleHexes));
            setPendingCoverageHexes(quality.pendingHexes.length);
            setPoorAccuracyHexes(quality.rejectedAccuracyHexes.length);
            if (quality.eligibleHexes.length > 0) {
              ownershipLookup.mutate(
                { data: { h3Indexes: quality.eligibleHexes } },
                {
                  onSuccess: (result) => {
                    setContestedHexes(
                      new Set(
                        result.ownership
                          .filter((hex) => hex.ownerId && hex.ownerId !== uid)
                          .map((hex) => hex.h3Index),
                      ),
                    );
                  },
                },
              );
            } else {
              setContestedHexes(new Set());
            }
          } catch (hexError) {
            console.error(
              '[HexRunner] Unable to update claimed hexes during the run.',
              hexError,
            );
            setError(
              'Territory calculation paused. Your GPS path is still being recorded.',
            );
          }
        }

        return nextPath;
      });
    };

    try {
      await startWatching((location) => locationCallbackRef.current?.(location));

      startTimeRef.current ??= Date.now();
      runningRef.current = true;
      setIsRunning(true);
    } catch (startError: unknown) {
      const message =
        startError instanceof Error
          ? startError.message
          : 'Unable to start this run.';
      setError(message);
      stopWatching();
      voiceCompanion.endRun();
      runPresence.endRun(clientRunId);
      clientRunIdRef.current = null;
      runningRef.current = false;
      startTimeRef.current = null;
    } finally {
      setIsStarting(false);
    }
  }, [identityError, ownershipLookup, queryClient, runAwaitingCache, safetyLookup, uid]);

  const cacheRunAndOpenSummary = useCallback(
    async (run: PendingRun) => {
      setIsCachingRun(true);
      setError(null);

      try {
        await queueRunForSave(run);
        setRunAwaitingCache(null);
        router.push({
          pathname: '/run-summary',
          params: {
            clientRunId: run.clientRunId,
            elapsedSeconds: run.elapsedSeconds.toString(),
            distanceKm: run.distanceKm.toString(),
            pointCount: run.points.length.toString(),
            hexCount: run.claimedHexes.length.toString(),
          },
        });
      } catch {
        setRunAwaitingCache(run);
        setError(
          'The run is still open here, but its recovery copy could not be saved. Retry before closing HexRunner.',
        );
      } finally {
        setIsCachingRun(false);
      }
    },
    [router],
  );

  const stopSession = useCallback(async () => {
    if (!uid) {
      setError('Your local HexRunner identity is unavailable.');
      stopWatching();
      voiceCompanion.endRun();
      const clientRunId = clientRunIdRef.current;
      if (clientRunId) {
        runPresence.endRun(clientRunId);
      }
      clientRunIdRef.current = null;
      runningRef.current = false;
      setIsRunning(false);
      return;
    }

    const endedAt = Date.now();
    const startedAt = startTimeRef.current ?? endedAt;
    if (isPausedRef.current && pauseStartTimeRef.current !== null) {
      totalPausedMsRef.current += (endedAt - pauseStartTimeRef.current);
      // clear pause start so we don't double count if something fails
      pauseStartTimeRef.current = null;
    }

    // Server validation requires: Math.abs(elapsed + paused - wallDuration) <= 5 seconds
    const wallDurationSeconds = Math.floor((endedAt - startedAt) / 1000);
    const finalPausedSeconds = Math.round(totalPausedMsRef.current / 1000);
    const finalElapsedSeconds = Math.max(0, wallDurationSeconds - finalPausedSeconds);
    const finalDistanceKm = distanceKmRef.current;
    let finalClaimedHexes: string[];
    try {
      finalClaimedHexes = getClaimQualitySnapshot(pathPoints).eligibleHexes;
    } catch (hexError) {
      console.error(
        '[HexRunner] Unable to finalize claimed hexes for this run.',
        hexError,
      );
      setError(
        'Territory could not be calculated yet. Your run is still open; tap Stop to retry.',
      );
      return;
    }
    const clientRunId = clientRunIdRef.current ?? createClientRunId();

    const antiSpoofCheck = checkSession(pathPoints);

    stopWatching();
    voiceCompanion.endRun();
    runPresence.endRun(clientRunId);
    clientRunIdRef.current = null;
    runningRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    isPausedRef.current = false;
    startTimeRef.current = null;

    const pendingRun: PendingRun = {
      clientRunId,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      elapsedSeconds: finalElapsedSeconds,
      pausedSeconds: finalPausedSeconds,
      distanceKm: finalDistanceKm,
      points: pathPoints,
      claimedHexes: finalClaimedHexes,
      antiSpoof: {
        flaggedSuspicious: antiSpoofCheck.suspicious,
        reason: antiSpoofCheck.reason ?? undefined,
        mockLocationDetected: pathPoints.some((point) => point.mocked),
      },
    };

    await cacheRunAndOpenSummary(pendingRun);
  }, [cacheRunAndOpenSummary, elapsedSeconds, pathPoints, uid]);

  const pace = formatPace(elapsedSeconds, distanceKm);
  const voiceAvailable = Platform.OS !== 'web';
  const toggleVoice = useCallback(async () => {
    if (!voiceAvailable) return;
    const nextEnabled = !voiceEnabled;
    voiceEnabledRef.current = nextEnabled;
    setVoiceEnabled(nextEnabled);
    await voiceCompanion.setEnabled(nextEnabled);
    if (nextEnabled && isRunning && !isPaused) {
      voiceCompanion.resume();
      voiceCompanion.announce({
        id: 'voice-enabled',
        text: 'Voice guidance enabled.',
        priority: 100,
      });
    }
  }, [isRunning, isPaused, voiceAvailable, voiceEnabled]);

  const togglePause = useCallback(() => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    isPausedRef.current = nextPaused;
    const clientRunId = clientRunIdRef.current;

    if (nextPaused) {
      stopWatching();
      pauseStartTimeRef.current = Date.now();
      if (clientRunId) runPresence.pauseRun(clientRunId);
      voiceCompanion.pause();
      lastPointRef.current = null;
    } else {
      if (pauseStartTimeRef.current !== null) {
        totalPausedMsRef.current += (Date.now() - pauseStartTimeRef.current);
        pauseStartTimeRef.current = null;
      }
      lastPointRef.current = null;
      if (clientRunId) runPresence.resumeRun(clientRunId);
      if (voiceEnabledRef.current) voiceCompanion.resume();

      startWatching((location) => locationCallbackRef.current?.(location)).catch((err) => {
        setError('Failed to restart GPS on resume.');
        setIsPaused(true);
        isPausedRef.current = true;
      });
    }
  }, [isPaused]);

  const isLocationReady = Platform.OS === 'web' || locationPermission?.granted;

  return (
    <View style={styles.screen}>
      <View style={StyleSheet.absoluteFill}>
        {isRunning ? (
          <RunMap
            currentPoint={pathPoints[pathPoints.length - 1] ?? null}
            pathPoints={pathPoints}
            claimedHexIndexes={claimedHexes}
            contestedHexIndexes={contestedHexes}
            exactRunners={presence.exactRunners}
            anonymousRunners={presence.anonymousRunners}
            onRunnerPress={setSelectedRunner}
            myColor={myColor}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1D24' }]} />
        )}
      </View>

      <View pointerEvents="box-none" style={[styles.headerFloating, { paddingTop: insets.top + 20 }]}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: voiceEnabled }}
          disabled={!voicePreferenceLoaded || !voiceAvailable}
          onPress={() => void toggleVoice()}
          style={[styles.voicePill, { opacity: !voicePreferenceLoaded || !voiceAvailable ? 0.65 : 1 }]}
        >
          <Feather name={voiceEnabled ? 'volume-2' : 'volume-x'} size={18} color="#000" />
        </Pressable>

        <View style={styles.statusPill}>
          <View style={[styles.statusDot2, { backgroundColor: isRunning ? (isPaused ? '#FF9500' : '#00FF00') : '#8E8E93' }]} />
          <Text style={styles.statusPillText}>{isRunning ? (isPaused ? 'PAUSED' : 'RECORDING') : 'READY'}</Text>
        </View>

        <View style={{ width: 44 }} />
      </View>

      {isRunning ? (
        <View
          style={[
            styles.bottomSheet,
            {
              bottom: 84,
              paddingBottom: Math.max(insets.bottom, 12) + 12,
            },
          ]}
        >
           <View style={styles.sheetHandle} />

           <View style={styles.metricsRow}>
             <View style={styles.metricCol}>
               <Text style={styles.metricLabel}>DISTANCE</Text>
               <Text style={styles.metricValue}>{distanceKm.toFixed(2)}</Text>
               <Text style={styles.metricUnit}>km</Text>
             </View>
             <View style={styles.metricCol}>
               <Text style={styles.metricLabel}>DURATION</Text>
               <Text style={styles.metricValue}>{formatElapsed(elapsedSeconds)}</Text>
               <Text style={styles.metricUnit}></Text>
             </View>
             <View style={styles.metricCol}>
               <Text style={styles.metricLabel}>PACE</Text>
               <Text style={styles.metricValue}>{pace}</Text>
               <Text style={styles.metricUnit}>/km</Text>
             </View>
           </View>

           <ScrollView style={{maxHeight: 180}} showsVerticalScrollIndicator={false}>
             <SafetyTools currentPoint={pathPoints[pathPoints.length - 1] ?? null} isRunning clientRunId={clientRunIdRef.current} />
             <CivicReportTools currentPoint={pathPoints[pathPoints.length - 1] ?? null} clientRunId={clientRunIdRef.current} />
           </ScrollView>

           <Pressable
             accessibilityRole="button"
             onPress={togglePause}
             style={({ pressed }) => [
               styles.pauseButton,
               { backgroundColor: isPaused ? '#00FF00' : '#FF9500' },
               pressed && { opacity: 0.85 }
             ]}
           >
             <Text style={[styles.pauseButtonText, { color: '#000' }]}>{isPaused ? 'Resume' : 'Pause Run'}</Text>
           </Pressable>

           <Pressable
             accessibilityRole="button"
             delayLongPress={600}
             onLongPress={() => void stopSession()}
             style={({ pressed }) => [
               styles.holdToFinish,
               pressed && { transform: [{ scale: 0.95 }] }
             ]}
           >
             <Text style={styles.holdToFinishText}>Hold to Finish</Text>
           </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.preflightSheet,
            {
              bottom: 84,
              paddingBottom: Math.max(insets.bottom, 12) + 20,
            },
          ]}
        >
          <View style={styles.sheetHandle} />

          <Text style={styles.preflightTitle}>
            {runAwaitingCache ? 'Save your completed run' : 'Ready to claim ground?'}
          </Text>
          <Text style={styles.preflightSubtitle}>
            {runAwaitingCache
              ? 'Retry the local recovery step before closing HexRunner.'
              : 'Start moving to record your route, distance, and pace.'}
          </Text>

          {!isLocationReady && Platform.OS !== 'web' ? (
            <View style={styles.permissionBox}>
              <Feather name="map-pin" size={18} color="#FF9500" />
              <Text style={styles.permissionText}>Location access is required.</Text>
              <Pressable
                onPress={() => {
                  if (locationPermission?.canAskAgain) {
                    void requestLocationPermission();
                  } else {
                    void Linking.openSettings();
                  }
                }}
                style={styles.permissionBtn}
              >
                <Text style={styles.permissionBtnText}>
                  {locationPermission?.canAskAgain ? 'ALLOW' : 'Open Settings'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {targetLatitude && targetLongitude ? (
            <View style={styles.noticeBox}>
              <Feather name="target" size={16} color="#007AFF" />
              <Text style={styles.noticeText}>Scouting target engaged. Paint loops at or around your destination to secure it.</Text>
            </View>
          ) : null}

          {error || identityError ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={16} color="#FF3B30" />
              <Text style={styles.errorText}>{error ?? identityError}</Text>
            </View>
          ) : null}

          {identityNotice ? (
            <View style={styles.noticeBox}>
              <Feather name="info" size={16} color="#007AFF" />
              <Text style={styles.noticeText}>{identityNotice}</Text>
              <Pressable onPress={() => void dismissIdentityNotice()} hitSlop={8} style={{marginLeft: 'auto'}}>
                <Feather name="x" size={16} color="#90949F" />
              </Pressable>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={isStarting || isCachingRun || (!runAwaitingCache && (identityLoading || !uid || !isLocationReady))}
            onPress={runAwaitingCache ? () => void cacheRunAndOpenSummary(runAwaitingCache) : startSession}
            style={({ pressed }) => [
              styles.startPreflightBtn,
              { opacity: pressed || isStarting || isCachingRun || (!runAwaitingCache && (identityLoading || !uid || !isLocationReady)) ? 0.6 : 1 }
            ]}
          >
            {isStarting || isCachingRun || (!runAwaitingCache && identityLoading) ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.startPreflightBtnText}>{runAwaitingCache ? 'RETRY SAVE' : 'START'}</Text>
            )}
          </Pressable>

          <Text style={styles.bgNote}>
            {Platform.OS === 'web'
              ? 'Web must keep tab active.'
              : 'Native continuous locked-screen tracking requires a development build.'}
          </Text>
        </View>
      )}

      <LiveInteractionsOverlay events={interactions.events} onDismiss={interactions.dismiss} />
      <WaveActionModal runner={selectedRunner} onClose={() => setSelectedRunner(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  title: {
    fontFamily: 'PermanentMarker_400Regular',
    fontSize: 29,
    letterSpacing: -0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 11,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.7,
  },
  readyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingBottom: 28,
  },
  readyCopy: {
    alignItems: 'center',
    gap: 7,
  },
  readyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    textAlign: 'center',
  },
  readySubtitle: {
    maxWidth: 310,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  startButton: {
    width: 176,
    height: 176,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 8,
    borderWidth: 4,
    transform: [{ rotate: '-2deg' }],
  },
  playIcon: {
    marginLeft: 5,
  },
  startButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 19,
    letterSpacing: 1.5,
  },
  permissionNote: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  runningContent: {
    gap: 10,
    paddingTop: 16,
    paddingBottom: 16,
  },
  runningScroll: {
    flex: 1,
  },
  voiceControl: {
    minHeight: 50,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voiceCopy: {
    flex: 1,
    gap: 2,
  },
  voiceLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  voiceMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  runMapFrame: {
    height: 226,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  equityContainer: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerFloating: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  voicePill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161920',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  statusDot2: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    color: '#FFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 24,
    zIndex: 10,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 24,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  metricCol: {
    alignItems: 'center',
  },
  metricLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#8E8E93',
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: 'Inter_900Black',
    fontSize: 40,
    color: '#000',
    letterSpacing: -1,
  },
  metricUnit: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#8E8E93',
    marginTop: -4,
  },
  holdToFinish: {
    backgroundColor: '#000',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  holdToFinishText: {
    color: '#FFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  pauseButton: {
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  pauseButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  preflightSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 24,
    zIndex: 10,
  },
  preflightTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 24,
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  preflightSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  permissionText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#D57B00',
  },
  permissionBtn: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  permissionBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#FFF',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEB',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#C93425',
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5F1FF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  noticeText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#007AFF',
  },
  startPreflightBtn: {
    backgroundColor: '#00FF00',
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  startPreflightBtnText: {
    fontFamily: 'Inter_900Black',
    fontSize: 18,
    color: '#000',
  },
  bgNote: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
  }
});
