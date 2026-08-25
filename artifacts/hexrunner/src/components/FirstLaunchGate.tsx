import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import React, { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Platform, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import PaintStroke from '@/src/components/PaintStroke';

const KEY = '@hexrunner/paint-school-complete';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const slides = [
  { mark: '01', icon: 'hexagon' as const, kicker: 'YOUR CITY / YOUR MARK', title: 'RUN\nLOUD.', copy: 'HexRunner turns ordinary blocks into a living territory game. Your route is your signature.' },
  { mark: '02', icon: 'edit-3' as const, kicker: 'MOVE TO MAKE A MARK', title: 'PAINT\nTHE GRID.', copy: 'Every verified stretch of your run paints the city map. Defend your cells or take new ground.' },
  { mark: '03', icon: 'shield' as const, kicker: 'THE STREET TALKS BACK', title: 'RUN\nAWARE.', copy: 'Air quality, coarse safety signals, and civic reports help you make sharper calls before you go.' },
];

export default function FirstLaunchGate({ children }: PropsWithChildren) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<(typeof slides)[number]>>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const entrance = useRef(new Animated.Value(0)).current;
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
      offset: target * SCREEN_WIDTH,
      animated: true,
    });
  };
  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => setActive(Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH));
  if (ready) return <>{children}</>;
  return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === 'web' ? 28 : 12), paddingBottom: Math.max(insets.bottom, 20) }]}>
    <View style={styles.header}><Text style={[styles.wordmark, { color: colors.foreground }]}>HEXRUNNER</Text><Pressable onPress={() => void finish()} hitSlop={12}><Text style={[styles.skip, { color: colors.mutedForeground }]}>SKIP</Text></Pressable></View>
    <FlatList ref={list} data={slides} horizontal pagingEnabled getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScrollEnd} keyExtractor={item => item.mark} renderItem={({ item }) => <Animated.View style={[styles.slide, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}><View style={[styles.paintMark, { borderColor: colors.primary, backgroundColor: colors.accent }]}><Text style={[styles.markNo, { color: colors.primary }]}>{item.mark}</Text><Feather name={item.icon} size={54} color={colors.foreground} /></View><Text style={[styles.kicker, { color: colors.primary }]}>{item.kicker}</Text><Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text><View style={styles.strokeWrap}><PaintStroke color={colors.primary} width={130} /></View><Text style={[styles.copy, { color: colors.mutedForeground }]}>{item.copy}</Text><Text style={[styles.sideTag, { color: colors.mutedForeground }]}>{item.mark} / CITY EDITION</Text></Animated.View>} />
    <View style={styles.footer}><View style={styles.dots}>{slides.map((slide, index) => <View key={slide.mark} style={[styles.dot, { backgroundColor: index === active ? colors.primary : colors.border, width: index === active ? 28 : 8 }]} />)}</View><Pressable accessibilityRole="button" onPress={next} style={({ pressed }) => [styles.next, { backgroundColor: colors.primary, opacity: pressed ? .76 : 1 }]}><Text style={[styles.nextText, { color: colors.primaryForeground }]}>{active === 2 ? 'ENTER THE ARENA' : 'NEXT MARK'}</Text><Feather name="arrow-right" size={20} color={colors.primaryForeground} /></Pressable></View>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24 }, wordmark: { fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: 2.2 }, skip: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 },
  slide: { width: SCREEN_WIDTH, flex: 1, justifyContent: 'center', paddingHorizontal: 26 }, paintMark: { width: 134, height: 134, borderWidth: 3, borderRadius: 18, justifyContent: 'center', alignItems: 'center', transform: [{ rotate: '-6deg' }], marginBottom: 38 }, markNo: { position: 'absolute', top: 11, right: 12, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.9, marginBottom: 10 }, title: { fontFamily: 'PermanentMarker_400Regular', fontSize: 47, lineHeight: 49, letterSpacing: -1 }, strokeWrap: { marginVertical: 16, transform: [{ rotate: '-5deg' }] }, copy: { fontFamily: 'Inter_500Medium', fontSize: 16, lineHeight: 24, maxWidth: 310 }, sideTag: { position: 'absolute', right: 28, bottom: 26, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2, transform: [{ rotate: '-90deg' }] },
  footer: { paddingHorizontal: 24, gap: 20 }, dots: { flexDirection: 'row', gap: 7, alignItems: 'center' }, dot: { height: 8, borderRadius: 4 }, next: { minHeight: 58, borderRadius: 4, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }, nextText: { fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 1.1 },
});