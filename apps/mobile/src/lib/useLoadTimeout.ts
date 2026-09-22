// Safety valve against an infinite loading skeleton: a Firestore subscription
// that neither resolves (no first snapshot) nor errors (a hung connection, an
// App Check attestation that never returns) would otherwise leave a screen
// showing only the skeleton forever — the exact "iOS native stuck on loader"
// bug this protects against. The skeleton must never outlive LOAD_TIMEOUT_MS;
// when it fires, `loading` flips false so the error surface renders instead.
//
// The callback is held in a ref so its identity changing across renders never
// re-arms (and thus extends) the timer; it is armed once per `uid`.
import { useEffect, useRef } from 'react';

export const LOAD_TIMEOUT_MS = 15000;

export function useLoadTimeout(uid: string | null, onTimeout: () => void): void {
  const cb = useRef(onTimeout);
  useEffect(() => {
    cb.current = onTimeout;
  }, [onTimeout]);
  useEffect(() => {
    if (!uid) return;
    const timer = setTimeout(() => cb.current(), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [uid]);
}