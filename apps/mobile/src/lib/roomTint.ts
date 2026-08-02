// Mobile v2 — Room tint preference (Green room vs Navy room).
// Ported from the design project's `mobile-blue.css` + `tweaks-panel.jsx` (Room option: green | blue).
// Device-local in AsyncStorage (`cisa.m2.tint.<uid>`).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type V2RoomTint = 'green' | 'blue';

const TINT_PREFIX = 'cisa.m2.tint.';

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, V2RoomTint> = {};
const hydrated = new Set<string>();

const keyFor = (uid: string) => TINT_PREFIX + uid;

const emit = () =>
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore listener errors */
    }
  });

function hydrate(uid: string) {
  if (hydrated.has(uid)) return;
  hydrated.add(uid);
  AsyncStorage.getItem(keyFor(uid))
    .then((raw) => {
      if (raw === 'blue' || raw === 'green') {
        cache[uid] = raw;
        emit();
      }
    })
    .catch((e) => {
      console.warn('Could not read saved room tint preference.', e);
    });
}

function get(uid: string | null | undefined): V2RoomTint {
  if (!uid) return 'green';
  hydrate(uid);
  return cache[uid] ?? 'green';
}

export const RoomTintStore = {
  for: (uid: string | null | undefined): V2RoomTint => get(uid),

  set(uid: string | null | undefined, tint: V2RoomTint) {
    if (!uid) return;
    cache[uid] = tint;
    AsyncStorage.setItem(keyFor(uid), tint).catch((e) => {
      console.warn('Could not save room tint preference.', e);
    });
    emit();
  },
};

/** React hook for live room tint reactivity. Handles null/undefined uid gracefully. */
export function useRoomTint(uid: string | null | undefined): [V2RoomTint, (tint: V2RoomTint) => void] {
  const [tint, setTintState] = useState<V2RoomTint>(() => get(uid));

  useEffect(() => {
    if (!uid) return;
    const listener = () => setTintState(get(uid));
    subs.add(listener);
    setTintState(get(uid));
    return () => {
      subs.delete(listener);
    };
  }, [uid]);

  const setTint = (next: V2RoomTint) => {
    if (uid) {
      RoomTintStore.set(uid, next);
    }
  };

  return [tint, setTint];
}
