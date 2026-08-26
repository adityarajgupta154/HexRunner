import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type Props = {
  latitude: number;
  longitude: number;
  onZoomStart: () => void;
  onComplete: () => void;
};

const earthSource = require('../../assets/images/earth-night-v1.png');

const stars = [
  [8, 14, 2], [21, 8, 1], [36, 17, 1], [51, 7, 2], [68, 15, 1],
  [87, 9, 1], [95, 26, 2], [5, 34, 1], [17, 45, 2], [82, 39, 1],
  [92, 54, 1], [11, 62, 1], [25, 75, 1], [76, 70, 2], [89, 82, 1],
  [57, 86, 1], [39, 92, 2], [7, 88, 1], [71, 29, 1], [30, 31, 1],
] as const;

/** A cinematic GPS arrival that hands off from orbital Earth to the live map. */
export default function GlobeArrival({
  latitude,
  longitude,
  onZoomStart,
  onComplete,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const sceneOpacity = useRef(new Animated.Value(1)).current;
  const globeScale = useRef(new Animated.Value(reducedMotion ? 1 : 0.76)).current;
  const globeTranslateY = useRef(new Animated.Value(reducedMotion ? 0 : 22)).current;
  const globeRotate = useRef(new Animated.Value(0)).current;
  const haloOpacity = useRef(new Animated.Value(0.25)).current;
  const targetScale = useRef(new Animated.Value(0)).current;
  const copyOpacity = useRef(new Animated.Value(0)).current;
  const descentProgress = useRef(new Animated.Value(0)).current;
  const onZoomStartRef = useRef(onZoomStart);
  const onCompleteRef = useRef(onComplete);

  const formattedCoordinate = useMemo(
    () => `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`,
    [latitude, longitude],
  );

  useEffect(() => {
    onZoomStartRef.current = onZoomStart;
    onCompleteRef.current = onComplete;
  }, [onComplete, onZoomStart]);

  useEffect(() => {
    if (reducedMotion) {
      const zoomTimer = setTimeout(() => onZoomStartRef.current(), 120);
      const completeTimer = setTimeout(() => onCompleteRef.current(), 420);
      Animated.parallel([
        Animated.timing(targetScale, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(copyOpacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(sceneOpacity, {
          toValue: 0,
          delay: 180,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      return () => {
        clearTimeout(zoomTimer);
        clearTimeout(completeTimer);
      };
    }

    const zoomTimer = setTimeout(() => onZoomStartRef.current(), 1350);
    const completeTimer = setTimeout(() => onCompleteRef.current(), 2850);

    const animation = Animated.parallel([
      Animated.sequence([
        Animated.parallel([
          Animated.timing(globeScale, {
            toValue: 1,
            duration: 720,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(globeTranslateY, {
            toValue: 0,
            duration: 720,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(copyOpacity, {
            toValue: 1,
            duration: 520,
            delay: 260,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(480),
        Animated.parallel([
          Animated.timing(globeScale, {
            toValue: 5.4,
            duration: 1180,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(globeTranslateY, {
            toValue: 78,
            duration: 1180,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(copyOpacity, {
            toValue: 0,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(descentProgress, {
            toValue: 1,
            duration: 1180,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: false,
          }),
        ]),
        Animated.timing(sceneOpacity, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(globeRotate, {
        toValue: 1,
        duration: 2500,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(targetScale, {
          toValue: 1,
          duration: 420,
          delay: 760,
          easing: Easing.out(Easing.back(1.8)),
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(targetScale, {
              toValue: 1.28,
              duration: 420,
              useNativeDriver: true,
            }),
            Animated.timing(targetScale, {
              toValue: 1,
              duration: 420,
              useNativeDriver: true,
            }),
          ]),
          { iterations: 2 },
        ),
      ]),
      Animated.loop(
        Animated.sequence([
          Animated.timing(haloOpacity, {
            toValue: 0.64,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(haloOpacity, {
            toValue: 0.25,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        { iterations: 2 },
      ),
    ]);

    animation.start();
    return () => {
      clearTimeout(zoomTimer);
      clearTimeout(completeTimer);
      animation.stop();
    };
  }, [
    copyOpacity,
    descentProgress,
    globeRotate,
    globeScale,
    globeTranslateY,
    haloOpacity,
    reducedMotion,
    sceneOpacity,
    targetScale,
  ]);

  const rotation = globeRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-7deg', '7deg'],
  });
  const progressWidth = descentProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['18%', '100%'],
  });

  return (
    <Animated.View
      testID="globe-arrival"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`GPS locked at ${formattedCoordinate}. Arriving at your location.`}
      style={[
        styles.overlay,
        { opacity: sceneOpacity, backgroundColor: colors.background },
      ]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {stars.map(([left, top, size], index) => (
          <View
            key={`${left}-${top}-${index}`}
            style={[
              styles.star,
              {
                left: `${left}%`,
                top: `${top}%`,
                width: size,
                height: size,
                borderRadius: size,
                backgroundColor: colors.mutedForeground,
                opacity: size === 2 ? 0.55 : 0.28,
              },
            ]}
          />
        ))}
      </View>

      <View style={[styles.orbitHeader, { top: insets.top + 24 }]}>
        <View style={styles.orbitLabel}>
          <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.orbitText, { color: colors.mutedForeground }]}>
            ORBITAL LOCATION LINK
          </Text>
        </View>
        <Text style={[styles.orbitIndex, { color: colors.primary }]}>GPS / 01</Text>
      </View>

      <Animated.View
        style={[
          styles.globeStage,
          {
            transform: [
              { translateY: globeTranslateY },
              { scale: globeScale },
              { rotate: rotation },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.outerHalo,
            {
              opacity: haloOpacity,
              borderColor: colors.accent,
              shadowColor: colors.accent,
            },
          ]}
        />
        <View
          style={[
            styles.innerHalo,
            {
              borderColor: colors.border,
              shadowColor: colors.accent,
            },
          ]}
        />
        <Image
          source={earthSource}
          style={styles.earth}
          contentFit="contain"
          transition={0}
          accessibilityIgnoresInvertColors
        />
        <Animated.View
          style={[
            styles.target,
            {
              borderColor: colors.primary,
              backgroundColor: colors.background,
              transform: [{ scale: targetScale }],
            },
          ]}
        >
          <View style={[styles.targetRing, { borderColor: colors.primary }]}>
            <View style={[styles.targetCore, { backgroundColor: colors.primary }]} />
          </View>
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          styles.copy,
          {
            bottom: Math.max(insets.bottom, 18) + 102,
            opacity: copyOpacity,
          },
        ]}
      >
        <View
          style={[
            styles.lockBadge,
            { borderColor: colors.primary, backgroundColor: colors.card },
          ]}
        >
          <Feather name="crosshair" size={13} color={colors.primary} />
          <Text style={[styles.lockText, { color: colors.primary }]}>
            GPS LOCKED
          </Text>
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          DESCENDING TO{'\n'}YOUR GRID.
        </Text>
        <Text style={[styles.coordinateText, { color: colors.mutedForeground }]}>
          {formattedCoordinate}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <Animated.View
            style={[
              styles.progressValue,
              { width: progressWidth, backgroundColor: colors.primary },
            ]}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  star: {
    position: 'absolute',
  },
  orbitHeader: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orbitLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  orbitText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 1.4,
  },
  orbitIndex: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 10,
    letterSpacing: 1.1,
  },
  globeStage: {
    width: 336,
    height: 336,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earth: {
    width: 310,
    height: 310,
  },
  outerHalo: {
    position: 'absolute',
    width: 330,
    height: 330,
    borderRadius: 165,
    borderWidth: 1,
    shadowOpacity: 0.7,
    shadowRadius: 36,
    elevation: 10,
  },
  innerHalo: {
    position: 'absolute',
    width: 314,
    height: 314,
    borderRadius: 157,
    borderWidth: 1,
    shadowOpacity: 0.4,
    shadowRadius: 18,
  },
  target: {
    position: 'absolute',
    right: 79,
    top: 90,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.65,
    shadowRadius: 12,
    elevation: 8,
  },
  targetRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  copy: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  lockBadge: {
    minHeight: 28,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  lockText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 9,
    letterSpacing: 1.4,
  },
  title: {
    marginTop: 13,
    fontFamily: 'Inter_900Black',
    fontSize: 31,
    fontStyle: 'italic',
    lineHeight: 29,
    letterSpacing: -1,
    textAlign: 'center',
  },
  coordinateText: {
    marginTop: 9,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    width: 180,
    height: 2,
    marginTop: 15,
    overflow: 'hidden',
  },
  progressValue: {
    height: 2,
  },
});