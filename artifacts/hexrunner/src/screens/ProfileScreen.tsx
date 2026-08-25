import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/src/context/AuthContext';
import { useGetUserStats, getGetUserStatsQueryKey } from '@workspace/api-client-react';
import { predictFitnessProfile } from '@/src/services/fitnessModel';

function formatPace(paceMinPerKm: number | null): string {
  if (paceMinPerKm === null || paceMinPerKm <= 0) return '--:--';
  const paceSeconds = Math.round(paceMinPerKm * 60);
  return `${Math.floor(paceSeconds / 60)}:${(paceSeconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    uid,
    loading: identityLoading,
    error: identityError,
  } = useAuth();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useGetUserStats(uid ?? '', {
    query: {
      enabled: !!uid,
      queryKey: getGetUserStatsQueryKey(uid ?? ''),
      refetchInterval: 30000,
    },
  });

  const fitnessProfile = useMemo(() => {
    if (!data?.recentRuns) return predictFitnessProfile([]);
    return predictFitnessProfile(
      data.recentRuns,
      data.baseline?.activityLevel ?? 'casual',
    );
  }, [data]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (identityLoading || (isLoading && !data)) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (identityError || (isError && !data)) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background, paddingHorizontal: 32 }]}>
        <Feather name="alert-triangle" size={32} color={colors.destructive} style={{ marginBottom: 12 }} />
        <Text style={[styles.errorText, { color: colors.foreground }]}>Unable to load profile.</Text>
        <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
          {identityError ??
          (error instanceof Error
            ? error.message
            : 'Please try again later.')}
        </Text>
        {uid ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading profile"
            testID="profile-retry"
            onPress={onRetry}
            style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.retryBtnText, { color: colors.primaryForeground }]}>Retry</Text>
          </Pressable>
        ) : (
          <Text style={[styles.identityHint, { color: colors.mutedForeground }]}>
            Reopen HexRunner to retry device setup.
          </Text>
        )}
      </View>
    );
  }

  const totals = data?.totals;
  const recentRuns = data?.recentRuns ?? [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <FlatList
        testID="profile-activity-list"
        data={recentRuns}
        keyExtractor={(item) => item.runId}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 24) + 60 }]}
        showsVerticalScrollIndicator={false}
        refreshing={isRefetching && !isLoading}
        onRefresh={onRetry}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>PROFILE</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>{data?.displayName || 'Runner'}</Text>
              </View>
            </View>

            {isError && data ? (
              <View style={[styles.staleBanner, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
                <Feather name="wifi-off" size={16} color={colors.destructive} />
                <Text style={[styles.staleText, { color: colors.foreground }]}>
                  Showing your latest saved progress.
                </Text>
              </View>
            ) : null}

            <View style={[styles.tierCard, { backgroundColor: colors.accent, borderColor: colors.primary }]}>
              <View style={styles.tierInfo}>
                <Text style={[styles.tierLabel, { color: colors.primary }]}>FITNESS TIER</Text>
                <Text style={[styles.tierValue, { color: colors.accentForeground }]}>
                  {fitnessProfile.tier.toUpperCase()}
                </Text>
              </View>
              <View
                style={[
                  styles.tierTarget,
                  { backgroundColor: colors.muted },
                ]}
              >
                <Feather name="target" size={16} color={colors.primary} />
                <Text style={[styles.tierTargetText, { color: colors.primary }]}>
                  {totals?.dailyBudget ?? 10} Hex Target
                </Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>TERRITORY</Text>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{totals?.totalHexesOwned ?? 0}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>RUNS</Text>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{totals?.totalRuns ?? 0}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>DISTANCE</Text>
                <Text style={[styles.statValue, { color: colors.foreground }]}>
                  {(totals?.totalDistanceKm ?? 0).toFixed(1)} <Text style={styles.statUnit}>km</Text>
                </Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>CLAIMED</Text>
                <Text style={[styles.statValue, { color: colors.foreground }]}>
                  {totals?.totalClaimedHexes ?? 0}
                </Text>
              </View>
            </View>

            <View style={[styles.streakCard, { backgroundColor: colors.accent, borderColor: colors.primary }]}>
              <Feather name="zap" size={18} color={colors.primary} />
              <Text style={[styles.streakText, { color: colors.accentForeground }]}>
                {totals?.currentStreak ?? 0}-day consecutive-run streak
              </Text>
            </View>

            {(data?.takeoverAlerts.length ?? 0) > 0 ? (
              <View style={[styles.alertCard, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
                <Feather name="alert-circle" size={17} color={colors.destructive} />
                <View style={styles.alertCopy}>
                  <Text style={[styles.alertTitle, { color: colors.foreground }]}>Territory takeover</Text>
                  <Text style={[styles.alertText, { color: colors.mutedForeground }]}>
                    A rival reclaimed {data?.takeoverAlerts.length} of your recent cells. Head out to take it back.
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Runs</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="activity" size={40} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No runs yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Hit the ground running to build your stats.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.runCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.runHeader}>
              <Text style={[styles.runDate, { color: colors.foreground }]}>
                {new Date(item.startedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </Text>
              <View style={styles.badgeRow}>
                <View style={[styles.hexBadge, { backgroundColor: colors.accent }]}>
                  <Feather name="plus" size={12} color={colors.primary} />
                  <Text style={[styles.hexBadgeText, { color: colors.primary }]}>{item.newHexes} new</Text>
                </View>
                {item.stolenHexes > 0 ? (
                  <View style={[styles.hexBadge, { backgroundColor: colors.muted }]}>
                    <Feather name="repeat" size={12} color={colors.foreground} />
                    <Text style={[styles.hexBadgeText, { color: colors.foreground }]}>{item.stolenHexes} stolen</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.runMetrics}>
              <View>
                <Text style={[styles.runMetricLabel, { color: colors.mutedForeground }]}>DISTANCE</Text>
                <Text style={[styles.runMetricValue, { color: colors.foreground }]}>
                  {item.distanceKm.toFixed(2)} km
                </Text>
              </View>
              <View>
                <Text style={[styles.runMetricLabel, { color: colors.mutedForeground }]}>PACE</Text>
                <Text style={[styles.runMetricValue, { color: colors.foreground }]}>
                  {formatPace(item.averagePaceMinPerKm)}
                </Text>
              </View>
              <View>
                <Text style={[styles.runMetricLabel, { color: colors.mutedForeground }]}>CLAIMED</Text>
                <Text style={[styles.runMetricValue, { color: colors.foreground }]}>
                  {item.claimedHexes}
                </Text>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
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
  listContent: {
    paddingBottom: 24,
  },
  tierCard: {
    marginHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 20,
  },
  staleBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  staleText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  tierInfo: {
    gap: 4,
  },
  tierLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.1,
  },
  tierValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
  },
  tierTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tierTargetText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 32,
  },
  streakCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  streakText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  alertCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
  },
  alertCopy: { flex: 1 },
  alertTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  alertText: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, marginTop: 3 },
  statBox: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  statLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  statValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    fontSize: 14,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  emptySub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    marginTop: 8,
  },
  runCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  runHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  runDate: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  hexBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hexBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  runMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  runMetricLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  runMetricValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    textAlign: 'center',
  },
  errorSub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  identityHint: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    textAlign: 'center',
  },
});