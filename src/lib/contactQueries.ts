// Contact list reads under the tightened rules (#1024 phase 4).
//
// The rules read `visibleTo` per document. A reader who is scoped to their
// ties (a Trainee) must therefore carry `where('visibleTo', 'array-contains',
// <uid>)` on the query itself, or Firestore rejects the whole list result.
// Everyone who sees the whole roster reads unconstrained. This mirrors
// `seesAllPeople`, the same predicate the rules use, so the client never asks
// for less than it is allowed and never asks for more than the query allows.
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { seesAllPeople, type AppRole } from './permissions';

export function contactVisibilityConstraints(
  role: AppRole | string | null,
  staffId: string | null | undefined,
): QueryConstraint[] {
  if (seesAllPeople(role) || !staffId) return [];
  return [where('visibleTo', 'array-contains', staffId)];
}

/** How many of each visible person's newest entries a Trainee's fan-out reads. */
const TIED_PER_CONTACT = 50;

/**
 * A Trainee's read of one contact subcollection across the people they can
 * see. The rules deny them the collection-group feed -- it spans people outside
 * their `visibleTo` -- so this lists each visible contact's subcollection
 * instead and hands back the merged docs, following the contact list as ties
 * come and go. A refused per-person read is the race when a tie is removed
 * (the subcollection listener can hear first); that person's docs are dropped
 * and the contact list's next snapshot settles it. Mirrors
 * packages/core/src/data/contacts.ts.
 */
export function subscribeTiedSubcollection(
  staffId: string,
  sub: 'interactions' | 'comments',
  cb: (docs: QueryDocumentSnapshot[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const perContact = new Map<string, { docs: QueryDocumentSnapshot[]; unsub: () => void }>();
  const publish = () => cb([...perContact.values()].flatMap((e) => e.docs));

  const unsubContacts = onSnapshot(
    query(collection(db, 'contacts'), where('visibleTo', 'array-contains', staffId)),
    (snap) => {
      const ids = new Set(snap.docs.map((d) => d.id));
      for (const [id, entry] of perContact) {
        if (!ids.has(id)) {
          entry.unsub();
          perContact.delete(id);
        }
      }
      for (const id of ids) {
        if (perContact.has(id)) continue;
        const entry = { docs: [] as QueryDocumentSnapshot[], unsub: () => {} };
        perContact.set(id, entry);
        entry.unsub = onSnapshot(
          query(collection(db, 'contacts', id, sub), orderBy('createdAt', 'desc'), limit(TIED_PER_CONTACT)),
          (s) => {
            entry.docs = s.docs;
            publish();
          },
          () => {
            perContact.delete(id);
            publish();
          },
        );
      }
      publish();
    },
    (e) => (onError ? onError(e) : console.error(`${sub} subscription error`, e)),
  );

  return () => {
    unsubContacts();
    for (const entry of perContact.values()) entry.unsub();
  };
}
