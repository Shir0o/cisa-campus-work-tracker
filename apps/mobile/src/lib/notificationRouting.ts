// Where tapping a push opens the app. A bell entry's `link` is a web path
// (it is written once and read by web, PWA and native alike); this maps it
// onto the native routes under app/.
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

export function routeForNotificationLink(link: unknown): string {
  if (typeof link !== 'string') return '/';
  const path = link.split('?')[0];
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/people\/([^/]+)$/))) return `/contact/${m[1]}`;
  if ((m = path.match(/^\/messages(\/[^/]+)?$/))) return `/messages${m[1] ?? ''}`;
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
