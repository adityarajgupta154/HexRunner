export type ResumeRunDependencies = {
  restartGps: () => Promise<void>;
  isRunCurrent: () => boolean;
  stopGps: () => void;
  commitResume: () => void;
  resumePresence: () => void;
};

export function activeElapsedSeconds({
  startedAt,
  now,
  completedPausedMs,
  pauseStartedAt,
}: {
  startedAt: number;
  now: number;
  completedPausedMs: number;
  pauseStartedAt: number | null;
}): number {
  const currentPausedMs =
    pauseStartedAt === null ? 0 : Math.max(0, now - pauseStartedAt);
  return Math.max(
    0,
    Math.floor(
      (now - startedAt - completedPausedMs - currentPausedMs) / 1_000,
    ),
  );
}

export function completedPauseDurationMs(
  pauseStartedAt: number | null,
  resumedAt: number,
): number {
  return pauseStartedAt === null
    ? 0
    : Math.max(0, resumedAt - pauseStartedAt);
}

export function shouldResumePresenceOnForeground({
  isRunning,
  isPaused,
}: {
  isRunning: boolean;
  isPaused: boolean;
}): boolean {
  return isRunning && !isPaused;
}

/**
 * Restarts GPS before making the run live again. A run can end or unmount while
 * a native permission prompt is open, so current-run authority is checked only
 * after the watcher has started.
 */
export async function resumeRunAfterGpsRestart(
  dependencies: ResumeRunDependencies,
): Promise<boolean> {
  await dependencies.restartGps();

  if (!dependencies.isRunCurrent()) {
    dependencies.stopGps();
    return false;
  }

  dependencies.commitResume();
  dependencies.resumePresence();
  return true;
}