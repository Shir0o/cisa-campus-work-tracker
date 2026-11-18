import { MessagesScreen } from '../../../src/components/messages/MessagesScreen';

// Messages — the conversation list (the design's `M2Messages`). The third tab
// for the full-timer and a drawer row for the trainee.
//
// No role guard: 'manager' is NAV_ITEMS' floor for /messages, so there is
// nobody the check could turn away.
export default function Messages() {
  return <MessagesScreen />;
}
