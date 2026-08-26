import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from 'react-native-reanimated';

interface Props {
  onComplete: () => void;
}

export default function BrandReveal({ onComplete }: Props) {
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.82)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    let staticTimer: ReturnType<typeof setTimeout> | undefined;
    const useNativeDriver = Platform.OS !== 'web';

    if (reducedMotion) {
      opacity.setValue(1);
      scale.setValue(1);
      glow.setValue(0.35);
      staticTimer = setTimeout(() => {
        if (!active) return;
        setVisible(false);
        onComplete();
      }, 1200);
    } else {
      animation = Animated.parallel([
        Animated.sequence([
          Animated.spring(scale, {
            toValue: 1,
            damping: 11,
            stiffness: 115,
            mass: 0.7,
            useNativeDriver,
          }),
          Animated.delay(850),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 450,
            useNativeDriver,
          }),
        ]),
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: 650,
            useNativeDriver,
          }),
          Animated.timing(glow, {
            toValue: 0.35,
            duration: 850,
            useNativeDriver,
          }),
        ]),
      ]);

      animation.start(({ finished }) => {
        if (!finished || !active) return;
        setVisible(false);
        onComplete();
      });
    }

    return () => {
      active = false;
      if (staticTimer) clearTimeout(staticTimer);
      animation?.stop();
    };
  }, [glow, onComplete, opacity, reducedMotion, scale]);

  if (!visible) return null;

  return (
    <Modal
      animationType="none"
      onRequestClose={() => undefined}
      presentationStyle="fullScreen"
      statusBarTranslucent
      transparent={false}
      visible
    >
      <Animated.View testID="brand-reveal" style={[styles.container, { opacity }]}>
        <LinearGradient
          colors={['#174450', '#081013', '#11170F']}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.grid} />
        <View style={styles.markStage}>
          <Animated.View
            style={[
              styles.glow,
              {
                opacity: glow,
                transform: [
                  {
                    scale: glow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.72, 1.18],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View style={{ transform: [{ scale }] }}>
            <Image
              source={require('../../../assets/images/hexrunner-mark-v2.png')}
              style={styles.logo}
              contentFit="contain"
              cachePolicy="memory"
            />
          </Animated.View>
        </View>
        <Text style={styles.wordmark}>HEXRUNNER</Text>
        <Text style={styles.tagline}>NIGHT MODE / READY</Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#081013',
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.2,
    borderWidth: 1,
    borderColor: '#92E8D1',
  },
  markStage: {
    width: 188,
    height: 188,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 2,
    borderColor: '#9CF04A',
    backgroundColor: 'rgba(156, 240, 74, 0.09)',
  },
  logo: {
    width: 132,
    height: 132,
  },
  wordmark: {
    marginTop: 20,
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 29,
    fontStyle: 'italic',
    letterSpacing: 1.6,
  },
  tagline: {
    marginTop: 8,
    color: '#9CF04A',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 4.2,
  },
});