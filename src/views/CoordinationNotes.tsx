// The Board — the team's shared coordination surface (doc-model rebuild, #24).
//
// A folder of dated Markdown PAGES — one running document per gathering, kept by
// date. Each page is a Google-Docs-style editor (TipTap) edited LIVE by the team:
// a Yjs CRDT carries concurrent edits + cursors over Firebase RTDB, while the
// markdown is persisted to Firestore (`board_docs`) as the durable, searchable
// record that powers the Pages list and the Notes & learnings archive. Admin-only.
// Re-derived from the design's `BoardFT` (docs/design/project/views/board.jsx).

import React, { useState, useEffect, useMemo, useRef, useReducer } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref as dbRef, remove as dbRemove } from 'firebase/database';
import { db, rtdb, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { cn, getUserInitials } from '../lib/utils';
import { Skeleton } from '../components/ui/Skeleton';
import {
  Plus,
  Search,
  X,
  Tag,
  ShieldAlert,
  Trash2,
  Feather,
  NotebookPen,
  Bold,
  Italic,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Heading1,
  Heading2,
  Type,
  Code2,
  Check,
  Clock,
  MapPin,
} from 'lucide-react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Collaboration } from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { RtdbYjsProvider } from '../lib/yjsRtdbProvider';
import {
  BoardDoc,
  BoardNote,
  NoteType,
  BOARD_SERIES,
  todayISO,
  weekdayOf,
  dateLabelOf,
  weekdayShort,
  dayNum,
  docGroup,
  DOC_GROUPS,
  DOC_STATUS,
  sessionStatus,
  docByDateDesc,
  newDocMarkdown,
} from '../lib/board';
import { mdPreview, mdOpenTasks } from '../lib/markdown';

// ── Team (contributor avatars + cursor identities) ────────────────────────────
interface TeamMember {
  uid: string;
  name: string;
  photoURL?: string;
  role?: string;
}

function Avatar({ member, size = 'sm' }: { member?: TeamMember; size?: 'xs' | 'sm' | 'md' }) {
  const dim = size === 'md' ? 'w-9 h-9 text-sm' : size === 'xs' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs';
  const name = member?.name || 'Unknown';
  const initials = member ? getUserInitials(name) : '–';
  if (member?.photoURL) {
    return <img src={member.photoURL} alt={name} className={cn(dim, 'rounded-full object-cover shrink-0')} />;
  }
  return (
    <div
      className={cn(
        dim,
        'rounded-full bg-primary-container text-on-primary-container font-semibold flex items-center justify-center shrink-0',
      )}
      title={name}
    >
      {initials}
    </div>
  );
}

const SectionHead = ({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) => (
  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
    <h2 className="font-serif text-2xl text-on-surface">{title}</h2>
    {sub && <span className="text-sm text-on-surface-variant">{sub}</span>}
    {action && <div className="ml-auto self-center">{action}</div>}
  </div>
);

// A stable, pleasant cursor/presence color per user.
const CURSOR_COLORS = ['#3a5a82', '#5d8071', '#c0823f', '#7d5a86', '#b5503f', '#5c6675'];
const colorFor = (uid: string) =>
  CURSOR_COLORS[Array.from(uid).reduce((a, c) => a + c.charCodeAt(0), 0) % CURSOR_COLORS.length];

// tiptap-markdown augments editor.storage with a `markdown` namespace.
type MarkdownStorage = { markdown: { getMarkdown: () => string } };
const editorMarkdown = (ed: Editor): string => (ed.storage as unknown as MarkdownStorage).markdown.getMarkdown();

const STATUS_CHIP: Record<string, string> = {
  accent: 'bg-stage-accent-soft text-stage-accent',
  teal: 'bg-tertiary/15 text-tertiary',
  '': 'bg-surface-variant text-on-surface-variant',
};

export default function CoordinationNotes() {
  const { isAdmin, user } = useAuth();
  const isMe = user?.email?.toLowerCase() === 'yilongwang05@gmail.com';
  const hasAccess = isAdmin || isMe;
  const uid = user?.uid || '';
  const meName = user?.displayName || user?.email || 'Someone';

  const [docs, setDocs] = useState<BoardDoc[]>([]);
  const [notes, setNotes] = useState<BoardNote[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);

  // notes archive controls
  const [q, setQ] = useState('');
  const [series, setSeries] = useState('All');
  const [kind, setKind] = useState<'All' | 'Records' | 'Learnings'>('All');
  const [showNoteForm, setShowNoteForm] = useState(false);

  const memberById = useMemo(() => {
    const m = new Map<string, TeamMember>();
    team.forEach((t) => m.set(t.uid, t));
    return m;
  }, [team]);

  // ── listeners ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasAccess) {
      setLoadingDocs(false);
      setLoadingNotes(false);
      return;
    }

    const unsubDocs = onSnapshot(
      query(collection(db, 'board_docs'), orderBy('date', 'desc')),
      (snap) => {
        setDocs(snap.docs.map((d) => ({ id: d.id, md: '', title: 'Untitled page', ...(d.data() as object) }) as BoardDoc));
        setLoadingDocs(false);
      },
      (err) => {
        setLoadingDocs(false);
        handleFirestoreError(err, OperationType.LIST, 'board_docs');
      },
    );

    const unsubNotes = onSnapshot(
      query(collection(db, 'board_notes'), orderBy('date', 'desc')),
      (snap) => {
        setNotes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as BoardNote));
        setLoadingNotes(false);
      },
      (err) => {
        setLoadingNotes(false);
        handleFirestoreError(err, OperationType.LIST, 'board_notes');
      },
    );

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setTeam(
          snap.docs
            .map((d) => {
              const data = d.data() as { displayName?: string; email?: string; photoURL?: string; role?: string; approved?: boolean };
              return {
                member: { uid: d.id, name: data.displayName || data.email || 'Teammate', photoURL: data.photoURL, role: data.role } as TeamMember,
                approved: data.approved,
              };
            })
            .filter((u) => u.approved !== false)
            .map((u) => u.member)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users'),
    );

    return () => {
      unsubDocs();
      unsubNotes();
      unsubUsers();
    };
  }, [hasAccess]);

  // keep a sensible page focused: today → soonest upcoming → most recent
  useEffect(() => {
    if (docs.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (activeId && docs.some((d) => d.id === activeId)) return;
    const desc = [...docs].sort(docByDateDesc);
    const today = desc.find((d) => sessionStatus(d.date) === 'today');
    const upcoming = [...desc].reverse().find((d) => sessionStatus(d.date) === 'upcoming');
    setActiveId((today || upcoming || desc[0]).id);
  }, [docs, activeId]);

  const grouped = useMemo(() => {
    const g: Record<string, BoardDoc[]> = { 'This week': [], Earlier: [] };
    [...docs].sort(docByDateDesc).forEach((d) => {
      (g[docGroup(d.date)] ||= []).push(d);
    });
    return g;
  }, [docs]);

  const active = docs.find((d) => d.id === activeId) || null;

  // ── mutations ──────────────────────────────────────────────────────────────
  const createDoc = async () => {
    try {
      const ref = doc(collection(db, 'board_docs'));
      const md = newDocMarkdown();
      await setDoc(ref, {
        date: todayISO(),
        title: 'Untitled page',
        md,
        facilitatorId: uid,
        createdAt: serverTimestamp(),
        createdBy: uid,
        createdByName: meName,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        updatedByName: meName,
      });
      logActivity({
        action: 'started a board page',
        targetId: ref.id,
        targetName: 'Untitled page',
        targetType: 'event',
        type: 'create',
        description: todayISO(),
      } as never);
      setActiveId(ref.id);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'board_docs');
    }
  };

  const saveMarkdown = async (id: string, md: string) => {
    try {
      await updateDoc(doc(db, 'board_docs', id), { md, updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: meName });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
    }
  };

  const saveTitle = async (id: string, title: string) => {
    try {
      await updateDoc(doc(db, 'board_docs', id), {
        title: title.trim() || 'Untitled page',
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        updatedByName: meName,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
    }
  };

  const deleteBoardDoc = async (d: BoardDoc) => {
    if (!window.confirm(`Delete "${d.title}"? This removes the page for everyone.`)) return;
    try {
      await deleteDoc(doc(db, 'board_docs', d.id));
      if (rtdb) {
        try {
          await dbRemove(dbRef(rtdb, `board_docs_rtdb/${d.id}`));
        } catch {
          /* live state cleanup is best-effort */
        }
      }
      if (activeId === d.id) setActiveId(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'board_docs');
    }
  };

  // ── notes ──────────────────────────────────────────────────────────────────
  const addNote = async (fields: { type: NoteType; series: string; title: string; body: string; tags: string[] }) => {
    try {
      const ref = doc(collection(db, 'board_notes'));
      await setDoc(ref, {
        type: fields.type,
        series: fields.series,
        title: fields.title.trim() || 'Untitled note',
        body: fields.body.trim(),
        date: todayISO(),
        contributorIds: [uid],
        tags: fields.tags,
        sessionId: active?.id || '',
        createdAt: serverTimestamp(),
        createdBy: uid,
        createdByName: meName,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        updatedByName: meName,
      });
      logActivity({
        action: fields.type === 'learning' ? 'recorded a learning' : 'saved a record',
        targetId: ref.id,
        targetName: fields.title || 'Note',
        targetType: 'comment',
        type: 'create',
        description: fields.series,
      } as never);
      setShowNoteForm(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'board_notes');
    }
  };

  const removeNote = async (n: BoardNote) => {
    if (!window.confirm(`Remove "${n.title}" from the archive?`)) return;
    try {
      await deleteDoc(doc(db, 'board_notes', n.id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'board_notes');
    }
  };

  const ql = q.trim().toLowerCase();
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (series !== 'All' && n.series !== series) return false;
      if (kind === 'Records' && n.type !== 'record') return false;
      if (kind === 'Learnings' && n.type !== 'learning') return false;
      if (ql) {
        const hay = `${n.title} ${n.body} ${n.series} ${(n.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [notes, series, kind, ql]);

  const seriesOptions = useMemo(() => {
    const set = new Set<string>(BOARD_SERIES);
    notes.forEach((n) => n.series && set.add(n.series));
    return ['All', ...Array.from(set)];
  }, [notes]);

  // ── access gate ──────────────────────────────────────────────────────────────
  if (!hasAccess) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center" id="coordination-notes-guard">
        <div className="bg-error-container/10 border border-error-container/30 rounded-3xl p-12 max-w-xl mx-auto my-12 flex flex-col items-center">
          <div className="w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="font-serif text-2xl mb-3 text-on-background">A space for the core team</h2>
          <p className="text-on-surface-variant leading-relaxed">
            The Board is where the full-time team thinks together. It's kept to administrators. If you think you should
            be here, ask an administrator to widen your access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-8" id="coordination-notes-panel">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="text-sm text-on-surface-variant mb-1">{weekdayOf(todayISO())}, {dateLabelOf(todayISO())}</div>
          <h1 className="font-serif text-3xl lg:text-4xl text-on-surface">The Board</h1>
          <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">
            One <b className="text-on-surface font-medium">page per gathering</b>, kept by date — what you talked
            through, who's carrying what, what you learned. Write it like a doc; nothing important should live in one
            person's inbox.
          </p>
        </div>
        <button
          onClick={createDoc}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shrink-0"
        >
          <Plus className="w-4 h-4" /> New page
        </button>
      </header>

      {/* Documents workspace */}
      <section>
        {loadingDocs ? (
          <Skeleton className="h-[560px] w-full rounded-2xl" />
        ) : docs.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-dashed border-outline-variant p-10 sm:p-14 text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-stage-accent-soft text-stage-accent flex items-center justify-center mb-4">
              <NotebookPen className="w-7 h-7" />
            </div>
            <h3 className="font-serif text-xl text-on-surface mb-1">No pages yet</h3>
            <p className="text-sm text-on-surface-variant max-w-sm mb-5">
              Start this week's first page — give it a title and begin writing. The team can edit it live, together.
            </p>
            <button
              onClick={createDoc}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" /> Start a page
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[300px_1fr] bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden min-h-[560px]">
            {/* Pages list */}
            <aside className="flex flex-col min-w-0 bg-surface-container-low lg:border-r border-b lg:border-b-0 border-outline-variant">
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <span className="font-serif text-[17px] text-on-surface">Pages</span>
                <button
                  onClick={createDoc}
                  title="New page"
                  className="w-7 h-7 grid place-items-center rounded-lg bg-surface border border-outline text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 pb-3 lg:block flex gap-2 lg:gap-0 overflow-x-auto">
                {DOC_GROUPS.map((g) => {
                  const items = grouped[g] || [];
                  if (!items.length) return null;
                  return (
                    <div key={g} className="lg:mt-1.5 shrink-0 lg:shrink">
                      <div className="hidden lg:block text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant/70 px-2 pt-3 pb-1.5">
                        {g}
                      </div>
                      <div className="flex lg:block gap-2 lg:gap-0">
                        {items.map((d) => (
                          <DocRow key={d.id} d={d} active={d.id === activeId} onClick={() => setActiveId(d.id)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Open page */}
            {active ? (
              <DocEditor
                key={active.id}
                doc={active}
                meUid={uid}
                meName={meName}
                onSaveMarkdown={saveMarkdown}
                onSaveTitle={saveTitle}
                onDelete={deleteBoardDoc}
              />
            ) : (
              <div className="grid place-items-center text-sm text-on-surface-variant p-10">Select a page.</div>
            )}
          </div>
        )}
      </section>

      {/* Notes & learnings */}
      <section>
        <SectionHead
          title="Notes & learnings"
          sub="Every page becomes a record — running it again? Find last time's notes."
          action={
            <button
              onClick={() => setShowNoteForm((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-stage-accent transition-colors"
            >
              <NotebookPen className="w-4 h-4" /> Add a note
            </button>
          }
        />

        {showNoteForm && <NoteForm seriesOptions={BOARD_SERIES} onCancel={() => setShowNoteForm(false)} onSave={addNote} />}

        {/* controls */}
        <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search notes — e.g. “Friday gathering”, “retreat”, “welcome”…"
              className="w-full bg-surface border border-outline-variant rounded-xl pl-10 pr-9 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex bg-surface-container-low border border-outline-variant rounded-xl p-1">
            {(['All', 'Records', 'Learnings'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  kind === k ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {/* series chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {seriesOptions.map((s) => (
            <button
              key={s}
              onClick={() => setSeries(s)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                series === s
                  ? 'bg-stage-accent border-stage-accent text-white'
                  : 'bg-surface border-outline-variant text-on-surface-variant hover:border-stage-accent/40 hover:text-on-surface',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* note cards */}
        {loadingNotes ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="border border-dashed border-outline-variant rounded-2xl p-8 text-center text-sm text-on-surface-variant italic">
            {notes.length === 0
              ? 'No notes yet — wrap a page and save what you learned.'
              : 'No notes match that yet — try a different word or series.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredNotes.map((n) => (
              <NoteCard key={n.id} n={n} memberById={memberById} onRemove={removeNote} />
            ))}
          </div>
        )}
      </section>

      <p className="text-center text-sm text-on-surface-variant/70 pt-2 flex items-center justify-center gap-2">
        <Feather className="w-3.5 h-3.5" /> A shared place to think together — so the team stays one mind.
      </p>
    </div>
  );
}

// ── Pages list row ────────────────────────────────────────────────────────────
function DocRow({ d, active, onClick }: { d: BoardDoc; active: boolean; onClick: () => void }) {
  const open = mdOpenTasks(d.md);
  const isToday = sessionStatus(d.date) === 'today';
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-[232px] lg:w-full grid grid-cols-[42px_1fr] gap-3 items-start text-left p-2.5 rounded-[10px] border transition-colors mt-0 lg:mt-0.5 shrink-0',
        active ? 'bg-stage-accent-soft border-stage-accent/40' : 'border-transparent hover:bg-surface',
      )}
    >
      <span className="flex flex-col items-center pt-0.5">
        <span className={cn('text-[10.5px] font-bold tracking-wider uppercase', active ? 'text-stage-accent' : 'text-on-surface-variant/70')}>
          {weekdayShort(d.date)}
        </span>
        <span className={cn('font-serif text-[22px] leading-none', active || isToday ? 'text-stage-accent' : 'text-on-surface-variant')}>
          {dayNum(d.date)}
        </span>
      </span>
      <span className="min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-on-surface leading-snug truncate">{d.title}</span>
        <span className="text-[12.5px] text-on-surface-variant/70 leading-snug line-clamp-2">{mdPreview(d.md)}</span>
        <span className="flex items-center gap-2 mt-1">
          {isToday && (
            <span className="text-[10.5px] font-bold tracking-wide uppercase text-stage-accent bg-stage-accent-soft rounded-full px-2 py-px">
              Today
            </span>
          )}
          {open > 0 && (
            <span className="text-[11.5px] text-on-surface-variant/80 bg-surface-variant border border-outline-variant rounded-full px-2 py-px">
              {open} to do
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

// ── The live document editor ──────────────────────────────────────────────────
function DocEditor({
  doc: d,
  meUid,
  meName,
  onSaveMarkdown,
  onSaveTitle,
  onDelete,
}: {
  doc: BoardDoc;
  meUid: string;
  meName: string;
  onSaveMarkdown: (id: string, md: string) => void;
  onSaveTitle: (id: string, title: string) => void;
  onDelete: (d: BoardDoc) => void;
}) {
  // This component is remounted (key={doc.id}) per page, so a fresh Y.Doc +
  // awareness live for exactly one page's lifetime.
  const ydoc = useMemo(() => new Y.Doc(), []);
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);
  const meColor = useMemo(() => colorFor(meUid), [meUid]);

  const [, force] = useReducer((x) => x + 1, 0);
  const [saved, setSaved] = useState(true);
  const [live, setLive] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [peers, setPeers] = useState<{ id: number; name: string; color: string }[]>([]);
  const [title, setTitle] = useState(d.title);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didSeed = useRef(false);

  const scheduleSave = (md: string) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onSaveMarkdown(d.id, md);
      setSaved(true);
    }, 1200);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }), // Yjs owns history
      Markdown.configure({ html: false, tightLists: true, linkify: true, transformPastedText: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Write the page — a heading, some notes, a checklist…' }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({ provider: { awareness }, user: { name: meName, color: meColor } }),
    ],
    editorProps: { attributes: { class: 'bdoc-prose', spellcheck: 'false' } },
    onUpdate: ({ editor, transaction }) => {
      if (!transaction.docChanged) return;
      scheduleSave(editorMarkdown(editor));
    },
  });

  // toolbar reactivity
  useEffect(() => {
    if (!editor) return;
    const f = () => force();
    editor.on('transaction', f);
    return () => {
      editor.off('transaction', f);
    };
  }, [editor]);

  // presence
  useEffect(() => {
    const update = () => {
      const out: { id: number; name: string; color: string }[] = [];
      awareness.getStates().forEach((s: { user?: { name?: string; color?: string } }, id: number) => {
        if (id === awareness.clientID) return;
        out.push({ id, name: s.user?.name || 'Someone', color: s.user?.color || '#888' });
      });
      setPeers(out);
    };
    awareness.on('change', update);
    update();
    return () => awareness.off('change', update);
  }, [awareness]);

  // realtime provider + first-open seeding (falls back to Firestore-only)
  useEffect(() => {
    if (!editor) return;
    const seedFromMd = () => {
      if (editor.isEmpty && d.md) editor.commands.setContent(d.md);
    };
    if (!rtdb) {
      seedFromMd();
      setLive(false);
      return;
    }
    const provider = new RtdbYjsProvider(rtdb, d.id, ydoc, {
      awareness,
      onSynced: async (degraded) => {
        if (degraded) {
          // RTDB unreachable (e.g. rules/permission denied) — show the Firestore copy
          // and edit single-user instead of leaving the pane blank.
          seedFromMd();
          setLive(false);
          return;
        }
        setLive(true);
        if (didSeed.current) return;
        didSeed.current = true;
        const mine = await provider.claimSeed();
        if (mine) seedFromMd();
      },
    });
    return () => {
      provider.destroy();
    };
  }, [editor]);

  // tear down the Y.Doc when leaving the page
  useEffect(() => () => ydoc.destroy(), [ydoc]);

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => onSaveTitle(d.id, v), 800);
  };

  const status = sessionStatus(d.date);
  const st = DOC_STATUS[status];

  const ToolBtn = ({
    onClick,
    on,
    title: t,
    children,
  }: {
    onClick: () => void;
    on?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={t}
      aria-label={t}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'h-[30px] min-w-[30px] px-1.5 rounded-md inline-flex items-center justify-center transition-colors',
        on ? 'bg-stage-accent-soft text-stage-accent' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface',
      )}
    >
      {children}
    </button>
  );

  const chain = () => editor!.chain().focus();

  return (
    <div className="flex flex-col min-w-0 bg-surface">
      {/* head */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 lg:px-8 pt-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          {st && (
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', STATUS_CHIP[st.tone] || STATUS_CHIP[''])}>
              {st.label}
            </span>
          )}
          <span className="text-[13px] text-on-surface-variant font-medium">
            {weekdayOf(d.date)}, {dateLabelOf(d.date)}
            {d.time ? ` · ${d.time}` : ''}
          </span>
          {d.place && (
            <span className="inline-flex items-center gap-1 text-[13px] text-on-surface-variant/70">
              <MapPin className="w-3.5 h-3.5" /> {d.place}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {peers.length > 0 && (
            <div className="flex -space-x-1.5" title={`${peers.length} other${peers.length === 1 ? '' : 's'} editing`}>
              {peers.slice(0, 4).map((p) => (
                <span
                  key={p.id}
                  className="w-6 h-6 rounded-full ring-2 ring-surface text-white text-[10px] font-semibold grid place-items-center"
                  style={{ background: p.color }}
                  title={p.name}
                >
                  {getUserInitials(p.name)}
                </span>
              ))}
            </div>
          )}
          {rtdb && (
            <span
              className={cn('inline-flex items-center gap-1.5 text-xs', live ? 'text-tertiary' : 'text-on-surface-variant/60')}
              title={live ? 'Live — edits sync as you type' : 'Connecting…'}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', live ? 'bg-tertiary' : 'bg-on-surface-variant/40')} /> Live
            </span>
          )}
          <button
            onClick={() => onDelete(d)}
            title="Delete this page"
            className="p-1.5 rounded-lg text-on-surface-variant/60 hover:text-error hover:bg-error-container/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* title */}
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Untitled page"
        spellCheck={false}
        className="w-full bg-transparent border-0 outline-none font-serif text-[30px] font-medium tracking-tight text-on-surface leading-tight px-5 lg:px-8 pt-3 pb-2 placeholder:text-on-surface-variant/50"
      />

      {/* toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-1 flex-wrap bg-surface border-y border-outline-variant px-4 lg:px-6 py-1.5 mx-1.5">
        {editor && (
          <>
            <div className="flex items-center gap-0.5">
              <ToolBtn title="Title" on={editor.isActive('heading', { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
                <Heading1 className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title="Heading" on={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
                <Heading2 className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title="Body" on={editor.isActive('paragraph')} onClick={() => chain().setParagraph().run()}>
                <Type className="w-4 h-4" />
              </ToolBtn>
            </div>
            <span className="w-px h-5 bg-outline-variant mx-1.5" />
            <div className="flex items-center gap-0.5">
              <ToolBtn title="Bold" on={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}>
                <Bold className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title="Italic" on={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}>
                <Italic className="w-4 h-4" />
              </ToolBtn>
            </div>
            <span className="w-px h-5 bg-outline-variant mx-1.5" />
            <div className="flex items-center gap-0.5">
              <ToolBtn title="Bulleted list" on={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}>
                <List className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title="Numbered list" on={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}>
                <ListOrdered className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title="Checklist" on={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()}>
                <ListChecks className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title="Quote" on={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}>
                <Quote className="w-4 h-4" />
              </ToolBtn>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1 text-xs whitespace-nowrap', saved ? 'text-tertiary' : 'text-on-surface-variant/70')}>
            {saved ? (
              <>
                <Check className="w-3 h-3" /> Saved
              </>
            ) : (
              'Saving…'
            )}
          </span>
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            title="View Markdown source"
            className={cn(
              'inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-lg px-2.5 py-1 border transition-colors',
              showSource
                ? 'bg-stage-accent-soft border-stage-accent/40 text-stage-accent'
                : 'bg-surface-variant border-outline-variant text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent',
            )}
          >
            <Code2 className="w-3.5 h-3.5" /> Markdown
          </button>
        </div>
      </div>

      {/* canvas */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {showSource ? (
          <textarea
            readOnly
            value={editor ? editorMarkdown(editor) : ''}
            spellCheck={false}
            className="block w-full max-w-[760px] mx-auto px-5 lg:px-8 py-7 min-h-[420px] bg-surface border-0 outline-none resize-none font-code text-[13.5px] leading-[1.7] text-on-surface-variant whitespace-pre-wrap"
            title="Markdown source is read-only while live editing is on"
          />
        ) : (
          <EditorContent editor={editor as Editor} />
        )}
      </div>
    </div>
  );
}

// ── Note card (records + learnings archive) ──────────────────────────────────
function NoteCard({
  n,
  memberById,
  onRemove,
}: {
  n: BoardNote;
  memberById: Map<string, TeamMember>;
  onRemove: (n: BoardNote) => void;
}) {
  const isLearning = n.type === 'learning';
  const ageDays = Math.round((Date.now() - new Date(n.date).getTime()) / 86400000);
  const oldRecall = ageDays > 300;
  return (
    <article
      className={cn(
        'group bg-surface rounded-2xl border p-5 flex flex-col',
        isLearning ? 'border-stage-amber/30' : 'border-outline-variant',
      )}
    >
      <div className="flex items-center gap-2.5 mb-2.5 text-xs">
        <span
          className={cn(
            'px-2 py-0.5 rounded-full font-medium',
            isLearning ? 'bg-stage-amber-soft text-stage-amber' : 'bg-stage-accent-soft text-stage-accent',
          )}
        >
          {isLearning ? 'Learning' : 'Record'}
        </span>
        <span className="inline-flex items-center gap-1 text-on-surface-variant">
          <Tag className="w-3 h-3" /> {n.series}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-on-surface-variant/70 whitespace-nowrap">
          {oldRecall && (
            <span className="px-1.5 py-px rounded-full bg-stage-amber-soft text-stage-amber font-semibold text-[10.5px]">1 yr</span>
          )}
          {dateLabelOf(n.date)}
        </span>
        <button
          onClick={() => onRemove(n)}
          className="p-0.5 text-on-surface-variant/0 group-hover:text-on-surface-variant/50 hover:!text-error transition-colors"
          title="Remove from archive"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <h4 className="font-serif text-lg text-on-surface leading-snug mb-2">{n.title}</h4>
      {n.body && <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-4 mb-3.5">{n.body}</p>}
      <div className="flex items-center gap-3 mt-auto">
        <div className="flex -space-x-2">
          {(n.contributorIds || []).slice(0, 4).map((id) => (
            <div key={id} className="ring-2 ring-surface rounded-full">
              <Avatar member={memberById.get(id)} size="xs" />
            </div>
          ))}
        </div>
        {(n.tags || []).length > 0 && (
          <span className="text-[11.5px] text-on-surface-variant/70 truncate ml-auto text-right">
            {(n.tags || []).map((t) => `#${t}`).join(' ')}
          </span>
        )}
      </div>
    </article>
  );
}

// ── Add-note form ─────────────────────────────────────────────────────────────
function NoteForm({
  seriesOptions,
  onCancel,
  onSave,
}: {
  seriesOptions: string[];
  onCancel: () => void;
  onSave: (f: { type: NoteType; series: string; title: string; body: string; tags: string[] }) => void;
}) {
  const [type, setType] = useState<NoteType>('record');
  const [series, setSeries] = useState(seriesOptions[0] || 'Team');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');

  const parseTags = (s: string) =>
    Array.from(new Set(s.split(/[,\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean)));

  const field =
    'w-full bg-surface border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors';

  return (
    <div className="mb-4 p-4 rounded-2xl bg-surface border border-outline-variant space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex bg-surface-container-low border border-outline-variant rounded-xl p-1">
          {(['record', 'learning'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setType(k)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                type === k ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <select
          value={series}
          onChange={(e) => setSeries(e.target.value)}
          className="bg-surface border border-outline-variant rounded-xl px-2.5 py-2 text-sm text-on-surface-variant focus:outline-none focus:border-stage-accent"
        >
          {seriesOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A short title — what this was about" className={field} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="What happened, or what you learned…"
        className={cn(field, 'resize-y leading-relaxed')}
      />
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags — welcome, retreat, follow-up" className={field} />
      <div className="flex gap-2.5 justify-end">
        <button
          onClick={onCancel}
          className="px-3.5 py-2 border border-outline-variant text-on-surface-variant text-sm font-medium rounded-xl hover:bg-surface-container transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ type, series, title, body, tags: parseTags(tags) })}
          disabled={!title.trim()}
          className="px-3.5 py-2 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-all"
        >
          Save to archive
        </button>
      </div>
    </div>
  );
}
