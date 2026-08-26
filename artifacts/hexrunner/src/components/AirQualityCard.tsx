import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getGetAirQualityQueryKey,
  useGetAirQuality,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type AirQualityCardProps = {
  latitude: number;
  longitude: number;
  expanded: boolean;
  onToggle: () => void;
};

const LEVEL_LABELS = {
  good: 'Good',
  moderate: 'Moderate',
  unhealthy_sensitive: 'Unhealthy for sensitive groups',
  unhealthy: 'Unhealthy',
  very_unhealthy: 'Very unhealthy',
  hazardous: 'Hazardous',
} as const;

function formatFreshness(observationTime: string): string {
  const observedAt = new Date(observationTime);
  const observedMs = observedAt.getTime();

  if (!Number.isFinite(observedMs)) return 'Observation time unavailable';

  const ageMinutes = Math.floor((Date.now() - observedMs) / 60_000);
  if (ageMinutes < 0) {
    return `Observed ${observedAt.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }
  if (ageMinutes < 1) return 'Observed less than a minute ago';
  if (ageMinutes < 60) return `Observed ${ageMinutes} min ago`;

  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) {
    return `Observed ${ageHours} hr${ageHours === 1 ? '' : 's'} ago`;
  }

  return `Observed ${observedAt.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} at ${observedAt.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function formatStaleWarning(observationTime: string): string {
  const freshness = formatFreshness(observationTime);
  const observedAge = freshness.startsWith('Observed ')
    ? freshness.slice('Observed '.length)
    : freshness;
  return `LAST OBSERVATION · ${observedAge.toUpperCase()} · USE CAUTION`;
}

function formatWindowTime(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function AirQualityCard({
  latitude,
  longitude,
  expanded,
  onToggle,
}: AirQualityCardProps) {
  const colors = useColors();
  const queryParams = {
    latitude,
    longitude,
  };
  const { data, isLoading, isError, refetch } = useGetAirQuality(queryParams, {
    query: {
      queryKey: getGetAirQualityQueryKey(queryParams),
      staleTime: 10 * 60 * 1_000,
      retry: 1,
    },
  });

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.card, borderColor: colors.border },
  ];

  if (isLoading) {
    return (
      <View
        accessibilityLabel="Loading current air quality"
        accessibilityLiveRegion="polite"
        style={cardStyle}
      >
        <View style={styles.stateRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <View style={styles.stateCopy}>
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              Checking air quality
            </Text>
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              Fetching the latest observation…
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={[cardStyle, { borderColor: colors.destructive }]}
      >
        <View style={styles.stateRow}>
          <Feather name="cloud-off" size={21} color={colors.destructive} />
          <View style={styles.stateCopy}>
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              Air quality source unavailable
            </Text>
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              No current AQI value is available.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading air quality"
            hitSlop={8}
            onPress={() => void refetch()}
            style={({ pressed }) => [
              styles.retryButton,
              {
                backgroundColor: colors.muted,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="refresh-cw" size={17} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    );
  }

  const levelLabel = LEVEL_LABELS[data.level];
  const levelColor =
    data.level === 'good'
      ? colors.primary
      : data.level === 'moderate'
        ? colors.accentForeground
        : colors.destructive;
  const windowStart = data.suggestedWindow
    ? formatWindowTime(data.suggestedWindow.startsAt)
    : null;
  const windowEnd = data.suggestedWindow
    ? formatWindowTime(data.suggestedWindow.endsAt)
    : null;

  return (
    <View style={[cardStyle, data.isStale && { borderColor: levelColor }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} city air quality details. Current AQI ${data.aqi}, ${levelLabel}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.compactHeader,
          { opacity: pressed ? 0.72 : 1 },
        ]}
      >
        <View style={[styles.compactIcon, { backgroundColor: `${levelColor}1F` }]}>
          <Feather name="wind" size={16} color={levelColor} />
        </View>
        <View style={styles.compactCopy}>
          <Text style={[styles.compactLabel, { color: colors.mutedForeground }]}>
            CITY INTEL
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.compactValue, { color: colors.foreground }]}
          >
            AQI {data.aqi}
            <Text style={{ color: levelColor }}> · {levelLabel}</Text>
          </Text>
        </View>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.mutedForeground}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.expandedContent}>
          {data.isStale ? (
            <View
              accessibilityLabel={`Warning: air quality observation is stale. ${formatFreshness(data.observationTime)}. Use caution.`}
              accessibilityLiveRegion="polite"
              style={[
                styles.staleBanner,
                {
                  backgroundColor: `${levelColor}20`,
                  borderColor: `${levelColor}55`,
                },
              ]}
            >
              <Feather name="alert-triangle" size={15} color={levelColor} />
              <Text style={[styles.staleText, { color: levelColor }]}>
                {formatStaleWarning(data.observationTime)}
              </Text>
            </View>
          ) : null}

          <View
            accessibilityLabel={`${formatFreshness(data.observationTime)}. Source: ${data.sourceName}`}
            style={styles.sourceRow}
          >
            <Feather
              name={data.isStale ? 'alert-circle' : 'clock'}
              size={13}
              color={data.isStale ? levelColor : colors.mutedForeground}
            />
            <Text
              numberOfLines={2}
              style={[
                styles.sourceText,
                { color: data.isStale ? levelColor : colors.mutedForeground },
              ]}
            >
              {formatFreshness(data.observationTime)} · {data.sourceName}
            </Text>
          </View>

          <View style={[styles.contextBox, { backgroundColor: colors.muted }]}>
            <Feather name="heart" size={15} color={levelColor} />
            <Text style={[styles.contextText, { color: colors.foreground }]}>
              {data.healthContext}
            </Text>
          </View>

          {data.suggestedWindow ? (
            <View
              accessibilityLabel={`Suggested exercise window${windowStart && windowEnd ? ` from ${windowStart} to ${windowEnd}` : ''}. Expected US AQI ${data.suggestedWindow.expectedAqi}. ${data.suggestedWindow.reason}`}
              style={[styles.windowRow, { borderTopColor: colors.border }]}
            >
              <View style={[styles.windowIcon, { backgroundColor: colors.accent }]}>
                <Feather name="sunrise" size={16} color={colors.accentForeground} />
              </View>
              <View style={styles.windowCopy}>
                <Text style={[styles.windowLabel, { color: colors.mutedForeground }]}>
                  BEST TIME TO MOVE
                </Text>
                {windowStart && windowEnd ? (
                  <Text style={[styles.windowTitle, { color: colors.foreground }]}>
                    {windowStart}–{windowEnd}
                    <Text style={{ color: colors.mutedForeground }}>
                      {' '}· AQI {data.suggestedWindow.expectedAqi}
                    </Text>
                  </Text>
                ) : (
                  <Text style={[styles.windowTitle, { color: colors.foreground }]}>
                    Expected AQI {data.suggestedWindow.expectedAqi}
                  </Text>
                )}
                <Text style={[styles.windowReason, { color: colors.mutedForeground }]}>
                  {data.suggestedWindow.reason}
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
            {data.disclaimer}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 18,
    padding: 6,
  },
  compactHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  compactIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  compactCopy: {
    flex: 1,
  },
  compactLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.8,
  },
  compactValue: {
    marginTop: 2,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  expandedContent: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  staleBanner: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
  },
  staleText: {
    flex: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.65,
    textAlign: 'center',
  },
  stateRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stateCopy: {
    flex: 1,
  },
  stateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  stateText: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  retryButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 13,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  eyebrowText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.9,
  },
  levelBadge: {
    maxWidth: '68%',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  levelDot: {
    width: 7,
    height: 7,
    flexShrink: 0,
    borderRadius: 4,
  },
  levelText: {
    flexShrink: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  readingRow: {
    marginTop: 9,
  },
  aqiReading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  aqiNumber: {
    fontFamily: 'Inter_700Bold',
    fontSize: 48,
    lineHeight: 53,
    letterSpacing: -1.5,
  },
  aqiLabelWrap: {
    marginLeft: 10,
    marginBottom: 7,
  },
  aqiLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  aqiLevel: {
    marginTop: 2,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  sourceRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 15,
  },
  contextBox: {
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  contextText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
  windowRow: {
    marginTop: 12,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  windowIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  windowCopy: {
    flex: 1,
  },
  windowLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.75,
  },
  windowTitle: {
    marginTop: 3,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  windowReason: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 15,
  },
  disclaimer: {
    marginTop: 11,
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    lineHeight: 13,
  },
});