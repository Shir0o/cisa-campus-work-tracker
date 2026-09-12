import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from './AuthProvider';
import { syncPushToken } from './pushRegistration';

export function usePushRegistration() {
  // The real signed-in account — not the effective (possibly impersonated)
  // uid. A push token is a device-level registration for the actual auth user:
  // writing it to a persona doc (e.g. `users/cisa-student`) is denied by
  // firestore.rules and would mis-route the device's notifications.
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) return;

    // No cancellation guard: `uid` is closed over, so a late-resolving sync
    // always writes the token to the account it was minted for.
    const syncToken = () => {
      void syncPushToken(uid);
    };

    syncToken();

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncToken();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      sub.remove();
    };
  }, [uid]);
}
