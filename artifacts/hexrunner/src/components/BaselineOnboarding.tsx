import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetUserStatsQueryKey,
  useUpdateUserBaseline,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/src/context/AuthContext';
import type { FitnessTier } from '@/src/services/fitnessModel';
import { getOnboardingFitnessTier } from '@/src/services/onboardingPreferences';

const setupReference = require('../../assets/images/arena-setup-reference.png');

const levels: {
  value: FitnessTier;
  label: string;
  hint: string;
  top: `${number}%`;
}[] = [
  {
    value: 'beginner',
    label: 'STARTING OUT',
    hint: 'New to regular activity',
    top: '59.25%',
  },
  {
    value: 'casual',
    label: 'CASUAL',
    hint: 'I move a few times a week',
    top: '65.82%',
  },
  {
    value: 'regular',
    label: 'REGULAR',
    hint: 'I train most weeks',
    top: '72.36%',
  },
  {
    value: 'trained',
    label: 'TRAINED',
    hint: 'Structured training is normal',
    top: '78.96%',
  },
];

function ShoeMark({ color }: { color: string }) {
  return (
    <Svg width={34} height={27} viewBox="0 0 34 27">
      <Path
        d="M4 17.5c3.2-.4 5.6-2.7 7.4-7l4.2 2.2 2.7 5.1c2.8 1.7 6.7 2.8 11.7 3.2v3H4.8c-1.8 0-2.8-1-2.8-2.8 0-1.9.7-3.1 2-3.7Z"
        fill={color}
      />
      <Path
        d="m12.5 11.5 4-4M16 13.5l4-4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CheckMark({ color }: { color: string }) {
  return (
    <Svg width={34} height={31} viewBox="0 0 34 31">
      <Path
        d="m3 16 8 8L31 4"
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </Svg>
  );
}

function CorrectedLevel({
  level,
  selected,
  foreground,
  muted,
  primary,
  card,
  accent,
}: {
  level: (typeof levels)[number];
  selected: boolean;
  foreground: string;
  muted: string;
  primary: string;
  card: string;
  accent: string;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.correctedLevel,
        {
          top: level.top,
          borderColor: selected ? primary : muted,
          backgroundColor: selected ? accent : card,
        },
      ]}
    >
      <ShoeMark color={selected ? primary : muted} />
      <View style={styles.correctedCopy}>
        <Text
          style={[
            styles.correctedLabel,
            { color: selected ? primary : foreground },
          ]}
        >
          {level.label}
        </Text>
        <Text style={[styles.correctedHint, { color: muted }]}>
          {level.hint}
        </Text>
      </View>
      {selected ? <CheckMark color={primary} /> : null}
    </View>
  );
}

export default function BaselineOnboarding() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { uid } = useAuth();
  const mutation = useUpdateUserBaseline();
  const [activityLevel, setActivityLevel] =
    useState<FitnessTier>('regular');
  const [city, setCity] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [focusedField, setFocusedField] = useState<'tag' | 'city' | null>(
    null,
  );
  const [isSkipped, setIsSkipped] = useState(false);

  useEffect(() => {
    let active = true;
    void getOnboardingFitnessTier().then(tier => {
      if (active && tier) setActivityLevel(tier);
    });
    return () => {
      active = false;
    };
  }, []);

  if (isSkipped) return null;

  const save = () => {
    if (!uid || !city.trim()) return;
    Keyboard.dismiss();
    mutation.mutate(
      {
        userId: uid,
        data: {
          city: city.trim(),
          activityLevel,
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

  const selectedLevel = levels.find(
    level => level.value === activityLevel,
  );
  const regularLevel = levels.find(level => level.value === 'regular');
  const needsSelectionCorrection =
    activityLevel !== 'regular' && selectedLevel && regularLevel;

  return (
    <Modal
      visible
      animationType="none"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => setIsSkipped(true)}
    >
      <View
        testID="baseline-onboarding"
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <StatusBar hidden />
        <Image
          source={setupReference}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
          transition={0}
          accessibilityIgnoresInvertColors
        />

        <Pressable
          testID="baseline-skip"
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          onPress={() => setIsSkipped(true)}
          style={styles.skipHitArea}
        />

        <TextInput
          testID="baseline-tag-input"
          accessibilityLabel="Tag name, optional"
          value={displayName}
          onChangeText={setDisplayName}
          onFocus={() => setFocusedField('tag')}
          onBlur={() => setFocusedField(null)}
          onSubmitEditing={Keyboard.dismiss}
          returnKeyType="next"
          maxLength={40}
          selectionColor={colors.primary}
          style={[
            styles.referenceInput,
            styles.tagInput,
            {
              color: colors.foreground,
              backgroundColor:
                focusedField === 'tag' || displayName
                  ? colors.card
                  : 'transparent',
            },
          ]}
        />

        <TextInput
          testID="baseline-city-input"
          accessibilityLabel="Your city or arena"
          value={city}
          onChangeText={setCity}
          onFocus={() => setFocusedField('city')}
          onBlur={() => setFocusedField(null)}
          onSubmitEditing={Keyboard.dismiss}
          returnKeyType="done"
          maxLength={60}
          selectionColor={colors.primary}
          style={[
            styles.referenceInput,
            styles.cityInput,
            {
              color: colors.foreground,
              backgroundColor:
                focusedField === 'city' || city
                  ? colors.card
                  : 'transparent',
            },
          ]}
        />

        {needsSelectionCorrection ? (
          <>
            <CorrectedLevel
              level={regularLevel}
              selected={false}
              foreground={colors.foreground}
              muted={colors.mutedForeground}
              primary={colors.primary}
              card={colors.card}
              accent={colors.accent}
            />
            <CorrectedLevel
              level={selectedLevel}
              selected
              foreground={colors.foreground}
              muted={colors.mutedForeground}
              primary={colors.primary}
              card={colors.card}
              accent={colors.accent}
            />
          </>
        ) : null}

        {levels.map(level => {
          const selected = activityLevel === level.value;
          return (
            <Pressable
              key={level.value}
              testID={`baseline-level-${level.value}`}
              accessibilityRole="radio"
              accessibilityLabel={`${level.label}. ${level.hint}`}
              accessibilityState={{ checked: selected }}
              onPress={() => setActivityLevel(level.value)}
              style={[styles.levelHitArea, { top: level.top }]}
            />
          );
        })}

        {mutation.isError ? (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: colors.card,
                borderColor: colors.destructive,
              },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              COULD NOT SAVE. CHECK YOUR CONNECTION AND RETRY.
            </Text>
          </View>
        ) : null}

        <Pressable
          testID="baseline-submit"
          accessibilityRole="button"
          accessibilityLabel="Enter the arena"
          accessibilityState={{
            disabled: !city.trim() || mutation.isPending,
          }}
          disabled={!city.trim() || mutation.isPending}
          onPress={save}
          style={styles.submitHitArea}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : null}
        </Pressable>

        <View style={styles.tabHitAreas}>
          <Pressable
            testID="baseline-tab-home"
            accessibilityRole="tab"
            accessibilityLabel="Home"
            accessibilityState={{ selected: true }}
            onPress={() => navigateFromSetup('/')}
            style={styles.tabHitArea}
          />
          <Pressable
            testID="baseline-tab-run"
            accessibilityRole="tab"
            accessibilityLabel="Run"
            onPress={() => navigateFromSetup('/run')}
            style={styles.tabHitArea}
          />
          <Pressable
            testID="baseline-tab-leaderboard"
            accessibilityRole="tab"
            accessibilityLabel="Leaderboard"
            onPress={() => navigateFromSetup('/leaderboard')}
            style={styles.tabHitArea}
          />
          <Pressable
            testID="baseline-tab-profile"
            accessibilityRole="tab"
            accessibilityLabel="Profile"
            onPress={() => navigateFromSetup('/profile')}
            style={styles.tabHitArea}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  skipHitArea: {
    position: 'absolute',
    top: '1.5%',
    right: '2%',
    width: '25%',
    height: '8%',
    zIndex: 10,
    outlineWidth: 0,
  },
  referenceInput: {
    position: 'absolute',
    left: '19%',
    right: '9.5%',
    height: '4.8%',
    zIndex: 10,
    borderWidth: 0,
    borderRadius: 1,
    paddingHorizontal: 6,
    paddingVertical: 0,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    outlineWidth: 0,
  },
  tagInput: {
    top: '43.55%',
  },
  cityInput: {
    top: '49.35%',
  },
  levelHitArea: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    height: '6.1%',
    zIndex: 10,
    outlineWidth: 0,
  },
  correctedLevel: {
    position: 'absolute',
    left: '8.5%',
    right: '8.5%',
    height: '5.9%',
    zIndex: 8,
    borderWidth: 1.5,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
  },
  correctedCopy: {
    flex: 1,
    marginLeft: 16,
  },
  correctedLabel: {
    fontFamily: 'PermanentMarker_400Regular',
    fontSize: 18,
    lineHeight: 21,
  },
  correctedHint: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
  errorBanner: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '83.7%',
    zIndex: 12,
    minHeight: 34,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  errorText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    textAlign: 'center',
  },
  submitHitArea: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '86.2%',
    height: '6.8%',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    outlineWidth: 0,
  },
  tabHitAreas: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '7.1%',
    zIndex: 10,
    flexDirection: 'row',
  },
  tabHitArea: {
    flex: 1,
    outlineWidth: 0,
  },
});