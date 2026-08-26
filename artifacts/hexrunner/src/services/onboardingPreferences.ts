import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FitnessTier } from '@/src/services/fitnessModel';

export const ONBOARDING_COMPLETE_KEY = '@hexrunner/paint-school-complete';
export const ONBOARDING_PACE_KEY = '@hexrunner/onboarding-pace';

export type OnboardingPace = 'stride' | 'roam' | 'surge';

export const PACE_TO_FITNESS_TIER: Readonly<Record<OnboardingPace, FitnessTier>> = {
  stride: 'regular',
  roam: 'casual',
  surge: 'trained',
};

export async function saveOnboardingPace(pace: OnboardingPace): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_PACE_KEY, pace);
}

export async function getOnboardingFitnessTier(): Promise<FitnessTier | null> {
  const pace = await AsyncStorage.getItem(ONBOARDING_PACE_KEY);
  return pace === 'stride' || pace === 'roam' || pace === 'surge'
    ? PACE_TO_FITNESS_TIER[pace]
    : null;
}