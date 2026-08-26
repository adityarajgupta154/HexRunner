import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const TOUR_KEY = '@hexrunner/coach-tour-completed';

export function CoachTour() {
  const colors = useColors();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TOUR_KEY).then(val => {
      if (val !== 'yes') setVisible(true);
    });
  }, []);

  const complete = () => {
    setVisible(false);
    AsyncStorage.setItem(TOUR_KEY, 'yes');
  };

  const next = () => {
    if (step >= 5) complete();
    else setStep(s => s + 1);
  };

  if (!visible) return null;

  const getStepConfig = () => {
    switch(step) {
      case 0: return { title: 'Welcome to your playground', desc: 'Every street, block and loop is up for grabs. Move through the real world to claim territory and grow your control of the map.', top: '40%', left: 24, right: 24, arrow: null };
      case 1: return { title: 'Run mode', desc: 'HexRunner currently validates running and walking routes so every claim follows one fair speed model.', top: 120, right: 16, width: 280, arrow: 'top-right' };
      case 2: return { title: 'Plan your route', desc: 'Switch to Target, pan across the grid, and scout a loop before you move.', bottom: 240, left: 16, width: 240, arrow: 'bottom-left' };
      case 3: return { title: 'Climb the leaderboard', desc: 'Use the leaderboard tab to compare your city, rivals, and global rank.', bottom: 240, left: 60, right: 60, arrow: 'bottom-center' };
      case 4: return { title: 'Open territory stats', desc: 'Tap your territory total to review your profile and current control.', top: 120, left: 16, width: 260, arrow: 'top-left' };
      case 5: return { title: 'Start moving', desc: 'Jump straight in and start your run.', bottom: 200, right: 16, width: 220, arrow: 'bottom-right' };
      default: return null;
    }
  };

  const config = getStepConfig();
  if (!config) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} pointerEvents="none" />
      <View
        testID={`home-coach-step-${step + 1}`}
        accessibilityViewIsModal
        accessibilityLabel={`${config.title}. ${config.desc}`}
        style={[
          styles.popover,
          {
            top: config.top as any,
            bottom: config.bottom,
            left: config.left,
            right: config.right,
            width: config.width,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Arrow (mock) */}
        {config.arrow === 'top-right' && <View style={[styles.arrow, { top: -8, right: 24 }]} />}
        {config.arrow === 'top-left' && <View style={[styles.arrow, { top: -8, left: 24 }]} />}
        {config.arrow === 'bottom-left' && <View style={[styles.arrow, { bottom: -8, left: 24 }]} />}
        {config.arrow === 'bottom-center' && <View style={[styles.arrow, { bottom: -8, alignSelf: 'center' }]} />}
        {config.arrow === 'bottom-right' && <View style={[styles.arrow, { bottom: -8, right: 24 }]} />}

        <View style={styles.header}>
           <Text style={styles.title}>{config.title}</Text>
           <Pressable accessibilityLabel="Close coach tour" onPress={complete} hitSlop={10}>
             <Feather name="x" size={18} color={colors.mutedForeground} />
           </Pressable>
        </View>
        <Text style={styles.desc}>{config.desc}</Text>
        <View style={styles.footer}>
           <Text style={styles.counter}>{step + 1} of 6</Text>
            <Pressable
              accessibilityLabel={step === 5 ? 'Finish coach tour' : 'Next coach tip'}
              style={[styles.next, { backgroundColor: colors.muted }]}
              onPress={next}
            >
             <Text style={styles.nextText}>{step === 5 ? 'Done' : 'Next'}</Text>
           </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  popover: {
    position: 'absolute',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  arrow: {
    position: 'absolute',
    width: 16, height: 16,
    backgroundColor: '#161920',
    transform: [{ rotate: '45deg' }],
    borderTopWidth: 1, borderLeftWidth: 1,
    borderColor: '#303440',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#FFF',
  },
  desc: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#90949F',
    lineHeight: 18,
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#90949F',
  },
  next: {
    backgroundColor: '#303440',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  nextText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#FFF',
  }
});
