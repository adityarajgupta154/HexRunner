import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  startWatching,
  stopWatching,
} from '@/src/services/locationTracker';

type RunPoint = {
  lat: number;
  lng: number;
  timestamp: number;
};

const EARTH_RADIUS_KM = 6_371;
const MIN_PACE_DISTANCE_KM = 0.01;

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
  const startTimeRef = useRef<number | null>(null);
  const lastPointRef = useRef<RunPoint | null>(null);
  const distanceKmRef = useRef(0);
  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [pathPoints, setPathPoints] = useState<RunPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => stopWatching, []);

  const startSession = useCallback(async () => {
    setIsStarting(true);
    setError(null);
    setElapsedSeconds(0);
    setDistanceKm(0);
    setPathPoints([]);
    distanceKmRef.current = 0;
    lastPointRef.current = null;

    try {
      await startWatching((location) => {
        const nextPoint: RunPoint = {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          timestamp: location.timestamp,
        };
        const previousPoint = lastPointRef.current;

        if (previousPoint) {
          distanceKmRef.current += haversineDistanceKm(
            previousPoint,
            nextPoint,
          );
          setDistanceKm(distanceKmRef.current);
        }

        lastPointRef.current = nextPoint;
        setPathPoints((currentPath) => [...currentPath, nextPoint]);
      });

      startTimeRef.current = Date.now();
      setIsRunning(true);
    } catch (startError: unknown) {
      const message =
        startError instanceof Error
          ? startError.message
          : 'Unable to start this run.';
      setError(message);
      stopWatching();
    } finally {
      setIsStarting(false);
    }
  }, []);

  const stopSession = useCallback(() => {
    const finalElapsedSeconds =
      startTimeRef.current === null
        ? elapsedSeconds
        : Math.floor((Date.now() - startTimeRef.current) / 1_000);
    const finalDistanceKm = distanceKmRef.current;

    stopWatching();
    setIsRunning(false);
    startTimeRef.current = null;

    router.push({
      pathname: '/run-summary',
      params: {
        elapsedSeconds: finalElapsedSeconds.toString(),
        distanceKm: finalDistanceKm.toString(),
        pointCount: pathPoints.length.toString(),
      },
    });
  }, [elapsedSeconds, pathPoints.length, router]);

  const pace = formatPace(elapsedSeconds, distanceKm);

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
            Run Session
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

      {isRunning ? (
        <View style={styles.runningContent}>
          <View style={styles.elapsedBlock}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
              ELAPSED TIME
            </Text>
            <Text style={[styles.elapsedValue, { color: colors.foreground }]}>
              {formatElapsed(elapsedSeconds)}
            </Text>
          </View>

          <View style={styles.statRow}>
            <MetricCard
              label="DISTANCE"
              value={distanceKm.toFixed(2)}
              unit="km"
            />
            <MetricCard label="PACE" value={pace} unit="min/km" />
          </View>

          <View
            style={[
              styles.gpsCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="navigation" size={20} color={colors.primary} />
            <View style={styles.gpsTextBlock}>
              <Text style={[styles.gpsTitle, { color: colors.foreground }]}>
                GPS path recording
              </Text>
              <Text
                style={[styles.gpsMeta, { color: colors.mutedForeground }]}
              >
                {pathPoints.length} location{' '}
                {pathPoints.length === 1 ? 'point' : 'points'} captured
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop run"
            onPress={stopSession}
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
        </View>
      ) : (
        <View style={styles.readyContent}>
          <View style={styles.readyCopy}>
            <Text style={[styles.readyTitle, { color: colors.foreground }]}>
              Ready to claim ground?
            </Text>
            <Text
              style={[styles.readySubtitle, { color: colors.mutedForeground }]}
            >
              Start moving to record your route, distance, and pace.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start run"
            disabled={isStarting}
            onPress={startSession}
            style={({ pressed }) => [
              styles.startButton,
              {
                backgroundColor: colors.primary,
                borderColor: colors.accentForeground,
                opacity: pressed || isStarting ? 0.82 : 1,
              },
            ]}
          >
            {isStarting ? (
              <ActivityIndicator size="large" color={colors.primaryForeground} />
            ) : (
              <>
                <Feather
                  name="play"
                  size={34}
                  color={colors.primaryForeground}
                  style={styles.playIcon}
                />
                <Text
                  style={[
                    styles.startButtonText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  START
                </Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.permissionNote, { color: colors.mutedForeground }]}>
            Foreground location permission is required.
          </Text>

          {error ? (
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
                {error}
              </Text>
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
    unit: string;
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
        <Text style={[styles.metricUnit, { color: colors.primary }]}>{unit}</Text>
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
    fontFamily: 'Inter_700Bold',
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
    borderRadius: 88,
    borderWidth: 4,
    shadowColor: '#2DE0B0',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
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
    flex: 1,
    paddingTop: 38,
  },
  elapsedBlock: {
    alignItems: 'center',
    gap: 7,
    marginBottom: 30,
  },
  elapsedValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 49,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.5,
  },
  metricLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.1,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minHeight: 146,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 20,
    padding: 17,
  },
  metricValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 35,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    marginTop: 12,
  },
  metricUnit: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    marginTop: 2,
  },
  gpsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderRadius: 17,
    padding: 16,
    marginTop: 14,
  },
  gpsTextBlock: {
    gap: 3,
  },
  gpsTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  gpsMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  stopButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    borderRadius: 18,
    marginTop: 'auto',
  },
  stopIcon: {
    width: 15,
    height: 15,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  stopButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
});