import { useLocalSearchParams } from 'expo-router';
import { BoardDocScreen } from '../../src/components/coordination/BoardDocScreen';

// One Board page, in the v2 language (the design's `M2BoardDoc`) — for every
// role. The admin WebView editor that used to live here is gone: mobile v2
// reads pages and writes none, so there is no longer a role fork on this route
// (and with it went the /api/mint-custom-token round trip on open).
export default function CoordinationDoc() {
  const { docId } = useLocalSearchParams<{ docId: string }>();
  return <BoardDocScreen docId={docId} />;
}
