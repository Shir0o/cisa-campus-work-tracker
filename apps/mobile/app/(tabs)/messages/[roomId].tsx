import { useLocalSearchParams } from 'expo-router';
import { memberRoleOf } from '@cisa/core';
import { useAuth } from '../../../src/lib/AuthProvider';
import { MemberThreadScreen } from '../../../src/components/member/MemberThreadScreen';
import { ChatThreadScreen } from '../../../src/components/messages/ChatThreadScreen';

// One Messages thread. Members get the member thread, staff the design's
// `M2Thread`; see messages/index.tsx for why the fork lives on the route rather
// than in the tab bar.
export default function ChatThread() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { role } = useAuth();
  if (memberRoleOf(role)) return <MemberThreadScreen roomId={roomId} />;
  return <ChatThreadScreen roomId={roomId} />;
}
