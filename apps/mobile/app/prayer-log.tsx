import { Redirect } from 'expo-router';
import { shellForRole } from '@cisa/core';
import { useAuth } from '../src/lib/AuthProvider';
import { FtPrayerLogScreen } from '../src/components/ft/FtPrayerLog';

// The full-timer's prayer log — reached from More and from the home's
// "Carrying" glance tile. Nobody else has a route to it (the trainee meets
// prayers as queue cards, members through their own Prayer screen), so a
// non-FT role who lands here by URL goes home — the same `shellForRole` gate
// Settings uses to decide whether to show the queue blocks.
export default function PrayerLog() {
  const { role } = useAuth();
  if (shellForRole(role) !== 'ft') return <Redirect href="/" />;
  return <FtPrayerLogScreen />;
}
