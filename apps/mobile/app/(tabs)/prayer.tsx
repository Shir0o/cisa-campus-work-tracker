import { Redirect } from 'expo-router';
import { memberRoleOf } from '@cisa/core';
import { useAuth } from '../../src/lib/AuthProvider';
import { MemberPrayerScreen } from '../../src/components/member/MemberPrayerScreen';

// Prayer — a tab only for students and community members, who get the v2 member
// screen: their own asks and the people on their heart, or a read-only window
// into what the team is carrying.
//
// Nobody else has a tab here (`tabsForRole`): the trainee meets prayers as queue
// cards, the full-timer through /prayer-log. A non-member who lands on this URL
// goes home, the same `Redirect` gate prayer-log.tsx uses.
export default function Prayer() {
  const { role } = useAuth();
  const memberRole = memberRoleOf(role);
  if (!memberRole) return <Redirect href="/" />;
  return <MemberPrayerScreen role={memberRole} />;
}
