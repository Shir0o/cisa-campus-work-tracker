import { pickLandingForRole } from '@cisa/core';
import { useAuth } from '../../src/lib/AuthProvider';
import { FtHomeScreen } from '../../src/components/ft/FtHomeScreen';
import { QueueScreen } from '../../src/components/queue/QueueScreen';

// Home dispatches by role, mirroring web's Landing.tsx: trainees get the focus
// queue (src/components/queue/QueueScreen.tsx), full-timers the at-a-glance
// widgets home (src/components/ft/FtHomeScreen.tsx). The screens each replaced
// — LandingTrainee and MyDayScreen with all of components/myday — are still on
// disk but no longer routed to.
export default function Home() {
  const { role } = useAuth();
  switch (pickLandingForRole(role)) {
    case 'trainee':
      return <QueueScreen />;
    default:
      return <FtHomeScreen />;
  }
}
