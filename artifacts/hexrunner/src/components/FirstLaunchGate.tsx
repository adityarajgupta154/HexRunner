import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { type PropsWithChildren, useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import {
  ONBOARDING_COMPLETE_KEY,
  saveOnboardingPace,
  saveOnboardingTerritoryColor,
  type OnboardingPace,
} from '@/src/services/onboardingPreferences';
import type { TerritoryColor } from '@workspace/api-client-react';

import BrandReveal from './onboarding/BrandReveal';
import OnboardingVideo from './onboarding/OnboardingVideo';
import {
  VIDEO_POSTERS,
  VIDEO_SOURCES,
} from './onboarding/onboardingMedia';

const WEB_TOP_INSET = 67;
const WEB_BOTTOM_INSET = 34;

type Step = 'loop' | 'take' | 'grow' | 'colour' | 'location';

const colourOptions: {
  key: TerritoryColor;
  color: string;
  label: string;
}[] = [
  { key: 'emerald', color: '#00FF78', label: 'Signal green' },
  { key: 'cyan', color: '#00D7FF', label: 'Electric cyan' },
  { key: 'amber', color: '#FFD60A', label: 'Arena amber' },
  { key: 'fuchsia', color: '#FF2D92', label: 'Hot fuchsia' },
  { key: 'violet', color: '#A970FF', label: 'Volt violet' },
];

const paces: {
  id: OnboardingPace;
  label: string;
}[] = [
  { id: 'stride', label: 'STRIDE' },
  { id: 'roam', label: 'ROAM' },
  { id: 'surge', label: 'SURGE' },
];

export default function FirstLaunchGate({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [brandRevealComplete, setBrandRevealComplete] = useState(false);

  const [step, setStep] = useState<Step>('loop');
  const [pace, setPace] = useState<OnboardingPace>('stride');
  const [showIdentityNotice, setShowIdentityNotice] = useState(false);
  const [selectedColour, setSelectedColour] = useState<TerritoryColor>('emerald');

  const selectedColourHex =
    colourOptions.find(option => option.key === selectedColour)?.color ??
    '#00FF78';

  useEffect(() => {
    void AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).then(value => {
      setNeedsOnboarding(value !== 'yes');
      setOnboardingReady(true);
    });
  }, []);

  const finish = async (persistPace: boolean) => {
    if (persistPace) await saveOnboardingPace(pace);
    await saveOnboardingTerritoryColor(selectedColour);
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'yes');
    setNeedsOnboarding(false);
  };

  const handleNext = () => {
    switch (step) {
      case 'loop': setStep('take'); break;
      case 'take': setStep('grow'); break;
      case 'grow': setStep('colour'); break;
      case 'colour': setStep('location'); break;
      case 'location': void handleLocationPermission(); break;
    }
  };

  const handleBack = () => {
    switch (step) {
      case 'take': setStep('loop'); break;
      case 'grow': setStep('take'); break;
      case 'colour': setStep('grow'); break;
      case 'location': setStep('colour'); break;
    }
  };

  const handleLocationPermission = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      // Even if denied, we let them proceed so they aren't stuck
    }
    void finish(true);
  };

  const explainIdentityRecovery = () => {
    setShowIdentityNotice(true);
    setTimeout(() => setShowIdentityNotice(false), 3200);
  };

  const completeBrandReveal = useCallback(() => {
    setBrandRevealComplete(true);
  }, []);

  const topInset = Platform.OS === 'web' ? Math.max(insets.top, WEB_TOP_INSET) : insets.top;
  const bottomInset = Platform.OS === 'web' ? Math.max(insets.bottom, WEB_BOTTOM_INSET) : insets.bottom;

  const renderOnboarding = () => (
    <View testID="onboarding-root" style={[styles.screen, { backgroundColor: '#0B0D12' }]}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {/* Background Video Area */}
      <View style={styles.mapArea}>
        <OnboardingVideo
          key={step}
          poster={VIDEO_POSTERS[step]}
          source={VIDEO_SOURCES[step]}
        />
      </View>

      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 10 }]}>
        {step !== 'loop' ? (
          <Pressable onPress={handleBack} hitSlop={12} style={styles.backButton}>
             <Feather name="chevron-left" size={24} color="#FFF" />
             <Text style={styles.backText}>BACK</Text>
          </Pressable>
        ) : <View style={{width: 80}} />}
      </View>

      {/* Bottom Sheet */}
      <View style={[styles.sheet, { paddingBottom: bottomInset + 18 }]}>
        <Animated.View
          key={step}
          entering={reducedMotion ? undefined : FadeIn.duration(400).delay(100)}
          style={styles.stepContent}
        >
          {step === 'loop' && (
            <View style={styles.stepContentInner}>
              <Text style={styles.title}>CLOSE THE LOOP</Text>
              <Text style={styles.description}>As you move, your route draws a shape on the map. Close the loop to claim everything inside. Even a small block counts.</Text>
            </View>
          )}
          {step === 'take' && (
            <View style={styles.stepContentInner}>
              <Text style={styles.title}>TAKE IT</Text>
              <Text style={styles.description}>Move through their area to take it. They can take yours too.</Text>
            </View>
          )}
          {step === 'grow' && (
            <View style={styles.stepContentInner}>
              <Text style={styles.title}>GROW YOUR TERRITORY</Text>
              <Text style={styles.description}>Block by block. Or all at once. Avoid out and back runs as they capture less territory.</Text>
            </View>
          )}
          {step === 'colour' && (
            <View style={styles.stepContentInner}>
              <Text style={styles.title}>CLAIM YOUR COLOUR</Text>
              <Text style={styles.description}>This is your territory.</Text>

              <View style={styles.colourGrid}>
                  {colourOptions.map(option => (
                   <Pressable
                      key={option.key}
                      testID={`onboarding-colour-${option.key}`}
                      accessibilityRole="radio"
                      accessibilityLabel={option.label}
                      accessibilityState={{ checked: selectedColour === option.key }}
                      onPress={() => setSelectedColour(option.key)}
                      style={[
                        styles.colourSwatch,
                        {
                          backgroundColor: option.color,
                          borderWidth: selectedColour === option.key ? 3 : 0,
                          borderColor: '#000',
                        },
                      ]}
                   />
                 ))}
              </View>

              <View style={{marginTop: 20, width: '100%'}}>
                <Text style={[styles.description, {fontSize: 12, marginBottom: 8}]}>Select a pace profile:</Text>
                <View style={styles.segmented}>
                  {paces.map(item => (
                    <Pressable
                      key={item.id}
                      testID={`onboarding-pace-${item.id}`}
                      onPress={() => setPace(item.id)}
                      style={[
                        styles.paceOption,
                        item.id === pace && { backgroundColor: '#000' }
                      ]}
                    >
                      <Text style={[styles.paceOptionText, item.id === pace && { color: '#FFF' }]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}
          {step === 'location' && (
            <View style={styles.stepContentInner}>
              <Text style={styles.title}>TO PLAY, TURN ON LOCATION</Text>
              <Text style={styles.description}>Let's see what's happening in your area.</Text>
            </View>
          )}
        </Animated.View>

        <View style={styles.footerRow}>
           <Pressable
            testID="onboarding-skip"
            onPress={() => void finish(false)}
            hitSlop={12}
          >
            <Text style={styles.skipText}>SKIP</Text>
          </Pressable>

          <Pressable
            testID="onboarding-next"
            onPress={handleNext}
            style={({ pressed }) => [
              styles.nextButton,
              { backgroundColor: selectedColourHex },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.nextText}>{step === 'location' ? 'TURN ON LOCATION' : 'NEXT'}</Text>
          </Pressable>
        </View>

        {step === 'loop' && (
           <Pressable
             testID="onboarding-sign-in"
             onPress={explainIdentityRecovery}
             style={styles.signIn}
           >
              <Text style={styles.signInText}>Already running? Sign in</Text>
           </Pressable>
        )}
        {showIdentityNotice ? (
          <View testID="onboarding-identity-notice" style={styles.identityNotice}>
            <Feather name="shield" size={15} color="#000" />
            <Text style={styles.identityNoticeText}>
              Your existing territory restores automatically on this device.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      {onboardingReady ? (
        needsOnboarding ? renderOnboarding() : children
      ) : (
        <View style={[styles.screen, { backgroundColor: '#0A0F14' }]} />
      )}
      {!brandRevealComplete && (
        <BrandReveal onComplete={completeBrandReveal} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', height: '100%', overflow: 'hidden' },
  mapArea: {
    flex: 1,
    backgroundColor: '#0B0D12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    zIndex: 4,
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingRight: 16,
    paddingLeft: 8,
    paddingVertical: 8,
    borderRadius: 24,
  },
  backText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#000',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    minHeight: 280,
  },
  stepContent: {
    minHeight: 200,
  },
  stepContentInner: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: '#000000',
    fontStyle: 'italic',
    letterSpacing: -0.5,
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    lineHeight: 22,
    color: '#1A1D24',
    textAlign: 'center',
  },
  colourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 24,
  },
  colourSwatch: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    borderRadius: 30,
    padding: 4,
  },
  paceOption: {
    flex: 1,
    height: 36,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paceOptionText: {
    color: '#8E8E93',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 32,
  },
  skipText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#000000',
    letterSpacing: 0.5,
  },
  nextButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    minWidth: 140,
    alignItems: 'center',
  },
  nextText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#000000',
  },
  signIn: {
    marginTop: 24,
    alignItems: 'center',
  },
  signInText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#8E8E93',
    textDecorationLine: 'underline',
  },
  identityNotice: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  identityNoticeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#000',
  },
});
