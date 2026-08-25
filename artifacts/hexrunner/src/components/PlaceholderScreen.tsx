import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

type PlaceholderScreenProps = {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
};

/**
 * Temporary placeholder body for the Phase 1 tab shell.
 * Each tab renders its name as a heading, per Task 1.1 of the build checklist.
 */
export default function PlaceholderScreen({
  title,
  subtitle,
  icon,
}: PlaceholderScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: topInset },
      ]}
    >
      <View
        style={[
          styles.iconBadge,
          {
            backgroundColor: colors.accent,
            borderColor: colors.border,
            borderRadius: colors.radius + 6,
          },
        ]}
      >
        <Feather name={icon} size={30} color={colors.accentForeground} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 32,
    paddingBottom: 96,
  },
  iconBadge: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
