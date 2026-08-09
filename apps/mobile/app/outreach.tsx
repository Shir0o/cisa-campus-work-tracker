import { Redirect } from 'expo-router';
import { shellForRole } from '@cisa/core';
import { useAuth } from '../src/lib/AuthProvider';
import { OutreachScreen } from '../src/components/ft/OutreachScreen';

// The full-timer's outreach page — reached from More. Nobody else has a route
// to it: outreach (and, when built, visits) are full-timer-only, a deliberate
// change from the design which let trainees and community members see them.
// A non-FT role who lands here by deep link goes home, like /prayer-log.
export default function Outreach() {
  const { role } = useAuth();
  if (shellForRole(role) !== 'ft') return <Redirect href="/" />;
  return <OutreachScreen />;
}
