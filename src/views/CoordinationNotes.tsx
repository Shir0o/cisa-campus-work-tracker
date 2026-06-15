// The Board — the team's shared coordination surface (Field Notes overhaul, #24).
//
// A weekly rhythm of coordination SESSIONS, each with a running AGENDA (items to
// talk through, with delegated sub-steps, carried forward if not covered) and a
// standalone TASK list. Discussion becomes NOTES that live on as a record or a
// learning, findable by event series. Admin-only. Re-derived from the design's
// `BoardFT` (docs/design/project/views/board.jsx) onto Firestore.

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { cn, getUserInitials } from '../lib/utils';
import { Skeleton } from '../components/ui/Skeleton';
import {
  Plus,
  Check,
  ArrowRight,
  Search,
  X,
  Tag,
  ShieldAlert,
  CalendarDays,
  Clock,
  MapPin,
  Users,
  Feather,
  NotebookPen,
  Trash2,
} from 'lucide-react';
import {
  BoardSession,
  BoardNote,
  AgendaItem,
  BoardCategory,
  NoteType,
  CATEGORY_META,
  CATEGORY_ORDER,
  CHIP_TONE,
  BOARD_SERIES,
  newId,
  sessionStatus,
  STATUS_LABEL,
  weekdayOf,
  dateLabelOf,
  todayISO,
  byDateAsc,
} from '../lib/board';

// ── Team (assignees) ─────────────────────────────────────────────────────────
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

function CatChip({ cat }: { cat: BoardCategory }) {
  const meta = CATEGORY_META[cat];
  const tone = CHIP_TONE[meta.tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', tone.bg, tone.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', tone.dot)} />
      {meta.label}
    </span>
  );
}

// Small teammate picker — anchored under whatever opens it.
function AssigneePicker({
  team,
  current,
  onPick,
  onClose,
}: {
  team: TeamMember[];
  current?: string;
  onPick: (uid: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-surface-container-high border border-outline-variant rounded-2xl shadow-xl p-1.5">
        <div className="px-2.5 py-1.5 text-xs text-on-surface-variant">Hand this to…</div>
        {team.length === 0 && <div className="px-2.5 py-2 text-xs text-on-surface-variant/70">No teammates yet.</div>}
        {team.map((u) => (
          <button
            key={u.uid}
            onClick={() => onPick(u.uid)}
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors',
              u.uid === current ? 'bg-stage-accent-soft' : 'hover:bg-surface-container-highest',
            )}
          >
            <Avatar member={u} size="sm" />
            <span className="text-sm text-on-surface truncate flex-1">{u.name}</span>
            {u.uid === current && <Check className="w-3.5 h-3.5 text-stage-accent shrink-0" />}
          </button>
        ))}
      </div>
    </>
  );
}

// Checkbox button shared by agenda items, sub-steps and tasks.
function CheckButton({
  on,
  onClick,
  size = 'md',
  title,
}: {
  on: boolean;
  onClick: () => void;
  size?: 'sm' | 'md';
  title?: string;
}) {
  const dim = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        dim,
        'shrink-0 rounded-md border flex items-center justify-center transition-colors',
        on ? 'bg-tertiary border-tertiary text-on-tertiary' : 'bg-surface border-outline hover:border-tertiary',
      )}
    >
      {on && <Check className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} strokeWidth={3} />}
    </button>
  );
}

export default function CoordinationNotes() {
  const { isAdmin, user } = useAuth();
  const isMe = user?.email?.toLowerCase() === 'yilongwang05@gmail.com';
  const hasAccess = isAdmin || isMe;
  const uid = user?.uid || '';
  const meName = user?.displayName || user?.email || 'Someone';

  const [sessions, setSessions] = useState<BoardSession[]>([]);
  const [notes, setNotes] = useState<BoardNote[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);

  const [focusId, setFocusId] = useState<string | null>(null);

  // agenda composer
  const [draft, setDraft] = useState('');
  const [draftCat, setDraftCat] = useState<BoardCategory>('care');
  const [targetId, setTargetId] = useState<string>('');

  // sub-step composer (which agenda item is taking a new step)
  const [subFor, setSubFor] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState('');

  // task add + assignee picker
  const [adding, setAdding] = useState(false);
  const [taskDraft, setTaskDraft] = useState('');
  const [taskWho, setTaskWho] = useState('');
  const [pickFor, setPickFor] = useState<string | null>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);

  // new session
  const [showNewSession, setShowNewSession] = useState(false);

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

  const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: meName });

  // ── listeners ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasAccess) {
      setLoadingSessions(false);
      setLoadingNotes(false);
      return;
    }

    const unsubSessions = onSnapshot(
      query(collection(db, 'board_sessions'), orderBy('date', 'asc')),
      (snap) => {
        setSessions(
          snap.docs.map((d) => ({ id: d.id, agenda: [], assigned: [], ...(d.data() as object) }) as BoardSession),
        );
        setLoadingSessions(false);
      },
      (err) => {
        setLoadingSessions(false);
        handleFirestoreError(err, OperationType.LIST, 'board_sessions');
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

    // team members for the assignee picker (admins can read the users directory)
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setTeam(
          snap.docs
            .map((d) => {
              const data = d.data() as { displayName?: string; email?: string; photoURL?: string; role?: string; approved?: boolean };
              return {
                member: {
                  uid: d.id,
                  name: data.displayName || data.email || 'Teammate',
                  photoURL: data.photoURL,
                  role: data.role,
                } as TeamMember,
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
      unsubSessions();
      unsubNotes();
      unsubUsers();
    };
  }, [hasAccess]);

  // keep a sensible session focused
  useEffect(() => {
    if (sessions.length === 0) {
      if (focusId !== null) setFocusId(null);
      return;
    }
    if (focusId && sessions.some((s) => s.id === focusId)) return;
    const ordered = [...sessions].sort(byDateAsc);
    const today = ordered.find((s) => sessionStatus(s.date) === 'today');
    const upcoming = ordered.find((s) => sessionStatus(s.date) === 'upcoming');
    setFocusId((today || upcoming || ordered[ordered.length - 1]).id);
  }, [sessions, focusId]);

  const orderedSessions = useMemo(() => [...sessions].sort(byDateAsc), [sessions]);
  const focus = useMemo(() => sessions.find((s) => s.id === focusId) || null, [sessions, focusId]);
  const focusStatus = focus ? sessionStatus(focus.date) : 'upcoming';
  const focusLocked = focusStatus === 'done';
  const futureSessions = orderedSessions.filter((s) => sessionStatus(s.date) !== 'done');

  // keep the agenda composer's target valid
  useEffect(() => {
    if (!focus) return;
    if (!futureSessions.some((s) => s.id === targetId)) {
      setTargetId(focus && sessionStatus(focus.date) !== 'done' ? focus.id : futureSessions[0]?.id || '');
    }
  }, [focus, futureSessions, targetId]);

  // ── mutations ──────────────────────────────────────────────────────────────
  const patchSession = async (sid: string, fields: Partial<BoardSession>) => {
    try {
      await updateDoc(doc(db, 'board_sessions', sid), { ...fields, ...stamp() });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_sessions');
    }
  };
  const patchAgenda = (sid: string, agenda: AgendaItem[]) => patchSession(sid, { agenda });
  const patchTasks = (sid: string, assigned: BoardSession['assigned']) => patchSession(sid, { assigned });

  const createSession = async (fields: {
    event: string;
    date: string;
    time: string;
    place: string;
    facilitatorId: string;
  }) => {
    try {
      const ref = doc(collection(db, 'board_sessions'));
      await setDoc(ref, {
        event: fields.event.trim() || 'Coordination session',
        date: fields.date || todayISO(),
        time: fields.time.trim(),
        place: fields.place.trim(),
        facilitatorId: fields.facilitatorId || uid,
        agenda: [],
        assigned: [],
        createdAt: serverTimestamp(),
        createdBy: uid,
        createdByName: meName,
        ...stamp(),
      });
      logActivity({
        action: 'opened a coordination session',
        targetId: ref.id,
        targetName: fields.event || 'Coordination session',
        targetType: 'event',
        type: 'create',
        description: `${fields.event} · ${fields.date}`,
      } as never);
      setShowNewSession(false);
      setFocusId(ref.id);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'board_sessions');
    }
  };

  const removeSession = async (s: BoardSession) => {
    if (!window.confirm(`Remove the ${weekdayOf(s.date)} session "${s.event}"? This can't be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'board_sessions', s.id));
      if (focusId === s.id) setFocusId(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'board_sessions');
    }
  };

  // agenda
  const toggleCovered = (item: AgendaItem) => {
    if (!focus) return;
    const agenda = focus.agenda.map((a) =>
      a.id === item.id ? { ...a, status: (a.status === 'covered' ? 'open' : 'covered') as AgendaItem['status'] } : a,
    );
    patchAgenda(focus.id, agenda);
  };

  const addAgendaItem = () => {
    const text = draft.trim();
    if (!text) return;
    const tgt = sessions.find((s) => s.id === targetId) || focus;
    if (!tgt) return;
    const item: AgendaItem = { id: newId('a-'), text, cat: draftCat, raisedById: uid, status: 'open', actions: [] };
    patchAgenda(tgt.id, [...tgt.agenda, item]);
    setDraft('');
  };

  const addSubStep = (itemId: string) => {
    if (!focus) return;
    const text = subDraft.trim();
    if (!text) return;
    const agenda = focus.agenda.map((a) =>
      a.id === itemId ? { ...a, actions: [...a.actions, { id: newId('g-'), text, who: uid, done: false }] } : a,
    );
    patchAgenda(focus.id, agenda);
    setSubDraft('');
  };

  const toggleAction = (itemId: string, actId: string) => {
    if (!focus) return;
    const agenda = focus.agenda.map((a) =>
      a.id === itemId ? { ...a, actions: a.actions.map((g) => (g.id === actId ? { ...g, done: !g.done } : g)) } : a,
    );
    patchAgenda(focus.id, agenda);
  };

  const pushItem = async (item: AgendaItem) => {
    if (!focus) return;
    const idx = orderedSessions.findIndex((s) => s.id === focus.id);
    const next = orderedSessions.slice(idx + 1).find((s) => sessionStatus(s.date) !== 'done');
    if (!next) {
      window.alert('No later session to push to — open a new session first.');
      return;
    }
    try {
      const batch = writeBatch(db);
      const curAgenda = focus.agenda.map((a) =>
        a.id === item.id ? { ...a, status: 'pushed' as const, pushedTo: weekdayOf(next.date) } : a,
      );
      // carry a fresh copy forward (drop the original's pushedTo to avoid undefined fields)
      const { pushedTo: _drop, ...rest } = item;
      const carried: AgendaItem = { ...rest, id: newId('a-'), status: 'open', carriedFrom: weekdayOf(focus.date) };
      batch.update(doc(db, 'board_sessions', focus.id), { agenda: curAgenda, ...stamp() });
      batch.update(doc(db, 'board_sessions', next.id), { agenda: [carried, ...next.agenda], ...stamp() });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_sessions');
    }
  };

  // tasks
  const addTask = () => {
    if (!focus) return;
    const text = taskDraft.trim();
    if (!text) return;
    const assigned = [...(focus.assigned || []), { id: newId('t-'), text, who: taskWho || uid, done: false }];
    patchTasks(focus.id, assigned);
    setTaskDraft('');
    setAdding(false);
    setPickFor(null);
  };

  const toggleTask = (taskId: string) => {
    if (!focus) return;
    const assigned = (focus.assigned || []).map((g) => (g.id === taskId ? { ...g, done: !g.done } : g));
    patchTasks(focus.id, assigned);
  };

  const reassignTask = (taskId: string, who: string) => {
    if (!focus) return;
    const assigned = (focus.assigned || []).map((g) => (g.id === taskId ? { ...g, who } : g));
    patchTasks(focus.id, assigned);
    setPickFor(null);
  };

  const removeTask = (taskId: string) => {
    if (!focus) return;
    patchTasks(focus.id, (focus.assigned || []).filter((g) => g.id !== taskId));
  };

  // send an agenda item over to the Tasks panel — pick who carries it there
  const sendToTasks = (item: AgendaItem) => {
    setTaskDraft(item.text);
    setTaskWho(item.raisedById || uid);
    setAdding(true);
    setPickFor(null);
    setTimeout(() => taskInputRef.current?.focus(), 40);
  };

  // notes
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
        sessionId: focus?.id || '',
        createdAt: serverTimestamp(),
        createdBy: uid,
        createdByName: meName,
        ...stamp(),
      });
      logActivity({
        action: fields.type === 'learning' ? 'recorded a learning' : 'saved a session record',
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

  // ── notes filtering ────────────────────────────────────────────────────────
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

  // ── access gate ─────────────────────────────────────────────────────────────
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

  const openAgendaCount = focus ? focus.agenda.filter((a) => a.status === 'open').length : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-8" id="coordination-notes-panel">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="text-sm text-on-surface-variant mb-1">The team · this week</div>
          <h1 className="font-serif text-3xl lg:text-4xl text-on-surface">The Board</h1>
          <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">
            Where the team thinks together — every coordination session, what's been <b className="text-on-surface font-medium">assigned</b>, and
            everything you've <b className="text-on-surface font-medium">learned</b>. Nothing important should live in one person's inbox.
          </p>
        </div>
        <button
          onClick={() => setShowNewSession(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shrink-0"
        >
          <Plus className="w-4 h-4" /> New session
        </button>
      </header>

      {/* Week switcher */}
      {loadingSessions ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
      ) : sessions.length === 0 ? null : (
        <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="This week's sessions">
          {orderedSessions.map((s) => {
            const st = sessionStatus(s.date);
            const n = s.agenda.filter((a) => a.status !== 'pushed').length;
            const active = s.id === focusId;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={active}
                onClick={() => setFocusId(s.id)}
                className={cn(
                  'shrink-0 w-36 text-left px-3.5 py-3 rounded-2xl border transition-all',
                  active
                    ? 'bg-surface border-stage-accent ring-1 ring-stage-accent/30 shadow-sm'
                    : 'bg-surface/60 border-outline-variant hover:border-outline hover:bg-surface',
                )}
              >
                <div className="flex items-center gap-1.5 mb-1.5 h-4">
                  {st === 'today' ? (
                    <span className="text-[11px] font-medium text-stage-accent">Today</span>
                  ) : st === 'done' ? (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-tertiary/15 text-tertiary">
                      <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-outline" />
                  )}
                </div>
                <div className="font-serif text-lg text-on-surface leading-tight">{weekdayOf(s.date)}</div>
                <div className="text-xs text-on-surface-variant">{dateLabelOf(s.date)}</div>
                <div className="text-xs text-on-surface-variant/80 mt-1">
                  {n} item{n === 1 ? '' : 's'}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Focused session */}
      {!loadingSessions && sessions.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-dashed border-outline-variant p-10 sm:p-14 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-stage-accent-soft text-stage-accent flex items-center justify-center mb-4">
            <CalendarDays className="w-7 h-7" />
          </div>
          <h3 className="font-serif text-xl text-on-surface mb-1">No sessions yet</h3>
          <p className="text-sm text-on-surface-variant max-w-sm mb-5">
            Start this week's first coordination session — give it a name, a time and a place, and the team can begin
            adding to the agenda.
          </p>
          <button
            onClick={() => setShowNewSession(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" /> Start a session
          </button>
        </div>
      ) : focus ? (
        <section className="bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
          {/* session head */}
          <div className="flex items-start gap-4 p-5 sm:p-6 border-b border-outline-variant/60">
            <div className="text-center shrink-0 w-14">
              <div className="font-serif text-lg text-on-surface leading-tight">{weekdayOf(focus.date)}</div>
              <div className="text-xs text-on-surface-variant">{dateLabelOf(focus.date)}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-on-surface">{focus.event}</div>
              <div className="text-sm text-on-surface-variant flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                {focus.time && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {focus.time}
                  </span>
                )}
                {focus.place && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {focus.place}
                  </span>
                )}
                {focus.facilitatorId && memberById.get(focus.facilitatorId) && (
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar member={memberById.get(focus.facilitatorId)} size="xs" />
                    {memberById.get(focus.facilitatorId)?.name.split(' ')[0]} leads
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                  focusStatus === 'today'
                    ? 'bg-stage-accent-soft text-stage-accent'
                    : focusStatus === 'done'
                      ? 'bg-tertiary/15 text-tertiary'
                      : 'bg-surface-variant text-on-surface-variant',
                )}
              >
                {STATUS_LABEL[focusStatus]}
              </span>
              <button
                onClick={() => removeSession(focus)}
                title="Remove this session"
                className="p-1.5 rounded-lg text-on-surface-variant/60 hover:text-error hover:bg-error-container/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
            {/* Agenda */}
            <div className="lg:col-span-2 p-5 sm:p-6 lg:border-r border-outline-variant/60">
              <div className="flex items-baseline gap-2 mb-4">
                <h3 className="font-serif text-xl text-on-surface">Agenda</h3>
                <span className="text-sm text-on-surface-variant">{openAgendaCount} to talk through</span>
              </div>

              <div className="space-y-2.5">
                {focus.agenda.filter((a) => a.status !== 'pushed').length === 0 && (
                  <p className="text-sm text-on-surface-variant/70 py-2">Nothing on the agenda yet.</p>
                )}
                {focus.agenda
                  .filter((a) => a.status !== 'pushed')
                  .map((a) => {
                    const covered = a.status === 'covered';
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          'rounded-2xl border p-3.5 transition-colors',
                          covered ? 'bg-surface/40 border-outline-variant/50' : 'bg-surface border-outline-variant',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <CheckButton on={covered} onClick={() => toggleCovered(a)} title={covered ? 'Covered' : 'Mark covered'} />
                          <div className="flex-1 min-w-0">
                            <div className={cn('text-sm text-on-surface', covered && 'line-through text-on-surface-variant')}>
                              {a.text}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5">
                              {a.carriedFrom && (
                                <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant/80">
                                  <ArrowRight className="w-3 h-3" /> carried from {a.carriedFrom}
                                </span>
                              )}
                              <CatChip cat={a.cat} />
                              {memberById.get(a.raisedById) && (
                                <span className="text-xs text-on-surface-variant/80">
                                  {memberById.get(a.raisedById)?.name.split(' ')[0]} raised this
                                </span>
                              )}
                            </div>

                            {/* sub-steps */}
                            {(a.actions.length > 0 || subFor === a.id) && (
                              <div className="mt-2.5 space-y-1.5 pl-0.5">
                                {a.actions.map((g) => (
                                  <div key={g.id} className="flex items-center gap-2">
                                    <CheckButton on={g.done} size="sm" onClick={() => toggleAction(a.id, g.id)} />
                                    <span
                                      onClick={() => toggleAction(a.id, g.id)}
                                      className={cn(
                                        'text-sm cursor-pointer',
                                        g.done ? 'line-through text-on-surface-variant/70' : 'text-on-surface-variant',
                                      )}
                                    >
                                      {g.text}
                                    </span>
                                  </div>
                                ))}
                                {subFor === a.id && (
                                  <div className="flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-md border border-dashed border-outline shrink-0" />
                                    <input
                                      autoFocus
                                      value={subDraft}
                                      placeholder="Add a step…  (Enter to keep going)"
                                      onChange={(e) => setSubDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') addSubStep(a.id);
                                        if (e.key === 'Escape') {
                                          setSubFor(null);
                                          setSubDraft('');
                                        }
                                      }}
                                      className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none border-b border-outline-variant focus:border-stage-accent py-0.5"
                                    />
                                    <button
                                      onClick={() => {
                                        setSubFor(null);
                                        setSubDraft('');
                                      }}
                                      className="p-1 text-on-surface-variant hover:text-on-surface"
                                      title="Done adding"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {!focusLocked && (
                              <div className="flex flex-wrap items-center gap-3 mt-2.5">
                                <button
                                  onClick={() => {
                                    setSubFor(subFor === a.id ? null : a.id);
                                    setSubDraft('');
                                  }}
                                  className="inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-stage-accent transition-colors"
                                >
                                  <Plus className="w-3 h-3" /> Add a step
                                </button>
                                <button
                                  onClick={() => sendToTasks(a)}
                                  className="inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-stage-accent transition-colors"
                                >
                                  Send to tasks <ArrowRight className="w-3 h-3" />
                                </button>
                                {!covered && (
                                  <button
                                    onClick={() => pushItem(a)}
                                    className="inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-stage-accent transition-colors ml-auto"
                                    title="Push to the next session"
                                  >
                                    Push <ArrowRight className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {/* pushed-out items */}
                {focus.agenda
                  .filter((a) => a.status === 'pushed')
                  .map((a) => (
                    <div key={a.id} className="flex items-center gap-3 px-3.5 py-2 text-on-surface-variant/70">
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-sm line-through">{a.text}</span>
                      <span className="text-xs">moved to {a.pushedTo}'s session</span>
                    </div>
                  ))}
              </div>

              {/* composer */}
              {!focusLocked && (
                <div className="mt-4 pt-4 border-t border-outline-variant/60 space-y-2.5">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addAgendaItem();
                    }}
                    placeholder="Add something to talk through…"
                    className="w-full bg-surface border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={draftCat}
                      onChange={(e) => setDraftCat(e.target.value as BoardCategory)}
                      className="bg-surface border border-outline-variant rounded-xl px-2.5 py-2 text-sm text-on-surface-variant focus:outline-none focus:border-stage-accent"
                      title="Category"
                    >
                      {CATEGORY_ORDER.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_META[c].label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      className="bg-surface border border-outline-variant rounded-xl px-2.5 py-2 text-sm text-on-surface-variant focus:outline-none focus:border-stage-accent"
                      title="Which session"
                    >
                      {futureSessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id === focus.id ? 'This session' : weekdayOf(s.date)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={addAgendaItem}
                      disabled={!draft.trim()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-all ml-auto"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add to agenda
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tasks aside */}
            <aside className="p-5 sm:p-6 bg-surface/40">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-xl text-on-surface">Tasks</h3>
                {!focusLocked && !adding && (
                  <button
                    onClick={() => {
                      setAdding(true);
                      setTaskWho(uid);
                      setTimeout(() => taskInputRef.current?.focus(), 40);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-stage-accent transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>

              {adding && (
                <div className="mb-3 p-3 rounded-2xl bg-surface border border-outline-variant space-y-2.5">
                  <input
                    ref={taskInputRef}
                    value={taskDraft}
                    onChange={(e) => setTaskDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addTask();
                      if (e.key === 'Escape') {
                        setAdding(false);
                        setTaskDraft('');
                      }
                    }}
                    placeholder="What needs doing?"
                    className="w-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button
                        onClick={() => setPickFor(pickFor === 'tnew' ? null : 'tnew')}
                        className="flex items-center"
                        title="Assign"
                      >
                        <Avatar member={memberById.get(taskWho)} size="sm" />
                      </button>
                      {pickFor === 'tnew' && (
                        <AssigneePicker
                          team={team}
                          current={taskWho}
                          onPick={(who) => {
                            setTaskWho(who);
                            setPickFor(null);
                          }}
                          onClose={() => setPickFor(null)}
                        />
                      )}
                    </div>
                    <button
                      onClick={addTask}
                      disabled={!taskDraft.trim()}
                      className="px-3 py-1.5 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-all"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setAdding(false);
                        setTaskDraft('');
                        setPickFor(null);
                      }}
                      className="p-1.5 text-on-surface-variant hover:text-on-surface"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {(focus.assigned || []).map((g) => (
                  <div key={g.id} className="group flex items-center gap-2.5 py-1.5">
                    <CheckButton on={g.done} size="sm" onClick={() => toggleTask(g.id)} />
                    <span
                      onClick={() => toggleTask(g.id)}
                      className={cn(
                        'flex-1 text-sm cursor-pointer',
                        g.done ? 'line-through text-on-surface-variant/70' : 'text-on-surface',
                      )}
                    >
                      {g.text}
                    </span>
                    <button
                      onClick={() => removeTask(g.id)}
                      className="p-1 text-on-surface-variant/0 group-hover:text-on-surface-variant/60 hover:!text-error transition-colors"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setPickFor(pickFor === `t:${g.id}` ? null : `t:${g.id}`)}
                        title={`Carried by ${memberById.get(g.who)?.name || 'someone'} — tap to reassign`}
                      >
                        <Avatar member={memberById.get(g.who)} size="sm" />
                      </button>
                      {pickFor === `t:${g.id}` && (
                        <AssigneePicker
                          team={team}
                          current={g.who}
                          onPick={(who) => reassignTask(g.id, who)}
                          onClose={() => setPickFor(null)}
                        />
                      )}
                    </div>
                  </div>
                ))}
                {(focus.assigned || []).length === 0 && !adding && (
                  <p className="text-sm text-on-surface-variant/70 py-1">Nothing being carried yet.</p>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {/* Notes & learnings */}
      <section>
        <SectionHead
          title="Notes &amp; learnings"
          sub="Every session becomes a record — running it again? Find last time's notes."
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
                  ? 'bg-stage-accent-soft border-stage-accent/40 text-stage-accent'
                  : 'bg-surface border-outline-variant text-on-surface-variant hover:border-outline',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* note cards */}
        {loadingNotes ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="bg-surface/50 border border-dashed border-outline-variant rounded-2xl p-8 text-center text-sm text-on-surface-variant">
            {notes.length === 0
              ? 'No notes yet — wrap a session and save what you learned.'
              : 'No notes match that yet — try a different word or series.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredNotes.map((n) => (
              <article
                key={n.id}
                className={cn(
                  'group bg-surface rounded-2xl border p-4 flex flex-col gap-2',
                  n.type === 'learning' ? 'border-l-2 border-l-stage-violet border-outline-variant' : 'border-outline-variant',
                )}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full font-medium',
                      n.type === 'learning' ? 'bg-stage-violet-soft text-stage-violet' : 'bg-stage-accent-soft text-stage-accent',
                    )}
                  >
                    {n.type === 'learning' ? 'Learning' : 'Record'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-on-surface-variant">
                    <Tag className="w-3 h-3" /> {n.series}
                  </span>
                  <span className="text-on-surface-variant/70 ml-auto">{dateLabelOf(n.date)}</span>
                  <button
                    onClick={() => removeNote(n)}
                    className="p-0.5 text-on-surface-variant/0 group-hover:text-on-surface-variant/50 hover:!text-error transition-colors"
                    title="Remove from archive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <h4 className="font-serif text-lg text-on-surface leading-snug">{n.title}</h4>
                {n.body && <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-4">{n.body}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex -space-x-1.5">
                    {(n.contributorIds || []).slice(0, 4).map((id) => (
                      <div key={id} className="ring-2 ring-surface rounded-full">
                        <Avatar member={memberById.get(id)} size="xs" />
                      </div>
                    ))}
                  </div>
                  {(n.tags || []).length > 0 && (
                    <span className="text-xs text-on-surface-variant/70 truncate">
                      {(n.tags || []).map((t) => `#${t}`).join(' ')}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="text-center text-sm text-on-surface-variant/70 pt-2 flex items-center justify-center gap-2">
        <Feather className="w-3.5 h-3.5" /> A shared place to think together — so the team stays one mind.
      </p>

      {showNewSession && (
        <NewSessionModal team={team} meUid={uid} onClose={() => setShowNewSession(false)} onSave={createSession} />
      )}
    </div>
  );
}

// ── New session modal ─────────────────────────────────────────────────────────
function NewSessionModal({
  team,
  meUid,
  onClose,
  onSave,
}: {
  team: TeamMember[];
  meUid: string;
  onClose: () => void;
  onSave: (f: { event: string; date: string; time: string; place: string; facilitatorId: string }) => void;
}) {
  const [event, setEvent] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [facilitatorId, setFacilitatorId] = useState(meUid);

  // Always keep the current user selectable, even if they aren't in the
  // approved `users` list yet (e.g. super-admin), so the select value matches.
  const teamOptions = useMemo<TeamMember[]>(() => {
    if (team.some((m) => m.uid === meUid)) return team;
    return [{ uid: meUid, name: 'You' }, ...team];
  }, [team, meUid]);

  const field = 'w-full bg-surface border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors';
  const label = 'text-sm text-on-surface-variant mb-1.5 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-surface rounded-3xl border border-outline-variant shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-2xl text-on-surface mb-1">A new coordination session</h3>
        <p className="text-sm text-on-surface-variant mb-5">When the team next gathers to think together.</p>
        <div className="space-y-3.5">
          <div>
            <label className={label}>What's it for</label>
            <input autoFocus value={event} onChange={(e) => setEvent(e.target.value)} placeholder="e.g. Friday Night Gathering" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Day</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>Time</label>
              <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="7:00 PM" className={field} />
            </div>
          </div>
          <div>
            <label className={label}>Where</label>
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Lower Common Room" className={field} />
          </div>
          <div>
            <label className={label}>Who's facilitating</label>
            <div className="relative">
              <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50 pointer-events-none" />
              <select value={facilitatorId} onChange={(e) => setFacilitatorId(e.target.value)} className={cn(field, 'pl-10')}>
                {teamOptions.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-2.5 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-medium rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave({ event, date, time, place, facilitatorId })}
            disabled={!event.trim()}
            className="flex-1 px-4 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-all"
          >
            Open session
          </button>
        </div>
      </div>
    </div>
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

  const field = 'w-full bg-surface border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors';

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
        <select value={series} onChange={(e) => setSeries(e.target.value)} className="bg-surface border border-outline-variant rounded-xl px-2.5 py-2 text-sm text-on-surface-variant focus:outline-none focus:border-stage-accent">
          {seriesOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A short title — what this was about" className={field} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What happened, or what you learned…" className={cn(field, 'resize-y leading-relaxed')} />
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags — welcome, retreat, follow-up" className={field} />
      <div className="flex gap-2.5 justify-end">
        <button onClick={onCancel} className="px-3.5 py-2 border border-outline-variant text-on-surface-variant text-sm font-medium rounded-xl hover:bg-surface-container transition-colors">
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
