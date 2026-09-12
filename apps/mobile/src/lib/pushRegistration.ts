// One place that mints the device's Expo push token and writes it to the
// signed-in user's doc. Shared because two different moments need it and both
// are load-bearing for background delivery: the app coming to the foreground
// (usePushRegistration) and the instant the user says yes to the permission
// prompt (MobileNotificationPermissionBanner). Registering only on the former
// meant a fresh grant sat unregistered until the next background/foreground
// cycle, so nothing buzzed in between (#977).
import { registerForPushToken } from './notifications';
import { setPushToken } from './data/users';

/** Best-effort: mints a token and persists it under `uid`. Resolves to the
 * token when one was stored, else `null` — a failure only costs the buzz, so
 * nothing here throws at the caller. */
export async function syncPushToken(uid: string | null): Promise<string | null> {
  if (!uid) return null;
  try {
    const token = await registerForPushToken();
    if (!token) return null;
    await setPushToken(uid, token);
    return token;
  } catch (err) {
    console.error('Failed to sync push token:', err);
    return null;
  }
}
