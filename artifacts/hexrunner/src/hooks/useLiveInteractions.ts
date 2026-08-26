import { useState, useEffect, useMemo } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getLiveInteractions, acknowledgeLiveInteractions } from '@workspace/api-client-react';
import { LiveInteractionsController, type InteractionsState } from '../services/liveInteractionsController';

export function useLiveInteractions(enabled: boolean, hasSnapshot: boolean) {
  const [state, setState] = useState<InteractionsState>({ events: [], isOffline: false });
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => setAppState(next));
    return () => subscription.remove();
  }, []);

  const controller = useMemo(() => {
    return new LiveInteractionsController({
      getLiveInteractions,
      acknowledgeLiveInteractions,
      now: () => Date.now(),
      setTimeout: (cb, ms) => setTimeout(cb, ms),
      clearTimeout: (id) => clearTimeout(id),
    }, setState);
  }, []);

  useEffect(() => {
    const isActuallyEnabled = enabled && appState === 'active';
    controller.update(isActuallyEnabled, hasSnapshot);
  }, [controller, enabled, hasSnapshot, appState]);

  useEffect(() => {
    return () => controller.dispose();
  }, [controller]);

  return {
    ...state,
    dismiss: (id: string) => controller.dismiss(id)
  };
}
