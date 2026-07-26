// Mobile v2 — the trainee's own settings for their focus queue. Ported from the
// design project's `M2Prefs` (views/mobile/queue.jsx), swapping localStorage for
// AsyncStorage exactly the way its sibling queueState.ts does.
//
// DEVICE-LOCAL on purpose. The obvious alternative is the Firestore-backed
// `UserPreferences` doc (src/lib/data/userPreferences.ts), but these are phone
// settings — when you're on campus, how loud your queue is — and putting them
// there would mean widening firestore.rules and deploying it before the screen
// could save anything. The design treats them as per-device too.
//
// Everything read back off the device goes through @cisa/core's normalizers, so
// a half-written or hand-edited value can't produce a queue nobody can explain.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import {
  ON_CAMPUS_DEFAULT,
  QUEUE_PREF_DEFAULTS,
  normalizeOnCampusWindow,
  normalizeQueuePrefs,
  type OnCampusWindow,
  type QueuePrefs,
} from '@cisa/core';

const PREFS_PREFIX = 'cisa.m2.prefs.';

/** What buildQueue needs, plus the window that promotes logging. */
export interface QueueSettings extends QueuePrefs {
  onCampus: OnCampusWindow;
}

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, QueueSettings> = {};
const hydrated = new Set<string>();

const keyFor = (uid: string) => PREFS_PREFIX + uid;
const defaults = (): QueueSettings => ({ ...QUEUE_PREF_DEFAULTS, onCampus: { ...ON_CAMPUS_DEFAULT } });

const normalize = (raw: unknown): QueueSettings => ({
  ...normalizeQueuePrefs(raw),
  onCampus: normalizeOnCampusWindow((raw as { onCampus?: unknown } | null)?.onCampus),
});

const emit = () =>
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener shouldn't stop the others */
    }
  });

// Storage failures stay non-fatal — the queue must keep working on the defaults
// rather than take the screen down — but they are not silent. These prefs exist
// ONLY on the device, so a swallowed write is the difference between "my
// settings didn't stick" and no evidence at all.
const save = (uid: string) => {
  AsyncStorage.setItem(keyFor(uid), JSON.stringify(cache[uid])).catch((e) => {
    console.warn('Could not save queue preferences; they will not survive a restart.', e);
  });
};

function hydrate(uid: string) {
  if (hydrated.has(uid)) return;
  hydrated.add(uid);
  AsyncStorage.getItem(keyFor(uid))
    .then((raw) => {
      if (!raw) return;
      cache[uid] = normalize(JSON.parse(raw));
      emit();
    })
    .catch((e) => {
      // Also catches a malformed payload from JSON.parse — worth seeing, since
      // the queue then quietly rebuilds on the defaults.
      console.warn('Could not read saved queue preferences; using the defaults.', e);
    });
}

function get(uid: string): QueueSettings {
  hydrate(uid);
  return (cache[uid] ??= defaults());
}

export const QueuePrefsStore = {
  for: (uid: string): QueueSettings => get(uid),

  /** Patch one or more settings. Normalized before it lands, so callers can
   * hand over whatever the picker gave them. */
  set(uid: string, patch: Partial<QueueSettings>) {
    cache[uid] = normalize({ ...get(uid), ...patch });
    save(uid);
    emit();
  },

  /** Back to how the queue arrives out of the box. */
  reset(uid: string) {
    cache[uid] = defaults();
    save(uid);
    emit();
  },

  subscribe(fn: Listener): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

/** Subscribe a component to the trainee's queue settings; re-renders on change.
 * Signed out, it reads the defaults and saves nothing. */
export function useQueuePrefs(uid: string | null): {
  prefs: QueueSettings;
  set: (patch: Partial<QueueSettings>) => void;
  reset: () => void;
} {
  const [, force] = useState(0);
  useEffect(() => QueuePrefsStore.subscribe(() => force((n) => n + 1)), []);

  return {
    prefs: uid ? QueuePrefsStore.for(uid) : defaults(),
    set: (patch: Partial<QueueSettings>) => uid && QueuePrefsStore.set(uid, patch),
    reset: () => uid && QueuePrefsStore.reset(uid),
  };
}
