import { memberRoleOf } from '@cisa/core';
import { useAuth } from '../src/lib/AuthProvider';
import { MemberYouScreen } from '../src/components/member/MemberYouScreen';
import { SettingsScreen } from '../src/components/settings/SettingsScreen';

// Settings — two v2 screens, one per shape of app. Members land on "You" (the
// design gives them a much shorter page); trainee and full-timer get the
// design's `M2Settings`, which also absorbed the old separate "Your queue"
// screen.
//
// The team roster that used to live here — approving a signup, inviting
// someone, changing a role, removing access — is gone from the phone. Mobile v2
// mounts no admin surface at all; that work is the desktop site's, and the
// screen's own foot line says so.
export default function SettingsRoute() {
  const { role } = useAuth();
  const memberRole = memberRoleOf(role);
  if (memberRole) return <MemberYouScreen role={memberRole} showBack />;
  return <SettingsScreen />;
}
