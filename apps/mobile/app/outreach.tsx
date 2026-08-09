import { Redirect } from 'expo-router';
import { canSeeOutreach } from '@cisa/core';
import { useAuth } from '../src/lib/AuthProvider';
import { OutreachScreen } from '../src/components/ft/OutreachScreen';

// The outreach page — reached from the full-timer's More and, for community,
// from the member app's "You" tab. Outreach is full-timer + community (the
// community folk who go out and log the names); trainees and students get
// redirected home. The separate Visits page, when built, will be admin-only.
export default function Outreach() {
  const { role } = useAuth();
  if (!canSeeOutreach(role)) return <Redirect href="/" />;
  return <OutreachScreen />;
}
