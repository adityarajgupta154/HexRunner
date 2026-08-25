import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

function numberParam(value: string | string[] | undefined): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
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
  const params = useLocalSearchParams<{
    elapsedSeconds?: string;
    distanceKm?: string;
    pointCount?: string;
  }>();
  const elapsedSeconds = numberParam(params.elapsedSeconds);
  const distanceKm = numberParam(params.distanceKm);
  const pointCount = numberParam(params.pointCount);

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 26,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View
        style={[
          styles.successIcon,
          {
            backgroundColor: colors.accent,
            borderColor: colors.primary,
          },
        ]}
      >
        <Feather name="check" size={38} color={colors.primary} />
      </View>

      <Text style={[styles.eyebrow, { color: colors.primary }]}>
        RUN COMPLETE
      </Text>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Session Summary
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Your route has been recorded locally for this session.
      </Text>

      <View style={styles.stats}>
        <SummaryCard
          icon="clock"
          label="TIME"
          value={formatElapsed(elapsedSeconds)}
        />
        <View style={styles.smallCardRow}>
          <SummaryCard
            compact
            icon="navigation"
            label="DISTANCE"
            value={distanceKm.toFixed(2)}
            unit="km"
          />
          <SummaryCard
            compact
            icon="zap"
            label="PACE"
            value={formatPace(elapsedSeconds, distanceKm)}
            unit="min/km"
          />
        </View>
        <View
          style={[
            styles.pointsCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="map-pin" size={19} color={colors.primary} />
          <Text style={[styles.pointsText, { color: colors.mutedForeground }]}>
            {Math.floor(pointCount)} GPS{' '}
            {Math.floor(pointCount) === 1 ? 'point' : 'points'} captured
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/run')}
        style={({ pressed }) => [
          styles.doneButton,
          {
            backgroundColor: colors.primary,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <Text
          style={[styles.doneButtonText, { color: colors.primaryForeground }]}
        >
          Done
        </Text>
        <Feather
          name="arrow-right"
          size={19}
          color={colors.primaryForeground}
        />
      </Pressable>
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
      <View
        style={[
          styles.summaryCard,
          compact && styles.compactCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardLabelRow}>
          <Feather name={icon} size={17} color={colors.primary} />
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>
            {label}
          </Text>
        </View>
        <Text
          style={[
            compact ? styles.compactValue : styles.largeValue,
            { color: colors.foreground },
          ]}
        >
          {value}
        </Text>
        {unit ? (
          <Text style={[styles.cardUnit, { color: colors.primary }]}>{unit}</Text>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
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
  doneButton: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
    marginTop: 'auto',
  },
  doneButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
});