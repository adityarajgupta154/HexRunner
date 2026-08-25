import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { getPendingRun } from '@/src/services/runStorage';

export default function PendingRunRecovery() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function recoverPendingRun() {
      const run = await getPendingRun();
      if (!active || !run || pathname === '/run-summary') return;

      router.replace({
        pathname: '/run-summary',
        params: {
          clientRunId: run.clientRunId,
          elapsedSeconds: run.elapsedSeconds.toString(),
          distanceKm: run.distanceKm.toString(),
          pointCount: run.points.length.toString(),
          hexCount: run.claimedHexes.length.toString(),
        },
      });
    }

    void recoverPendingRun();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  return null;
}