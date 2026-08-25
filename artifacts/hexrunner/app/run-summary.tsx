import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import RunSummaryScreen from '@/src/screens/RunSummaryScreen';

export default function RunSummaryRoute() {
  return (
    <ScreenErrorBoundary>
      <RunSummaryScreen />
    </ScreenErrorBoundary>
  );
}