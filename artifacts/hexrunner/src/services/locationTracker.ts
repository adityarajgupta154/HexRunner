import * as Location from 'expo-location';

export type LocationUpdateHandler = (location: Location.LocationObject) => void;

let activeSubscription: Location.LocationSubscription | null = null;
let watcherGeneration = 0;

/**
 * Requests foreground permission and starts one high-accuracy location watcher.
 * Calling this again replaces any existing watcher.
 */
export async function startWatching(
  onUpdate: LocationUpdateHandler,
): Promise<void> {
  stopWatching();
  const generation = watcherGeneration;

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
  activeSubscription?.remove();
  activeSubscription = null;
}