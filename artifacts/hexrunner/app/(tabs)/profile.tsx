import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import ProfileScreen from '@/src/screens/ProfileScreen';

export default function ProfileRoute() {
  return (
    <ScreenErrorBoundary>
      <ProfileScreen />
    </ScreenErrorBoundary>
  );
}
