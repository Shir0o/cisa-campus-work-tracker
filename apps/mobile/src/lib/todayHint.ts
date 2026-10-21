// Mobile v2 — the one-time hint inside the first Today card (#1715). Once
// dismissed it never comes back on this device, kept per user alongside the
// other device-local queue settings (queuePrefs.ts, queueState.ts).
//
// Hidden until storage answers, so a trainee who already dismissed it never
// sees it flash on launch.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const HINT_PREFIX = 'cisa.m2.hint.';
const keyFor = (uid: string) => HINT_PREFIX + uid;

/** uid → dismissed; absent until read back from the device. */
const cache: Record<string, boolean> = {};

export function useTodayHint(uid: string | null): { show: boolean; dismiss: () => void } {
  const [dismissed, setDismissed] = useState<boolean | undefined>(uid ? cache[uid] : true);

  useEffect(() => {
    if (!uid || cache[uid] !== undefined) return;
    let alive = true;
    AsyncStorage.getItem(keyFor(uid))
      .then((raw) => {
        cache[uid] = raw === 'true';
        if (alive) setDismissed(cache[uid]);
      })
      .catch(() => {
        /* unavailable storage: leave the hint hidden rather than nag */
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  return {
    show: dismissed === false,
    dismiss: () => {
      if (!uid) return;
      cache[uid] = true;
      setDismissed(true);
      AsyncStorage.setItem(keyFor(uid), 'true').catch((e) => {
        console.warn('Could not save that the Today hint was dismissed.', e);
      });
    },
  };
}
