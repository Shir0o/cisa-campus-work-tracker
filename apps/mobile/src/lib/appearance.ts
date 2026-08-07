// Mobile v2 — Appearance preference (Daylight / Dark / Match my phone).
// The design keeps this on `M2Prefs.appearance`, per person; this is the same
// preference, device-local in AsyncStorage (`cisa.m2.scheme.<uid>`).
//
// Deliberately the same shape as roomTint.ts — the two controls sit beside each
// other in Settings → "How it looks", and used to behave differently only
// because this one was never persisted.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { parseSchemePref, type SchemePref } from '@cisa/core';

const SCHEME_PREFIX = 'cisa.m2.scheme.';

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, SchemePref> = {};
const hydrated = new Set<string>();

const keyFor = (uid: string) => SCHEME_PREFIX + uid;

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
      const saved = parseSchemePref(raw);
      if (saved) {
        cache[uid] = saved;
        emit();
      }
    })
    .catch((e) => {
      console.warn('Could not read saved appearance preference.', e);
    });
}

function get(uid: string | null | undefined): SchemePref {
  if (!uid) return 'system';
  hydrate(uid);
  return cache[uid] ?? 'system';
}

export const AppearanceStore = {
  for: (uid: string | null | undefined): SchemePref => get(uid),

  set(uid: string | null | undefined, scheme: SchemePref) {
    if (!uid) return;
    cache[uid] = scheme;
    AsyncStorage.setItem(keyFor(uid), scheme).catch((e) => {
      console.warn('Could not save appearance preference.', e);
    });
    emit();
  },
};

/** React hook for live appearance reactivity. Handles null/undefined uid
 *  gracefully — signed out, everyone follows the phone. */
export function useAppearance(uid: string | null | undefined): [SchemePref, (scheme: SchemePref) => void] {
  const [scheme, setSchemeState] = useState<SchemePref>(() => get(uid));

  useEffect(() => {
    if (!uid) return;
    const listener = () => setSchemeState(get(uid));
    subs.add(listener);
    setSchemeState(get(uid));
    return () => {
      subs.delete(listener);
    };
  }, [uid]);

  // Stable across renders: ThemeProvider hands this straight into the theme
  // context's useMemo, and a fresh closure every render would defeat it.
  const setScheme = useCallback(
    (next: SchemePref) => {
      if (uid) {
        AppearanceStore.set(uid, next);
      }
    },
    [uid],
  );

  return [scheme, setScheme];
}
