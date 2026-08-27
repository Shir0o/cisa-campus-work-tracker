import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
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

    const syncToken = () => {
      registerForPushToken()
        .then((token) => {
          if (!cancelled && token) void setPushToken(uid, token);
        })
        .catch((err) => {
          console.error('Failed to sync push token:', err);
        });
    };

    syncToken();

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncToken();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [uid]);
}
