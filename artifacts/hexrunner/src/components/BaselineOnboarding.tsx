import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getGetUserStatsQueryKey, useUpdateUserBaseline } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/src/context/AuthContext';
import type { FitnessTier } from '@/src/services/fitnessModel';

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
    <View style={[styles.scrim, { backgroundColor: 'rgba(5, 10, 14, 0.82)' }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>FIRST RUN SETUP</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Set your arena baseline</Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          Three quick answers personalize your on-device target and city standings.
        </Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Runner name (optional)"
          placeholderTextColor={colors.mutedForeground}
          maxLength={40}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
        />
        <TextInput
          value={city}
          onChangeText={setCity}
          placeholder="Your city (for city leaderboard)"
          placeholderTextColor={colors.mutedForeground}
          maxLength={60}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
        />
        <Text style={[styles.question, { color: colors.foreground }]}>How active are you now?</Text>
        <View style={styles.levels}>
          {levels.map((level) => (
            <Pressable
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
        {mutation.isError ? <Text style={[styles.error, { color: colors.destructive }]}>Could not save your baseline. Check your connection and retry.</Text> : null}
        <Pressable
          disabled={!city.trim() || mutation.isPending}
          onPress={save}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: !city.trim() || mutation.isPending || pressed ? 0.58 : 1 }]}
        >
          {mutation.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Enter the arena</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, zIndex: 10, justifyContent: 'center', padding: 22 },
  card: { borderWidth: 1, borderRadius: 22, padding: 20 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.3 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 25, marginTop: 6 },
  copy: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontFamily: 'Inter_500Medium', fontSize: 14, marginBottom: 10 },
  question: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 4, marginBottom: 9 },
  levels: { gap: 8 },
  level: { borderWidth: 1, borderRadius: 12, padding: 10 },
  levelLabel: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  levelHint: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 },
  error: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 10 },
  button: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
});