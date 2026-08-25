import {
  saveRun,
  setBaseUrl,
  type SaveRunRequest,
  type SaveRunResult,
} from '@workspace/api-client-react';
import AsyncStorage from '@react-native-async-storage/async-storage';

let pendingRun: SaveRunRequest | null = null;
const saveRequests = new Map<string, Promise<SaveRunResult>>();
const PENDING_RUN_KEY = '@hexrunner/pending-run';

function apiOrigin(): string | null {
  const configuredDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();

  if (configuredDomain) {
    return /^https?:\/\//i.test(configuredDomain)
      ? configuredDomain
      : `https://${configuredDomain}`;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return null;
}

const baseUrl = apiOrigin();
if (baseUrl) {
  setBaseUrl(baseUrl);
}

export type PendingRun = SaveRunRequest;

export function createClientRunId(): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 14);
  return `run_${time}_${random}`;
}

export async function queueRunForSave(run: PendingRun): Promise<void> {
  pendingRun = run;
  await AsyncStorage.setItem(PENDING_RUN_KEY, JSON.stringify(run));
}

export async function getPendingRun(): Promise<PendingRun | null> {
  if (pendingRun) {
    return pendingRun;
  }

  const stored = await AsyncStorage.getItem(PENDING_RUN_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<PendingRun>;
    if (!parsed.clientRunId) return null;
    pendingRun = parsed as PendingRun;
    return pendingRun;
  } catch {
    await AsyncStorage.removeItem(PENDING_RUN_KEY);
    return null;
  }
}

async function loadPendingRun(clientRunId: string): Promise<PendingRun | null> {
  const run = await getPendingRun();
  return run?.clientRunId === clientRunId ? run : null;
}

export async function clearPendingRun(clientRunId: string): Promise<void> {
  const storedRun = await loadPendingRun(clientRunId);

  if (storedRun) {
    pendingRun = null;
    await AsyncStorage.removeItem(PENDING_RUN_KEY);
  }
  saveRequests.delete(clientRunId);
}

export async function savePendingRun(
  clientRunId: string,
): Promise<SaveRunResult> {
  if (!baseUrl) {
    throw new Error('The Replit API address is unavailable.');
  }

  const run = await loadPendingRun(clientRunId);
  if (!run) {
    throw new Error('This run is no longer available to save.');
  }

  const existingRequest = saveRequests.get(clientRunId);
  if (existingRequest) return existingRequest;

  const request = saveRun(run).finally(() => {
    saveRequests.delete(clientRunId);
  });
  saveRequests.set(clientRunId, request);
  return request;
}