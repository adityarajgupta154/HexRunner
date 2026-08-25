import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';

const KEY = '@hexrunner/paint-school-complete';
const posterAsset01 = require('../../assets/images/onboarding-poster.png');
const posterAsset02 = require('../../assets/images/onboarding-poster-02.png');
const posterAsset03 = require('../../assets/images/onboarding-poster-03.png');

const slides = [
  { mark: '01', asset: posterAsset01 },
  { mark: '02', asset: posterAsset02 },
  { mark: '03', asset: posterAsset03 },
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
          const suffix = index === 0 ? '' : `-0${index + 1}`;
          const isFinalPoster = index === slides.length - 1;
          return (
            <View
              testID={`poster-slide${suffix}`}
              style={{ width: screenWidth, height: screenHeight, position: 'relative', overflow: 'hidden' }}
            >
              <Image
                source={item.asset}
                style={[StyleSheet.absoluteFillObject, { width: screenWidth, height: screenHeight }]}
                contentFit="fill"
                transition={0}
                accessibilityIgnoresInvertColors
              />
              <Pressable
                testID={`poster-skip${suffix}`}
                onPress={() => void finish()}
                style={{ position: 'absolute', top: Math.max(insets.top, 20), right: 0, width: 120, height: 80 }}
                accessibilityRole="button"
                accessibilityLabel="Skip onboarding"
              />
              <Pressable
                testID={isFinalPoster ? 'poster-enter-arena-03' : `poster-next-mark${suffix}`}
                onPress={isFinalPoster ? () => void finish() : next}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.max(insets.bottom + 80, 100) }}
                accessibilityRole="button"
                accessibilityLabel={isFinalPoster ? 'Enter the HexRunner arena' : 'Go to next onboarding screen'}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', height: '100%', overflow: 'hidden' },
});
