import { Stack } from 'expo-router';

// Messages is a TAB in three of the four role shells (the design's
// `.mbr-tabs`), and the thread opens inside it with the bar still underneath —
// so the list and the room live in a stack nested in the tab rather than as
// pushed routes over it. The group parens don't touch the paths: '/messages'
// and '/messages/[roomId]' are unchanged, and every existing deep link (a home
// card's "Write back", a to-do notification) still lands here.
export default function MessagesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
