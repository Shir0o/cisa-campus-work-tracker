// Where tapping a push opens the app. A bell entry's `link` is a web path
// (it is written once and read by web, PWA and native alike); this maps it
// onto the native routes under app/.
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

export function routeForNotificationLink(link: unknown): string {
  if (typeof link !== 'string') return '/';
  const [path, query = ''] = link.split('?');
  const q = new URLSearchParams(query);
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/people\/([^/]+)$/))) {
    const id = m[1];
    // A message on an Interaction's Thread opens that Thread itself (#1303).
    const interaction = q.get('interaction');
    if (interaction) return `/contact/${id}/thread?interaction=${interaction}`;
    // A reply opens the Thread under its parent; a Full-timers one names its side.
    const parent = q.get('parent');
    const team = q.get('tab') === 'discussion';
    if (parent) return `/contact/${id}/thread?parent=${parent}${team ? '&stream=team' : ''}`;
    // A top-level Full-timers message opens the Conversation on its side; a
    // top-level Conversation message just opens the Conversation.
    if (team) return `/contact/${id}?tab=conversation&stream=team`;
    if (q.get('tab') === 'thread') return `/contact/${id}?tab=conversation`;
    return `/contact/${id}`;
  }
  if ((m = path.match(/^\/messages\/([^/]+)$/))) {
    const parent = q.get('parent');
    return parent ? `/messages/${m[1]}/thread?parent=${parent}` : `/messages/${m[1]}`;
  }
  if (path === '/messages') return '/messages';
  if ((m = path.match(/^\/coordination\/([^/]+)$/))) return `/coordination/${m[1]}`;
  if (path === '/directory') return '/people';
  if (path === '/feedback') return '/your-notes';
  return '/';
}

/** Opens the linked screen when a push is tapped — including the tap that
 *  cold-starts the app. */
export function useNotificationTapRouting(enabled: boolean) {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (Platform.OS === 'web' || !enabled || !last) return;
    if (last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    router.push(routeForNotificationLink(last.notification.request.content.data?.link) as never);
  }, [enabled, last]);
}
