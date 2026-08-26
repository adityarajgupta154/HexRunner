import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { ExactPresence } from '@workspace/api-client-react';

export type PresenceOverlayProps = {
  isLoading: boolean;
  hasSnapshot: boolean;
  isOffline: boolean;
  isStale: boolean;
  ambientCount: number;
  nearestExactRunner: ExactPresence | null;
  targetDirection: string;
  anonymousCount: number;
  style?: StyleProp<ViewStyle>;
};

export default function PresenceOverlay({
  isLoading,
  hasSnapshot,
  isOffline,
  isStale,
  ambientCount,
  nearestExactRunner,
  targetDirection,
  anonymousCount,
  style
}: PresenceOverlayProps) {
  const colors = useColors();

  let statusIcon: keyof typeof Feather.glyphMap = 'activity';
  let statusColor = colors.primary;
  let statusText = 'LIVE PRESENCE';

  if (isOffline && !hasSnapshot) {
    statusIcon = 'wifi-off';
    statusColor = colors.destructive;
    statusText = 'PRESENCE OFFLINE';
  } else if (isStale) {
    statusColor = colors.mutedForeground;
    statusText = 'PRESENCE (STALE)';
  } else if (isLoading && !hasSnapshot) {
    statusText = 'SEARCHING AREA...';
  }

  return (
    <View pointerEvents="none" style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      <View style={styles.header}>
        {isLoading && !hasSnapshot ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ width: 14, height: 14 }} />
        ) : (
          <Feather name={statusIcon} size={14} color={statusColor} />
        )}
        <Text style={[styles.title, { color: statusColor }]}>
           {statusText}
        </Text>
      </View>

      <View style={styles.content}>
        {isOffline && !hasSnapshot ? (
          <View style={styles.targetRow}>
            <Text style={[styles.targetLabel, { color: colors.mutedForeground }]}>STATUS:</Text>
            <Text style={[styles.targetValue, { color: colors.mutedForeground }]}>
               UNAVAILABLE
            </Text>
          </View>
        ) : nearestExactRunner ? (
          <View style={styles.targetRow}>
            <Text style={[styles.targetLabel, { color: colors.mutedForeground }]}>TARGET:</Text>
            <Text style={[styles.targetValue, { color: colors.foreground }]} numberOfLines={1}>
               {nearestExactRunner.displayName.toUpperCase()}
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
               <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>
                 {nearestExactRunner.distanceMeters}M {targetDirection}
               </Text>
            </View>
          </View>
        ) : anonymousCount > 0 ? (
          <View style={styles.targetRow}>
            <Text style={[styles.targetLabel, { color: colors.mutedForeground }]}>TARGET:</Text>
            <Text style={[styles.targetValue, { color: colors.mutedForeground }]}>
               CLOAKED
            </Text>
          </View>
        ) : hasSnapshot ? (
          <View style={styles.targetRow}>
            <Text style={[styles.targetLabel, { color: colors.mutedForeground }]}>TARGET:</Text>
            <Text style={[styles.targetValue, { color: colors.mutedForeground }]}>
               NONE
            </Text>
          </View>
        ) : (
          <View style={styles.targetRow}>
            <Text style={[styles.targetLabel, { color: colors.mutedForeground }]}>TARGET:</Text>
            <Text style={[styles.targetValue, { color: colors.mutedForeground }]}>
               LOCATING...
            </Text>
          </View>
        )}
      </View>
      
      {hasSnapshot && (
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
           <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
             {ambientCount} runner{ambientCount !== 1 ? 's' : ''} ambient · activity cue, not a safety guarantee
           </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  targetLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  targetValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 'auto',
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  footerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    lineHeight: 14,
  },
});
