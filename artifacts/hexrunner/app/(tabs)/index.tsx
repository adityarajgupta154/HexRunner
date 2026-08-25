import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import HomeScreen from '@/src/screens/HomeScreen';

export default function HomeRoute() {
  return (
    <ScreenErrorBoundary>
      <HomeScreen />
    </ScreenErrorBoundary>
  );
}
