import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { getPendingRun } from '@/src/services/runStorage';
import { getPendingRunRecoveryRoute } from '@/src/services/pendingRunRecovery';

export default function PendingRunRecovery() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function recoverPendingRun() {
      const run = await getPendingRun();
      const recoveryRoute = getPendingRunRecoveryRoute(run, pathname);
      if (!active || !recoveryRoute) return;

      router.replace(recoveryRoute);
    }

    void recoverPendingRun();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  return null;
}