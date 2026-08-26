import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { sendWave } from '@workspace/api-client-react';
import * as crypto from 'expo-crypto';
import type { ExactPresence, AnonymousPresence } from '@workspace/api-client-react';
import {
  WaveActionController,
  type WaveActionState,
} from '@/src/services/waveActionController';

export function WaveActionModal({
  runner,
  onClose
}: {
  runner: ExactPresence | AnonymousPresence | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const [waveState, setWaveState] = useState<WaveActionState>({
    status: 'idle',
  });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const controller = useMemo(
    () =>
      new WaveActionController(
        {
          sendWave,
          createIdempotencyKey: () => crypto.randomUUID(),
          setTimeout: (cb, ms) => setTimeout(cb, ms),
          clearTimeout: (id) => clearTimeout(id),
        },
        setWaveState,
        () => onCloseRef.current(),
      ),
    [],
  );
  const status = waveState.status;

  useEffect(() => {
    controller.select(runner?.interactionToken ?? null);
  }, [controller, runner]);

  useEffect(() => () => controller.dispose(), [controller]);

  if (!runner) return null;

  const isExact = 'userId' in runner;
  const displayName = isExact
    ? runner.displayName.toUpperCase()
    : 'CLOAKED RUNNER';
  const handleClose = () => {
    if (status === 'pending') return;
    controller.select(null);
    onClose();
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close wave action"
          style={styles.backdrop}
          onPress={handleClose}
          disabled={status === 'pending'}
        />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Feather name="radio" size={18} color={colors.primary} />
            <Text style={[styles.title, { color: colors.foreground }]}>LIVE INTERACTION</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close wave action"
              onPress={handleClose}
              disabled={status === 'pending'}
              style={styles.closeBtn}
              hitSlop={12}
            >
             <Feather name="x" size={20} color={colors.mutedForeground} />
           </Pressable>
          </View>

          <View style={[styles.targetBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.targetLabel, { color: colors.mutedForeground }]}>TARGET</Text>
            <Text style={[styles.targetName, { color: colors.foreground }]}>{displayName}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Send a wave to ${displayName}`}
            onPress={() => void controller.send()}
            disabled={status === 'pending' || status === 'sent'}
            style={({pressed}) => [
              styles.actionBtn,
              {
                backgroundColor: status === 'sent' ? '#2DE0B0' : (status === 'pending' ? colors.muted : colors.primary),
                borderColor: status === 'sent' ? '#2DE0B0' : colors.primary,
                opacity: pressed ? 0.8 : 1
              }
            ]}
          >
            {status === 'pending' ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : status === 'sent' ? (
                <>
                  <Feather name="check" size={18} color="#000" />
                  <Text style={[styles.actionBtnText, { color: '#000' }]}>WAVE SENT</Text>
                </>
              ) : (
                <>
                  <Feather name="zap" size={18} color={colors.primaryForeground} />
                  <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>SEND WAVE</Text>
                </>
              )}
          </Pressable>

          {status === 'throttled' && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>You're waving too fast. Cool down.</Text>
          )}
          {status === 'blocked' && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>Interaction unavailable.</Text>
          )}
          {status === 'offline' && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>No connection. Wave not sent.</Text>
          )}
          {status === 'failed' && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>Wave failed. Try again.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -10 },
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 4,
  },
  targetBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  targetLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1,
  },
  targetName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    letterSpacing: 1,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textAlign: 'center',
  }
});
