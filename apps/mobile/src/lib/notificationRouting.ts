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
    // An old Interaction-Thread link lands on the person's Story: threads
    // under an Interaction are cut (§24).
    if (q.get('interaction')) return `/contact/${id}`;
    // A reply opens the Thread under its parent. `tab=discussion` is an old
    // Full-timers link; it lands on the Conversation like any other.
    const parent = q.get('parent');
    if (parent) return `/contact/${id}/thread?parent=${parent}`;
    if (q.get('tab') === 'thread' || q.get('tab') === 'discussion') return `/contact/${id}?tab=conversation`;
    return `/contact/${id}`;
  }
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
