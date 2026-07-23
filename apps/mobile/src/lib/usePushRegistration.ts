// Silent re-sync of an already-granted permission's push token on sign-in.
// Never prompts — that's ensureNotificationPermission()'s job, called
// contextually from a feature that actually needs it (see QuickCaptureSheet).
import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { registerForPushToken } from './notifications';
import { setPushToken } from './data/users';

export function usePushRegistration() {
  const { uid } = useAuth();
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
