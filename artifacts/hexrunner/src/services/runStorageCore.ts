import type {
  SaveRunRequest,
  SaveRunResult,
} from '@workspace/api-client-react';

export type PendingRun = SaveRunRequest;

export type RunStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export type RunStorageDependencies = {
  storage: RunStorageAdapter;
  saveRunRequest: (run: SaveRunRequest) => Promise<SaveRunResult>;
};

export const PENDING_RUN_KEY = '@hexrunner/pending-run';

export function createRunStorage({
  storage,
  saveRunRequest,
}: RunStorageDependencies) {
  let pendingRun: PendingRun | null = null;
  const saveRequests = new Map<string, Promise<SaveRunResult>>();

  async function queueRunForSave(run: PendingRun): Promise<void> {
    pendingRun = run;
    await storage.setItem(PENDING_RUN_KEY, JSON.stringify(run));
  }

  async function getPendingRun(): Promise<PendingRun | null> {
    if (pendingRun) {
      return pendingRun;
    }

    const stored = await storage.getItem(PENDING_RUN_KEY);
    if (!stored) return null;

    try {
      const parsed = JSON.parse(stored) as Partial<PendingRun>;
      if (!parsed.clientRunId) return null;
      pendingRun = parsed as PendingRun;
      return pendingRun;
    } catch {
      await storage.removeItem(PENDING_RUN_KEY);
      return null;
    }
  }

  async function loadPendingRun(
    clientRunId: string,
  ): Promise<PendingRun | null> {
    const run = await getPendingRun();
    return run?.clientRunId === clientRunId ? run : null;
  }

  async function clearPendingRun(clientRunId: string): Promise<void> {
    const storedRun = await loadPendingRun(clientRunId);

    if (storedRun) {
      pendingRun = null;
      await storage.removeItem(PENDING_RUN_KEY);
    }
    saveRequests.delete(clientRunId);
  }

  async function savePendingRun(
    clientRunId: string,
  ): Promise<SaveRunResult> {
    const run = await loadPendingRun(clientRunId);
    if (!run) {
      throw new Error('This run is no longer available to save.');
    }

    const existingRequest = saveRequests.get(clientRunId);
    if (existingRequest) return existingRequest;

    const request = saveRunRequest(run).finally(() => {
      saveRequests.delete(clientRunId);
    });
    saveRequests.set(clientRunId, request);
    return request;
  }

  return {
    queueRunForSave,
    getPendingRun,
    clearPendingRun,
    savePendingRun,
  };
}