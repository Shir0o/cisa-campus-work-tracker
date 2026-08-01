// Live data for the native Coordination Notes / Board list — mirrors the
// `board_docs` listener in web's src/views/CoordinationNotes.tsx, grouped by
// DOC_GROUPS ("This week" / "Earlier") for the Pages list.
import { useEffect, useMemo, useState } from 'react';
import { DOC_GROUPS, docGroup, type BoardDoc, type DocGroup } from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeBoardDocs } from './data/board';
import { useFullTimerNames } from './useFullTimerNames';

/** Who's leading a page, for the design's "…· Ana leading" row line.
 * `facilitatorId` is written on create but was rendered nowhere until v2, so
 * fall back to whoever started the page before giving up. */
export const boardLeaderName = (
  doc: Pick<BoardDoc, 'facilitatorId' | 'createdByName'>,
  names: Record<string, string>,
): string | null => (doc.facilitatorId ? names[doc.facilitatorId] : null) ?? doc.createdByName ?? null;

export function useBoardListData() {
  const { uid, role } = useAuth();
  const [docs, setDocs] = useState<BoardDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const names = useFullTimerNames();

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeBoardDocs(
      role,
      (list) => {
        setDocs(list);
        setLoading(false);
      },
      (e) => {
        setError("Couldn't load board_docs.");
        handleFirestoreError(e, OperationType.LIST, 'board_docs', { rethrow: false });
      },
    );
    return () => unsub();
  }, [uid, role]);

  const sections = useMemo(() => {
    const byGroup: Record<DocGroup, BoardDoc[]> = { Pinned: [], 'This week': [], Earlier: [] };
    for (const d of docs) byGroup[docGroup(d)].push(d);
    return DOC_GROUPS.map((title) => ({ title, data: byGroup[title] })).filter((s) => s.data.length > 0);
  }, [docs]);

  return { sections, total: docs.length, names, loading, error };
}
