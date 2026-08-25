import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { getGetUserStatsQueryKey, useUpdateUserBaseline } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/src/context/AuthContext';
import type { FitnessTier } from '@/src/services/fitnessModel';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const levels: { value: FitnessTier; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Starting out', hint: 'New to regular activity' },
  { value: 'casual', label: 'Casual', hint: 'I move a few times a week' },
  { value: 'regular', label: 'Regular', hint: 'I train most weeks' },
  { value: 'trained', label: 'Trained', hint: 'Structured training is normal' },
];

const CrownIcon = ({ color }: { color: string }) => (
  <Svg width="18" height="14" viewBox="0 0 18 14" style={styles.crownSvg}>
    <Path d="M2 12 L4 2 L9 7 L14 2 L16 12 Z" stroke={color} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
  </Svg>
);

const SneakerIcon = ({ color, size }: { color: string; size: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 16v-2.38C4 11.5 5.5 10 7.38 10h.85c.66 0 1.25.4 1.5 1l1.54 3.7c.3.73 1 1.2 1.8 1.2h3.43c1.37 0 2.5 1.13 2.5 2.5V20H5.5A1.5 1.5 0 0 1 4 18.5v-2.5z" />
    <Path d="M8 10l2-2 1.5 1.5" />
    <Path d="M12 11.5l1.5-1.5" />
    <Path d="M4 18h16" />
  </Svg>
);

const ButtonBrush = ({ color }: { color: string }) => (
  <Svg viewBox="0 0 100 24" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
    <Path
      d="M 1 4 C 15 1 85 1 98 3 C 101 10 99 15 97 22 C 85 24 15 23 2 20 C -1 15 0 10 1 4 Z"
      fill={color}
    />
    <Path d="M -1 8 L 4 6 M 96 18 L 101 16 M 10 22 L 20 23 M 80 2 L 90 1" stroke={color} strokeWidth={1} />
  </Svg>
);

const BrushUnderline = ({ width, color }: { width: number; color: string }) => (
  <Svg width={width} height="12" viewBox="0 0 100 12" preserveAspectRatio="none">
    <Path d="M 0 6 C 20 2 80 3 100 5 C 98 9 90 12 0 9 Z" fill={color} />
  </Svg>
);

const SmallUnderline = ({ width, color }: { width: number; color: string }) => (
  <Svg width={width} height="4" viewBox="0 0 100 4" preserveAspectRatio="none">
    <Path d="M 0 2 Q 50 0 100 2 Q 50 4 0 2 Z" fill={color} />
  </Svg>
);

export default function BaselineOnboarding() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { uid } = useAuth();
  const mutation = useUpdateUserBaseline();
  const insets = useSafeAreaInsets();
  const tabBarHeight = Platform.OS === 'web' ? 84 : 70;

  const [activityLevel, setActivityLevel] = useState<FitnessTier>('casual');
  const [city, setCity] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSkipped, setIsSkipped] = useState(false);
  const [focusedField, setFocusedField] = useState<'tag' | 'city' | null>(null);

  if (isSkipped) return null;

  const save = () => {
    if (!uid || !city.trim()) return;
    mutation.mutate(
      {
        userId: uid,
        data: {
          city: city.trim(),
          activityLevel,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        },
      },
      { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(uid) }) },
    );
  };

  return (
    <View
      testID="baseline-onboarding"
      style={[
        styles.scrim,
        {
          backgroundColor: colors.background,
          bottom: tabBarHeight,
        },
      ]}
    >
      <View pointerEvents="none" style={styles.texture}>
        <View style={[styles.textureLine, styles.textureLineOne, { backgroundColor: colors.primary }]} />
        <View style={[styles.textureLine, styles.textureLineTwo, { backgroundColor: colors.primary }]} />
        <Feather name="hexagon" size={92} color={colors.primary} style={styles.textureHex} />
      </View>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: Math.max(insets.top, 20) + 16,
            borderColor: colors.primary,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={tabBarHeight + 24}
      >
        <View style={styles.navRow}>
          <View style={styles.logoContainer}>
            <CrownIcon color={colors.primary} />
            <Text style={[styles.navText, { color: colors.foreground }]}>HEXRUNNER</Text>
            <View style={styles.logoUnderline}>
              <SmallUnderline width={110} color={colors.primary} />
            </View>
          </View>
          <Pressable
            testID="baseline-skip"
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            onPress={() => setIsSkipped(true)}
            style={({ pressed }) => [styles.skipContainer, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.skipText, { color: colors.foreground }]}>SKIP</Text>
            <View style={styles.skipUnderline}>
              <SmallUnderline width={40} color={colors.primary} />
            </View>
          </Pressable>
        </View>

        <View style={styles.badgesRow}>
          <View style={[styles.badgePaint, { backgroundColor: colors.primary }]}>
            <Feather name="crosshair" size={32} color={colors.primaryForeground} />
          </View>
          <View style={[styles.badgeNumber, { borderColor: colors.border }]}>
            <Text style={[styles.badgeNumberText, { color: colors.primary }]}>01</Text>
          </View>
        </View>

        <Text style={[styles.eyebrow, { color: colors.primary }]}>FIRST RUN SETUP / 01</Text>
        <Text style={[styles.mainTitle, { color: colors.foreground }]}>SET YOUR</Text>
        <Text style={[styles.mainTitle, { color: colors.primary, marginTop: -12 }]}>ARENA.</Text>
        <View style={styles.titleStroke}>
          <BrushUnderline width={220} color={colors.primary} />
        </View>

        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          Three quick answers personalize your on-device target and city standings.
        </Text>

        <View
          style={[
            styles.inputWrapper,
            {
              borderColor: focusedField === 'tag' ? colors.primary : colors.border,
              backgroundColor: colors.card,
            },
          ]}
        >
          <Feather name="tag" size={20} color={colors.primary} style={styles.inputIcon} />
          <TextInput
            testID="baseline-tag-input"
            accessibilityLabel="Tag name, optional"
            value={displayName}
            onChangeText={setDisplayName}
            onFocus={() => setFocusedField('tag')}
            onBlur={() => setFocusedField(null)}
            placeholder="Tag name (optional)"
            placeholderTextColor={colors.mutedForeground}
            maxLength={40}
            style={[styles.input, { color: colors.foreground }]}
          />
        </View>

        <View
          style={[
            styles.inputWrapper,
            {
              borderColor: focusedField === 'city' ? colors.primary : colors.border,
              backgroundColor: colors.card,
            },
          ]}
        >
          <Feather name="map-pin" size={20} color={colors.primary} style={styles.inputIcon} />
          <TextInput
            testID="baseline-city-input"
            accessibilityLabel="Your city or arena"
            value={city}
            onChangeText={setCity}
            onFocus={() => setFocusedField('city')}
            onBlur={() => setFocusedField(null)}
            placeholder="Your city / arena"
            placeholderTextColor={colors.mutedForeground}
            maxLength={60}
            style={[styles.input, { color: colors.foreground }]}
          />
        </View>

        <Text style={[styles.question, { color: colors.foreground }]}>HOW DO YOU MOVE?</Text>
        <View style={styles.questionUnderline}>
          <SmallUnderline width={180} color={colors.primary} />
        </View>

        <View style={styles.levels}>
          {levels.map((level) => {
            const isSelected = activityLevel === level.value;
            return (
              <Pressable
                key={level.value}
                testID={`baseline-level-${level.value}`}
                accessibilityRole="radio"
                accessibilityLabel={`${level.label}. ${level.hint}`}
                accessibilityState={{ checked: isSelected }}
                onPress={() => setActivityLevel(level.value)}
                style={[
                  styles.level,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.accent : colors.card,
                  },
                ]}
              >
                <SneakerIcon color={isSelected ? colors.primary : colors.mutedForeground} size={28} />
                <View style={styles.levelTextContainer}>
                  <Text style={[styles.levelLabel, { color: isSelected ? colors.primary : colors.foreground }]}>
                    {level.label.toUpperCase()}
                  </Text>
                  <Text style={[styles.levelHint, { color: colors.mutedForeground }]}>{level.hint}</Text>
                </View>
                {isSelected && <Feather name="check" size={24} color={colors.primary} style={styles.levelCheck} />}
              </Pressable>
            );
          })}
        </View>

        {mutation.isError && (
          <Text style={[styles.error, { color: colors.destructive }]}>
            COULD NOT SAVE YOUR BASELINE. CHECK YOUR CONNECTION AND RETRY.
          </Text>
        )}

        <Pressable
          testID="baseline-submit"
          accessibilityRole="button"
          accessibilityLabel="Enter the arena"
          accessibilityState={{ disabled: !city.trim() || mutation.isPending }}
          disabled={!city.trim() || mutation.isPending}
          onPress={save}
          style={({ pressed }) => [
            styles.button,
            { opacity: !city.trim() || mutation.isPending || pressed ? 0.6 : 1 },
          ]}
        >
          <ButtonBrush color={colors.primary} />
          {mutation.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <View style={styles.buttonContent}>
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>ENTER THE ARENA</Text>
              <Feather name="arrow-right" size={24} color={colors.primaryForeground} />
            </View>
          )}
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  texture: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', opacity: 0.12 },
  textureLine: { position: 'absolute', height: 2, width: 190 },
  textureLineOne: { top: '18%', right: -45, transform: [{ rotate: '-24deg' }] },
  textureLineTwo: { bottom: '28%', left: -70, transform: [{ rotate: '17deg' }] },
  textureHex: { position: 'absolute', right: -26, top: '46%', opacity: 0.35, transform: [{ rotate: '14deg' }] },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 44, alignSelf: 'center', width: '94%', maxWidth: 500, borderWidth: 1.5, borderRadius: 5 },

  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  logoContainer: { position: 'relative', marginTop: 8 },
  crownSvg: { position: 'absolute', top: -14, left: -6, transform: [{ rotate: '-12deg' }] },
  navText: { fontFamily: 'PermanentMarker_400Regular', fontSize: 24, letterSpacing: 1 },
  logoUnderline: { marginTop: -2, marginLeft: 2, transform: [{ rotate: '-2deg' }] },

  skipContainer: { position: 'relative', padding: 8, marginRight: -8 },
  skipText: { fontFamily: 'PermanentMarker_400Regular', fontSize: 20, letterSpacing: 1 },
  skipUnderline: { marginTop: -2, transform: [{ rotate: '-2deg' }] },

  badgesRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  badgePaint: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center', transform: [{ rotate: '-3deg' }] },
  badgeNumber: { width: 44, height: 44, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', marginLeft: 12, transform: [{ rotate: '4deg' }], backgroundColor: 'rgba(255,255,255,0.02)' },
  badgeNumberText: { fontFamily: 'PermanentMarker_400Regular', fontSize: 22 },

  eyebrow: { fontFamily: 'PermanentMarker_400Regular', fontSize: 16, letterSpacing: 1, marginBottom: 6, transform: [{ rotate: '-2deg' }] },
  mainTitle: { fontFamily: 'PermanentMarker_400Regular', fontSize: 52, lineHeight: 52, letterSpacing: -1, textTransform: 'uppercase' },
  titleStroke: { marginTop: 4, marginBottom: 24, transform: [{ rotate: '-2deg' }] },

  copy: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 22, marginBottom: 24, paddingRight: 20 },

  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 2, marginBottom: 16, paddingHorizontal: 16, minHeight: 56 },
  inputIcon: { marginRight: 14 },
  input: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15, paddingVertical: 14 },

  question: { fontFamily: 'PermanentMarker_400Regular', fontSize: 20, marginTop: 16, marginBottom: 4, transform: [{ rotate: '-1deg' }] },
  questionUnderline: { marginBottom: 20, transform: [{ rotate: '-1deg' }] },

  levels: { gap: 12, marginBottom: 32 },
  level: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 2, padding: 16, minHeight: 74 },
  levelTextContainer: { flex: 1, marginLeft: 16 },
  levelLabel: { fontFamily: 'PermanentMarker_400Regular', fontSize: 18, letterSpacing: 0.5, marginBottom: 2 },
  levelHint: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  levelCheck: { marginLeft: 12 },

  error: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 16, textAlign: 'center' },

  button: { minHeight: 64, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', paddingHorizontal: 20, marginTop: 8 },
  buttonContent: { flexDirection: 'row', gap: 12, alignItems: 'center', zIndex: 1 },
  buttonText: { fontFamily: 'PermanentMarker_400Regular', fontSize: 22, letterSpacing: 1, transform: [{ rotate: '-1deg' }] },
});
