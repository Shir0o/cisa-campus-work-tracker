import { Redirect } from 'expo-router';
import { shellForRole } from '@cisa/core';
import { useAuth } from '../../src/lib/AuthProvider';
import { FtMoreScreen } from '../../src/components/ft/FtMoreScreen';

// The fourth tab: the full-timer's "More" (views/mobile/ft.jsx `FtMore`). The
// trainee has no tab bar, so nothing routes here for them.
export default function More() {
  const { role } = useAuth();
  if (shellForRole(role) === 'ft') return <FtMoreScreen />;
  return <Redirect href="/" />;
}
