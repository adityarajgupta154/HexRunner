import type { SaveRunResult } from '@workspace/api-client-react';

export type RunSummarySaveStatus = 'saving' | 'saved' | 'failed';

export type RunSummarySaveObserver = {
  onSaving: () => void;
  onSaved: (result: SaveRunResult) => void;
  onFailed: (message: string) => void;
};

export function isRunSummaryDoneDisabled(
  saveStatus: RunSummarySaveStatus,
): boolean {
  return saveStatus !== 'saved';
}

export function isRunSummaryRetryVisible(
  saveStatus: RunSummarySaveStatus,
): boolean {
  return saveStatus === 'failed';
}

export async function runSummarySaveAttempt({
  clientRunId,
  savePendingRun,
  observer,
  afterSaved,
}: {
  clientRunId: string;
  savePendingRun: (clientRunId: string) => Promise<SaveRunResult>;
  observer: RunSummarySaveObserver;
  afterSaved?: (result: SaveRunResult) => Promise<void>;
}): Promise<void> {
  observer.onSaving();

  try {
    const result = await savePendingRun(clientRunId);
    observer.onSaved(result);
    if (afterSaved) {
      try {
        await afterSaved(result);
      } catch {
        // A secondary delivery must not turn a successfully saved run into failure.
      }
    }
  } catch (error: unknown) {
    observer.onFailed(
      error instanceof Error ? error.message : 'Unable to save this run.',
    );
  }
}