// Local/scheduled OS notifications — expo-notifications. Remote push (a real
// Expo push token reaching a server) stays deferred: this project has no
// extra.eas.projectId (no `eas init` has run — see MIGRATION.md's Phase 5),
// which getExpoPushTokenAsync requires to mint a token, and no server-side
// infra exists to dispatch one. Every call here is a no-op on web — Expo web
// doesn't support real token minting or persistent local scheduling.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const IS_WEB = Platform.OS === 'web';

if (!IS_WEB) {
  // Without this, notifications show nothing while the app is in the
  // foreground.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

/** Requests permission only if undetermined; never re-prompts after a denial
 * (iOS only shows the system dialog once anyway). Call this at the moment a
 * feature actually needs it (e.g. setting a reminder), not on every sign-in —
 * asking before the user has a reason to say yes burns iOS's one-shot prompt. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (IS_WEB) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

/** Best-effort remote Expo push token. Degrades to `null` (dev-only warning,
 * no throw) when `extra.eas.projectId` is absent — mirrors the Firebase API
 * key guard convention in src/lib/firebase.ts. */
export async function registerForPushToken(): Promise<string | null> {
  if (IS_WEB) return null;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    if (__DEV__) {
      console.warn(
        'No extra.eas.projectId in app.json — skipping remote push token registration. Run `npx eas init` to enable (see MIGRATION.md Phase 5).',
      );
    }
    return null;
  }
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (e) {
    console.error('Failed to get Expo push token:', e);
    return null;
  }
}

/** Schedules a real OS-level local notification at a future instant — fires
 * even if the app is closed, unlike today's Firestore-only task doc. */
export async function scheduleReminderNotification(input: {
  title: string;
  body: string;
  trigger: Date;
}): Promise<string | null> {
  if (IS_WEB) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: input.title, body: input.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: input.trigger },
    });
  } catch (e) {
    console.error('Failed to schedule reminder notification:', e);
    return null;
  }
}

/** Schedules a local OS due-date notification for a to-do (defaults to 9:00 AM on due date). */
export async function scheduleTodoDueNotification(todo: {
  id?: string;
  title: string;
  dueDate?: string | null;
}): Promise<string | null> {
  if (IS_WEB || !todo.dueDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todo.dueDate);
  if (!m) return null;
  const trigger = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0);
  if (trigger.getTime() <= Date.now()) return null;

  return scheduleReminderNotification({
    title: 'To-do due today',
    body: `Due today: ${todo.title.length > 100 ? todo.title.slice(0, 100) + '…' : todo.title}`,
    trigger,
  });
}

/** Checks the current notification permission status without prompting. */
export async function getNotificationPermissionStatus(): Promise<Notifications.PermissionStatus | 'unsupported'> {
  if (IS_WEB) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Sends an immediate local test notification to verify notification permissions and foreground/banner display. */
export async function sendTestLocalNotification(): Promise<boolean> {
  if (IS_WEB) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test Notification',
        body: 'Notifications are working properly on your device.',
        sound: true,
      },
      trigger: null, // immediate
    });
    return true;
  } catch (e) {
    console.error('Failed to trigger test local notification:', e);
    return false;
  }
}
