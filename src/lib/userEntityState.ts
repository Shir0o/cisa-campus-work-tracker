import { useEffect, useState } from "react";

// Unified per-user entity state store (#326).
// Keyed by entity ref (`contact:<id>`, `interaction:<id>`, `thread:<id>`,
// `conv:<id>`, `message:<id>`, `todo:<id>`) with two orthogonal axes:
// - `read`: user has seen / scanned the item (passive awareness)
// - `done`: user has cleared / handled / hidden the item (active resolution)
//
// Client-only, per-device preferences namespaced per uid (`cisa.user.entity.<uid>`).
// Transparently migrates and backs legacy stores (`inboxReads`, `convHides`, `messageHides`).

const USER_ENTITY_PREFIX = "cisa.user.entity.";
const LEGACY_INBOX_READ_PREFIX = "cisa.inbox.read.";
const LEGACY_CONV_HIDE_PREFIX = "cisa.conv.hidden.";
const LEGACY_MSG_HIDE_PREFIX = "cisa.msg.hidden.";

export interface EntityStateBucket {
  read: Set<string>;
  done: Set<string>;
}

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, EntityStateBucket> = {};

const keyFor = (uid: string) => USER_ENTITY_PREFIX + uid;

const load = (uid: string): EntityStateBucket => {
  const bucket: EntityStateBucket = {
    read: new Set<string>(),
    done: new Set<string>(),
  };

  try {
    const raw = localStorage.getItem(keyFor(uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.read)) {
          parsed.read.forEach((id: string) => bucket.read.add(id));
        }
        if (Array.isArray(parsed.done)) {
          parsed.done.forEach((id: string) => bucket.done.add(id));
        }
        return bucket;
      }
    }
  } catch {
    /* ignore malformed storage */
  }

  // Transparent legacy migration on first load when unified store is not present
  try {
    const legacyInbox = localStorage.getItem(LEGACY_INBOX_READ_PREFIX + uid);
    if (legacyInbox) {
      const arr = JSON.parse(legacyInbox);
      if (Array.isArray(arr)) {
        arr.forEach((id: string) => bucket.read.add(id));
      }
    }

    const legacyConv = localStorage.getItem(LEGACY_CONV_HIDE_PREFIX + uid);
    if (legacyConv) {
      const arr = JSON.parse(legacyConv);
      if (Array.isArray(arr)) {
        arr.forEach((id: string) => {
          bucket.done.add(`conv:${id}`);
          bucket.done.add(id);
        });
      }
    }

    const legacyMsg = localStorage.getItem(LEGACY_MSG_HIDE_PREFIX + uid);
    if (legacyMsg) {
      const arr = JSON.parse(legacyMsg);
      if (Array.isArray(arr)) {
        arr.forEach((id: string) => {
          bucket.done.add(`message:${id}`);
          bucket.done.add(id);
        });
      }
    }
  } catch {
    /* ignore malformed legacy storage */
  }

  return bucket;
};

const get = (uid: string): EntityStateBucket => (cache[uid] ??= load(uid));

const save = (uid: string) => {
  try {
    const bucket = get(uid);
    const data = {
      read: [...bucket.read],
      done: [...bucket.done],
    };
    localStorage.setItem(keyFor(uid), JSON.stringify(data));
  } catch {
    /* ignore quota/storage errors */
  }
};

const emit = () => {
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener shouldn't stop others */
    }
  });
};

function hasDone(bucket: EntityStateBucket, ref: string): boolean {
  if (bucket.done.has(ref)) return true;
  if (ref.startsWith("conv:")) {
    if (bucket.done.has(ref.slice(5))) return true;
  } else if (ref.startsWith("message:")) {
    if (bucket.done.has(ref.slice(8))) return true;
  } else {
    if (bucket.done.has(`conv:${ref}`) || bucket.done.has(`message:${ref}`)) {
      return true;
    }
  }
  return false;
}

function removeDone(bucket: EntityStateBucket, ref: string): boolean {
  let changed = bucket.done.delete(ref);
  if (ref.startsWith("conv:")) {
    if (bucket.done.delete(ref.slice(5))) changed = true;
  } else if (ref.startsWith("message:")) {
    if (bucket.done.delete(ref.slice(8))) changed = true;
  } else {
    if (bucket.done.delete(`conv:${ref}`)) changed = true;
    if (bucket.done.delete(`message:${ref}`)) changed = true;
  }
  return changed;
}

export const UserEntityState = {
  isRead(uid: string, entityRef: string): boolean {
    return get(uid).read.has(entityRef);
  },

  isDone(uid: string, entityRef: string): boolean {
    return hasDone(get(uid), entityRef);
  },

  /** Everything this browser has recorded for a person, so the server store can
   *  be seeded from it exactly once (#813). `inboxState.ts` is the only caller:
   *  starting the worklist clean would show every Full-timer their whole contact
   *  history as new on launch day. */
  allRefs(uid: string): { read: string[]; done: string[] } {
    const bucket = get(uid);
    return { read: [...bucket.read], done: [...bucket.done] };
  },

  getState(uid: string, entityRef: string): { read: boolean; done: boolean } {
    const bucket = get(uid);
    return {
      read: bucket.read.has(entityRef),
      done: hasDone(bucket, entityRef),
    };
  },

  setRead(uid: string, entityRef: string, read: boolean = true) {
    const bucket = get(uid);
    if (read) {
      if (!bucket.read.has(entityRef)) {
        bucket.read.add(entityRef);
        save(uid);
        emit();
      }
    } else {
      if (bucket.read.delete(entityRef)) {
        save(uid);
        emit();
      }
    }
  },

  setDone(uid: string, entityRef: string, done: boolean = true) {
    const bucket = get(uid);
    if (done) {
      if (!bucket.done.has(entityRef)) {
        bucket.done.add(entityRef);
        save(uid);
        emit();
      }
    } else {
      if (removeDone(bucket, entityRef)) {
        save(uid);
        emit();
      }
    }
  },

  markRead(uid: string, entityRef: string) {
    this.setRead(uid, entityRef, true);
  },

  markUnread(uid: string, entityRef: string) {
    this.setRead(uid, entityRef, false);
  },

  markDone(uid: string, entityRef: string) {
    this.setDone(uid, entityRef, true);
  },

  markUndone(uid: string, entityRef: string) {
    this.setDone(uid, entityRef, false);
  },

  markAllRead(uid: string, entityRefs: string[]) {
    const bucket = get(uid);
    let changed = false;
    for (const ref of entityRefs) {
      if (!bucket.read.has(ref)) {
        bucket.read.add(ref);
        changed = true;
      }
    }
    if (changed) {
      save(uid);
      emit();
    }
  },

  markAllDone(uid: string, entityRefs: string[]) {
    const bucket = get(uid);
    let changed = false;
    for (const ref of entityRefs) {
      if (!bucket.done.has(ref)) {
        bucket.done.add(ref);
        changed = true;
      }
    }
    if (changed) {
      save(uid);
      emit();
    }
  },

  clearDone(uid: string, entityRefs?: string[]) {
    const bucket = get(uid);
    let changed = false;
    if (!entityRefs || entityRefs.length === 0) {
      if (bucket.done.size > 0) {
        bucket.done.clear();
        changed = true;
      }
    } else {
      for (const ref of entityRefs) {
        if (removeDone(bucket, ref)) {
          changed = true;
        }
      }
    }
    if (changed) {
      save(uid);
      emit();
    }
  },

  clearAll(uid: string) {
    const bucket = get(uid);
    if (bucket.read.size > 0 || bucket.done.size > 0) {
      bucket.read.clear();
      bucket.done.clear();
      save(uid);
      emit();
    }
  },

  subscribe(fn: Listener): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

/** React hook subscribing to any per-user entity state change */
export function useUserEntityState(): typeof UserEntityState {
  const [, force] = useState(0);
  useEffect(() => UserEntityState.subscribe(() => force((n) => n + 1)), []);
  return UserEntityState;
}

/** React hook subscribing to a single entity ref's state for a given user */
export function useEntityState(uid: string, entityRef: string) {
  const [, force] = useState(0);
  useEffect(() => UserEntityState.subscribe(() => force((n) => n + 1)), []);
  return {
    ...UserEntityState.getState(uid, entityRef),
    markRead: () => UserEntityState.markRead(uid, entityRef),
    markUnread: () => UserEntityState.markUnread(uid, entityRef),
    markDone: () => UserEntityState.markDone(uid, entityRef),
    markUndone: () => UserEntityState.markUndone(uid, entityRef),
  };
}

/** Test-only cache reset */
export function __resetUserEntityStateCache() {
  for (const k of Object.keys(cache)) {
    delete cache[k];
  }
}
