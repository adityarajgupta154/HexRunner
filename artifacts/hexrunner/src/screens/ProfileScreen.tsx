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
  const { uid } = useAuth();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetUserStats(uid ?? '', {
    query: { enabled: !!uid, queryKey: getGetUserStatsQueryKey(uid ?? '') },
  });

  const fitnessProfile = useMemo(() => {
    if (!data?.recentRuns) return predictFitnessProfile([]);
    return predictFitnessProfile(data.recentRuns, 'casual');
  }, [data]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (isLoading && !data) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background, paddingHorizontal: 32 }]}>
        <Feather name="alert-triangle" size={32} color={colors.destructive} style={{ marginBottom: 12 }} />
        <Text style={[styles.errorText, { color: colors.foreground }]}>Unable to load profile.</Text>
        <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
          {error instanceof Error
            ? error.message
            : 'Please try again later.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.retryBtnText, { color: colors.primaryForeground }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const totals = data?.totals;
  const recentRuns = data?.recentRuns ?? [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <FlatList
        data={recentRuns}
        keyExtractor={(item) => item.runId}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 24) + 60 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>PROFILE</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>{data?.displayName || 'Runner'}</Text>
              </View>
            </View>

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
                  {fitnessProfile.budget} Hex Target
                </Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>HEXES</Text>
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
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>AVG PACE</Text>
                <Text style={[styles.statValue, { color: colors.foreground }]}>
                  {formatPace(totals?.averagePaceMinPerKm ?? null)}
                </Text>
              </View>
            </View>

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
              <View style={[styles.hexBadge, { backgroundColor: colors.accent }]}>
                <Feather name="hexagon" size={12} color={colors.primary} />
                <Text style={[styles.hexBadgeText, { color: colors.primary }]}>+{item.newHexes}</Text>
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
});