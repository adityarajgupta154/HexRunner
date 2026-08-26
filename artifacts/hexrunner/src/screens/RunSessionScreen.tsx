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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useLookupHexOwnership, useLookupSafetyAreas, type ExactPresence, type AnonymousPresence } from '@workspace/api-client-react';
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
    enabled: isFocused && isRunning,
    location: presenceLocation,
    mode: 'run'
  });
  const shouldPollEquity =
    isFocused &&
    isRunning &&
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

  const interactions = useLiveInteractions(isFocused && isRunning, presence.hasSnapshot);
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
      setElapsedSeconds(
        Math.floor((Date.now() - startTimeRef.current) / 1_000),
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
        runPresence.resumeRun(clientRunId);
        voiceCompanion.resume();
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
    const clientRunId = createClientRunId();
    clientRunIdRef.current = clientRunId;
    queryClient.removeQueries({ queryKey: getGetCurrentEquityZoneQueryKey() });
    runningRef.current = true;
    runPresence.beginRun(clientRunId, AppState.currentState === 'active');
    voiceCompanion.beginRun();
    lastPointRef.current = null;
    startTimeRef.current = null;

    try {
      await startWatching((location) => {
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
      });

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
    const finalElapsedSeconds =
      startTimeRef.current === null
        ? elapsedSeconds
        : Math.floor((endedAt - startTimeRef.current) / 1_000);
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
    startTimeRef.current = null;

    const pendingRun: PendingRun = {
      clientRunId,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      elapsedSeconds: finalElapsedSeconds,
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
    if (nextEnabled && isRunning) {
      voiceCompanion.resume();
      voiceCompanion.announce({
        id: 'voice-enabled',
        text: 'Voice guidance enabled.',
        priority: 100,
      });
    }
  }, [isRunning, voiceAvailable, voiceEnabled]);

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 20,
          paddingBottom: Math.max(insets.bottom, 12) + 98,
        },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            HEXRUNNER
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            MAKE A MARK
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: isRunning ? colors.accent : colors.muted,
              borderColor: isRunning ? colors.primary : colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isRunning
                  ? colors.primary
                  : colors.mutedForeground,
              },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              {
                color: isRunning
                  ? colors.accentForeground
                  : colors.mutedForeground,
              },
            ]}
          >
            {isRunning ? 'RECORDING' : 'READY'}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{
          checked: voiceEnabled,
          disabled: !voicePreferenceLoaded || !voiceAvailable,
        }}
        accessibilityLabel="Voice guidance"
        accessibilityHint="Uses on-device speech only and never records microphone audio"
        disabled={!voicePreferenceLoaded || !voiceAvailable}
        testID="voice-guidance-toggle"
        onPress={() => void toggleVoice()}
        style={({ pressed }) => [
          styles.voiceControl,
          {
            backgroundColor: voiceEnabled ? colors.accent : colors.card,
            borderColor: voiceEnabled ? colors.primary : colors.border,
            opacity:
              pressed || !voicePreferenceLoaded || !voiceAvailable ? 0.65 : 1,
          },
        ]}
      >
        <Feather
          name={voiceEnabled ? 'volume-2' : 'volume-x'}
          size={18}
          color={voiceEnabled ? colors.primary : colors.mutedForeground}
        />
        <View style={styles.voiceCopy}>
          <Text style={[styles.voiceLabel, { color: colors.foreground }]}>
            {voiceAvailable
              ? `Voice guidance ${voiceEnabled ? 'on' : 'off'}`
              : 'Voice guidance unavailable on web'}
          </Text>
          <Text style={[styles.voiceMeta, { color: colors.mutedForeground }]}>
            {voiceAvailable
              ? 'On-device speech only · no microphone'
              : 'Use the iOS or Android app for on-device speech'}
          </Text>
        </View>
      </Pressable>

      {isRunning ? (
        <ScrollView
          style={styles.runningScroll}
          contentContainerStyle={styles.runningContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.runMapFrame}>
            <RunMap
              currentPoint={pathPoints[pathPoints.length - 1] ?? null}
              pathPoints={pathPoints}
              claimedHexIndexes={claimedHexes}
              contestedHexIndexes={contestedHexes}
              exactRunners={presence.exactRunners}
              anonymousRunners={presence.anonymousRunners}
              onRunnerPress={setSelectedRunner}
            />
          </View>

          <View style={styles.statRow}>
            <MetricCard
              label="TIME"
              value={formatElapsed(elapsedSeconds)}
            />
            <MetricCard
              label="DISTANCE"
              value={distanceKm.toFixed(2)}
              unit="km"
            />
            <MetricCard label="PACE" value={pace} unit="min/km" />
          </View>

          {(() => {
            const equityDisplayState = isRunning ? getEquityZoneDisplayState(equityStatus, isFetchingEquity, isErrorEquity) : 'unavailable';
            let equityContent;
            let equityBg = colors.card;
            let equityBorder = colors.border;
            switch (equityDisplayState) {
              case 'checking':
                equityContent = <Text style={[styles.equityText, { color: colors.mutedForeground }]}>CHECKING REWARD STATUS...</Text>;
                break;
              case 'cold_zone_active':
                equityContent = (
                  <View style={styles.equityActiveRow}>
                    <Feather name="zap" size={15} color={colors.primaryForeground} />
                    <Text style={[styles.equityTextActive, { color: colors.primaryForeground }]}>COLD ZONE — 2X</Text>
                  </View>
                );
                equityBg = colors.primary;
                equityBorder = colors.primary;
                break;
              case 'standard':
                equityContent = <Text style={[styles.equityText, { color: colors.foreground }]}>STANDARD ZONE — 1X</Text>;
                break;
              case 'insufficient_data':
                equityContent = <Text style={[styles.equityText, { color: colors.mutedForeground }]}>ZONE BONUS UNAVAILABLE — MORE CITY ACTIVITY NEEDED</Text>;
                break;
              case 'stale_error':
                equityContent = <Text style={[styles.equityText, { color: colors.mutedForeground }]}>SIGNAL LOST — FINAL CREDIT CONFIRMED ON SAVE</Text>;
                break;
              case 'unavailable':
              default:
                equityContent = <Text style={[styles.equityText, { color: colors.mutedForeground }]}>WAITING FOR SERVER-VERIFIED ZONE</Text>;
                break;
            }
            return (
              <View style={[styles.equityContainer, { backgroundColor: equityBg, borderColor: equityBorder }]}>
                {equityContent}
              </View>
            );
          })()}

          <SafetyTools
            currentPoint={pathPoints[pathPoints.length - 1] ?? null}
            isRunning
            clientRunId={clientRunIdRef.current}
          />
          <CivicReportTools
            currentPoint={pathPoints[pathPoints.length - 1] ?? null}
            clientRunId={clientRunIdRef.current}
          />

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

          <View
            style={[
              styles.claimedCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.claimedIcon}>
              <Feather name="hexagon" size={20} color={colors.primary} />
            </View>
            <View style={styles.claimedTextBlock}>
              <Text style={[styles.claimedText, { color: colors.foreground }]}>
                Paint-ready zones: {claimedHexes.size}
              </Text>
              <Text
                style={[styles.claimedMeta, { color: colors.mutedForeground }]}
              >
                {pendingCoverageHexes > 0
                  ? `${pendingCoverageHexes} zone${pendingCoverageHexes === 1 ? '' : 's'} need 6s of coverage`
                  : poorAccuracyHexes > 0
                    ? `${poorAccuracyHexes} zone${poorAccuracyHexes === 1 ? '' : 's'} skipped for poor GPS accuracy`
                    : `${pathPoints.length} location ${pathPoints.length === 1 ? 'point' : 'points'} captured`}
              </Text>
            </View>
          </View>

          {contestedHexes.size > 0 ? (
            <View style={[styles.contestCard, { backgroundColor: colors.accent, borderColor: colors.primary }]}>
              <Feather name="crosshair" size={17} color={colors.primary} />
              <Text style={[styles.contestText, { color: colors.accentForeground }]}>
                Painting over {contestedHexes.size} rival {contestedHexes.size === 1 ? 'zone' : 'zones'} — finish your coverage to take them over.
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop run"
            onPress={() => void stopSession()}
            style={({ pressed }) => [
              styles.stopButton,
              {
                backgroundColor: colors.destructive,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <View style={styles.stopIcon} />
            <Text
              style={[
                styles.stopButtonText,
                { color: colors.destructiveForeground },
              ]}
            >
              Stop Run
            </Text>
          </Pressable>

          <LiveInteractionsOverlay events={interactions.events} onDismiss={interactions.dismiss} />
          <WaveActionModal runner={selectedRunner} onClose={() => setSelectedRunner(null)} />
        </ScrollView>
      ) : (
        <View style={styles.readyContent}>
          <View style={styles.readyCopy}>
            <Text style={[styles.readyTitle, { color: colors.foreground }]}>
              {runAwaitingCache
                ? 'Save your completed run'
                : 'Ready to claim ground?'}
            </Text>
            <Text
              style={[styles.readySubtitle, { color: colors.mutedForeground }]}
            >
              {runAwaitingCache
                ? 'Retry the local recovery step before closing HexRunner.'
                : 'Start moving to record your route, distance, and pace.'}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start run"
            disabled={
              isStarting ||
              isCachingRun ||
              (!runAwaitingCache && (identityLoading || !uid))
            }
            onPress={
              runAwaitingCache
                ? () => void cacheRunAndOpenSummary(runAwaitingCache)
                : startSession
            }
            style={({ pressed }) => [
              styles.startButton,
              {
                backgroundColor: colors.primary,
                borderColor: colors.accentForeground,
                opacity:
                  pressed ||
                  isStarting ||
                  isCachingRun ||
                  (!runAwaitingCache && (identityLoading || !uid))
                    ? 0.6
                    : 1,
              },
            ]}
          >
            {isStarting || isCachingRun || (!runAwaitingCache && identityLoading) ? (
              <ActivityIndicator size="large" color={colors.primaryForeground} />
            ) : (
              <>
                <Feather
                  name={runAwaitingCache ? 'upload-cloud' : 'play'}
                  size={34}
                  color={colors.primaryForeground}
                  style={runAwaitingCache ? undefined : styles.playIcon}
                />
                <Text
                  style={[
                    styles.startButtonText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  {runAwaitingCache ? 'RETRY SAVE' : 'START'}
                </Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.permissionNote, { color: colors.mutedForeground }]}>
            {runAwaitingCache
              ? 'Keep HexRunner open until the summary appears.'
              : 'Foreground location permission is required.'}
          </Text>

          <SafetyTools currentPoint={null} isRunning={false} clientRunId={null} />

          {error || identityError ? (
            <View
              style={[
                styles.errorCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.destructive,
                },
              ]}
            >
              <Feather
                name="alert-circle"
                size={18}
                color={colors.destructive}
              />
              <Text style={[styles.errorText, { color: colors.foreground }]}>
                {error ?? identityError}
              </Text>
            </View>
          ) : null}

          {identityNotice ? (
            <View
              style={[
                styles.errorCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.primary,
                },
              ]}
            >
              <Feather name="info" size={18} color={colors.primary} />
              <Text style={[styles.errorText, { color: colors.foreground }]}>
                {identityNotice}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss identity notice"
                hitSlop={8}
                onPress={() => void dismissIdentityNotice()}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );

  function MetricCard({
    label,
    value,
    unit,
  }: {
    label: string;
    value: string;
    unit?: string;
  }) {
    return (
      <View
        style={[
          styles.metricCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <Text style={[styles.metricValue, { color: colors.foreground }]}>
          {value}
        </Text>
        {unit ? (
          <Text style={[styles.metricUnit, { color: colors.primary }]}>
            {unit}
          </Text>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
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
  errorCard: {
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
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
  metricLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.1,
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
  equityText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.1,
    textAlign: 'center',
  },
  equityActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  equityTextActive: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  metricCard: {
    flex: 1,
    minHeight: 88,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: 11,
  },
  metricValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    marginTop: 8,
  },
  metricUnit: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    marginTop: 2,
  },
  claimedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 13,
    minHeight: 58,
  },
  claimedIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: 'rgba(45, 224, 176, 0.12)',
  },
  claimedTextBlock: {
    flex: 1,
    gap: 2,
  },
  claimedText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  claimedMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  contestCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  contestText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  stopButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    borderRadius: 18,
    marginTop: 2,
  },
  stopIcon: {
    width: 15,
    height: 15,
    borderRadius: 3,
    backgroundColor: '#F2E8D5',
  },
  stopButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
});
