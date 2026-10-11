// One live Interactions listener per Contact, shared by every component that
// asks for it. The Suggestion queue's rows each flag a same-day duplicate
// against their Contact's Interactions, and a backfill puts hundreds of rows
// on a handful of Contacts — so the listener is ref-counted by contact id and
// closes when the last row using it goes away.
import { useCallback, useSyncExternalStore } from 'react';
import { subscribeContactInteractions } from '../lib/bnpb';
import type { Interaction } from '../types';

const NONE: Interaction[] = [];

interface SharedSubscription {
  interactions: Interaction[];
  listeners: Set<() => void>;
  close: () => void;
}

const shared = new Map<string, SharedSubscription>();

function retain(contactId: string, onChange: () => void): () => void {
  let entry = shared.get(contactId);
  if (!entry) {
    const created: SharedSubscription = { interactions: NONE, listeners: new Set(), close: () => {} };
    created.close = subscribeContactInteractions(
      contactId,
      (list) => {
        created.interactions = list;
        created.listeners.forEach((listener) => listener());
      },
      (e) => console.error('contact interactions subscription error', e),
    );
    shared.set(contactId, created);
    entry = created;
  }
  const retained = entry;
  retained.listeners.add(onChange);
  return () => {
    retained.listeners.delete(onChange);
    if (retained.listeners.size === 0) {
      retained.close();
      if (shared.get(contactId) === retained) shared.delete(contactId);
    }
  };
}

/** The live Interactions of one Contact; empty until they stream in or with no Contact. */
export function useContactInteractions(contactId: string | null | undefined): Interaction[] {
  const subscribe = useCallback(
    (onChange: () => void) => (contactId ? retain(contactId, onChange) : () => {}),
    [contactId],
  );
  const getSnapshot = useCallback(
    () => (contactId ? shared.get(contactId)?.interactions ?? NONE : NONE),
    [contactId],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}
