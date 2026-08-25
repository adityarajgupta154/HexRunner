import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type LocationUpdateHandler = (location: Location.LocationObject) => void;

let activeSubscription: Location.LocationSubscription | null = null;
let activeWebWatchId: number | null = null;
let watcherGeneration = 0;

function browserPositionToLocation(
  position: GeolocationPosition,
): Location.LocationObject {
  return {
    timestamp: position.timestamp,
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: position.coords.altitude,
      accuracy: position.coords.accuracy,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
    },
  };
}

async function startWebWatcher(
  onUpdate: LocationUpdateHandler,
  generation: number,
): Promise<void> {
  if (!navigator.geolocation) {
    throw new Error('Browser location services are unavailable.');
  }

  const initialPosition = await new Promise<GeolocationPosition>(
    (resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      });
    },
  );

  if (generation !== watcherGeneration) return;

  onUpdate(browserPositionToLocation(initialPosition));
  activeWebWatchId = navigator.geolocation.watchPosition(
    (position) => onUpdate(browserPositionToLocation(position)),
    (error) => {
      console.warn('[HexRunner] Browser location update failed:', error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3_000,
      timeout: 15_000,
    },
  );
}

/**
 * Requests foreground permission and starts one high-accuracy location watcher.
 * Calling this again replaces any existing watcher.
 */
export async function startWatching(
  onUpdate: LocationUpdateHandler,
): Promise<void> {
  stopWatching();
  const generation = watcherGeneration;

  // Expo Location's web subscription cleanup currently calls a missing native
  // emitter method. Use the browser API in previews while retaining Expo
  // Location for the actual iOS/Android app.
  if (Platform.OS === 'web') {
    await startWebWatcher(onUpdate, generation);
    return;
  }

  const permission = await Location.requestForegroundPermissionsAsync();

  if (!permission.granted) {
    throw new Error('Foreground location permission was not granted.');
  }

  // The screen may have unmounted while the permission prompt was visible.
  if (generation !== watcherGeneration) return;

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Highest,
      timeInterval: 3_000,
      distanceInterval: 10,
    },
    onUpdate,
  );

  // Avoid leaving a watcher alive if stopWatching ran while setup was pending.
  if (generation !== watcherGeneration) {
    subscription.remove();
    return;
  }

  activeSubscription = subscription;
}

/** Stops and clears the active foreground location watcher. */
export function stopWatching(): void {
  watcherGeneration += 1;

  if (activeWebWatchId !== null && typeof navigator !== 'undefined') {
    navigator.geolocation.clearWatch(activeWebWatchId);
    activeWebWatchId = null;
  }

  activeSubscription?.remove();
  activeSubscription = null;
}