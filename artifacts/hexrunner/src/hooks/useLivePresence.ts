import { useEffect, useMemo, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as crypto from 'expo-crypto';
import {
  updateDiscoveryAnchor,
  endDiscoveryAnchor,
  getNearbyPresence,
} from '@workspace/api-client-react';
import {
  LivePresenceController,
  selectGhostTarget,
  type LivePresenceLocation,
  type PresenceMode,
  type PresenceState,
} from '@/src/services/livePresenceController';

export type UseLivePresenceProps = {
  enabled: boolean;
  location: LivePresenceLocation | null;
  mode: PresenceMode;
};

export function useLivePresence({ enabled, location, mode }: UseLivePresenceProps) {
  const [state, setState] = useState<PresenceState>({
    isLoading: false,
    hasSnapshot: false,
    exactRunners: [],
    anonymousRunners: [],
    ambientCount: 0,
    isStale: false,
    isOffline: false,
  });

  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const controller = useMemo(() => {
    return new LivePresenceController(
      {
        updateDiscoveryAnchor,
        endDiscoveryAnchor,
        getNearbyPresence,
        now: () => Date.now(),
        setTimeout: (cb, ms) => setTimeout(cb, ms),
        clearTimeout: (id) => clearTimeout(id),
        createSessionId: () => crypto.randomUUID(),
      },
      setState
    );
  }, []);

  useEffect(() => {
    const isActuallyEnabled = enabled && appState === 'active';
    controller.update(isActuallyEnabled, mode, location);
  }, [controller, enabled, mode, location, appState]);

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  const target = selectGhostTarget(state.exactRunners, location);

  return {
    ...state,
    nearestExactRunner: target?.runner ?? null,
    targetDirection: target?.direction ?? '',
  };
}
