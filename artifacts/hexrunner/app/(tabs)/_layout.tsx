import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

// IMPORTANT: iOS 26 uses NativeTabs for native tabs with liquid glass support.
// NativeTabs intentionally does NOT use custom design tokens — liquid glass
// is a system-level appearance provided by iOS and cannot be overridden.
// Custom brand colors are applied only on the ClassicTabLayout path (older iOS / Android / web).
type ClassicTabIconProps = {
  color: string;
  sfName: string;
  featherName: keyof typeof Feather.glyphMap;
};

function ClassicTabIcon({ color, sfName, featherName }: ClassicTabIconProps) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={sfName as never} tintColor={color} size={24} />;
  }
  return <Feather name={featherName} size={22} color={color} />;
}

function ClassicTabLayout() {
  const colors = useColors();
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 10,
          letterSpacing: 0.7,
        },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: '#091216',
          borderTopWidth: 1,
          borderTopColor: 'rgba(184,211,199,0.16)',
          elevation: 0,
          height: isWeb ? 84 : 74,
          paddingTop: 7,
        },
        tabBarBackground: () =>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#091216' }]} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'MAP',
          tabBarIcon: ({ color }) => (
            <ClassicTabIcon
              color={color}
              sfName="hexagon"
              featherName="hexagon"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="run"
        options={{
          title: 'RUN',
          tabBarIcon: ({ color }) => (
            <ClassicTabIcon
              color={color}
              sfName="figure.run"
              featherName="activity"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'RANK',
          tabBarIcon: ({ color }) => (
            <ClassicTabIcon color={color} sfName="trophy" featherName="award" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'YOU',
          tabBarIcon: ({ color }) => (
            <ClassicTabIcon
              color={color}
              sfName="person.crop.circle"
              featherName="user"
            />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return <ClassicTabLayout />;
}
