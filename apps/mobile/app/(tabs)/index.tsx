import { pickLandingForRole } from '@cisa/core';
import { useAuth } from '../../src/lib/AuthProvider';
import { FtHomeScreen } from '../../src/components/ft/FtHomeScreen';
import { QueueScreen } from '../../src/components/queue/QueueScreen';
import { MemberHomeScreen } from '../../src/components/member/MemberHomeScreen';

// Home dispatches by role, mirroring web's Landing.tsx. Every role is on
// mobile v2 now: trainees get the focus queue
// (src/components/queue/QueueScreen.tsx), full-timers the at-a-glance widgets
// home (src/components/ft/FtHomeScreen.tsx), and students/community the calm
// single-scroll member app (src/components/member/MemberHomeScreen.tsx). The
// screens each replaced — LandingTrainee, MyDayScreen with all of
// components/myday, LandingStudent and LandingCommunity — are still on disk
// but no longer routed to.
export default function Home() {
  const { role } = useAuth();
  switch (pickLandingForRole(role)) {
    case 'trainee':
      return <QueueScreen />;
    case 'student':
      return <MemberHomeScreen role="student" />;
    case 'community':
      return <MemberHomeScreen role="community" />;
    default:
      return <FtHomeScreen />;
  }
}
