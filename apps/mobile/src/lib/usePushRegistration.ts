// Silent re-sync of an already-granted permission's push token on sign-in.
// Never prompts — that's ensureNotificationPermission()'s job, called
// contextually from a feature that actually needs it (see QuickCaptureSheet).
import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { registerForPushToken } from './notifications';
import { setPushToken } from './data/users';

export function usePushRegistration() {
  // The real signed-in account — not the effective (possibly impersonated)
  // uid. A push token is a device-level registration for the actual auth user:
  // writing it to a persona doc (e.g. `users/cisa-student`) is denied by
  // firestore.rules and would mis-route the device's notifications.
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    registerForPushToken().then((token) => {
      if (!cancelled && token) void setPushToken(uid, token);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);
}
