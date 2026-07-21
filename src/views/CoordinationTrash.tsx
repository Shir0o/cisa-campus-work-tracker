// Trash for The Board (board_docs) — soft-deleted pages, admin-only (matches
// board_docs' delete rule). Restore brings a page back to the main Pages
// list; "Delete Forever" is the old permanent hard-delete, now only reachable
// from here. Web's counterpart to apps/mobile/app/coordination/trash.tsx —
// previously Trash only existed on mobile, so a page deleted from the web
// editor had no web-side way to be recovered.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { dayNum, weekdayShort, type BoardDoc } from '../lib/board';
import { deleteBoardDoc, purgeExpiredTrash, restoreBoardDoc } from '../lib/data/board';
import PageContainer from '../components/layout/PageContainer';
import { Skeleton } from '../components/ui/Skeleton';

export default function CoordinationTrash() {
  const { isAdmin } = useAuth();
  const [docs, setDocs] = useState<BoardDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'board_docs'), orderBy('date', 'desc')),
      (snap) => {
        const trashed = snap.docs
          .map((d) => ({ id: d.id, md: '', title: 'Untitled page', ...(d.data() as object) }) as BoardDoc)
          .filter((d) => !!d.deletedAt);
        setDocs(trashed);
        setLoading(false);
        void purgeExpiredTrash(trashed);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'board_docs (trash)');
      },
    );
    return () => unsub();
  }, [isAdmin]);

  const confirmPurge = (d: BoardDoc) => {
    if (!window.confirm(`Permanently delete "${d.title}"? This can't be undone.`)) return;
    deleteBoardDoc(d).catch((e) => handleFirestoreError(e, OperationType.DELETE, 'board_docs'));
  };

  if (!isAdmin) {
    return (
      <PageContainer variant="reading" className="text-center py-16">
        <p className="text-on-surface-variant">Not available.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer variant="wide" className="space-y-6" id="coordination-trash">
      <div className="space-y-1">
        <Link
          to="/coordination"
          className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Coordination Notes
        </Link>
        <h1 className="text-2xl sm:text-3xl font-regular tracking-tight text-on-background">Trash</h1>
        <p className="text-sm text-on-surface-variant">Deleted pages, kept here until restored or removed for good.</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Trash2 className="w-10 h-10 text-on-surface-variant/40" />
          <p className="text-on-surface-variant">Trash is empty.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-4 p-4 rounded-2xl border border-outline-variant bg-surface-container"
            >
              <div className="flex flex-col items-center justify-center w-11 shrink-0 py-1.5 rounded-lg bg-surface-variant">
                <span className="text-[11px] font-semibold text-on-surface-variant">{weekdayShort(d.date)}</span>
                <span className="text-lg font-bold text-on-surface">{dayNum(d.date)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-on-surface truncate">{d.title}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <button
                  onClick={() => restoreBoardDoc(d).catch((e) => handleFirestoreError(e, OperationType.UPDATE, 'board_docs'))}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:opacity-80"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                </button>
                <button onClick={() => confirmPurge(d)} className="text-sm font-bold text-error hover:opacity-80">
                  Delete Forever
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
