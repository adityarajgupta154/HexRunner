import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import LeaderboardScreen from '@/src/screens/LeaderboardScreen';

export default function LeaderboardRoute() {
  return (
    <ScreenErrorBoundary>
      <LeaderboardScreen />
    </ScreenErrorBoundary>
  );
}
