import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';

type Props = {
  latitude: number;
  longitude: number;
  onComplete: () => void;
};

/** A session-only GPS arrival interstitial. It intentionally reports coordinates, never a guessed city. */
export default function GlobeArrival({ latitude, longitude, onComplete }: Props) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(reducedMotion ? 1 : 1.35)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = reducedMotion ? 500 : 2200;
    const animation = Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, { toValue: 1, duration: reducedMotion ? 1 : 1100, useNativeDriver: true }),
        Animated.delay(reducedMotion ? 180 : 600),
        Animated.timing(opacity, { toValue: 0, duration: reducedMotion ? 220 : 500, useNativeDriver: true }),
      ]),
      Animated.timing(spin, {
        toValue: reducedMotion ? 0 : 1,
        duration: reducedMotion ? 1 : 1700,
        useNativeDriver: true,
      }),
    ]);
    const timer = setTimeout(onComplete, duration);
    animation.start();
    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [onComplete, opacity, reducedMotion, scale, spin]);

  return (
    <Animated.View testID="globe-arrival" accessibilityLiveRegion="polite" style={[styles.overlay, { opacity }]}>
      <Animated.View
        style={[
          styles.globeStage,
          {
            transform: [
              { scale },
              {
                rotate: spin.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-8deg', '10deg'],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.globe}>
          <Feather name="globe" size={150} color="rgba(146,232,209,0.55)" />
          <View style={styles.latitudeLine} />
          <View style={styles.longitudeLine} />
          <View style={styles.target}>
            <View style={styles.targetCore} />
          </View>
        </View>
      </Animated.View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>GPS LINK / LOCKED</Text>
        <Text style={styles.title}>ARRIVING AT{'\n'}YOUR GRID.</Text>
        <View style={styles.coordinate}>
          <Feather name="crosshair" size={13} color="#9CF04A" />
          <Text style={styles.coordinateText}>{latitude.toFixed(4)}°, {longitude.toFixed(4)}°</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: '#071015', alignItems: 'center', justifyContent: 'center' },
  globeStage: { width: 228, height: 228, alignItems: 'center', justifyContent: 'center' },
  globe: { width: 184, height: 184, borderRadius: 92, borderWidth: 1, borderColor: 'rgba(146,232,209,0.45)', backgroundColor: '#102A32', shadowColor: '#6CC4B2', shadowOpacity: 0.35, shadowRadius: 28, elevation: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  latitudeLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(146,232,209,0.3)' },
  longitudeLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(146,232,209,0.3)' },
  target: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#9CF04A', backgroundColor: 'rgba(156,240,74,0.12)', alignItems: 'center', justifyContent: 'center' },
  targetCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9CF04A' },
  copy: { position: 'absolute', bottom: 100, alignItems: 'center' },
  eyebrow: { color: '#9CF04A', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.9 },
  title: { marginTop: 9, color: '#F1F4EA', fontFamily: 'Inter_700Bold', fontSize: 31, fontStyle: 'italic', lineHeight: 27, textAlign: 'center' },
  coordinate: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  coordinateText: { color: '#C5D0C8', fontFamily: 'Inter_600SemiBold', fontSize: 12, fontVariant: ['tabular-nums'] },
});