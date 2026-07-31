import { Redirect } from 'expo-router';
import { memberRoleOf, shellForRole } from '@cisa/core';
import { useAuth } from '../../src/lib/AuthProvider';
import { FtMoreScreen } from '../../src/components/ft/FtMoreScreen';
import { MemberYouScreen } from '../../src/components/member/MemberYouScreen';

// The fourth tab, which is a different screen in each shell: the design's "You"
// for a member (views/mobile/member.jsx) and "More" for the full-timer
// (views/mobile/ft.jsx `FtMore`). The trainee has no tab bar, so nothing routes
// here for them.
//
// MemberYouScreen is also what `/settings` renders for a member, so a deep link
// and this tab land on the same screen.
export default function More() {
  const { role } = useAuth();
  const memberRole = memberRoleOf(role);
  if (memberRole) return <MemberYouScreen role={memberRole} />;
  if (shellForRole(role) === 'ft') return <FtMoreScreen />;
  return <Redirect href="/" />;
}
