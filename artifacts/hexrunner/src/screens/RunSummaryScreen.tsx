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
import {
  getGetLeaderboardQueryKey,
  getGetUserStatsQueryKey,
  useGetUserStats,
} from '@workspace/api-client-react';
import { predictFitnessProfile } from '@/src/services/fitnessModel';
import type { SaveRunResult } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  isRunSummaryDoneDisabled,
  isRunSummaryRetryVisible,
  runSummarySaveAttempt,
  type RunSummarySaveStatus,
} from '@/src/services/runSummaryState';
import { flushPendingSafetyReports } from '@/src/services/safetyStorage';
import { flushPendingCivicReports } from '@/src/services/civicStorage';

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
  const queryClient = useQueryClient();
  const {
    uid,
    loading: identityLoading,
    error: identityError,
  } = useAuth();
  const saveStartedRef = useRef(false);
  const [saveStatus, setSaveStatus] =
    useState<RunSummarySaveStatus>('saving');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SaveRunResult | null>(null);
  const [safetyDelivery, setSafetyDelivery] = useState<
    'idle' | 'sending' | 'delivered' | 'pending'
  >('idle');
  const [civicDelivery, setCivicDelivery] = useState<
    'idle' | 'sending' | 'delivered' | 'pending'
  >('idle');

  const { data: userStats } = useGetUserStats(uid ?? '', {
    query: { enabled: !!uid, queryKey: getGetUserStatsQueryKey(uid ?? '') },
  });

  const fitnessProfile = React.useMemo(() => {
    if (!userStats?.recentRuns) return predictFitnessProfile([]);
    return predictFitnessProfile(
      userStats.recentRuns,
      userStats.baseline?.activityLevel ?? 'casual',
    );
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
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: getGetUserStatsQueryKey(uid ?? ''),
            }),
            queryClient.invalidateQueries({
              queryKey: getGetLeaderboardQueryKey(),
            }),
          ]);
        },
        onFailed(message) {
          setSaveError(message);
          setSaveStatus('failed');
        },
      },
      afterSaved: async () => {
        await Promise.all([
          (async () => {
            setSafetyDelivery('sending');
            try {
              const result = await flushPendingSafetyReports(clientRunId);
              setSafetyDelivery(
                result.remaining > 0
                  ? 'pending'
                  : result.delivered > 0
                    ? 'delivered'
                    : 'idle',
              );
            } catch {
              setSafetyDelivery('pending');
            }
          })(),
          (async () => {
            setCivicDelivery('sending');
            try {
              const result = await flushPendingCivicReports(clientRunId);
              setCivicDelivery(
                result.remaining > 0
                  ? 'pending'
                  : result.delivered > 0
                    ? 'delivered'
                    : 'idle',
              );
            } catch {
              setCivicDelivery('pending');
            }
          })(),
        ]);
      },
    });
  }, [clientRunId, queryClient, uid]);

  useEffect(() => {
    if (identityLoading || !uid || saveStartedRef.current) return;
    saveStartedRef.current = true;
    void persistRun();
  }, [identityLoading, persistRun, uid]);

  useEffect(() => {
    if (!identityLoading && identityError) {
      setSaveStatus('failed');
      setSaveError(identityError);
    }
  }, [identityError, identityLoading]);

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
            <View
              accessibilityLabel={`New hexes claimed: ${saveResult.newHexes}. Hexes stolen from others: ${saveResult.stolenHexes}. Total claimed: ${saveResult.claimedHexes}.`}
              style={styles.hexResultRows}
            >
              <View style={styles.hexResultLine}>
                <Text style={[styles.hexResultLabel, { color: colors.mutedForeground }]}>New hexes claimed:</Text>
                <Text style={[styles.hexResultValue, { color: colors.primary }]}>+{saveResult.newHexes}</Text>
              </View>
              <View style={[styles.horizontalDivider, { backgroundColor: colors.border }]} />
              <View style={styles.hexResultLine}>
                <Text style={[styles.hexResultLabel, { color: colors.mutedForeground }]}>Hexes stolen from others:</Text>
                <Text style={[styles.hexResultValue, { color: colors.accentForeground }]}>{saveResult.stolenHexes}</Text>
              </View>
              <View style={[styles.horizontalDivider, { backgroundColor: colors.border }]} />
              <View style={styles.hexResultLine}>
                <Text style={[styles.hexResultLabel, { color: colors.mutedForeground }]}>Total claimed:</Text>
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
                  {saveResult.dailyClaimedHexes} / {saveResult.dailyBudget}
                </Text>
              </View>
              <View style={[styles.progressBarBg, { backgroundColor: colors.muted }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                       backgroundColor: saveResult.dailyClaimedHexes >= saveResult.dailyBudget ? colors.accentForeground : colors.primary,
                       width: `${Math.min(100, (saveResult.dailyClaimedHexes / Math.max(1, saveResult.dailyBudget)) * 100)}%`
                    }
                  ]}
                />
              </View>
            </View>

            <View style={[styles.streakLine, { borderTopColor: colors.border }]}>
              <Feather name="zap" size={15} color={colors.primary} />
              <Text style={[styles.streakText, { color: colors.foreground }]}>
                {saveResult.currentStreak}-day consecutive-run streak
              </Text>
            </View>
            {saveResult.budgetSkippedHexes > 0 ? (
              <View style={[styles.warningBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="clock" size={14} color={colors.primary} />
                <Text style={[styles.warningText, { color: colors.foreground }]}>
                  {saveResult.budgetSkippedHexes} claim{saveResult.budgetSkippedHexes === 1 ? '' : 's'} held for tomorrow so your daily target stays balanced.
                </Text>
              </View>
            ) : null}

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

        {safetyDelivery !== 'idle' ? (
          <View
            style={[
              styles.saveCard,
              {
                backgroundColor: colors.card,
                borderColor:
                  safetyDelivery === 'pending'
                    ? colors.destructive
                    : colors.border,
              },
            ]}
          >
            {safetyDelivery === 'sending' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather
                name={safetyDelivery === 'delivered' ? 'shield' : 'clock'}
                size={20}
                color={
                  safetyDelivery === 'delivered'
                    ? colors.primary
                    : colors.destructive
                }
              />
            )}
            <View style={styles.saveCopy}>
              <Text style={[styles.saveTitle, { color: colors.foreground }]}>
                {safetyDelivery === 'sending'
                  ? 'Sending safety signal'
                  : safetyDelivery === 'delivered'
                    ? 'Safety signal delivered'
                    : 'Safety signal still pending'}
              </Text>
              {safetyDelivery === 'pending' ? (
                <Text
                  style={[
                    styles.saveError,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Saved as a coarse area on this device. HexRunner will retry
                  while the app is open.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {civicDelivery !== 'idle' ? (
          <View
            style={[
              styles.saveCard,
              {
                backgroundColor: colors.card,
                borderColor:
                  civicDelivery === 'pending'
                    ? colors.destructive
                    : colors.border,
              },
            ]}
          >
            {civicDelivery === 'sending' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather
                name={civicDelivery === 'delivered' ? 'check-circle' : 'clock'}
                size={20}
                color={
                  civicDelivery === 'delivered'
                    ? colors.primary
                    : colors.destructive
                }
              />
            )}
            <View style={styles.saveCopy}>
              <Text style={[styles.saveTitle, { color: colors.foreground }]}>
                {civicDelivery === 'sending'
                  ? 'Sending street issue report'
                  : civicDelivery === 'delivered'
                    ? 'Street issue report delivered'
                    : 'Street issue report still pending'}
              </Text>
              {civicDelivery === 'pending' ? (
                <Text
                  style={[
                    styles.saveError,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Its metadata is queued on this device. HexRunner will retry
                  when street issue reporting next opens.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

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
  hexResultRows: {
    gap: 10,
  },
  hexResultLine: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  horizontalDivider: {
    height: 1,
  },
  hexResultLabel: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  hexResultValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
  },
  progressContainer: {
    paddingTop: 12,
    borderTopWidth: 1,
  },
  streakLine: {
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
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