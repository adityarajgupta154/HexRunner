import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import React, { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import PaintStroke from '@/src/components/PaintStroke';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';

const KEY = '@hexrunner/paint-school-complete';
const posterAsset01 = require('../../assets/images/onboarding-poster.png');
const posterAsset02 = require('../../assets/images/onboarding-poster-02.png');

const slides = [
  { mark: '01', icon: 'hexagon' as const, kicker: 'YOUR CITY / YOUR MARK', title: 'RUN\nLOUD.', copy: 'HexRunner turns ordinary blocks into a living territory game. Your route is your signature.' },
  { mark: '02', icon: 'edit-3' as const, kicker: 'MOVE TO MAKE A MARK', title: 'PAINT\nTHE GRID.', copy: 'Every verified stretch of your run paints the city map. Defend your cells or take new ground.' },
  { mark: '03', icon: 'shield' as const, kicker: 'THE STREET TALKS BACK', title: 'RUN\nAWARE.', copy: 'Air quality, coarse safety signals, and civic reports help you make sharper calls before you go.' },
];

export default function FirstLaunchGate({ children }: PropsWithChildren) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const nativeWindow = useWindowDimensions();
  const [measuredViewport, setMeasuredViewport] = useState<{ width: number; height: number } | null>(null);
  const screenWidth = Platform.OS === 'web'
    ? measuredViewport?.width ?? 1
    : nativeWindow.width;
  const screenHeight = Platform.OS === 'web'
    ? measuredViewport?.height ?? 1
    : nativeWindow.height;
  const list = useRef<FlatList<(typeof slides)[number]>>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);

  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const measureRoot = () => {
      const root = document.getElementById('root');
      const rect = root?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      setMeasuredViewport(current =>
        current?.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height }
      );
    };
    measureRoot();
    window.addEventListener('resize', measureRoot);
    return () => window.removeEventListener('resize', measureRoot);
  }, []);

  useEffect(() => { void AsyncStorage.getItem(KEY).then(value => setReady(value === 'yes')); }, []);
  useEffect(() => { Animated.timing(entrance, { toValue: 1, duration: 420, useNativeDriver: true }).start(); }, [entrance]);

  const finish = async () => { await AsyncStorage.setItem(KEY, 'yes'); setReady(true); };

  const next = () => {
    if (active === slides.length - 1) {
      void finish();
      return;
    }
    const target = active + 1;
    setActive(target);
    list.current?.scrollToOffset({
      offset: target * screenWidth,
      animated: Platform.OS !== 'web',
    });
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => setActive(Math.round(event.nativeEvent.contentOffset.x / screenWidth));
  const onLayout = (event: LayoutChangeEvent) => {
    if (Platform.OS === 'web') return;
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setMeasuredViewport(current =>
      current?.width === width && current.height === height ? current : { width, height }
    );
  };

  if (ready) return <>{children}</>;

  return (
    <View
      testID="onboarding-root"
      onLayout={onLayout}
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          opacity: measuredViewport ? 1 : 0,
        },
      ]}
    >
      <StatusBar hidden />

      <FlatList
        ref={list}
        data={slides}
        horizontal
        pagingEnabled
        getItemLayout={(_, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        keyExtractor={item => item.mark}
        renderItem={({ item, index }) => {
          if (index === 0 || index === 1) {
            const isFirstPoster = index === 0;
            return (
              <View
                testID={isFirstPoster ? 'poster-slide' : 'poster-slide-02'}
                style={{ width: screenWidth, height: screenHeight, position: 'relative', overflow: 'hidden' }}
              >
                <Image
                  source={isFirstPoster ? posterAsset01 : posterAsset02}
                  style={[StyleSheet.absoluteFillObject, { width: screenWidth, height: screenHeight }]}
                  contentFit="fill"
                  transition={0}
                  accessibilityIgnoresInvertColors
                />
                <Pressable
                  testID={isFirstPoster ? 'poster-skip' : 'poster-skip-02'}
                  onPress={() => void finish()}
                  style={{ position: 'absolute', top: Math.max(insets.top, 20), right: 0, width: 120, height: 80 }}
                  accessibilityRole="button"
                  accessibilityLabel="Skip onboarding"
                />
                <Pressable
                  testID={isFirstPoster ? 'poster-next-mark' : 'poster-next-mark-02'}
                  onPress={next}
                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.max(insets.bottom + 80, 100) }}
                  accessibilityRole="button"
                  accessibilityLabel="Go to next onboarding screen"
                />
              </View>
            );
          }

          return (
            <Animated.View
              testID={`onboarding-slide-${item.mark}`}
              style={[
                styles.slide,
                {
                  width: screenWidth,
                  height: screenHeight,
                  backgroundColor: colors.background,
                  opacity: entrance,
                  transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
                },
              ]}
            >
              <View style={[styles.paintMark, { borderColor: colors.primary, backgroundColor: colors.accent }]}>
                <Text style={[styles.markNo, { color: colors.primary }]}>{item.mark}</Text>
                <Feather name={item.icon} size={54} color={colors.foreground} />
              </View>
              <Text style={[styles.kicker, { color: colors.primary }]}>{item.kicker}</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
              <View style={styles.strokeWrap}>
                <PaintStroke color={colors.primary} width={130} />
              </View>
              <Text style={[styles.copy, { color: colors.mutedForeground }]}>{item.copy}</Text>
              <Text style={[styles.sideTag, { color: colors.mutedForeground }]}>{item.mark} / CITY EDITION</Text>
            </Animated.View>
          );
        }}
      />

      {active === 2 ? (
        <>
          <View style={[styles.headerOverlay, { paddingTop: insets.top + (Platform.OS === 'web' ? 28 : 12) }]}>
            <Text style={[styles.wordmark, { color: colors.foreground }]}>HEXRUNNER</Text>
            <Pressable onPress={() => void finish()} hitSlop={12}>
              <Text style={[styles.skip, { color: colors.mutedForeground }]}>SKIP</Text>
            </Pressable>
          </View>

          <View style={[styles.footerOverlay, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.dots}>
              {slides.map((slide, index) => (
                <View key={slide.mark} style={[styles.dot, { backgroundColor: index === active ? colors.primary : colors.border, width: index === active ? 28 : 8 }]} />
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={next} style={({ pressed }) => [styles.next, { backgroundColor: colors.primary, opacity: pressed ? .76 : 1 }]}>
              <Text style={[styles.nextText, { color: colors.primaryForeground }]}>{active === 2 ? 'ENTER THE ARENA' : 'NEXT MARK'}</Text>
              <Feather name="arrow-right" size={20} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', height: '100%', overflow: 'hidden' },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, zIndex: 10 },
  footerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, gap: 20, zIndex: 10 },
  wordmark: { fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: 2.2 },
  skip: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 },
  slide: { justifyContent: 'center', paddingHorizontal: 26, paddingBottom: 60 },
  paintMark: { width: 134, height: 134, borderWidth: 3, borderRadius: 18, justifyContent: 'center', alignItems: 'center', transform: [{ rotate: '-6deg' }], marginBottom: 38 },
  markNo: { position: 'absolute', top: 11, right: 12, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.9, marginBottom: 10 },
  title: { fontFamily: 'PermanentMarker_400Regular', fontSize: 47, lineHeight: 49, letterSpacing: -1 },
  strokeWrap: { marginVertical: 16, transform: [{ rotate: '-5deg' }] },
  copy: { fontFamily: 'Inter_500Medium', fontSize: 16, lineHeight: 24, maxWidth: 310 },
  sideTag: { position: 'absolute', right: 28, bottom: 26, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2, transform: [{ rotate: '-90deg' }] },
  dots: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  next: { minHeight: 58, borderRadius: 4, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  nextText: { fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 1.1 },
});
