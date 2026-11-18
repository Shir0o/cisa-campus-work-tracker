import { useLocalSearchParams } from 'expo-router';
import { ChatThreadScreen } from '../../../../src/components/messages/ChatThreadScreen';

// One Messages thread — the design's `M2Thread`.
export default function ChatThread() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  return <ChatThreadScreen roomId={roomId} />;
}
