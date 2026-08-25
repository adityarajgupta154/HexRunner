import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import RunSessionScreen from '@/src/screens/RunSessionScreen';

export default function RunRoute() {
  return (
    <ScreenErrorBoundary>
      <RunSessionScreen />
    </ScreenErrorBoundary>
  );
}
