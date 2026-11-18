import { pickLandingForRole } from '@cisa/core';
import { useAuth } from '../../src/lib/AuthProvider';
import { FtHomeScreen } from '../../src/components/ft/FtHomeScreen';
import { QueueScreen } from '../../src/components/queue/QueueScreen';

// Home dispatches by role, mirroring web's Landing.tsx: trainees get the focus
// queue (src/components/queue/QueueScreen.tsx), full-timers the at-a-glance
// widgets home (src/components/ft/FtHomeScreen.tsx). The screens each replaced
// — LandingTrainee and MyDayScreen with all of components/myday — are still on
// disk but no longer routed to. No role gets nothing here: the root layout's
// AccessGate holds that account on the pending screen before it gets this far.
export default function Home() {
  const { role } = useAuth();
  switch (pickLandingForRole(role)) {
    case 'trainee':
      return <QueueScreen />;
    case 'myday':
      return <FtHomeScreen />;
    default:
      return null;
  }
}
