import { useLocalSearchParams } from 'expo-router';
import { ChatReplyThreadScreen } from '../../../../src/components/messages/ChatReplyThreadScreen';

// A Thread pushed over a chat room (ADR 0033, T2). `?parent=` is the message
// whose replies it holds — staff and members alike.
export default function ChatThread() {
  const { roomId, parent } = useLocalSearchParams<{ roomId: string; parent: string }>();
  return <ChatReplyThreadScreen roomId={roomId} parentId={parent} />;
}
