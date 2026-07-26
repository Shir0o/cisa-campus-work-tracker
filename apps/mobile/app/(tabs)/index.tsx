import { pickLandingForRole } from '@cisa/core';
import { useAuth } from '../../src/lib/AuthProvider';
import { MyDayScreen } from '../../src/components/myday/MyDayScreen';
import { QueueScreen } from '../../src/components/queue/QueueScreen';
import { LandingStudent } from '../../src/components/landing/LandingStudent';
import { LandingCommunity } from '../../src/components/landing/LandingCommunity';

// Home dispatches by role, mirroring web's Landing.tsx: Student/Community each
// get their own landing; Full-timers see My Day. Trainees get mobile v2's focus
// queue (see src/components/queue/QueueScreen.tsx) — the dashboard-shaped
// LandingTrainee it replaces is still on disk but no longer routed to.
export default function Home() {
  const { role } = useAuth();
  switch (pickLandingForRole(role)) {
    case 'trainee':
      return <QueueScreen />;
    case 'student':
      return <LandingStudent />;
    case 'community':
      return <LandingCommunity />;
    default:
      return <MyDayScreen />;
  }
}
