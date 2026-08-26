import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import {
  ONBOARDING_COMPLETE_KEY,
  saveOnboardingPace,
  type OnboardingPace,
} from '@/src/services/onboardingPreferences';

const heroAsset = require('../../assets/images/cinematic-urban-runner.jpg');
const WEB_TOP_INSET = 67;
const WEB_BOTTOM_INSET = 34;
const paces: {
  id: OnboardingPace;
  label: string;
  note: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { id: 'stride', label: 'STRIDE', note: 'Run the grid', icon: 'shoe-sneaker' },
  { id: 'roam', label: 'ROAM', note: 'Walk it down', icon: 'navigation-variant-outline' },
  { id: 'surge', label: 'SURGE', note: 'Race the line', icon: 'lightning-bolt-outline' },
];

export default function FirstLaunchGate({ children }: PropsWithChildren) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [pace, setPace] = useState<OnboardingPace>('stride');
  const [showIdentityNotice, setShowIdentityNotice] = useState(false);
  const intro = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).then(value =>
      setReady(value === 'yes'),
    );
    Animated.timing(intro, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, {
          toValue: 1,
          duration: 3800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scan, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    scanLoop.start();
    return () => {
      scanLoop.stop();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [intro, scan]);

  const finish = async (persistPace: boolean) => {
    if (persistPace) await saveOnboardingPace(pace);
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'yes');
    setReady(true);
  };

  const explainIdentityRecovery = () => {
    setShowIdentityNotice(true);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setShowIdentityNotice(false), 3200);
  };

  if (ready) return <>{children}</>;

  const topInset = Platform.OS === 'web' ? Math.max(insets.top, WEB_TOP_INSET) : insets.top;
  const bottomInset = Platform.OS === 'web' ? Math.max(insets.bottom, WEB_BOTTOM_INSET) : insets.bottom;
  const activeIndex = paces.findIndex(item => item.id === pace);
  const activePace = paces[activeIndex];

  return (
    <View
      testID="onboarding-root"
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <Image
        source={heroAsset}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={{ left: '57%', top: '50%' }}
        transition={0}
        accessibilityLabel="Runner moving through a rain-lit city street at night"
      />
      <LinearGradient
        colors={['rgba(3,5,9,0.12)', 'rgba(5,7,11,0.08)', 'rgba(5,7,11,0.58)', '#080a0f']}
        locations={[0, 0.25, 0.58, 0.91]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.atmosphere} pointerEvents="none" />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.scanLine,
          {
            opacity: scan.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 0.8, 0.8, 0] }),
            transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [0, 430] }) }],
          },
        ]}
      />

      <View style={[styles.header, { paddingTop: topInset + 18 }]}>
        <View style={styles.brand}>
          <View style={[styles.brandMark, { backgroundColor: colors.cinematicAccent }]}>
            <MaterialCommunityIcons name="hexagon-outline" size={19} color={colors.cinematicAccentForeground} />
          </View>
          <Text style={styles.brandText}>HEXRUNNER</Text>
        </View>
        <Pressable
          testID="onboarding-skip"
          onPress={() => void finish(false)}
          accessibilityRole="button"
          accessibilityLabel="Skip setup"
          hitSlop={12}
          style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
        >
          <Text style={[styles.skipText, { borderBottomColor: colors.cinematicAccent }]}>SKIP SETUP</Text>
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.heroCopy,
          {
            opacity: intro,
            transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
          },
        ]}
      >
        <View style={styles.gridStatus}>
          <View style={[styles.statusDot, { backgroundColor: colors.cinematicAccent }]} />
          <Text style={[styles.eyebrow, { color: colors.cinematicAccent }]}>CITY GRID / ARMED</Text>
        </View>
        <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={3} style={styles.title}>
          RUN THE{'\n'}<Text style={{ color: colors.cinematicAccent }}>CITY.</Text>{'\n'}KEEP IT.
        </Text>
        <Text style={styles.description}>
          Every route cuts a line. Close the loop to claim real blocks before another runner does.
        </Text>
      </Animated.View>

      <View style={[styles.controls, { paddingBottom: bottomInset + 18 }]}>
        <View style={styles.paceHeading}>
          <View>
            <Text style={styles.paceLabel}>PICK YOUR PACE</Text>
            <Text style={styles.paceNote}>{activePace.note}</Text>
          </View>
          <Text style={[styles.counter, { color: colors.cinematicAccent }]}>0{activeIndex + 1} / 03</Text>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Choose your movement style" style={styles.segmented}>
          {paces.map(item => {
            const selected = item.id === pace;
            return (
              <Pressable
                key={item.id}
                testID={`onboarding-pace-${item.id}`}
                onPress={() => setPace(item.id)}
                accessibilityRole="radio"
                accessibilityLabel={`${item.label}. ${item.note}`}
                accessibilityState={{ checked: selected }}
                style={({ pressed }) => [
                  styles.paceOption,
                  selected && { backgroundColor: colors.cinematicAccent },
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  name={item.icon}
                  size={16}
                  color={selected ? colors.cinematicAccentForeground : '#f3f2e9'}
                />
                <Text style={[styles.paceOptionText, selected && styles.selectedPaceText]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          testID="onboarding-enter-arena"
          onPress={() => void finish(true)}
          accessibilityRole="button"
          accessibilityLabel={`Enter the arena with ${activePace.label.toLowerCase()} pace`}
          style={({ pressed }) => [
            styles.enterButton,
            { backgroundColor: colors.cinematicAccent },
            pressed && styles.enterPressed,
          ]}
        >
          <Text style={styles.enterText}>ENTER THE ARENA</Text>
          <View style={styles.enterIcon}>
            <Feather name="arrow-up-right" size={19} color={colors.cinematicAccent} />
          </View>
        </Pressable>
        <Pressable
          testID="onboarding-sign-in"
          onPress={explainIdentityRecovery}
          accessibilityRole="button"
          accessibilityLabel="Already running? Sign in"
          hitSlop={10}
          style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
        >
          <Feather name="log-in" size={14} color="#e5e4db" />
          <Text style={[styles.signInText, { textDecorationColor: colors.cinematicAccent }]}>
            Already running? Sign in
          </Text>
        </Pressable>
        {showIdentityNotice ? (
          <View
            testID="onboarding-identity-notice"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.identityNotice}
          >
            <Feather name="shield" size={15} color={colors.cinematicAccent} />
            <Text style={styles.identityNoticeText}>
              Your existing territory restores automatically on this device.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', height: '100%', overflow: 'hidden' },
  atmosphere: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 42, 52, 0.14)',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 150,
    height: 1,
    backgroundColor: 'rgba(215,255,62,0.42)',
  },
  header: {
    position: 'absolute',
    zIndex: 4,
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 26,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  brandText: {
    color: '#f3f2e9',
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    letterSpacing: -1,
  },
  skip: { minHeight: 44, justifyContent: 'center' },
  skipText: {
    color: '#f3f2e9',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    borderBottomWidth: 1,
    paddingBottom: 4,
  },
  heroCopy: {
    position: 'absolute',
    zIndex: 3,
    left: 27,
    right: 24,
    top: '30%',
  },
  gridStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2 },
  title: {
    color: '#f3f2e9',
    fontFamily: 'Inter_700Bold',
    fontSize: 57,
    lineHeight: 51,
    letterSpacing: -3.4,
    maxWidth: 340,
  },
  description: {
    color: '#e8e7de',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 18,
    maxWidth: 280,
  },
  controls: {
    position: 'absolute',
    zIndex: 5,
    left: 20,
    right: 20,
    bottom: 0,
  },
  paceHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    marginBottom: 11,
  },
  paceLabel: { color: '#aeb1af', fontFamily: 'Inter_500Medium', fontSize: 9, letterSpacing: 1.7 },
  paceNote: { color: '#f3f2e9', fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 4 },
  counter: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1 },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(233,234,223,0.55)',
    backgroundColor: 'rgba(8,10,15,0.78)',
    borderRadius: 30,
    padding: 5,
  },
  paceOption: {
    flex: 1,
    height: 46,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  paceOptionText: { color: '#e9eadf', fontFamily: 'Inter_700Bold', fontSize: 13 },
  selectedPaceText: { color: '#090b10' },
  enterButton: {
    height: 60,
    marginTop: 14,
    paddingHorizontal: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  enterText: { color: '#090b10', fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.6 },
  enterIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#090b10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signIn: {
    minHeight: 42,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  signInText: {
    color: '#e5e4db',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  identityNotice: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 78,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: 'rgba(215,255,62,0.55)',
    backgroundColor: 'rgba(16,21,26,0.96)',
  },
  identityNoticeText: {
    flex: 1,
    color: '#f3f2e9',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 17,
  },
  pressed: { opacity: 0.72 },
  enterPressed: { transform: [{ scale: 0.985 }] },
});
