// The submitter's own Notes for the native mobile read-back view (ADR 0019) —
// mirrors web's MyNotes page. Reads are Firestore queries scoped to the signed-in
// user; replies are posted to the server, never written from the client.
import { useEffect, useState } from 'react';
import type { Feedback } from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeMyNotes } from './data/feedback';
import { useIdentityReset } from './useIdentityReset';
import { useMinLoading } from './useMinLoading';

export function useMyNotesData() {
  const { uid } = useAuth();
  const [notes, setNotes] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drop the previous identity's list synchronously instead of flashing it
  // until the new snapshot (the "See it as they do" flash, same as chat).
  useIdentityReset(uid, () => {
    setNotes([]);
    setLoading(true);
    setError(null);
  });

  useEffect(() => {
    if (!uid) return;
    const onError = (e: unknown) => {
      // A silent failure here is what made the web page look empty rather than
      // broken (ADR 0019). Say so instead.
      setError(`Couldn't load your notes.`);
      handleFirestoreError(e, OperationType.LIST, 'feedback', { rethrow: false });
    };
    const unsubscribe = subscribeMyNotes(
      uid,
      (list) => {
        setNotes(list);
        setLoading(false);
        setError(null);
      },
      onError,
    );
    return () => {
      unsubscribe();
      setLoading(true);
    };
  }, [uid]);

  return { notes, loading: useMinLoading(loading), error };
}