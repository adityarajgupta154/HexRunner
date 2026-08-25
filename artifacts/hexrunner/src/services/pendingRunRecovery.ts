import type { PendingRun } from '@/src/services/runStorageCore';

export type PendingRunRecoveryRoute = {
  pathname: '/run-summary';
  params: {
    clientRunId: string;
    elapsedSeconds: string;
    distanceKm: string;
    pointCount: string;
    hexCount: string;
  };
};

export function getPendingRunRecoveryRoute(
  run: PendingRun | null,
  pathname: string,
): PendingRunRecoveryRoute | null {
  if (!run || pathname === '/run-summary') return null;

  return {
    pathname: '/run-summary',
    params: {
      clientRunId: run.clientRunId,
      elapsedSeconds: run.elapsedSeconds.toString(),
      distanceKm: run.distanceKm.toString(),
      pointCount: run.points.length.toString(),
      hexCount: run.claimedHexes.length.toString(),
    },
  };
}