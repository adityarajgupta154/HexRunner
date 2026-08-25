import React, { type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { ErrorFallbackProps } from '@/components/ErrorFallback';
import { useColors } from '@/hooks/useColors';

function ScreenErrorFallback({ resetError }: ErrorFallbackProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Feather name="alert-triangle" size={28} color={colors.destructive} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        This screen couldn&apos;t load
      </Text>
      <Text style={[styles.message, { color: colors.mutedForeground }]}>
        A temporary problem interrupted this screen. Your saved progress is safe.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry loading this screen"
        onPress={resetError}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.primary,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <Feather name="refresh-cw" size={17} color={colors.primaryForeground} />
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          Retry
        </Text>
      </Pressable>
    </View>
  );
}

export function ScreenErrorBoundary({ children }: PropsWithChildren) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          FallbackComponent={ScreenErrorFallback}
          onReset={reset}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  icon: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    textAlign: 'center',
  },
  message: {
    maxWidth: 320,
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  button: {
    minHeight: 48,
    marginTop: 22,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 15,
  },
  buttonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
});