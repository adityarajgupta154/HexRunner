import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import PlaceholderScreen from '@/src/components/PlaceholderScreen';
import {
  startWatching,
  stopWatching,
} from '@/src/services/locationTracker';

export default function HomeScreen() {
  useEffect(() => {
    // expo-location is used on the physical phone; the web preview remains a
    // visual fallback and does not attempt to start a native GPS watcher.
    if (Platform.OS === 'web') return;

    startWatching((location) => {
      console.log('[HexRunner] Location update', {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    }).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unable to start location.';
      console.warn('[HexRunner] Location watcher unavailable:', message);
    });

    return stopWatching;
  }, []);

  return (
    <PlaceholderScreen
      title="Home"
      subtitle="Your live hex map will render here (Phases 2-3)."
      icon="hexagon"
    />
  );
}
