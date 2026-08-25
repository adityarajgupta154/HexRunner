import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  clearPendingRun,
  savePendingRun,
} from '@/src/services/runStorage';
import { useAuth } from '@/src/context/AuthContext';
import { useGetUserStats, getGetUserStatsQueryKey } from '@workspace/api-client-react';
import { predictFitnessProfile } from '@/src/services/fitnessModel';
import type { SaveRunResult } from '@workspace/api-client-react';
import {
  isRunSummaryDoneDisabled,
  isRunSummaryRetryVisible,
  runSummarySaveAttempt,
  type RunSummarySaveStatus,
} from '@/src/services/runSummaryState';

function numberParam(value: string | string[] | undefined): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return [hours, minutes, seconds]
    .map((unit) => unit.toString().padStart(2, '0'))
    .join(':');
}

function formatPace(elapsedSeconds: number, distanceKm: number): string {
  if (distanceKm < 0.01) return '--:--';
  const paceSeconds = Math.round(elapsedSeconds / distanceKm);
  return `${Math.floor(paceSeconds / 60)}:${(paceSeconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

export default function RunSummaryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { uid } = useAuth();
  const saveStartedRef = useRef(false);
  const [saveStatus, setSaveStatus] =
    useState<RunSummarySaveStatus>('saving');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SaveRunResult | null>(null);

  const { data: userStats, refetch: refetchStats } = useGetUserStats(uid ?? '', {
    query: { enabled: !!uid, queryKey: getGetUserStatsQueryKey(uid ?? '') },
  });

  const fitnessProfile = React.useMemo(() => {
    if (!userStats?.recentRuns) return predictFitnessProfile([]);
    return predictFitnessProfile(userStats.recentRuns, 'casual');
  }, [userStats]);

  const params = useLocalSearchParams<{
    clientRunId?: string;
    elapsedSeconds?: string;
    distanceKm?: string;
    pointCount?: string;
    hexCount?: string;
  }>();

  const clientRunId = stringParam(params.clientRunId);
  const elapsedSeconds = numberParam(params.elapsedSeconds);
  const distanceKm = numberParam(params.distanceKm);
  const pointCount = numberParam(params.pointCount);
  const hexCount = numberParam(params.hexCount);

  const persistRun = useCallback(async () => {
    await runSummarySaveAttempt({
      clientRunId,
      savePendingRun,
      observer: {
        onSaving() {
          setSaveStatus('saving');
          setSaveError(null);
        },
        onSaved(result) {
          setSaveResult(result);
          setSaveStatus('saved');
          void refetchStats();
        },
        onFailed(message) {
          setSaveError(message);
          setSaveStatus('failed');
        },
      },
    });
  }, [clientRunId, refetchStats]);

  useEffect(() => {
    if (saveStartedRef.current) return;
    saveStartedRef.current = true;
    void persistRun();
  }, [persistRun]);

  const finish = useCallback(async () => {
    await clearPendingRun(clientRunId);
    router.replace('/run');
  }, [clientRunId, router]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 26, paddingBottom: insets.bottom + 24 }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={[styles.successIcon, { backgroundColor: colors.accent, borderColor: colors.primary }]}>
            <Feather name="check" size={38} color={colors.primary} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>RUN COMPLETE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Session Summary</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {saveStatus === 'saved'
              ? 'Your route and claimed territory are stored in Replit.'
              : saveStatus === 'failed'
                ? 'Your run is complete, but it still needs to be saved.'
                : 'Saving your route and claimed territory to Replit…'}
          </Text>
        </View>

        <View style={styles.stats}>
          <SummaryCard icon="clock" label="TIME" value={formatElapsed(elapsedSeconds)} />
          <View style={styles.smallCardRow}>
            <SummaryCard compact icon="navigation" label="DISTANCE" value={distanceKm.toFixed(2)} unit="km" />
            <SummaryCard compact icon="zap" label="PACE" value={formatPace(elapsedSeconds, distanceKm)} unit="min/km" />
          </View>
          <View style={[styles.pointsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="map-pin" size={19} color={colors.primary} />
            <Text style={[styles.pointsText, { color: colors.mutedForeground }]}>
              {Math.floor(pointCount)} GPS {Math.floor(pointCount) === 1 ? 'point' : 'points'} · {Math.floor(hexCount)} {Math.floor(hexCount) === 1 ? 'hex' : 'hexes'} claimed
            </Text>
          </View>
        </View>

        {saveResult ? (
          <View style={[styles.hexResultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.hexResultRow}>
              <View style={styles.hexResultItem}>
                <Text style={[styles.hexResultLabel, { color: colors.mutedForeground }]}>NEW</Text>
                <Text style={[styles.hexResultValue, { color: colors.primary }]}>+{saveResult.newHexes}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.hexResultItem}>
                <Text style={[styles.hexResultLabel, { color: colors.mutedForeground }]}>STOLEN</Text>
                <Text style={[styles.hexResultValue, { color: colors.accentForeground }]}>{saveResult.stolenHexes}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.hexResultItem}>
                <Text style={[styles.hexResultLabel, { color: colors.mutedForeground }]}>TOTAL CLAIMED</Text>
                <Text style={[styles.hexResultValue, { color: colors.foreground }]}>{saveResult.claimedHexes}</Text>
              </View>
            </View>

            <View
              style={[
                styles.progressContainer,
                { borderTopColor: colors.border },
              ]}
            >
              <View style={styles.progressHeader}>
                <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>DAILY TARGET</Text>
                <Text style={[styles.progressValues, { color: colors.foreground }]}>
                  {saveResult.claimedHexes} / {fitnessProfile.budget}
                </Text>
              </View>
              <View style={[styles.progressBarBg, { backgroundColor: colors.muted }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      backgroundColor: saveResult.claimedHexes >= fitnessProfile.budget ? colors.accentForeground : colors.primary,
                      width: `${Math.min(100, (saveResult.claimedHexes / Math.max(1, fitnessProfile.budget)) * 100)}%`
                    }
                  ]}
                />
              </View>
            </View>

            {saveResult.antiSpoof.flaggedSuspicious ||
            saveResult.antiSpoof.mockLocationDetected ? (
              <View style={[styles.warningBox, { backgroundColor: colors.muted, borderColor: colors.destructive }]}>
                <Feather name="alert-triangle" size={14} color={colors.destructive} />
                <Text style={[styles.warningText, { color: colors.destructiveForeground }]}>
                  {saveResult.antiSpoof.reason ??
                    'This run contains unusual location signals and was saved with an advisory flag.'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.saveCard, { backgroundColor: colors.card, borderColor: saveStatus === 'failed' ? colors.destructive : colors.border }]}>
          {saveStatus === 'saving' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Feather
              name={saveStatus === 'saved' ? 'cloud' : 'alert-circle'}
              size={20}
              color={saveStatus === 'saved' ? colors.primary : colors.destructive}
            />
          )}
          <View style={styles.saveCopy}>
            <Text style={[styles.saveTitle, { color: colors.foreground }]}>
              {saveStatus === 'saving' ? 'Saving run' : saveStatus === 'saved' ? 'Saved to Replit' : 'Save failed'}
            </Text>
            {isRunSummaryRetryVisible(saveStatus) ? (
              <Text numberOfLines={2} style={[styles.saveError, { color: colors.mutedForeground }]}>
                {saveError}
              </Text>
            ) : null}
          </View>
          {isRunSummaryRetryVisible(saveStatus) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry saving run"
              onPress={() => void persistRun()}
              style={({ pressed }) => [styles.retryButton, { borderColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
            </Pressable>
          ) : null}
        </View>

      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          disabled={isRunSummaryDoneDisabled(saveStatus)}
          onPress={() => void finish()}
          style={({ pressed }) => [
            styles.doneButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed || saveStatus !== 'saved' ? 0.58 : 1,
            },
          ]}
        >
          <Text style={[styles.doneButtonText, { color: colors.primaryForeground }]}>Done</Text>
          <Feather name="arrow-right" size={19} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );

  function SummaryCard({
    compact = false,
    icon,
    label,
    value,
    unit,
  }: {
    compact?: boolean;
    icon: keyof typeof Feather.glyphMap;
    label: string;
    value: string;
    unit?: string;
  }) {
    return (
      <View style={[styles.summaryCard, compact && styles.compactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardLabelRow}>
          <Feather name={icon} size={17} color={colors.primary} />
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>{label}</Text>
        </View>
        <Text style={[compact ? styles.compactValue : styles.largeValue, { color: colors.foreground }]}>{value}</Text>
        {unit ? <Text style={[styles.cardUnit, { color: colors.primary }]}>{unit}</Text> : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
  },
  successIcon: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    borderWidth: 1,
    marginTop: 16,
    marginBottom: 22,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.8,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 31,
    letterSpacing: -0.7,
    marginTop: 6,
  },
  subtitle: {
    maxWidth: 320,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
  },
  stats: {
    width: '100%',
    gap: 12,
    marginTop: 30,
  },
  summaryCard: {
    width: '100%',
    minHeight: 126,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
  },
  smallCardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  compactCard: {
    flex: 1,
    minHeight: 142,
  },
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  largeValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    fontVariant: ['tabular-nums'],
    marginTop: 13,
  },
  compactValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 29,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    marginTop: 15,
  },
  cardUnit: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    marginTop: 2,
  },
  pointsCard: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 16,
  },
  pointsText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  hexResultCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  hexResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hexResultItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  divider: {
    width: 1,
    height: 32,
  },
  hexResultLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  hexResultValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
  },
  progressContainer: {
    paddingTop: 12,
    borderTopWidth: 1,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  progressValues: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  warningText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
  saveCard: {
    width: '100%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 15,
    marginTop: 12,
  },
  saveCopy: {
    flex: 1,
    gap: 2,
  },
  saveTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  saveError: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 15,
  },
  retryButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
  },
  retryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  footer: {
    paddingHorizontal: 20,
  },
  doneButton: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
  },
  doneButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
});