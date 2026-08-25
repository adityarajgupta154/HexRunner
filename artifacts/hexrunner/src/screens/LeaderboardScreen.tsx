import React, { useCallback, useMemo, useState } from 'react';
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
import { useGetLeaderboard, getGetLeaderboardQueryKey } from '@workspace/api-client-react';

export default function LeaderboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { uid } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const leaderboardParams = useMemo(
    () => ({ currentUserId: uid ?? undefined }),
    [uid],
  );

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useGetLeaderboard(leaderboardParams, {
    query: {
      refetchInterval: 30000,
      queryKey: getGetLeaderboardQueryKey(leaderboardParams),
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
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
        <Text style={[styles.errorText, { color: colors.foreground }]}>
          Unable to load leaderboard.
        </Text>
        <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
          {error instanceof Error
            ? error.message
            : 'Please try again later.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void refetch()}
          style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.retryBtnText, { color: colors.primaryForeground }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const entries = data?.users ?? [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>TERRITORY CONTROL</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Leaderboard</Text>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.rank) + item.displayName}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 60 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="award" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No runners yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              The map is wide open. Go claim the first hex.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.isCurrentUser;

          return (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: isMe ? colors.accent : colors.card,
                  borderColor: isMe ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.rankContainer}>
                <Text
                  style={[
                    styles.rankText,
                    { color: item.rank <= 3 ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {item.rank}
                </Text>
              </View>
              <View style={styles.nameContainer}>
                <Text
                  style={[
                    styles.nameText,
                    { color: isMe ? colors.accentForeground : colors.foreground },
                  ]}
                  numberOfLines={1}
                >
                  {item.displayName}
                </Text>
                {isMe && (
                  <View style={[styles.meBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.meBadgeText, { color: colors.primaryForeground }]}>YOU</Text>
                  </View>
                )}
              </View>
              <View style={styles.scoreContainer}>
                <Text style={[styles.scoreText, { color: colors.foreground }]}>
                  {item.totalHexesOwned}
                </Text>
                <Feather name="hexagon" size={14} color={colors.primary} />
              </View>
            </View>
          );
        }}
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
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
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
  listContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  emptySub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  rankContainer: {
    width: 32,
    alignItems: 'center',
  },
  rankText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  nameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  nameText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  meBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  meBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
});