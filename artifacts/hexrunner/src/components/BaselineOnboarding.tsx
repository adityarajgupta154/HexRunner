import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetUserStatsQueryKey,
  useUpdateUserBaseline,
} from '@workspace/api-client-react';
import type { TerritoryColor } from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/src/context/AuthContext';
import type { FitnessTier } from '@/src/services/fitnessModel';
import {
  getOnboardingFitnessTier,
  getOnboardingTerritoryColor,
} from '@/src/services/onboardingPreferences';

const brandMark = require('../../assets/images/hexrunner-mark-v2.png');

const levels: {
  value: FitnessTier;
  label: string;
  hint: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  {
    value: 'beginner',
    label: 'STARTING OUT',
    hint: 'New to regular activity',
    icon: 'sunrise',
  },
  {
    value: 'casual',
    label: 'CASUAL',
    hint: 'I move a few times a week',
    icon: 'wind',
  },
  {
    value: 'regular',
    label: 'REGULAR',
    hint: 'I train most weeks',
    icon: 'activity',
  },
  {
    value: 'trained',
    label: 'TRAINED',
    hint: 'Structured training is normal',
    icon: 'zap',
  },
];

const routes: {
  route: '/' | '/run' | '/leaderboard' | '/profile';
  label: string;
  icon: keyof typeof Feather.glyphMap;
  testID: string;
}[] = [
  { route: '/', label: 'MAP', icon: 'map', testID: 'baseline-tab-home' },
  { route: '/run', label: 'RUN', icon: 'navigation', testID: 'baseline-tab-run' },
  {
    route: '/leaderboard',
    label: 'RANK',
    icon: 'bar-chart-2',
    testID: 'baseline-tab-leaderboard',
  },
  {
    route: '/profile',
    label: 'YOU',
    icon: 'user',
    testID: 'baseline-tab-profile',
  },
];

export default function BaselineOnboarding() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { uid } = useAuth();
  const mutation = useUpdateUserBaseline();
  const [activityLevel, setActivityLevel] =
    useState<FitnessTier>('regular');
  const [territoryColor, setTerritoryColor] =
    useState<TerritoryColor>('emerald');
  const [city, setCity] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [focusedField, setFocusedField] = useState<'tag' | 'city' | null>(
    null,
  );
  const [isSkipped, setIsSkipped] = useState(false);
  const [showCityRequired, setShowCityRequired] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getOnboardingFitnessTier(),
      getOnboardingTerritoryColor(),
    ])
      .then(([tier, color]) => {
        if (!active) return;
        if (tier) setActivityLevel(tier);
        setTerritoryColor(color);
      })
      .catch(() => {
        // Keep the safe defaults if persisted onboarding preferences are unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  if (isSkipped) return null;

  const save = () => {
    if (!uid || !city.trim()) {
      setShowCityRequired(true);
      return;
    }
    Keyboard.dismiss();
    mutation.mutate(
      {
        userId: uid,
        data: {
          city: city.trim(),
          activityLevel,
          territoryColor,
          ...(displayName.trim()
            ? { displayName: displayName.trim() }
            : {}),
        },
      },
      {
        onSuccess: () =>
          void queryClient.invalidateQueries({
            queryKey: getGetUserStatsQueryKey(uid),
          }),
      },
    );
  };

  const navigateFromSetup = (
    route: '/' | '/run' | '/leaderboard' | '/profile',
  ) => {
    setIsSkipped(true);
    if (route !== '/') router.push(route);
  };

  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 28) : insets.top;

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => setIsSkipped(true)}
    >
      <View
        testID="baseline-onboarding"
        accessibilityLabel={`Baseline onboarding. ${activityLevel} activity level selected`}
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <StatusBar style="light" />

        <View
          pointerEvents="none"
          style={[styles.gridTexture, { borderColor: colors.border }]}
        >
          {Array.from({ length: 7 }).map((_, index) => (
            <View
              key={`grid-v-${index}`}
              style={[
                styles.gridVertical,
                {
                  left: `${index * 16.66}%`,
                  backgroundColor: colors.border,
                },
              ]}
            />
          ))}
          {Array.from({ length: 12 }).map((_, index) => (
            <View
              key={`grid-h-${index}`}
              style={[
                styles.gridHorizontal,
                {
                  top: `${index * 9.09}%`,
                  backgroundColor: colors.border,
                },
              ]}
            />
          ))}
        </View>

        <View style={[styles.header, { paddingTop: topInset + 8 }]}>
          <View style={styles.brand}>
            <Image source={brandMark} style={styles.brandMark} contentFit="contain" />
            <View>
              <Text style={[styles.brandName, { color: colors.foreground }]}>
                HEXRUNNER
              </Text>
              <Text style={[styles.brandMode, { color: colors.primary }]}>
                TERRITORY SYSTEM
              </Text>
            </View>
          </View>
          <Pressable
            testID="baseline-skip"
            accessibilityRole="button"
            accessibilityLabel="Skip arena setup"
            onPress={() => setIsSkipped(true)}
            hitSlop={12}
            style={({ pressed }) => [styles.skipButton, { opacity: pressed ? 0.55 : 1 }]}
          >
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>SKIP</Text>
            <Feather name="arrow-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <KeyboardAwareScrollViewCompat
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 126 },
          ]}
          bottomOffset={84}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stepRow}>
            <View
              style={[
                styles.stepBadge,
                { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Feather name="crosshair" size={20} color={colors.primaryForeground} />
            </View>
            <View style={[styles.stepNumber, { borderColor: colors.border }]}>
              <Text style={[styles.stepNumberText, { color: colors.foreground }]}>
                01
              </Text>
            </View>
            <View style={[styles.stepRule, { backgroundColor: colors.border }]} />
            <Text style={[styles.stepCount, { color: colors.mutedForeground }]}>
              FIRST RUN SETUP
            </Text>
          </View>

          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            CALIBRATE YOUR HOME GRID
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            SET YOUR{'\n'}
            <Text style={{ color: colors.primary }}>ARENA.</Text>
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Three quick choices tune your local territory, fitness baseline and
            city rankings.
          </Text>

          <View style={styles.form}>
            <View
              style={[
                styles.inputShell,
                {
                  borderColor:
                    focusedField === 'tag' ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                },
              ]}
            >
              <View style={[styles.inputIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="tag" size={18} color={colors.primary} />
              </View>
              <TextInput
                testID="baseline-tag-input"
                accessibilityLabel="Tag name, optional"
                value={displayName}
                onChangeText={setDisplayName}
                onFocus={() => setFocusedField('tag')}
                onBlur={() => setFocusedField(null)}
                returnKeyType="next"
                maxLength={40}
                placeholder="RUNNER TAG  /  OPTIONAL"
                placeholderTextColor={colors.mutedForeground}
                selectionColor={colors.primary}
                autoCapitalize="words"
                style={[styles.input, { color: colors.foreground }]}
              />
            </View>

            <View
              style={[
                styles.inputShell,
                {
                  borderColor:
                    focusedField === 'city' || showCityRequired
                      ? colors.primary
                      : colors.border,
                  backgroundColor: colors.card,
                },
              ]}
            >
              <View style={[styles.inputIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="map-pin" size={18} color={colors.primary} />
              </View>
              <TextInput
                testID="baseline-city-input"
                accessibilityLabel="Your city or arena"
                value={city}
                onChangeText={value => {
                  setCity(value);
                  if (value.trim()) setShowCityRequired(false);
                }}
                onFocus={() => setFocusedField('city')}
                onBlur={() => setFocusedField(null)}
                onSubmitEditing={save}
                returnKeyType="done"
                maxLength={60}
                placeholder="CITY  /  HOME ARENA"
                placeholderTextColor={colors.mutedForeground}
                selectionColor={colors.primary}
                autoCapitalize="words"
                style={[styles.input, { color: colors.foreground }]}
              />
            </View>
            {showCityRequired ? (
              <Text style={[styles.fieldError, { color: colors.primary }]}>
                ADD YOUR HOME CITY TO ENTER THE ARENA.
              </Text>
            ) : null}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              HOW DO YOU MOVE?
            </Text>
            <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
              SELECT ONE
            </Text>
          </View>

          <View
            accessibilityRole="radiogroup"
            style={styles.levels}
          >
            {levels.map((level, index) => {
              const selected = activityLevel === level.value;
              return (
                <Pressable
                  key={level.value}
                  testID={`baseline-level-${level.value}`}
                  accessibilityRole="radio"
                  accessibilityLabel={`${level.label}. ${level.hint}`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => setActivityLevel(level.value)}
                  style={({ pressed }) => [
                    styles.levelCard,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.secondary : colors.card,
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.levelIndex,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : colors.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.levelIndexText,
                        {
                          color: selected
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      0{index + 1}
                    </Text>
                  </View>
                  <Feather
                    name={level.icon}
                    size={21}
                    color={selected ? colors.primary : colors.mutedForeground}
                  />
                  <View style={styles.levelCopy}>
                    <Text
                      style={[
                        styles.levelLabel,
                        { color: selected ? colors.primary : colors.foreground },
                      ]}
                    >
                      {level.label}
                    </Text>
                    <Text style={[styles.levelHint, { color: colors.mutedForeground }]}>
                      {level.hint}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: selected ? colors.primary : colors.mutedForeground },
                    ]}
                  >
                    {selected ? (
                      <View style={[styles.radioCore, { backgroundColor: colors.primary }]} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {mutation.isError ? (
            <View
              style={[
                styles.errorBanner,
                { backgroundColor: colors.card, borderColor: colors.destructive },
              ]}
            >
              <Feather name="alert-circle" size={18} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.foreground }]}>
                COULD NOT SAVE. CHECK YOUR CONNECTION AND RETRY.
              </Text>
            </View>
          ) : null}

          <Pressable
            testID="baseline-submit"
            accessibilityRole="button"
            accessibilityLabel="Enter the arena"
            accessibilityState={{ disabled: !city.trim() || mutation.isPending }}
            disabled={!city.trim() || mutation.isPending}
            onPress={save}
            style={({ pressed }) => [
              styles.submit,
              {
                backgroundColor: city.trim() ? colors.primary : colors.muted,
                borderColor: city.trim() ? colors.primary : colors.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <View>
                  <Text
                    style={[
                      styles.submitLabel,
                      {
                        color: city.trim()
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    ENTER THE ARENA
                  </Text>
                  <Text
                    style={[
                      styles.submitHint,
                      {
                        color: city.trim()
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    LOCK BASELINE & OPEN MAP
                  </Text>
                </View>
                <Feather
                  name="arrow-up-right"
                  size={26}
                  color={
                    city.trim() ? colors.primaryForeground : colors.mutedForeground
                  }
                />
              </>
            )}
          </Pressable>
        </KeyboardAwareScrollViewCompat>

        <View
          style={[
            styles.nav,
            {
              paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 18 : 8),
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          {routes.map(item => {
            const selected = item.route === '/';
            return (
              <Pressable
                key={item.route}
                testID={item.testID}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                onPress={() => navigateFromSetup(item.route)}
                style={({ pressed }) => [
                  styles.navItem,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <Feather
                  name={item.icon}
                  size={19}
                  color={selected ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.navLabel,
                    { color: selected ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {item.label}
                </Text>
                {selected ? (
                  <View style={[styles.navSignal, { backgroundColor: colors.primary }]} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  gridTexture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.13,
  },
  gridVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  brandMark: {
    width: 34,
    height: 34,
  },
  brandName: {
    fontFamily: 'Inter_900Black',
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: 0.6,
    fontStyle: 'italic',
  },
  brandMode: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 1.45,
  },
  skipButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  skipText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  stepBadge: {
    width: 42,
    height: 42,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    width: 42,
    height: 42,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 7,
  },
  stepNumberText: {
    fontFamily: 'Inter_900Black',
    fontSize: 17,
    fontStyle: 'italic',
  },
  stepRule: {
    flex: 1,
    height: 1,
    marginHorizontal: 12,
  },
  stepCount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 1.1,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Inter_900Black',
    fontSize: 44,
    lineHeight: 43,
    letterSpacing: -2.2,
    fontStyle: 'italic',
  },
  subtitle: {
    maxWidth: 340,
    marginTop: 13,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
  },
  form: {
    gap: 10,
    marginTop: 24,
  },
  inputShell: {
    minHeight: 56,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  inputIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 54,
    paddingHorizontal: 13,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.8,
    outlineWidth: 0,
  },
  fieldError: {
    marginTop: -2,
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.9,
  },
  sectionHeader: {
    marginTop: 28,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 18,
    letterSpacing: -0.4,
    fontStyle: 'italic',
  },
  sectionMeta: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 1.2,
  },
  levels: {
    gap: 9,
  },
  levelCard: {
    minHeight: 66,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 12,
  },
  levelIndex: {
    width: 34,
    height: 34,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelIndexText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  levelCopy: {
    flex: 1,
  },
  levelLabel: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 14,
    letterSpacing: 0.4,
    fontStyle: 'italic',
  },
  levelHint: {
    marginTop: 2,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 15,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  errorBanner: {
    minHeight: 48,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.45,
  },
  submit: {
    minHeight: 64,
    borderWidth: 1,
    marginTop: 20,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  submitLabel: {
    fontFamily: 'Inter_900Black',
    fontSize: 16,
    lineHeight: 19,
    letterSpacing: 0.2,
    fontStyle: 'italic',
  },
  submitHint: {
    marginTop: 2,
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 1,
  },
  nav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 72,
    borderTopWidth: 1,
    paddingTop: 9,
    paddingHorizontal: 8,
    flexDirection: 'row',
  },
  navItem: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.8,
  },
  navSignal: {
    position: 'absolute',
    top: -10,
    width: 28,
    height: 2,
  },
});