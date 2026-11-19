// Mobile read-back of the submitter's own Notes (ADR 0019) — mirrors the web
// Your notes page. Reads go through Firestore scoped to the signed-in user.
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import type { Feedback } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

/** The submitter's own Notes, newest first (the owner query is capped at 50). */
export function subscribeMyNotes(
  uid: string,
  cb: (notes: Feedback[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const q = query(
    collection(db, 'feedback'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50),
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: Feedback[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
        } as Feedback);
      });
      cb(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'feedback');
      onError?.(err);
    },
  );

  return unsubscribe;
}
