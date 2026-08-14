// Minimum time a loading skeleton stays up, even when the data is already
// there: an identity switch ("See it as they do") — or any (re)load — that
// resolves from Firestore's local cache within a frame or two otherwise
// renders skeleton → content faster than the eye can follow, which reads as
// a flash rather than a load. This holds `loading` true for at least
// MIN_SKELETON_MS from the moment it last turned on.
//
// The arming is a render-phase adjustment (the same "storing information
// from previous renders" pattern as useIdentityReset), so the hold starts on
// the very first frame `loading` is true; the only effect is the hold's own
// countdown.
import { useEffect, useState } from 'react';

export const MIN_SKELETON_MS = 500;

export function useMinLoading(loading: boolean, minMs: number = MIN_SKELETON_MS): boolean {
  const [hold, setHold] = useState(loading);
  const [nonce, setNonce] = useState(0);
  const [wasLoading, setWasLoading] = useState(loading);

  // When loading turns on, hold the skeleton and (re)arm the countdown. The
  // nonce re-runs the timer below even when `hold` is already true, so a
  // second identity switch mid-hold still gets a full minimum from ITS onset.
  if (wasLoading !== loading) {
    setWasLoading(loading);
    if (loading) {
      setHold(true);
      setNonce((n) => n + 1);
    }
  }

  // The hold's own countdown. Deliberately NOT keyed on `loading`: when the
  // data arrives early (loading flips false), the pending timer must survive
  // to end the hold at the minimum duration — clearing it here would leave
  // the skeleton up forever.
  useEffect(() => {
    if (!hold) return;
    const timer = setTimeout(() => setHold(false), minMs);
    return () => clearTimeout(timer);
  }, [hold, nonce, minMs]);

  return loading || hold;
}
