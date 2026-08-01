import { memberRoleOf } from '@cisa/core';
import { useAuth } from '../../../src/lib/AuthProvider';
import { MemberMessagesScreen } from '../../../src/components/member/MemberMessagesScreen';
import { MessagesScreen } from '../../../src/components/messages/MessagesScreen';

// Messages — the conversation list. The third tab in every shell that has a bar
// (student, community, full-timer) and a drawer row for the trainee.
//
// Two v2 screens, one per shape of app: the member's calm single scroll and the
// staff list (the design's `M2Messages`). Branching HERE rather than in the tab
// bar keeps every deep link — a home card's "Write back", a notification —
// landing on the right screen for whoever opened it.
//
// No role guard: 'viewer' is NAV_ITEMS' floor for /messages, so there is nobody
// the check could turn away.
export default function Messages() {
  const { role } = useAuth();
  const memberRole = memberRoleOf(role);
  if (memberRole) return <MemberMessagesScreen role={memberRole} />;
  return <MessagesScreen />;
}
