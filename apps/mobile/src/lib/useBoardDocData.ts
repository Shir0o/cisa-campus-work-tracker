// Live data for a single Board page — powers the native read-only detail
// screen. Every role reads a page here now: mobile v2 has no editor at all
// (writing a page is desktop work), so the old admin WebView fork is gone.
import { useEffect, useMemo, useState } from 'react';
import { canSeeBoardDoc, type BoardDoc } from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeBoardDoc } from './data/board';
import { boardLeaderName } from './useBoardListData';
import { useFullTimerNames } from './useFullTimerNames';
import { useIdentityReset } from './useIdentityReset';

export function useBoardDocData(docId: string) {
  const { uid, role } = useAuth();
  const [doc, setDoc] = useState<BoardDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drop the previous identity's content the moment it changes (impersonation)
  // instead of flashing it until the new snapshot lands.
  useIdentityReset(uid, () => {
    setDoc(null);
    setLoading(true);
    setError(null);
  });

  useEffect(() => {
    if (!uid || !docId) return;
    const unsub = subscribeBoardDoc(
      docId,
      (d) => {
        setDoc(d);
        setLoading(false);
      },
      (e) => {
        setError(`Couldn't load board_docs/${docId}.`);
        handleFirestoreError(e, OperationType.GET, `board_docs/${docId}`, { rethrow: false });
      },
    );
    return () => unsub();
  }, [uid, docId]);

  // Defense-in-depth: the list screen already scopes its query by audience,
  // but a deep link could still land here directly with a doc this role
  // can't see (matching the guard pattern used by journey.tsx/history.tsx).
  const allowed = useMemo(() => !doc || canSeeBoardDoc(role, doc), [doc, role]);

  const names = useFullTimerNames();
  const keeperName = doc ? boardLeaderName(doc, names) : null;

  return { doc, loading, error, allowed, keeperName };
}
