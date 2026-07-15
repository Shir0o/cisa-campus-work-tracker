import { pickLandingForRole } from '@cisa/core';
import { useAuth } from '../../src/lib/AuthProvider';
import { MyDayScreen } from '../../src/components/myday/MyDayScreen';
import { LandingTrainee } from '../../src/components/landing/LandingTrainee';
import { LandingStudent } from '../../src/components/landing/LandingStudent';
import { LandingCommunity } from '../../src/components/landing/LandingCommunity';

// Home dispatches by role, mirroring web's Landing.tsx: Trainee/Student/
// Community each get their own landing; Full-timers see My Day.
export default function Home() {
  const { role } = useAuth();
  switch (pickLandingForRole(role)) {
    case 'trainee':
      return <LandingTrainee />;
    case 'student':
      return <LandingStudent />;
    case 'community':
      return <LandingCommunity />;
    default:
      return <MyDayScreen />;
  }
}
