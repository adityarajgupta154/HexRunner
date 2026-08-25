import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { getGetUserStatsQueryKey, useUpdateUserBaseline } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/src/context/AuthContext';
import type { FitnessTier } from '@/src/services/fitnessModel';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import PaintStroke from '@/src/components/PaintStroke';

const levels: { value: FitnessTier; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Starting out', hint: 'New to regular activity' },
  { value: 'casual', label: 'Casual', hint: 'I move a few times a week' },
  { value: 'regular', label: 'Regular', hint: 'I train most weeks' },
  { value: 'trained', label: 'Trained', hint: 'Structured training is normal' },
];

export default function BaselineOnboarding() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { uid } = useAuth();
  const mutation = useUpdateUserBaseline();
  const [activityLevel, setActivityLevel] = useState<FitnessTier>('casual');
  const [city, setCity] = useState('');
  const [displayName, setDisplayName] = useState('');

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
    <View style={[styles.scrim, { backgroundColor: 'rgba(16, 13, 12, 0.94)' }]}>
      <KeyboardAwareScrollViewCompat contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bottomOffset={56}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]}>
        <View style={[styles.paintStamp, { backgroundColor: colors.primary }]}><Feather name="crosshair" size={28} color={colors.primaryForeground} /></View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>FIRST RUN SETUP / 01</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>SET YOUR{'\n'}ARENA.</Text>
        <View style={styles.stroke}><PaintStroke color={colors.primary} width={126} /></View>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          Three quick answers personalize your on-device target and city standings.
        </Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Tag name (optional)"
          placeholderTextColor={colors.mutedForeground}
          maxLength={40}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
        />
        <TextInput
          value={city}
          onChangeText={setCity}
          placeholder="Your city / arena"
          placeholderTextColor={colors.mutedForeground}
          maxLength={60}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
        />
        <Text style={[styles.question, { color: colors.foreground }]}>HOW DO YOU MOVE?</Text>
        <View style={styles.levels}>
          {levels.map((level) => (
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: activityLevel === level.value }}
              key={level.value}
              onPress={() => setActivityLevel(level.value)}
              style={[
                styles.level,
                {
                  borderColor: activityLevel === level.value ? colors.primary : colors.border,
                  backgroundColor: activityLevel === level.value ? colors.accent : colors.background,
                },
              ]}
            >
              <Text style={[styles.levelLabel, { color: colors.foreground }]}>{level.label}</Text>
              <Text style={[styles.levelHint, { color: colors.mutedForeground }]}>{level.hint}</Text>
            </Pressable>
          ))}
        </View>
        {mutation.isError ? <Text style={[styles.error, { color: colors.destructive }]}>COULD NOT SAVE YOUR BASELINE. CHECK YOUR CONNECTION AND RETRY.</Text> : null}
        <Pressable
          disabled={!city.trim() || mutation.isPending}
          onPress={save}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: !city.trim() || mutation.isPending || pressed ? 0.58 : 1 }]}
        >
          {mutation.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>ENTER THE ARENA</Text><Feather name="arrow-right" size={18} color={colors.primaryForeground} /></>}
        </Pressable>
      </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { borderWidth: 2, borderRadius: 5, padding: 20, maxWidth: 500, alignSelf: 'center', width: '100%' },
  paintStamp: { width: 52, height: 52, borderRadius: 4, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-7deg' }], marginBottom: 20 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.3 },
  title: { fontFamily: 'PermanentMarker_400Regular', fontSize: 34, lineHeight: 37, letterSpacing: -0.7, marginTop: 6 },
  stroke: { marginTop: 7, marginBottom: 3, transform: [{ rotate: '-4deg' }] },
  copy: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 13, paddingVertical: 12, fontFamily: 'Inter_500Medium', fontSize: 14, marginBottom: 10 },
  question: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1, marginTop: 7, marginBottom: 9 },
  levels: { gap: 8 },
  level: { borderWidth: 1, borderRadius: 3, padding: 10 },
  levelLabel: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  levelHint: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 },
  error: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 10 },
  button: { minHeight: 52, borderRadius: 3, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 1 },
});