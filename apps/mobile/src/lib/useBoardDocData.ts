// Live data for a single Board page — powers the native read-only detail
// screen (non-admin roles; admins go through the WebView editor instead).
import { useEffect, useMemo, useState } from 'react';
import { canSeeBoardDoc, type BoardDoc } from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeBoardDoc } from './data/board';

export function useBoardDocData(docId: string) {
  const { uid, role } = useAuth();
  const [doc, setDoc] = useState<BoardDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return { doc, loading, error, allowed };
}
