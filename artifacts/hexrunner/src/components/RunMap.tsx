import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

type RunPoint = {
  lat: number;
  lng: number;
  timestamp: number;
};

type RunMapProps = {
  currentPoint: RunPoint | null;
  claimedHexIndexes: ReadonlySet<string>;
};

/** Browser fallback; Expo Go selects RunMap.native.tsx automatically. */
export default function RunMap(_props: RunMapProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Feather name="map" size={27} color={colors.primary} />
      <Text style={[styles.title, { color: colors.foreground }]}>
        Live run map
      </Text>
      <Text style={[styles.message, { color: colors.mutedForeground }]}>
        Open in Expo Go to view claimed hexes.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 18,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  message: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
});