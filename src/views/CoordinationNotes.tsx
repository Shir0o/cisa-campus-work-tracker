// The Board — the team's shared coordination surface (doc-model rebuild, #24).
//
// A folder of dated Markdown PAGES — one running document per gathering, kept by
// date. Each page is a Google-Docs-style editor (TipTap) edited LIVE by the team:
// a Yjs CRDT carries concurrent edits + cursors over Firebase RTDB, while the
// markdown is persisted to Firestore (`board_docs`) as the durable, searchable
// record that powers the Pages list and the Notes & learnings archive. Admin-only.
// Re-derived from the design's `BoardFT`.

import React, { useState, useEffect, useMemo, useRef, useReducer } from 'react';
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, rtdb, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { softDeleteBoardDoc, restoreBoardDoc, pinBoardDoc } from '../lib/data/board';
import { useUndoSnack } from '../hooks/useUndoSnack';
import { UndoSnackbar } from '../components/UndoSnackbar';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { cn, getUserInitials } from '../lib/utils';
import { useMediaQuery } from '../lib/useMediaQuery';
import CoordinationNotesMobile from './CoordinationNotesMobile';
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
  CheckSquare,
  Clock,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  Sparkles,
  AtSign,
  Lock,
  Globe,
  RotateCw,
  Link2,
  Pin,
  Archive,
  Edit3,
} from 'lucide-react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Collaboration } from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { RtdbYjsProvider } from '../lib/yjsRtdbProvider';
import {
  BoardDoc,
  DocGroup,
  BoardNote,
  NoteType,
  BOARD_SERIES,
  Audience,
  BOARD_AUDIENCE,
  AUDIENCE_ORDER,
  audienceOf,
  canViewBoard,
  canViewBoardNotes,
  boardAudiencesForRole,
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
  docSortOrder,
  newDocMarkdown,
} from '../lib/board';
import { mdPreview, mdOpenTasks, htmlToBoardMarkdown } from '../lib/markdown';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Task, Contact } from '../types';
import TodoComposer, { type TodoComposerInitial } from '../components/todos/TodoComposer';
import TodoRow, { PersonAvatar } from '../components/todos/TodoRow';
import { setTodoDone, deleteTodo, addTodo } from '../lib/todos';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';

// ── Team (contributor avatars + cursor identities) ────────────────────────────
export interface TeamMember {
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
type MarkdownStorage = {
  markdown: { getMarkdown: () => string; parser: { parse: (md: string) => string } };
};
const editorMarkdown = (ed: Editor): string => (ed.storage as unknown as MarkdownStorage).markdown.getMarkdown();

function renumberMarkdownLists(text: string): string {
  const lines = text.split('\n');
  const processed = new Set<number>();
  let i = 0;
  while (i < lines.length) {
    if (processed.has(i)) {
      i++;
      continue;
    }
    const line = lines[i];
    const match = line.match(/^(\s*)(\d+)\.(\s+)(.*)$/);
    if (match) {
      const indent = match[1];
      const listIndices = [i];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        const nextMatch = nextLine.match(/^(\s*)(\d+)\.(\s+)(.*)$/);
        if (nextMatch) {
          if (nextMatch[1] === indent) {
            listIndices.push(j);
            processed.add(j);
            j++;
            continue;
          }
        }
        
        const nextIndentMatch = nextLine.match(/^(\s*)\S/);
        if (nextLine.trim() === '' || (nextIndentMatch && nextIndentMatch[1].length > indent.length)) {
          j++;
          continue;
        }
        
        break;
      }
      
      if (listIndices.length > 1) {
        const firstMatch = lines[listIndices[0]].match(/^(\s*)(\d+)\.(\s+)(.*)$/);
        if (firstMatch) {
          const startNum = parseInt(firstMatch[2], 10);
          for (let k = 0; k < listIndices.length; k++) {
            const idx = listIndices[k];
            const itemMatch = lines[idx].match(/^(\s*)(\d+)\.(\s+)(.*)$/);
            if (itemMatch) {
              const itemIndent = itemMatch[1];
              const itemSpace = itemMatch[3];
              const itemRest = itemMatch[4];
              lines[idx] = `${itemIndent}${startNum + k}.${itemSpace}${itemRest}`;
            }
          }
        }
      }
    }
    i++;
  }
  return lines.join('\n');
}
// Render a Markdown string to the editor's own clean HTML — used to normalize
// rich (HTML) pastes through Markdown so they match the page's formatting.
const editorMdToHtml = (ed: Editor, md: string): string =>
  (ed.storage as unknown as MarkdownStorage).markdown.parser.parse(md);

const STATUS_CHIP: Record<string, string> = {
  accent: 'bg-stage-accent-soft text-stage-accent',
  teal: 'bg-tertiary/15 text-tertiary',
  '': 'bg-surface-variant text-on-surface-variant',
};

// ── Audience (visibility) badge ───────────────────────────────────────────────
const AUDIENCE_ICON = { lock: Lock, users: Users, globe: Globe } as const;
const AUDIENCE_CHIP: Record<Audience, string> = {
  team: 'bg-surface-variant text-on-surface-variant',
  trainees: 'bg-stage-accent-soft text-stage-accent',
  everyone: 'bg-tertiary/15 text-tertiary',
};

function AudienceBadge({ audience, size = 'sm' }: { audience: Audience; size?: 'xs' | 'sm' }) {
  const meta = BOARD_AUDIENCE[audience];
  const Icon = AUDIENCE_ICON[meta.icon];
  return (
    <span
      title={meta.sub}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        AUDIENCE_CHIP[audience],
        size === 'xs' ? 'px-1.5 py-px text-[10.5px]' : 'px-2 py-0.5 text-xs',
      )}
    >
      <Icon className={size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'} /> {meta.label}
    </span>
  );
}

// Full-timer control to set who a page is open to.
function AudiencePicker({ audience, onChange }: { audience: Audience; onChange: (a: Audience) => void }) {
  const Icon = AUDIENCE_ICON[BOARD_AUDIENCE[audience].icon];
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full pl-2 pr-0.5 py-0.5 text-xs font-medium', AUDIENCE_CHIP[audience])}
      title="Who can see this page"
    >
      <Icon className="w-3 h-3" />
      <select
        value={audience}
        onChange={(e) => onChange(e.target.value as Audience)}
        aria-label="Page audience"
        className="bg-transparent border-0 outline-none text-xs font-medium cursor-pointer pr-0.5"
      >
        {AUDIENCE_ORDER.map((a) => (
          <option key={a} value={a}>
            {BOARD_AUDIENCE[a].label} · {BOARD_AUDIENCE[a].sub}
          </option>
        ))}
      </select>
    </span>
  );
}

const CustomTab = Extension.create({
  name: 'customTab',
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive('listItem') || editor.isActive('taskItem') || editor.isActive('table')) {
          return false;
        }
        return editor.commands.insertContent('  ');
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('listItem') || editor.isActive('taskItem') || editor.isActive('table')) {
          return false;
        }
        const { state } = editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const pos = selection.from;
        const resolvedPos = state.doc.resolve(pos);
        const textBefore = resolvedPos.parent.textContent.slice(
          Math.max(0, resolvedPos.parentOffset - 2),
          resolvedPos.parentOffset
        );
        if (textBefore === '  ') {
          return editor.commands.deleteRange({ from: pos - 2, to: pos });
        } else if (textBefore.endsWith(' ')) {
          return editor.commands.deleteRange({ from: pos - 1, to: pos });
        }
        return false;
      },
    };
  },
});

// Helper functions for heading anchor tags
const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-'); // Replace multiple - with single -
};

const getHeadingText = (node: React.ReactNode): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getHeadingText).join('');
  if (React.isValidElement(node)) return getHeadingText((node.props as any).children);
  return '';
};

const HeadingWithAnchor = ({
  level,
  className,
  children,
}: {
  level: 2 | 3 | 4;
  className: string;
  children: React.ReactNode;
}) => {
  const text = getHeadingText(children);
  const id = slugify(text);
  const Tag = level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4';

  return (
    <Tag id={id} className={cn('group flex items-center gap-2 scroll-mt-20', className)}>
      <span>{children}</span>
      {id && (
        <a
          href={`#${id}`}
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = id;
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-stage-accent hover:text-stage-accent-hover inline-flex items-center"
          title="Link to this section"
          aria-label="Link to this section"
        >
          <Link2 className="w-4 h-4" />
        </a>
      )}
    </Tag>
  );
};

// ── Read-only page render for non-editors (Trainees + Students) ───────────────
// No TipTap/Yjs — just the durable markdown rendered with react-markdown so a
// viewer never loads collaborative editing or writes presence.
const READONLY_MD: Components = {
  h1: ({ children }) => <HeadingWithAnchor level={2} className="font-serif text-2xl text-on-surface mt-6 mb-2 first:mt-0">{children}</HeadingWithAnchor>,
  h2: ({ children }) => <HeadingWithAnchor level={3} className="font-serif text-xl text-on-surface mt-5 mb-2">{children}</HeadingWithAnchor>,
  h3: ({ children }) => <HeadingWithAnchor level={4} className="font-semibold text-on-surface mt-4 mb-1.5">{children}</HeadingWithAnchor>,
  p: ({ children }) => <p className="text-[15px] text-on-surface-variant leading-relaxed my-2">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={cn('my-2 space-y-1 text-[15px] text-on-surface-variant', className?.includes('contains-task-list') ? 'list-none pl-1' : 'pl-5')}>
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="pl-5 my-2 space-y-1 text-[15px] text-on-surface-variant">{children}</ol>,
  li: ({ children, className }) => (
    <li className={cn('leading-relaxed', className?.includes('task-list-item') && 'list-none flex items-start gap-2')}>{children}</li>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-stage-accent underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-on-surface">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-stage-accent/40 pl-3 my-3 text-on-surface-variant/90 italic">{children}</blockquote>
  ),
  code: ({ children }) => <code className="bg-surface-variant rounded px-1 py-0.5 text-[13px]">{children}</code>,
  table: ({ children }) => <table className="my-3 border-collapse text-sm">{children}</table>,
  th: ({ children }) => <th className="border border-outline-variant px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-outline-variant px-2 py-1">{children}</td>,
};

function ReadOnlyDoc({
  doc: d,
  pagesCollapsed,
  onTogglePages,
}: {
  doc: BoardDoc;
  pagesCollapsed: boolean;
  onTogglePages: () => void;
}) {
  const st = DOC_STATUS[sessionStatus(d.date)];
  return (
    <div className="flex flex-col min-w-0 bg-surface overflow-y-auto custom-scrollbar">
      {/* head */}
      <div className="flex items-center gap-2.5 flex-wrap px-5 lg:px-8 pt-4">
        {pagesCollapsed && (
          <button
            type="button"
            onClick={onTogglePages}
            title="Show pages"
            aria-label="Show pages"
            className="hidden lg:grid w-8 h-8 -ml-1 place-items-center rounded-lg text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
          >
            <PanelLeftOpen className="w-[18px] h-[18px]" />
          </button>
        )}
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
        <AudienceBadge audience={audienceOf(d)} />
      </div>

      <h1 className="font-serif text-[24px] sm:text-[30px] font-medium tracking-tight text-on-surface leading-tight px-5 lg:px-8 pt-3 pb-3">
        {d.title}
      </h1>

      <div className="px-5 lg:px-8 pb-6 bdoc-prose-viewer">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={READONLY_MD}>
          {d.md || '_This page is empty._'}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ── Notes & learnings: prefill helpers (Session 4) ────────────────────────────
// Exported alongside NoteForm/addNote's shape so EmbedCoordinationDoc.tsx's
// admin-only "Save to archive" flow can reuse them (see MIGRATION.md
// "Coordination Notes / The Board").
export type NoteFormInitial = { id?: string; type?: NoteType; series?: string; title?: string; body?: string; displayMode?: 'text' | 'list' };

// Guess which series a page belongs to from its title (first-word match).
export function guessSeries(title: string): string {
  const t = (title || '').toLowerCase();
  return BOARD_SERIES.find((s) => t.includes(s.toLowerCase().split(' ')[0])) || 'Team';
}

// A short plain-text excerpt of a page's markdown, for the archive body.
export function mdExcerpt(md: string): string {
  const body = (md || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^#{1,3}\s/.test(l)) // drop headings
    .filter((l) => !/^\*\*.*\*\*$/.test(l)) // drop a bold-only meta line
    .map((l) =>
      l
        .replace(/^\s*[-*]\s+\[( |x|X)\]\s+/, '') // task marker
        .replace(/^\s*[-*]\s+/, '') // bullet
        .replace(/^>\s?/, '') // quote
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1'),
    )
    .join(' ');
  return body.length > 360 ? body.slice(0, 357).trimEnd() + '…' : body;
}

export default function CoordinationNotes() {
  const { isAdmin, user, role } = useAuth();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isMe = user?.email?.toLowerCase() === 'yilongwang05@gmail.com';
  // Full-timers (admins) edit; Trainees + Students read a role-scoped subset.
  const canEdit = isAdmin || isMe;
  const canView = canEdit || canViewBoard(role);
  const canSeeNotes = canEdit || canViewBoardNotes(role);
  const uid = user?.uid || '';
  const meName = user?.displayName || user?.email || 'Someone';

  const [docs, setDocs] = useState<BoardDoc[]>([]);
  const [notes, setNotes] = useState<BoardNote[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Pages panel collapse (desktop) — mirrors the main sidebar's persisted toggle.
  const [pagesCollapsed, setPagesCollapsed] = useState(() => localStorage.getItem('board_pages_collapsed') === 'true');
  const togglePages = () =>
    setPagesCollapsed((v) => {
      localStorage.setItem('board_pages_collapsed', String(!v));
      return !v;
    });

  // Live Markdown of the page currently being edited, so its Pages-list row
  // (preview + "to do" count) reflects edits immediately rather than waiting for
  // the debounced Firestore save. Reset when switching pages.
  const [liveActiveMd, setLiveActiveMd] = useState<string | null>(null);
  useEffect(() => setLiveActiveMd(null), [activeId]);

  // notes archive controls
  const [q, setQ] = useState('');
  const [series, setSeries] = useState('All');
  const [kind, setKind] = useState<'All' | 'Records' | 'Learnings'>('All');
  const [noteTab, setNoteTab] = useState<'active' | 'archived' | 'trash'>('active');
  // The note form holds optional prefill so "Save to archive" can seed it from a page.
  const [noteForm, setNoteForm] = useState<NoteFormInitial | null>(null);

  // team to-dos ("What we're holding")
  const [todos, setTodos] = useState<Task[]>([]);
  const [todoFilter, setTodoFilter] = useState<string>('all'); // 'all' | assignee uid
  const [showDoneTodos, setShowDoneTodos] = useState(false);
  const [todoComposer, setTodoComposer] = useState<{ mode: 'create' | 'edit'; initial?: TodoComposerInitial } | null>(null);

  // a light, ephemeral confirmation pill (the global Toaster is notification-driven)
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2800);
  };

  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  const handleToggleTodo = async (todoId: string, done: boolean) => {
    const todo = todos.find((t) => t.id === todoId);
    if (!todo) return;
    await setTodoDone(todoId, done);
    if (typeof logActivity === 'function') {
      logActivity({
        action: done ? 'completed task' : 'reopened task',
        targetId: todoId,
        targetName: todo.title,
        targetType: 'comment',
        type: 'update',
        description: done ? 'Marked as completed' : 'Marked as pending',
      } as never);
    }
  };

  const handleDeleteTodo = async (todoId: string) => {
    const todo = todos.find((t) => t.id === todoId);
    if (!todo) return;
    await deleteTodo(todoId);
    if (typeof logActivity === 'function') {
      logActivity({
        action: 'deleted task',
        targetId: todoId,
        targetName: todo.title,
        targetType: 'comment',
        type: 'delete',
        description: 'Task removed',
      } as never);
    }
  };

  const memberById = useMemo(() => {
    const m = new Map<string, TeamMember>();
    team.forEach((t) => m.set(t.uid, t));
    return m;
  }, [team]);

  // ── listeners ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canView) {
      setLoadingDocs(false);
      setLoadingNotes(false);
      return;
    }

    // Full-timers read every page (incl. legacy pages with no audience); lower
    // roles must scope the query by audience so the rules' per-doc checks pass.
    // The non-admin query has no orderBy (sorted client-side) so no composite
    // index is needed.
    const docsQuery = canEdit
      ? query(collection(db, 'board_docs'), orderBy('date', 'desc'))
      : query(collection(db, 'board_docs'), where('audience', 'in', boardAudiencesForRole(role)));
    const unsubDocs = onSnapshot(
      docsQuery,
      (snap) => {
        setDocs(
          snap.docs
            .map((d) => ({ id: d.id, md: '', title: 'Untitled page', ...(d.data() as object) }) as BoardDoc)
            .filter((d) => !d.deletedAt),
        );
        setLoadingDocs(false);
      },
      (err) => {
        setLoadingDocs(false);
        handleFirestoreError(err, OperationType.LIST, 'board_docs');
      },
    );

    // The Notes & learnings archive is Full-timer + Trainee only.
    const unsubNotes = canSeeNotes
      ? onSnapshot(
          query(collection(db, 'board_notes'), orderBy('date', 'desc')),
          (snap) => {
            setNotes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as BoardNote));
            setLoadingNotes(false);
          },
          (err) => {
            setLoadingNotes(false);
            handleFirestoreError(err, OperationType.LIST, 'board_notes');
          },
        )
      : (setLoadingNotes(false), () => {});

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
            .filter((u) => {
              if (u.approved === false) return false;
              const name = (u.member.name || '').toLowerCase();
              return !name.startsWith('cisa-');
            })
            .map((u) => u.member)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users'),
    );

    // To-dos ("What we're holding") + contacts (AI linking) are editor-only.
    const unsubTodos = canEdit
      ? onSnapshot(
          collection(db, 'tasks'),
          (snap) => setTodos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Task)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'),
        )
      : () => {};

    const unsubContacts = canEdit
      ? onSnapshot(
          collection(db, 'contacts'),
          (snap) => {
            setContacts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Contact));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'contacts'),
        )
      : () => {};

    return () => {
      unsubDocs();
      unsubNotes();
      unsubUsers();
      unsubTodos();
      unsubContacts();
    };
  }, [canView, canEdit, canSeeNotes, role]);

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

  // Deep-link from a to-do's source link on My Day: focus the page it came from.
  const location = useLocation();
  useEffect(() => {
    const focusId = (location.state as { focusDocId?: string } | null)?.focusDocId;
    if (focusId && docs.some((d) => d.id === focusId)) setActiveId(focusId);
  }, [location.state, docs]);

  // ── team to-dos: derived counts + the filtered, sorted list ──────────────────
  const openTodoCount = useMemo(
    () => todos.filter((t) => t.status !== 'completed' && t.status !== 'canceled').length,
    [todos],
  );
  const openTodosByUid = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of todos) {
      if (t.status === 'completed' || t.status === 'canceled' || !t.assigneeId) continue;
      m.set(t.assigneeId, (m.get(t.assigneeId) ?? 0) + 1);
    }
    return m;
  }, [todos]);
  const visibleTodos = useMemo(() => {
    const dueMs = (s?: string | null) => (s ? new Date(s).getTime() : Infinity);
    return todos
      .filter((t) => t.status !== 'canceled')
      .filter((t) => todoFilter === 'all' || t.assigneeId === todoFilter)
      .filter((t) => showDoneTodos || t.status !== 'completed')
      .sort((a, b) => {
        const ra = a.status === 'completed' ? 1 : 0;
        const rb = b.status === 'completed' ? 1 : 0;
        if (ra !== rb) return ra - rb;
        return dueMs(a.dueDate) - dueMs(b.dueDate);
      });
  }, [todos, todoFilter, showDoneTodos]);

  const jumpToTodoSource = (docId: string) => {
    if (docs.some((d) => d.id === docId)) {
      setActiveId(docId);
      document.getElementById('coordination-notes-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showToast('That page is no longer here.');
    }
  };

  const grouped = useMemo(() => {
    const g: Record<DocGroup, BoardDoc[]> = { Pinned: [], 'This week': [], Earlier: [] };
    [...docs].sort(docSortOrder).forEach((d) => {
      (g[docGroup(d)] ||= []).push(d);
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
        audience: 'team' as Audience, // starts private to the team; open it up when ready
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

  const saveAudience = async (id: string, audience: Audience) => {
    try {
      await updateDoc(doc(db, 'board_docs', id), {
        audience,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        updatedByName: meName,
      });
      showToast(`Page now open to ${BOARD_AUDIENCE[audience].sub}.`);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
    }
  };

  const deleteBoardDoc = async (d: BoardDoc) => {
    try {
      await softDeleteBoardDoc(d);
      if (activeId === d.id) setActiveId(null);
      showUndoSnack('Page moved to Trash', () => restoreBoardDoc(d));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
    }
  };

  // ── notes ──────────────────────────────────────────────────────────────────
  const addNote = async (fields: { id?: string; type: NoteType; series: string; title: string; body: string; tags: string[]; displayMode?: 'text' | 'list' }) => {
    try {
      if (fields.id) {
        await updateDoc(doc(db, 'board_notes', fields.id), {
          type: fields.type,
          series: fields.series,
          title: fields.title.trim() || 'Untitled note',
          body: fields.body.trim(),
          tags: fields.tags,
          displayMode: fields.displayMode || 'text',
          updatedAt: serverTimestamp(),
          updatedBy: uid,
          updatedByName: meName,
        });
        showToast('Note updated.');
      } else {
        const ref = doc(collection(db, 'board_notes'));
        await setDoc(ref, {
          type: fields.type,
          series: fields.series,
          title: fields.title.trim() || 'Untitled note',
          body: fields.body.trim(),
          date: todayISO(),
          contributorIds: [uid],
          tags: fields.tags,
          displayMode: fields.displayMode || 'text',
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
        showToast('Note saved.');
      }
      setNoteForm(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'board_notes');
    }
  };

  // Session 4 — "Save to archive": promote the open page into Notes & learnings,
  // prefilling the form with its title, an excerpt, and a guessed series.
  const promoteDoc = (d: BoardDoc) => {
    const md = d.id === activeId ? liveActiveMd ?? d.md : d.md;
    setNoteForm({ type: 'record', series: guessSeries(d.title), title: d.title, body: mdExcerpt(md) });
    document.getElementById('board-notes-section')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const softDeleteNote = async (n: BoardNote) => {
    try {
      await updateDoc(doc(db, 'board_notes', n.id), { deletedAt: serverTimestamp() });
      showUndoSnack('Note moved to Trash', () => updateDoc(doc(db, 'board_notes', n.id), { deletedAt: null }));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_notes');
    }
  };

  const restoreNote = async (n: BoardNote) => {
    try {
      await updateDoc(doc(db, 'board_notes', n.id), { deletedAt: null });
      showToast('Note restored from Trash.');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_notes');
    }
  };

  const removeNoteForever = async (n: BoardNote) => {
    if (!window.confirm(`Permanently delete "${n.title}" from Trash?`)) return;
    try {
      await deleteDoc(doc(db, 'board_notes', n.id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'board_notes');
    }
  };

  const toggleArchiveNote = async (n: BoardNote) => {
    try {
      const isArchived = !!n.archivedAt;
      await updateDoc(doc(db, 'board_notes', n.id), { archivedAt: isArchived ? null : serverTimestamp() });
      showToast(isArchived ? 'Note unarchived.' : 'Note archived.');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_notes');
    }
  };

  const toggleNoteDisplayMode = async (n: BoardNote) => {
    try {
      const newMode = n.displayMode === 'list' ? 'text' : 'list';
      let newBody = n.body;
      if (newMode === 'list') {
        newBody = n.body
          .split('\n')
          .map((l) => (l.trim().startsWith('- [') ? l : `- [ ] ${l}`))
          .join('\n');
      }
      await updateDoc(doc(db, 'board_notes', n.id), { displayMode: newMode, body: newBody });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_notes');
    }
  };

  const toggleNoteChecklistItem = async (n: BoardNote, lineIdx: number, done: boolean) => {
    try {
      const lines = n.body.split('\n');
      if (lineIdx < 0 || lineIdx >= lines.length) return;
      const curLine = lines[lineIdx];
      const itemText = curLine.replace(/^\s*-\s*\[[ xX]\]\s*/, '');
      lines[lineIdx] = done ? `- [x] ${itemText}` : `- [ ] ${itemText}`;
      await updateDoc(doc(db, 'board_notes', n.id), { body: lines.join('\n') });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_notes');
    }
  };

  const ql = q.trim().toLowerCase();
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (noteTab === 'trash') {
        if (!n.deletedAt) return false;
      } else if (noteTab === 'archived') {
        if (n.deletedAt || !n.archivedAt) return false;
      } else {
        if (n.deletedAt || n.archivedAt) return false;
      }
      if (series !== 'All' && n.series !== series) return false;
      if (kind === 'Records' && n.type !== 'record') return false;
      if (kind === 'Learnings' && n.type !== 'learning') return false;
      if (ql) {
        const hay = `${n.title} ${n.body} ${n.series}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [notes, noteTab, series, kind, ql]);

  const seriesOptions = useMemo(() => {
    const set = new Set<string>(BOARD_SERIES);
    notes.forEach((n) => n.series && set.add(n.series));
    return ['All', ...Array.from(set)];
  }, [notes]);

  // ── access gate ──────────────────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center" id="coordination-notes-guard">
        <div className="bg-error-container/10 border border-error-container/30 rounded-3xl p-12 max-w-xl mx-auto my-12 flex flex-col items-center">
          <div className="w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="font-serif text-2xl mb-3 text-on-background">A space for the team</h2>
          <p className="text-on-surface-variant leading-relaxed">
            This is where the team coordinates. If you think you should be here, ask a full-timer to widen your access.
          </p>
        </div>
      </div>
    );
  }

  // Header copy by role: editors get the working framing, trainees a read-along
  // note, students a gentler "what's happening" look.
  const heading = canSeeNotes ? 'Coordination Notes' : "What's happening";
  const intro = canEdit ? (
    <>
      One <b className="text-on-surface font-medium">page per gathering</b>, kept by date — what you talked through, who's
      holding what, what you learned. Write it like a doc; nothing important should live in one person's inbox.
    </>
  ) : canSeeNotes ? (
    <>
      The team's shared pages, kept by date. Read along to follow what's being planned and learned together — the pages
      open to <b className="text-on-surface font-medium">staff &amp; trainees</b> are gathered here for you.
    </>
  ) : (
    <>
      A look at our gatherings — what's coming up, and how each night is shaped. These are the pages the team keeps{' '}
      <b className="text-on-surface font-medium">open to everyone</b>.
    </>
  );

  const TodoSectionComponent = canEdit ? (
    <section className="px-5 mt-5">
      <SectionHead
        title="What we're holding"
        sub={`Every to-do the team is holding — ${openTodoCount > 0 ? `${openTodoCount} still open` : 'all clear'}. Highlight a line in a page above, or add one here.`}
        action={
          <button
            onClick={() => setTodoComposer({ mode: 'create', initial: { assigneeId: uid } })}
            className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-stage-accent transition-colors"
          >
            <Plus className="w-4 h-4" /> Add to-do
          </button>
        }
      />

      {/* filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-3">
        <div className="flex flex-wrap gap-1.5 flex-1">
          <button
            onClick={() => setTodoFilter('all')}
            className={cn(
              'inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
              todoFilter === 'all'
                ? 'bg-primary-container border-primary text-on-primary-container'
                : 'bg-surface border-outline-variant/60 text-on-surface-variant hover:border-outline',
            )}
          >
            <Users className="w-3.5 h-3.5" /> Everyone
          </button>
          {team.map((m) => {
            const n = openTodosByUid.get(m.uid) ?? 0;
            return (
              <button
                key={m.uid}
                onClick={() => setTodoFilter(m.uid)}
                className={cn(
                  'inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border text-xs font-medium transition-colors',
                  todoFilter === m.uid
                    ? 'bg-primary-container border-primary text-on-primary-container'
                    : 'bg-surface border-outline-variant/60 text-on-surface-variant hover:border-outline',
                )}
              >
                <PersonAvatar person={m} size="xs" />
                {m.name.split(' ')[0]}
                {m.uid === uid ? ' (you)' : ''}
                {n > 0 && (
                  <span className="ml-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary/15 text-primary text-[10px] font-bold inline-flex items-center justify-center">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setShowDoneTodos((v) => !v)}
          className={cn(
            'inline-flex items-center gap-2 text-xs font-medium transition-colors shrink-0',
            showDoneTodos ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface',
          )}
        >
          <span
            className={cn(
              'w-4 h-4 rounded border flex items-center justify-center',
              showDoneTodos ? 'bg-primary border-primary text-on-primary' : 'border-outline',
            )}
          >
            {showDoneTodos && <Check className="w-2.5 h-2.5" />}
          </span>
          Show done
        </button>
      </div>

      {visibleTodos.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-dashed border-outline-variant p-8 text-center flex flex-col items-center">
          <CheckSquare className="w-6 h-6 text-on-surface-variant/50 mb-2" />
          <p className="text-sm text-on-surface-variant max-w-sm">
            Nothing here yet. Add one above, or highlight a line in a page and choose “Make a to-do”.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
          {visibleTodos.map((t, i) => (
            <TodoRow
              key={t.id}
              first={i === 0}
              todo={t}
              assignee={t.assigneeId ? memberById.get(t.assigneeId) : undefined}
              showAssignee
              onToggle={(todo, done) => handleToggleTodo(todo.id, done)}
              onEdit={(todo) =>
                setTodoComposer({
                  mode: 'edit',
                  initial: {
                    id: todo.id,
                    text: todo.title,
                    assigneeId: todo.assigneeId ?? null,
                    dueDate: todo.dueDate ?? null,
                  },
                })
              }
              onDelete={(todo) => handleDeleteTodo(todo.id)}
              onJumpToSource={jumpToTodoSource}
            />
          ))}
        </div>
      )}
    </section>
  ) : null;

  const NotesSectionComponent = canSeeNotes ? (
    <section id="board-notes-section" className="px-5 mt-5">
      <SectionHead
        title="Notes & learnings"
        sub="Every page becomes a record — running it again? Find last time's notes."
        action={
          canEdit ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNoteForm({ type: 'record' })}
                className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-stage-accent transition-colors"
              >
                <Plus className="w-4 h-4" /> New record
              </button>
              <button
                onClick={() => setNoteForm({ type: 'learning' })}
                className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-stage-accent transition-colors"
              >
                <NotebookPen className="w-4 h-4" /> New learning
              </button>
            </div>
          ) : undefined
        }
      />

      {canEdit && noteForm && (
        <NoteForm initial={noteForm} seriesOptions={BOARD_SERIES} onCancel={() => setNoteForm(null)} onSave={addNote} />
      )}

      {/* controls */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes — e.g. “Small Groups”, “Conferences/Trainings”, “welcome”…"
            className="w-full bg-surface border border-outline-variant rounded-xl pl-10 pr-9 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-surface-container-low border border-outline-variant rounded-xl p-1">
            {(['active', 'archived', 'trash'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setNoteTab(t)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                  noteTab === t ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {t === 'trash' ? 'Trash' : t === 'archived' ? 'Archive' : 'Active'}
              </button>
            ))}
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
      {notes.length === 0 ? (
        <div className="border border-dashed border-outline-variant rounded-2xl p-8 text-center text-sm text-on-surface-variant italic">
          No notes yet — wrap a page and save what you learned.
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="border border-dashed border-outline-variant rounded-2xl p-8 text-center text-sm text-on-surface-variant italic">
          No notes match that yet — try a different word, filter, or series.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredNotes.map((n) => (
              <NoteCard
                key={n.id}
                n={n}
                memberById={memberById}
                canEdit={canEdit}
                noteTab={noteTab}
                onEdit={(note) => setNoteForm({ id: note.id, type: note.type, series: note.series, title: note.title, body: note.body, displayMode: note.displayMode || 'text' })}
                onSoftDelete={softDeleteNote}
                onRestore={restoreNote}
                onRemoveForever={removeNoteForever}
                onToggleArchive={toggleArchiveNote}
                onToggleDisplayMode={toggleNoteDisplayMode}
                onToggleChecklistItem={toggleNoteChecklistItem}
              />
            ))}
          </div>
        )
      }
    </section>
  ) : null;

  if (isMobile && !loadingDocs && !loadingNotes) {
    return (
      <>
        <CoordinationNotesMobile
          canEdit={canEdit}
          canSeeNotes={canSeeNotes}
          docs={docs}
          active={active}
          activeId={activeId}
          setActiveId={setActiveId}
          newDoc={createDoc}
          promoteDoc={promoteDoc}
          heading={heading}
          intro={intro}
          uid={uid}
          meName={meName}
          pagesCollapsed={pagesCollapsed}
          togglePages={togglePages}
          setLiveActiveMd={setLiveActiveMd}
          saveMarkdown={saveMarkdown}
          saveTitle={saveTitle}
          saveAudience={saveAudience}
          deleteBoardDoc={deleteBoardDoc}
          team={team}
          showToast={showToast}
          contacts={contacts}
          setSelectedContact={setSelectedContact}
          setIsDetailsModalOpen={setIsDetailsModalOpen}
          DocEditorComponent={DocEditor}
          ReadOnlyDocComponent={ReadOnlyDoc}
          TodoSectionComponent={TodoSectionComponent}
          NotesSectionComponent={NotesSectionComponent}
        />
        <ContactDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedContact(null);
          }}
          contact={selectedContact}
        />
      </>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-8" id="coordination-notes-panel">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="text-sm text-on-surface-variant mb-1">{weekdayOf(todayISO())}, {dateLabelOf(todayISO())}</div>
          <h1 className="font-serif text-3xl lg:text-4xl text-on-surface">{heading}</h1>
          <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">{intro}</p>
        </div>
        {canEdit && (
          <button
            onClick={createDoc}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shrink-0"
          >
            <Plus className="w-4 h-4" /> New page
          </button>
        )}
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
            <h3 className="font-serif text-xl text-on-surface mb-1">
              {canEdit ? 'No pages yet' : 'Nothing here just yet'}
            </h3>
            <p className="text-sm text-on-surface-variant max-w-sm mb-5">
              {canEdit
                ? "Start this week's first page — give it a title and begin writing. The team can edit it live, together."
                : 'Check back after the next gathering — the team will share pages here as they plan.'}
            </p>
            {canEdit && (
              <button
                onClick={createDoc}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 transition-all"
              >
                <Plus className="w-4 h-4" /> Start a page
              </button>
            )}
          </div>
        ) : (
          <div
            data-testid="coordination-notes-workspace"
            className={cn(
              'grid lg:grid-rows-1 bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden min-h-[560px] lg:min-h-0 lg:h-[calc(100vh-6rem)]',
              pagesCollapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-[300px_1fr]',
            )}
          >
            {/* Pages list */}
            <aside
              className={cn(
                'flex flex-col min-w-0 bg-surface-container-low lg:border-r border-b lg:border-b-0 border-outline-variant',
                pagesCollapsed && 'lg:hidden',
              )}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <span className="font-serif text-[17px] text-on-surface">Pages</span>
                <div className="flex items-center gap-1.5">
                  {canEdit && (
                    <button
                      onClick={createDoc}
                      title="New page"
                      className="w-7 h-7 grid place-items-center rounded-lg bg-surface border border-outline text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isAdmin && (
                    <Link
                      to="/coordination/trash"
                      title="Trash"
                      aria-label="Trash"
                      className="w-7 h-7 grid place-items-center rounded-lg bg-surface border border-outline text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Link>
                  )}
                  <button
                    onClick={togglePages}
                    title="Collapse pages"
                    aria-label="Collapse pages"
                    className="hidden lg:grid w-7 h-7 place-items-center rounded-lg bg-surface border border-outline text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent transition-colors"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5" />
                  </button>
                </div>
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
                          <DocRow
                            key={d.id}
                            d={d}
                            active={d.id === activeId}
                            canEdit={canEdit}
                            liveMd={d.id === activeId ? liveActiveMd ?? undefined : undefined}
                            onClick={() => setActiveId(d.id)}
                            onTogglePin={isAdmin ? () => pinBoardDoc(d, !d.pinned) : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Open page — full editor for full-timers, read-only render otherwise */}
            {active ? (
              canEdit ? (
                <DocEditor
                  key={active.id}
                  doc={active}
                  meUid={uid}
                  meName={meName}
                  pagesCollapsed={pagesCollapsed}
                  onTogglePages={togglePages}
                  onLiveMarkdownChange={setLiveActiveMd}
                  onSaveMarkdown={saveMarkdown}
                  onSaveTitle={saveTitle}
                  onSaveAudience={saveAudience}
                  onPromote={promoteDoc}
                  onDelete={deleteBoardDoc}
                  team={team}
                  onToast={showToast}
                  contacts={contacts}
                  onSelectContact={setSelectedContact}
                  onOpenContactModal={setIsDetailsModalOpen}
                />
              ) : (
                <ReadOnlyDoc key={active.id} doc={active} pagesCollapsed={pagesCollapsed} onTogglePages={togglePages} />
              )
            ) : (
              <div className="grid place-items-center text-sm text-on-surface-variant p-10">Select a page.</div>
            )}
          </div>
        )}
      </section>

      {/* What we're carrying — every to-do the team is holding, in one list */}
      {canEdit && (
      <section>
        <SectionHead
          title="What we're holding"
          sub={`Every to-do the team is holding — ${openTodoCount > 0 ? `${openTodoCount} still open` : 'all clear'}. Highlight a line in a page above, or add one here.`}
          action={
            <button
              onClick={() => setTodoComposer({ mode: 'create', initial: { assigneeId: uid } })}
              className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-stage-accent transition-colors"
            >
              <Plus className="w-4 h-4" /> Add to-do
            </button>
          }
        />

        {/* controls: person filter + show done */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-3">
          <div className="flex flex-wrap gap-1.5 flex-1">
            <button
              onClick={() => setTodoFilter('all')}
              className={cn(
                'inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
                todoFilter === 'all'
                  ? 'bg-primary-container border-primary text-on-primary-container'
                  : 'bg-surface border-outline-variant/60 text-on-surface-variant hover:border-outline',
              )}
            >
              <Users className="w-3.5 h-3.5" /> Everyone
            </button>
            {team.map((m) => {
              const n = openTodosByUid.get(m.uid) ?? 0;
              return (
                <button
                  key={m.uid}
                  onClick={() => setTodoFilter(m.uid)}
                  className={cn(
                    'inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border text-xs font-medium transition-colors',
                    todoFilter === m.uid
                      ? 'bg-primary-container border-primary text-on-primary-container'
                      : 'bg-surface border-outline-variant/60 text-on-surface-variant hover:border-outline',
                  )}
                >
                  <PersonAvatar person={m} size="xs" />
                  {m.name.split(' ')[0]}
                  {m.uid === uid ? ' (you)' : ''}
                  {n > 0 && (
                    <span className="ml-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary/15 text-primary text-[10px] font-bold inline-flex items-center justify-center">
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowDoneTodos((v) => !v)}
            className={cn(
              'inline-flex items-center gap-2 text-xs font-medium transition-colors shrink-0',
              showDoneTodos ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            <span
              className={cn(
                'w-4 h-4 rounded border flex items-center justify-center',
                showDoneTodos ? 'bg-primary border-primary text-on-primary' : 'border-outline',
              )}
            >
              {showDoneTodos && <Check className="w-2.5 h-2.5" />}
            </span>
            Show done
          </button>
        </div>

        {visibleTodos.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-dashed border-outline-variant p-8 text-center flex flex-col items-center">
            <CheckSquare className="w-6 h-6 text-on-surface-variant/50 mb-2" />
            <p className="text-sm text-on-surface-variant max-w-sm">
              Nothing here yet. Add one above, or highlight a line in a page and choose “Make a to-do”.
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
            {visibleTodos.map((t, i) => (
              <TodoRow
                key={t.id}
                first={i === 0}
                todo={t}
                assignee={t.assigneeId ? memberById.get(t.assigneeId) : undefined}
                showAssignee
                onToggle={(todo, done) => handleToggleTodo(todo.id, done)}
                onEdit={(todo) =>
                  setTodoComposer({
                    mode: 'edit',
                    initial: {
                      id: todo.id,
                      text: todo.title,
                      assigneeId: todo.assigneeId ?? null,
                      dueDate: todo.dueDate ?? null,
                    },
                  })
                }
                onDelete={(todo) => handleDeleteTodo(todo.id)}
                onJumpToSource={jumpToTodoSource}
              />
            ))}
          </div>
        )}
      </section>
      )}

      {/* Notes & learnings */}
      {NotesSectionComponent}

      <p className="text-center text-sm text-on-surface-variant/70 pt-2 flex items-center justify-center gap-2">
        <Feather className="w-3.5 h-3.5" />{' '}
        {canEdit
          ? 'A shared place to think together — so the team stays one mind.'
          : canSeeNotes
            ? 'Read along — the team is keeping nothing important to itself.'
            : 'A look at how each gathering comes together.'}
      </p>

      {/* Add / edit a to-do (centered) */}
      {todoComposer && (
        <TodoComposer
          mode={todoComposer.mode}
          initial={todoComposer.initial}
          team={team}
          meUid={uid}
          meName={meName}
          onClose={() => setTodoComposer(null)}
          onSaved={showToast}
        />
      )}

      {/* ephemeral confirmation */}
      {flash && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] bg-on-surface text-surface text-sm font-medium px-4 py-2.5 rounded-full shadow-lg">
          {flash}
        </div>
      )}

      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />

      <ContactDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        contact={selectedContact}
      />
    </div>
  );
}

// ── Pages list row ────────────────────────────────────────────────────────────
function DocRow({
  d,
  active,
  canEdit,
  liveMd,
  onClick,
  onTogglePin,
}: {
  d: BoardDoc;
  active: boolean;
  canEdit: boolean;
  liveMd?: string;
  onClick: () => void;
  onTogglePin?: () => void;
}) {
  const md = liveMd ?? d.md;
  const open = mdOpenTasks(md);
  const isToday = sessionStatus(d.date) === 'today';
  const audience = audienceOf(d);
  return (
    <div
      className={cn(
        'relative w-[232px] lg:w-full group rounded-[10px] border transition-colors mt-0 lg:mt-0.5 shrink-0',
        active ? 'bg-stage-accent-soft border-stage-accent/40' : 'border-transparent hover:bg-surface',
      )}
    >
      <button onClick={onClick} className="w-full grid grid-cols-[42px_1fr] gap-3 items-start text-left p-2.5">
        <span className="flex flex-col items-center pt-0.5">
          <span className={cn('text-[10.5px] font-bold tracking-wider uppercase', active ? 'text-stage-accent' : 'text-on-surface-variant/70')}>
            {weekdayShort(d.date)}
          </span>
          <span className={cn('font-serif text-[22px] leading-none', active || isToday ? 'text-stage-accent' : 'text-on-surface-variant')}>
            {dayNum(d.date)}
          </span>
        </span>
        <span className="min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-on-surface leading-snug truncate pr-5">{d.title}</span>
          <span className="text-[12.5px] text-on-surface-variant/70 leading-snug line-clamp-2">{mdPreview(md)}</span>
          <span className="flex items-center gap-2 mt-1">
            {isToday && (
              <span className="text-[10.5px] font-bold tracking-wide uppercase text-stage-accent bg-stage-accent-soft rounded-full px-2 py-px">
                Today
              </span>
            )}
            {open > 0 && canEdit && (
              <span className="text-[11.5px] text-on-surface-variant/80 bg-surface-variant border border-outline-variant rounded-full px-2 py-px">
                {open} to do
              </span>
            )}
            {(canEdit || audience !== 'everyone') && <AudienceBadge audience={audience} size="xs" />}
          </span>
        </span>
      </button>
      {onTogglePin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          title={d.pinned ? 'Unpin' : 'Pin to top'}
          aria-label={d.pinned ? 'Unpin' : 'Pin to top'}
          className={cn(
            'absolute top-0.5 right-0.5 p-2 rounded-md transition-colors',
            d.pinned ? 'text-stage-accent' : 'text-on-surface-variant/50 opacity-0 group-hover:opacity-100 hover:text-stage-accent',
          )}
        >
          <Pin className="w-3.5 h-3.5" fill={d.pinned ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
}

// ── Note Composer Popover ───────────────────────────────────────────────────
function NoteComposer({
  anchorRect,
  initialText,
  seriesOptions,
  onClose,
  onSaved,
  meUid,
  meName,
  sessionId,
}: {
  anchorRect: { top: number; left: number };
  initialText: string;
  seriesOptions: string[];
  onClose: () => void;
  onSaved?: (msg: string) => void;
  meUid: string;
  meName: string;
  sessionId: string;
}) {
  const [type, setType] = useState<NoteType>('record');
  const [series, setSeries] = useState(seriesOptions[0] || 'Team');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(initialText);
  const [saving, setSaving] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  React.useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight ?? 260;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(anchorRect.left - 160, 12), vw - 332);
    let top = anchorRect.top + 14;
    if (top + h > vh - 12) top = Math.max(12, anchorRect.top - h - 14);
    setPos({ left, top });
  }, [anchorRect]);

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const ref = doc(collection(db, 'board_notes'));
      await setDoc(ref, {
        type,
        series,
        title: title.trim() || 'Untitled note',
        body: body.trim(),
        date: todayISO(),
        contributorIds: [meUid],
        tags: [],
        sessionId: sessionId || '',
        createdAt: serverTimestamp(),
        createdBy: meUid,
        createdByName: meName,
        updatedAt: serverTimestamp(),
        updatedBy: meUid,
        updatedByName: meName,
      });
      logActivity({
        action: type === 'learning' ? 'recorded a learning' : 'saved a record',
        targetId: ref.id,
        targetName: title || 'Note',
        targetType: 'comment',
        type: 'create',
        description: series,
      } as never);
      onSaved?.(`Note saved to ${series}.`);
      onClose();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'board_notes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        style={pos ? { position: 'fixed', left: pos.left, top: pos.top, width: 320 } : { display: 'none' }}
        className="bg-surface rounded-2xl border border-outline-variant p-4 shadow-xl flex flex-col space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-sm font-semibold text-on-surface">Make note/learning</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-surface-container-low border border-outline-variant rounded-xl p-0.5">
            {(['record', 'learning'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setType(k)}
                className={cn(
                  'px-2 py-1 rounded-lg text-[11px] font-medium capitalize transition-colors',
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
            className="bg-surface border border-outline-variant rounded-xl px-2 py-1 text-xs text-on-surface-variant focus:outline-none focus:border-stage-accent"
          >
            {seriesOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors"
          autoFocus
        />

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Note content..."
          className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors resize-y leading-relaxed"
        />

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant text-xs font-medium rounded-xl hover:bg-surface-container transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="px-3 py-1.5 bg-primary text-on-primary text-xs font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-all"
          >
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Link Composer Popover (insert a link with custom display text) ─────────
function LinkComposer({
  anchorRect,
  initialText,
  onClose,
  onInsert,
}: {
  anchorRect: { top: number; left: number };
  initialText: string;
  onClose: () => void;
  onInsert: (text: string, href: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const [href, setHref] = useState('');

  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  React.useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight ?? 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(anchorRect.left - 160, 12), vw - 332);
    let top = anchorRect.top + 14;
    if (top + h > vh - 12) top = Math.max(12, anchorRect.top - h - 14);
    setPos({ left, top });
  }, [anchorRect]);

  const canInsert = text.trim().length > 0 && href.trim().length > 0;

  const handleInsert = () => {
    if (!canInsert) return;
    onInsert(text.trim(), href.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        style={pos ? { position: 'fixed', left: pos.left, top: pos.top, width: 320 } : { display: 'none' }}
        className="bg-surface rounded-2xl border border-outline-variant p-4 shadow-xl flex flex-col space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-sm font-semibold text-on-surface">Insert link</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant">
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Text to display"
          className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors"
          autoFocus
        />
        <input
          value={href}
          onChange={(e) => setHref(e.target.value)}
          placeholder="https://example.com"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleInsert();
          }}
          className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors"
        />

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant text-xs font-medium rounded-xl hover:bg-surface-container transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!canInsert}
            className="px-3 py-1.5 bg-primary text-on-primary text-xs font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-all"
          >
            Insert link
          </button>
        </div>
      </div>
    </div>
  );
}

// ── The live document editor ──────────────────────────────────────────────────
export function DocEditor({
  doc: d,
  meUid,
  meName,
  pagesCollapsed,
  onTogglePages,
  onLiveMarkdownChange,
  onSaveMarkdown,
  onSaveTitle,
  onSaveAudience,
  onPromote,
  onDelete,
  team,
  onToast,
  contacts,
  onSelectContact,
  onOpenContactModal,
}: {
  doc: BoardDoc;
  meUid: string;
  meName: string;
  pagesCollapsed: boolean;
  onTogglePages: () => void;
  onLiveMarkdownChange: (md: string) => void;
  onSaveMarkdown: (id: string, md: string) => void;
  onSaveTitle: (id: string, title: string) => void;
  onSaveAudience: (id: string, audience: Audience) => void;
  onPromote: (d: BoardDoc) => void;
  onDelete: (d: BoardDoc) => void;
  team: TeamMember[];
  onToast: (msg: string) => void;
  contacts: Contact[];
  onSelectContact: (c: Contact | null) => void;
  onOpenContactModal: (open: boolean) => void;
}) {
  const { user } = useAuth();

  // This component is remounted (key={doc.id}) per page, so a fresh Y.Doc +
  // awareness live for exactly one page's lifetime.
  const ydoc = useMemo(() => new Y.Doc(), []);
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);
  const meColor = useMemo(() => colorFor(meUid), [meUid]);

  const [, force] = useReducer((x) => x + 1, 0);
  const [saved, setSaved] = useState(true);
  const [live, setLive] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [markdownSource, setMarkdownSource] = useState('');
  const [peers, setPeers] = useState<{ id: number; name: string; color: string }[]>([]);
  const [title, setTitle] = useState(d.title);

  // Highlight → floating bubble menu over selection:
  const canvasRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [fab, setFab] = useState<{ text: string; lines: string[]; top: number; left: number } | null>(null);
  const [todoFromSelection, setTodoFromSelection] = useState<{ rect: { top: number; left: number }; text: string; lines?: string[] } | null>(null);
  const [noteFromSelection, setNoteFromSelection] = useState<{ rect: { top: number; left: number }; text: string } | null>(null);
  const [linkComposer, setLinkComposer] = useState<{ rect: { top: number; left: number }; text: string } | null>(null);
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const linkBtnRef = useRef<HTMLButtonElement>(null);

  const refreshSelectionFab = () => {
    if (todoFromSelection || noteFromSelection || showSource) {
      setFab(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setFab(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!canvasRef.current || !canvasRef.current.contains(range.commonAncestorContainer)) {
      setFab(null);
      return;
    }
    const rawText = sel.toString();
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (!text) {
      setFab(null);
      return;
    }

    const lines = parseSelectionToTasks(rawText);

    const r = range.getBoundingClientRect();
    setFab({ text, lines, top: r.top, left: r.left + r.width / 2 });
  };

  const openTodoFromFab = () => {
    if (!fab) return;
    setTodoFromSelection({
      rect: { top: fab.top, left: fab.left },
      text: fab.text,
      lines: fab.lines.length > 1 ? fab.lines : undefined
    });
    setFab(null);
  };

  const openNoteFromFab = () => {
    if (!fab) return;
    setNoteFromSelection({ rect: { top: fab.top, left: fab.left }, text: fab.text });
    setFab(null);
  };

  const openLinkFromFab = () => {
    if (!fab) return;
    setLinkComposer({ rect: { top: fab.top, left: fab.left }, text: fab.text });
    setFab(null);
  };

  const openLinkFromToolbar = () => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const text = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    const rect = linkBtnRef.current?.getBoundingClientRect();
    setLinkComposer({ rect: { top: rect ? rect.bottom : 80, left: rect ? rect.left : 80 }, text });
  };

  // Inserts a link with custom display text. If the selection is unchanged,
  // just applies the link mark; otherwise replaces the selection (or inserts
  // at the cursor when nothing was selected) with the new linked text.
  const insertLink = (text: string, hrefInput: string) => {
    if (!editor || !text.trim()) return;
    const trimmedHref = hrefInput.trim();
    if (!trimmedHref) return;
    const href = /^[a-z][a-z0-9+.-]*:/i.test(trimmedHref) ? trimmedHref : `https://${trimmedHref}`;
    const { from, to, empty } = editor.state.selection;
    const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    if (!empty && selectedText === text) {
      chain().extendMarkRange('link').setLink({ href }).run();
      return;
    }
    let c = chain();
    if (!empty) c = c.deleteSelection();
    c.insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }).run();
  };

  const handleAssignDirectly = async (member: TeamMember) => {
    if (!fab) return;
    const lines = fab.lines;
    setFab(null);
    setAssignMenuOpen(false);

    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();

    try {
      if (lines.length > 1) {
        for (const line of lines) {
          await addTodo(
            {
              title: line,
              assigneeId: member.uid,
              dueDate: null,
              source: { docId: d.id, docTitle: title || d.title || 'Untitled page' },
            },
            { uid: meUid, name: meName }
          );
        }
        onToast(`Created ${lines.length} tasks assigned to ${member.name.split(' ')[0]}.`);
      } else {
        await addTodo(
          {
            title: fab.text,
            assigneeId: member.uid,
            dueDate: null,
            source: { docId: d.id, docTitle: title || d.title || 'Untitled page' },
          },
          { uid: meUid, name: meName }
        );
        onToast(`Task assigned to ${member.name.split(' ')[0]}.`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Keyboard shortcut: pressing `@` key while selection FAB is active opens Direct Assignment menu
  useEffect(() => {
    if (!fab) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '@') {
        e.preventDefault();
        setAssignMenuOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fab]);

  // AI Insights States
  const [analyzing, setAnalyzing] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [insightsData, setInsightsData] = useState<{
    updatedMarkdown: string;
    suggestedTasks: any[];
  } | null>(null);
  const [linksApplied, setLinksApplied] = useState(false);
  const [addedTasks, setAddedTasks] = useState<Record<number, boolean>>({});
  const [dismissedTasks, setDismissedTasks] = useState<Record<number, boolean>>({});
  const [aiError, setAiError] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markdownSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didSeed = useRef(false);
  const edRef = useRef<Editor | null>(null);

  const scheduleSave = (md: string) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onSaveMarkdown(d.id, md);
      setSaved(true);
    }, 1200);
  };

  // Push the live Markdown up so this page's Pages-list row (preview + "to do"
  // count) updates as you type — more frequent than the Firestore save, but still
  // throttled to spare parent re-renders.
  const scheduleLivePreview = (md: string) => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => onLiveMarkdownChange(md), 300);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }), // Yjs owns history
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({ html: false, tightLists: true, linkify: true, transformPastedText: true }),
      CustomTab,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Write the page — a heading, some notes, a checklist…' }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({ provider: { awareness }, user: { name: meName, color: meColor } }),
    ],
    editorProps: {
      attributes: { class: 'bdoc-prose', spellcheck: 'false' },
      // Match rich (HTML) pastes — Google Docs, Notion, a webpage, a rendered AI
      // reply — to the page's own formatting by routing them through Markdown
      // (turndown → editor's Markdown parser), dropping the source's foreign
      // markup and inline styles. Internal copy/paste is left to ProseMirror.
      transformPastedHTML: (html) => {
        if (html.includes('data-pm-slice')) return html;
        const ed = edRef.current;
        if (!ed) return html;
        return editorMdToHtml(ed, htmlToBoardMarkdown(html));
      },
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement;
        const link = target.closest('a');
        if (link) {
          const href = link.getAttribute('href');
          if (href && (href.startsWith('/contacts/') || href.startsWith('contact://'))) {
            event.preventDefault();
            const contactId = href.replace('/contacts/', '').replace('contact://', '');
            const c = contacts.find((x) => x.id === contactId);
            if (c) {
              onSelectContact(c);
              onOpenContactModal(true);
              return true;
            }
          }
        }
        return false;
      },
    },
    onCreate: ({ editor }) => {
      edRef.current = editor;
    },
    onUpdate: ({ editor, transaction }) => {
      if (!transaction.docChanged) return;
      const md = editorMarkdown(editor);
      scheduleSave(md);
      scheduleLivePreview(md);
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

  // Sync editor markdown to markdownSource state when editor updates
  useEffect(() => {
    if (!editor || !showSource) return;
    const handleUpdate = () => {
      // Only update if the active element is not the textarea to avoid cursor jumping
      if (document.activeElement?.id !== 'markdown-source-textarea') {
        setMarkdownSource(editorMarkdown(editor));
      }
    };
    editor.on('update', handleUpdate);
    // Initialize
    setMarkdownSource(editorMarkdown(editor));
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, showSource]);

  // Auto-resize raw markdown textarea to match content height
  useEffect(() => {
    if (showSource && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [markdownSource, showSource]);

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

  // Cancel a pending live-preview push on unmount — a page switch resets the
  // parent's live Markdown, so a late fire would wrongly stamp it onto the next
  // page's row. (Save/title timers are intentionally left to flush.)
  useEffect(() => () => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    if (markdownSyncTimer.current) clearTimeout(markdownSyncTimer.current);
  }, []);

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => onSaveTitle(d.id, v), 800);
  };

  const formatFriendlyError = (rawError: string): string => {
    if (!rawError) return "An unexpected error occurred.";
    
    let cleanMsg = rawError.trim();

    const extractMessage = (obj: any): string | null => {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.error && typeof obj.error === 'object' && obj.error.message) {
        return obj.error.message;
      }
      if (obj.message && typeof obj.message === 'string') {
        return obj.message;
      }
      if (obj.error && typeof obj.error === 'string') {
        try {
          const nested = JSON.parse(obj.error);
          const nestedMsg = extractMessage(nested);
          if (nestedMsg) return nestedMsg;
        } catch {}
        return obj.error;
      }
      return null;
    };

    try {
      if (cleanMsg.startsWith('{') && cleanMsg.endsWith('}')) {
        const parsed = JSON.parse(cleanMsg);
        const extracted = extractMessage(parsed);
        if (extracted) {
          cleanMsg = extracted;
        }
      }
    } catch {}

    try {
      if (cleanMsg.startsWith('{') && cleanMsg.endsWith('}')) {
        const parsed = JSON.parse(cleanMsg);
        if (parsed.message) {
          cleanMsg = parsed.message;
        } else if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) {
          cleanMsg = parsed.error.message;
        }
      }
    } catch {}

    if (
      cleanMsg.includes("experiences high demand") || 
      cleanMsg.includes("high demand") || 
      cleanMsg.includes("503") || 
      cleanMsg.includes("UNAVAILABLE")
    ) {
      return "The AI service is temporarily unavailable due to high demand. Please try again in a few moments.";
    }
    if (
      cleanMsg.includes("API key not valid") || 
      cleanMsg.includes("API_KEY_INVALID") ||
      cleanMsg.includes("API key expired")
    ) {
      return "The configured AI service key is invalid. Please contact support or check your server configuration.";
    }

    return cleanMsg;
  };

  const analyzeNotes = async () => {
    if (!editor) return;
    const text = editorMarkdown(editor);
    if (!text.trim()) {
      alert("Please write some notes first before running AI analysis.");
      return;
    }
    setAnalyzing(true);
    setAiError(null);
    setInsightsData(null);
    setLinksApplied(false);
    setAddedTasks({});
    setDismissedTasks({});
    setShowInsights(true);

    try {
      let token: string | null = null;
      try {
        if (user && typeof user.getIdToken === 'function') {
          token = await user.getIdToken();
        }
      } catch (tokenErr) {
        console.error('Failed to get Firebase ID token:', tokenErr);
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/analyze-notes', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        let errMsg = "Failed to analyze notes";
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {
          try {
            errMsg = await res.text() || errMsg;
          } catch {}
        }
        throw new Error(errMsg);
      }
      const data = await res.json();
      if (data.success) {
        setInsightsData(data);
      } else {
        throw new Error(data.error || "Analysis failed");
      }
    } catch (err: any) {
      console.error("AI Analysis Error: ", err);
      setAiError(formatFriendlyError(err.message || String(err)));
    } finally {
      setAnalyzing(false);
    }
  };

  const applyLinks = () => {
    if (!editor || !insightsData?.updatedMarkdown) return;
    editor.commands.setContent(insightsData.updatedMarkdown);
    setLinksApplied(true);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const val = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (e.key === 'Tab') {
      e.preventDefault();
      const insert = '  '; // 2 spaces
      
      if (!e.shiftKey) {
        // Tab: indent
        const newVal = val.substring(0, start) + insert + val.substring(end);
        const renumbered = renumberMarkdownLists(newVal);
        setMarkdownSource(renumbered);
        
        if (markdownSyncTimer.current) clearTimeout(markdownSyncTimer.current);
        markdownSyncTimer.current = setTimeout(() => {
          if (editor) editor.commands.setContent(renumbered);
        }, 1000);
        
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + insert.length;
        });
      } else {
        // Shift-Tab: outdent
        const beforeCursor = val.substring(0, start);
        const lineStartIdx = beforeCursor.lastIndexOf('\n') + 1;
        const currentLine = val.substring(lineStartIdx, start);
        if (currentLine.startsWith('  ')) {
          const newVal = val.substring(0, lineStartIdx) + currentLine.substring(2) + val.substring(start);
          const renumbered = renumberMarkdownLists(newVal);
          setMarkdownSource(renumbered);
          
          if (markdownSyncTimer.current) clearTimeout(markdownSyncTimer.current);
          markdownSyncTimer.current = setTimeout(() => {
            if (editor) editor.commands.setContent(renumbered);
          }, 1000);
          
          requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd = Math.max(lineStartIdx, start - 2);
          });
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter: auto indent
      const beforeCursor = val.substring(0, start);
      const lineStartIdx = beforeCursor.lastIndexOf('\n') + 1;
      const currentLine = val.substring(lineStartIdx, start);
      
      const indent = (currentLine.match(/^[\s\t]*/) as RegExpMatchArray)[0];
      
      const insert = '\n' + indent;
      const newVal = val.substring(0, start) + insert + val.substring(end);
      const renumbered = renumberMarkdownLists(newVal);
      setMarkdownSource(renumbered);
      
      if (markdownSyncTimer.current) clearTimeout(markdownSyncTimer.current);
      markdownSyncTimer.current = setTimeout(() => {
        if (editor) editor.commands.setContent(renumbered);
      }, 1000);
      
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + insert.length;
      });
    }
  };

  const handleSaveTask = async (taskData: {
    title: string;
    dueDate: string | null;
    priority: 'low' | 'medium' | 'high';
    contactId: string | null;
    assigneeId: string | null;
  }) => {
    const matchedContact = contacts.find((c) => c.id === taskData.contactId);
    const matchedAssignee = team.find((t) => t.uid === taskData.assigneeId);

    const taskRef = doc(collection(db, 'tasks'));
    await setDoc(taskRef, {
      title: taskData.title,
      dueDate: taskData.dueDate || null,
      priority: taskData.priority,
      contactId: taskData.contactId || null,
      contactName: matchedContact?.name || null,
      assigneeId: taskData.assigneeId || null,
      assigneeName: matchedAssignee?.name || null,
      status: 'pending',
      createdAt: serverTimestamp(),
    });

    logActivity({
      action: 'added task',
      targetId: taskRef.id,
      targetName: taskData.title,
      targetType: 'comment',
      type: 'create',
      description: `Assigned to ${matchedAssignee?.name || 'Unassigned'}`,
    } as never);
  };

  const status = sessionStatus(d.date);
  const st = DOC_STATUS[status];

  const ToolBtn = ({
    onClick,
    on,
    title: t,
    children,
    btnRef,
  }: {
    onClick: () => void;
    on?: boolean;
    title: string;
    children: React.ReactNode;
    btnRef?: React.Ref<HTMLButtonElement>;
  }) => (
    <button
      ref={btnRef}
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
          {pagesCollapsed && (
            <button
              type="button"
              onClick={onTogglePages}
              title="Show pages"
              aria-label="Show pages"
              className="hidden lg:grid w-8 h-8 -ml-1 place-items-center rounded-lg text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
            >
              <PanelLeftOpen className="w-[18px] h-[18px]" />
            </button>
          )}
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
          <AudiencePicker audience={audienceOf(d)} onChange={(a) => onSaveAudience(d.id, a)} />
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onPromote(d)}
            title="Keep this page as a record or learning in the archive"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-outline-variant text-xs font-medium text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent transition-colors"
          >
            <Tag className="w-3.5 h-3.5" /> Save to archive
          </button>
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
        className="w-full bg-transparent border-0 outline-none font-serif text-[24px] sm:text-[30px] font-medium tracking-tight text-on-surface leading-tight px-5 lg:px-8 pt-3 pb-2 placeholder:text-on-surface-variant/50"
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
              <ToolBtn title="Link" btnRef={linkBtnRef} on={editor.isActive('link')} onClick={openLinkFromToolbar}>
                <Link2 className="w-4 h-4" />
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
            onClick={() => {
              if (showInsights) {
                setShowInsights(false);
              } else {
                if (insightsData || aiError) {
                  setShowInsights(true);
                } else {
                  analyzeNotes();
                }
              }
            }}
            disabled={analyzing}
            title="Analyze notes with AI to link contacts and suggest tasks"
            className={cn(
              'inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-lg px-2.5 py-1 border transition-colors',
              showInsights
                ? 'bg-stage-accent-soft border-stage-accent/40 text-stage-accent'
                : 'bg-surface-variant border-outline-variant text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent',
            )}
          >
            <Sparkles className={cn("w-3.5 h-3.5", analyzing && "animate-spin text-stage-accent")} /> {analyzing ? 'Analyzing…' : 'AI Insights'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (showSource) {
                if (markdownSyncTimer.current) clearTimeout(markdownSyncTimer.current);
                if (editor) {
                  editor.commands.setContent(markdownSource);
                }
              }
              setShowSource((v) => !v);
            }}
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

      {/* canvas & sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Editor Content */}
        <div
          ref={canvasRef}
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-surface"
          onMouseUp={refreshSelectionFab}
          onKeyUp={refreshSelectionFab}
        >
          {showSource ? (
            <textarea
              ref={textareaRef}
              id="markdown-source-textarea"
              value={markdownSource}
              onChange={(e) => {
                const rawVal = e.target.value;
                const renumbered = renumberMarkdownLists(rawVal);
                
                const textarea = e.target;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                
                setMarkdownSource(renumbered);
                
                if (markdownSyncTimer.current) clearTimeout(markdownSyncTimer.current);
                markdownSyncTimer.current = setTimeout(() => {
                  if (editor) {
                    editor.commands.setContent(renumbered);
                  }
                }, 1000);
                
                requestAnimationFrame(() => {
                  textarea.selectionStart = start;
                  textarea.selectionEnd = end;
                });
              }}
              onKeyDown={handleTextareaKeyDown}
              spellCheck={false}
              className="block w-full max-w-[760px] mx-auto px-5 lg:px-8 py-7 min-h-[160px] bg-surface border-0 outline-none resize-none font-code text-[13.5px] leading-[1.7] text-on-surface-variant whitespace-pre-wrap focus:ring-1 focus:ring-primary/20 overflow-hidden"
              title="Markdown source view"
            />
          ) : (
            <EditorContent editor={editor as Editor} />
          )}
        </div>

        {/* AI Insights Sidebar */}
        {showInsights && (
          <aside className="w-[320px] border-l border-outline-variant bg-surface-container-low flex flex-col min-h-0 shrink-0">
            {/* Sidebar Head */}
            <div className="flex items-center justify-between p-4 border-b border-outline-variant shrink-0 bg-surface">
              <span className="font-serif text-lg text-on-surface flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-stage-accent" /> AI Insights
              </span>
              <div className="flex items-center gap-1">
                {insightsData && (
                  <button
                    onClick={analyzeNotes}
                    disabled={analyzing}
                    className="p-1 rounded-md text-on-surface-variant/70 hover:bg-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
                    title="Refresh AI Insights"
                    aria-label="Refresh AI Insights"
                  >
                    <RotateCw className={cn("w-4 h-4", analyzing && "animate-spin")} />
                  </button>
                )}
                <button
                  onClick={() => setShowInsights(false)}
                  className="p-1 rounded-md text-on-surface-variant/70 hover:bg-surface-variant hover:text-on-surface transition-colors"
                  title="Close sidebar"
                  aria-label="Close sidebar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sidebar Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
              {analyzing ? (
                <div className="h-60 flex flex-col items-center justify-center text-center p-4">
                  <div className="relative mb-4 flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <Sparkles className="w-4 h-4 absolute text-stage-accent animate-pulse" />
                  </div>
                  <h4 className="text-sm font-semibold text-on-surface mb-1">Reading between the lines...</h4>
                  <p className="text-xs text-on-surface-variant max-w-[200px]">
                    Gemini is extracting action items and looking up contact names.
                  </p>
                </div>
              ) : aiError ? (
                <div className="p-3 bg-error-container/20 border border-error-container/30 rounded-xl text-center space-y-2">
                  <p className="text-xs text-error font-medium">{aiError}</p>
                  <button
                    onClick={analyzeNotes}
                    className="px-3 py-1.5 bg-error text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Try again
                  </button>
                </div>
              ) : insightsData ? (
                <>
                  {/* Link Suggestions */}
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-bold tracking-wider uppercase text-on-surface-variant/70">
                      Contact Links
                    </h5>
                    <div className="bg-surface border border-outline-variant rounded-xl p-3 space-y-3">
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        We scanned the notes and matched contact names to their profile database links.
                      </p>
                      {linksApplied ? (
                        <div className="flex items-center gap-1.5 text-xs text-tertiary font-semibold">
                          <Check className="w-4 h-4" /> Links applied to notes!
                        </div>
                      ) : (
                        <button
                          onClick={applyLinks}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-stage-accent text-white text-xs font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all"
                        >
                          Apply Links to Notes
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Task Suggestions */}
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-bold tracking-wider uppercase text-on-surface-variant/70">
                      Suggested Tasks
                    </h5>
                    {insightsData.suggestedTasks.length === 0 ? (
                      <p className="text-xs text-on-surface-variant/70 italic bg-surface border border-outline-variant rounded-xl p-3">
                        No tasks found in the text. Try writing something like "Tony to text Jerry on Monday".
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {insightsData.suggestedTasks.map((t, idx) => {
                          if (dismissedTasks[idx]) return null;
                          const isAdded = addedTasks[idx];

                          return (
                            <SuggestedTaskCard
                              key={idx}
                              task={t}
                              isAdded={isAdded}
                              contacts={contacts}
                              team={team}
                              meUid={meUid}
                              onAdd={() => setAddedTasks(prev => ({ ...prev, [idx]: true }))}
                              onDismiss={() => setDismissedTasks(prev => ({ ...prev, [idx]: true }))}
                              onSaveTask={handleSaveTask}
                            />
                          );
                        })}
                        {Object.keys(dismissedTasks).length + Object.keys(addedTasks).length === insightsData.suggestedTasks.length && (
                          <p className="text-xs text-on-surface-variant/70 italic text-center py-2">
                            All suggestions processed!
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-on-surface-variant">
                  <p className="text-xs italic">Notes must be analyzed first.</p>
                  <button
                    onClick={analyzeNotes}
                    className="mt-3 px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Run AI Analysis
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Highlight → Selection Menu */}
      {fab && !todoFromSelection && !noteFromSelection && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: 'fixed', top: fab.top - 44, left: fab.left, transform: 'translateX(-50%)' }}
          className="z-[110] flex items-center bg-on-surface text-surface rounded-full shadow-lg h-9 px-1.5 gap-1 select-none"
        >
          <button
            onClick={openTodoFromFab}
            className="flex items-center gap-1.5 px-2.5 h-6 rounded-full hover:bg-surface/10 text-xs font-semibold transition-colors"
            title="Make a to-do"
          >
            <CheckSquare className="w-3.5 h-3.5" /> Todo
          </button>

          <div className="w-px h-4 bg-surface/20" />

          <button
            onClick={openNoteFromFab}
            className="flex items-center gap-1.5 px-2.5 h-6 rounded-full hover:bg-surface/10 text-xs font-semibold transition-colors"
            title="Make into note/learning"
          >
            <Feather className="w-3.5 h-3.5" /> Note/Learning
          </button>

          <div className="w-px h-4 bg-surface/20" />

          <button
            onClick={openLinkFromFab}
            className="flex items-center gap-1.5 px-2.5 h-6 rounded-full hover:bg-surface/10 text-xs font-semibold transition-colors"
            title="Turn into a link"
          >
            <Link2 className="w-3.5 h-3.5" /> Link
          </button>

          <div className="w-px h-4 bg-surface/20" />

          <div className="relative">
            <button
              onClick={() => setAssignMenuOpen(!assignMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 h-6 rounded-full hover:bg-surface/10 text-xs font-semibold transition-colors"
              title="Assign to member"
            >
              <AtSign className="w-3.5 h-3.5" /> Assign
            </button>
            
            {assignMenuOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-on-surface border border-surface/10 rounded-xl shadow-xl py-1 w-44 flex flex-col z-[120] max-h-48 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-150">
                {team.map((m) => (
                  <button
                    key={m.uid}
                    onClick={() => handleAssignDirectly(m)}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface/15 text-left text-xs font-medium w-full text-surface transition-colors"
                  >
                    <PersonAvatar person={m} size="xs" />
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Composer anchored to the selection */}
      {todoFromSelection && (
        <TodoComposer
          mode="create"
          anchorRect={todoFromSelection.rect}
          initial={{ text: todoFromSelection.text, assigneeId: null }}
          initialTexts={todoFromSelection.lines}
          source={{ docId: d.id, docTitle: title || d.title || 'Untitled page' }}
          team={team}
          meUid={meUid}
          meName={meName}
          onClose={() => setTodoFromSelection(null)}
          onSaved={onToast}
        />
      )}

      {/* Note Composer anchored to the selection */}
      {noteFromSelection && (
        <NoteComposer
          anchorRect={noteFromSelection.rect}
          initialText={noteFromSelection.text}
          seriesOptions={BOARD_SERIES}
          onClose={() => setNoteFromSelection(null)}
          onSaved={onToast}
          meUid={meUid}
          meName={meName}
          sessionId={d.id}
        />
      )}

      {/* Link Composer — toolbar button or the selection pill menu */}
      {linkComposer && (
        <LinkComposer
          anchorRect={linkComposer.rect}
          initialText={linkComposer.text}
          onClose={() => setLinkComposer(null)}
          onInsert={insertLink}
        />
      )}
    </div>
  );
}

// ── Note card (records + learnings archive) ──────────────────────────────────
function NoteCard({
  n,
  memberById,
  canEdit,
  noteTab,
  onEdit,
  onSoftDelete,
  onRestore,
  onRemoveForever,
  onToggleArchive,
  onToggleDisplayMode,
  onToggleChecklistItem,
  onRemove,
}: {
  n: BoardNote;
  memberById: Map<string, TeamMember>;
  canEdit?: boolean;
  noteTab?: 'active' | 'archived' | 'trash';
  onEdit?: (n: BoardNote) => void;
  onSoftDelete?: (n: BoardNote) => void;
  onRestore?: (n: BoardNote) => void;
  onRemoveForever?: (n: BoardNote) => void;
  onToggleArchive?: (n: BoardNote) => void;
  onToggleDisplayMode?: (n: BoardNote) => void;
  onToggleChecklistItem?: (n: BoardNote, lineIdx: number, done: boolean) => void;
  onRemove?: (n: BoardNote) => void;
}) {
  const isLearning = n.type === 'learning';
  const ageDays = Math.round((Date.now() - new Date(n.date).getTime()) / 86400000);
  const oldRecall = ageDays > 300;
  const isListMode = n.displayMode === 'list' || (n.body && n.body.split('\n').some((l) => /^\s*-\s*\[[ xX]\]/.test(l)));
  const lines = n.body ? n.body.split('\n') : [];

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
        {n.archivedAt != null && (
          <span className="px-1.5 py-0.5 rounded bg-surface-variant text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
            Archived
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 text-on-surface-variant/70 whitespace-nowrap">
          {oldRecall && (
            <span className="px-1.5 py-px rounded-full bg-stage-amber-soft text-stage-amber font-semibold text-[10.5px]">1 yr</span>
          )}
          {dateLabelOf(n.date)}
        </span>

        {canEdit && (
          <div className="flex items-center gap-1 ml-1">
            {onToggleDisplayMode && (
              <button
                onClick={() => onToggleDisplayMode(n)}
                className="p-1 text-on-surface-variant/50 hover:text-primary transition-colors"
                title={isListMode ? 'Switch to text mode' : 'Switch to checklist mode'}
              >
                {isListMode ? <Type className="w-3.5 h-3.5" /> : <ListChecks className="w-3.5 h-3.5" />}
              </button>
            )}
            {onEdit && noteTab !== 'trash' && (
              <button
                onClick={() => onEdit(n)}
                className="p-1 text-on-surface-variant/50 hover:text-primary transition-colors"
                title="Edit note"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
            {onToggleArchive && noteTab !== 'trash' && (
              <button
                onClick={() => onToggleArchive(n)}
                className={cn('p-1 transition-colors', n.archivedAt ? 'text-primary' : 'text-on-surface-variant/50 hover:text-primary')}
                title={n.archivedAt ? 'Unarchive note' : 'Archive note'}
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            )}
            {noteTab === 'trash' ? (
              <>
                {onRestore && (
                  <button
                    onClick={() => onRestore(n)}
                    className="p-1 text-on-surface-variant/50 hover:text-primary transition-colors"
                    title="Restore note"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                )}
                {onRemoveForever && (
                  <button
                    onClick={() => onRemoveForever(n)}
                    className="p-1 text-on-surface-variant/50 hover:text-error transition-colors"
                    title="Delete forever"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            ) : (
              (onSoftDelete || onRemove) && (
                <button
                  onClick={() => (onSoftDelete ? onSoftDelete(n) : onRemove?.(n))}
                  className="p-1 text-on-surface-variant/50 hover:text-error transition-colors"
                  title="Move to Trash"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>
        )}
      </div>

      <h4 className="font-serif text-lg text-on-surface leading-snug mb-2">{n.title}</h4>

      {n.body && (
        isListMode ? (
          <div className="space-y-1.5 mb-3.5 text-sm text-on-surface-variant">
            {lines.map((line, idx) => {
              const isChecked = /^\s*-\s*\[[xX]\]/.test(line);
              const cleanText = line.replace(/^\s*-\s*\[[ xX]\]\s*/, '');
              return (
                <label key={idx} className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => onToggleChecklistItem?.(n, idx, e.target.checked)}
                    disabled={!canEdit}
                    className="mt-0.5 w-3.5 h-3.5 rounded border-outline-variant text-primary focus:ring-primary/20 accent-primary"
                  />
                  <span className={cn('leading-normal', isChecked && 'line-through opacity-60')}>
                    {cleanText}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-4 mb-3.5">{n.body}</p>
        )
      )}

      <div className="flex items-center gap-3 mt-auto">
        <div className="flex -space-x-2">
          {(n.contributorIds || []).slice(0, 4).map((id) => (
            <div key={id} className="ring-2 ring-surface rounded-full">
              <Avatar member={memberById.get(id)} size="xs" />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

// ── Add-note form ─────────────────────────────────────────────────────────────
// Exported for EmbedCoordinationDoc.tsx's admin-only "Save to archive" flow.
export function NoteForm({
  seriesOptions,
  initial,
  onCancel,
  onSave,
}: {
  seriesOptions: string[];
  initial?: NoteFormInitial;
  onCancel: () => void;
  onSave: (f: { id?: string; type: NoteType; series: string; title: string; body: string; tags: string[]; displayMode?: 'text' | 'list' }) => void;
}) {
  const [type, setType] = useState<NoteType>(initial?.type ?? 'record');
  const [series, setSeries] = useState(initial?.series || seriesOptions[0] || 'Team');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [displayMode, setDisplayMode] = useState<'text' | 'list'>(initial?.displayMode ?? 'text');

  const toggleMode = () => {
    if (displayMode === 'text') {
      const formatted = body
        .split('\n')
        .map((l) => (l.trim().startsWith('- [') ? l : `- [ ] ${l}`))
        .join('\n');
      setBody(formatted);
      setDisplayMode('list');
    } else {
      const plain = body
        .split('\n')
        .map((l) => l.replace(/^\s*-\s*\[[ xX]\]\s*/, ''))
        .join('\n');
      setBody(plain);
      setDisplayMode('text');
    }
  };

  const field =
    'w-full bg-surface border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors';

  return (
    <div className="mb-4 p-4 rounded-2xl bg-surface border border-outline-variant space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
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
        <button
          type="button"
          onClick={toggleMode}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
            displayMode === 'list'
              ? 'bg-stage-accent-soft text-stage-accent border-stage-accent/40'
              : 'bg-surface border-outline-variant text-on-surface-variant hover:text-on-surface',
          )}
          title={displayMode === 'list' ? 'Switch to text format' : 'Switch to checklist format'}
        >
          {displayMode === 'list' ? <ListChecks className="w-3.5 h-3.5" /> : <Type className="w-3.5 h-3.5" />}
          <span>{displayMode === 'list' ? 'List format' : 'Text format'}</span>
        </button>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A short title — what this was about" className={field} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder={displayMode === 'list' ? "- [ ] First item\n- [ ] Second item" : "What happened, or what you learned…"}
        className={cn(field, 'resize-y leading-relaxed font-sans')}
      />
      <div className="flex gap-2.5 justify-end">
        <button
          onClick={onCancel}
          className="px-3.5 py-2 border border-outline-variant text-on-surface-variant text-sm font-medium rounded-xl hover:bg-surface-container transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ id: initial?.id, type, series, title, body, tags: [], displayMode })}
          disabled={!title.trim()}
          className="px-3.5 py-2 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-all"
        >
          {initial?.id ? 'Update note' : type === 'learning' ? 'Save learning' : 'Save record'}
        </button>
      </div>
    </div>
  );
}

// ── Suggested Task card inside AI Insights sidebar ────────────────────────────
function SuggestedTaskCard({
  task,
  isAdded,
  contacts,
  team,
  meUid,
  onAdd,
  onDismiss,
  onSaveTask,
}: {
  task: any;
  isAdded: boolean;
  contacts: Contact[];
  team: TeamMember[];
  meUid: string;
  onAdd: () => void;
  onDismiss: () => void;
  onSaveTask: (taskData: {
    title: string;
    dueDate: string | null;
    priority: 'low' | 'medium' | 'high';
    contactId: string | null;
    assigneeId: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(task.priority || 'medium');
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId || meUid || '');
  const [contactId, setContactId] = useState<string>(task.contactId || '');
  const [saving, setSaving] = useState(false);

  const saveTask = async () => {
    if (!title.trim()) return;
    try {
      setSaving(true);
      await onSaveTask({
        title: title.trim(),
        dueDate: dueDate || null,
        priority,
        contactId: contactId || null,
        assigneeId: assigneeId || null,
      });
      onAdd();
    } catch (err) {
      console.error('Failed to save suggested task: ', err);
      alert('Failed to save task: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  if (isAdded) {
    return (
      <div className="bg-tertiary/10 border border-tertiary/30 rounded-xl p-3 flex items-center justify-between text-xs">
        <span className="text-on-surface font-medium truncate flex-1">
          <del className="text-on-surface-variant">{title}</del>
        </span>
        <span className="flex items-center gap-1 text-tertiary font-semibold ml-2">
          <Check className="w-3.5 h-3.5" /> Added
        </span>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-outline-variant rounded-xl p-3.5 space-y-3 shadow-xs">
      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        rows={2}
        className="w-full text-xs font-semibold text-on-surface bg-transparent border-0 resize-none focus:outline-none focus:ring-0 p-0 leading-snug"
        placeholder="Task description"
      />

      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
        {/* Assignee */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-on-surface-variant/60 block">Who</label>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full bg-surface border border-outline-variant rounded-lg p-1 text-[11px] text-on-surface focus:outline-none"
          >
            <option value="">Unassigned</option>
            {team.map((t) => (
              <option key={t.uid} value={t.uid}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Due Date */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-on-surface-variant/60 block">When</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-surface border border-outline-variant rounded-lg p-1 text-[11px] text-on-surface focus:outline-none"
          />
        </div>

        {/* Contact */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-on-surface-variant/60 block">Contact</label>
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="w-full bg-surface border border-outline-variant rounded-lg p-1 text-[11px] text-on-surface focus:outline-none"
          >
            <option value="">None</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-on-surface-variant/60 block">Priority</label>
          <div className="flex bg-surface-container border border-outline-variant rounded-lg p-0.5">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  'flex-1 text-[9.5px] font-bold uppercase rounded py-0.5 transition-colors',
                  priority === p
                    ? p === 'high'
                      ? 'bg-error text-white'
                      : p === 'medium'
                        ? 'bg-stage-amber text-on-stage-amber'
                        : 'bg-stage-teal text-white'
                    : 'text-on-surface-variant/60 hover:text-on-surface',
                )}
              >
                {p.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onDismiss}
          className="px-2 py-1 text-on-surface-variant/70 hover:bg-surface-variant rounded text-[11px] font-semibold"
        >
          Dismiss
        </button>
        <button
          onClick={saveTask}
          disabled={saving || !title.trim()}
          className="flex items-center gap-1 px-3 py-1 bg-primary text-on-primary rounded-lg text-[11px] font-semibold hover:opacity-90 transition-opacity"
        >
          {saving ? 'Adding...' : 'Add Task'}
        </button>
      </div>
    </div>
  );
}

interface HierarchicalParsedLine {
  raw: string;
  cleanText: string;
  indent: number;
  isParent: boolean;
}

function parseSelectionToTasks(rawText: string): string[] {
  const lines = rawText.split('\n');
  const parsedLines: HierarchicalParsedLine[] = [];

  // 1. First pass: parse lines, compute indentation and clean text
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Base indentation from leading spaces/tabs
    const rawIndent = line.match(/^[\s\t]*/)?.[0] || '';
    let indent = 0;
    for (const char of rawIndent) {
      indent += char === '\t' ? 2 : 1;
    }

    // Conceptually list items are indented relative to plain text parent headers
    const startsWithMarker = /^[\-\*\+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed);
    if (startsWithMarker) {
      indent += 2; // virtual indentation boost for list markers
    }

    const cleanText = trimmed
      .replace(/^[\-\*\+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .trim();

    if (cleanText) {
      parsedLines.push({
        raw: line,
        cleanText,
        indent,
        isParent: false
      });
    }
  }

  // 2. Second pass: mark lines that are followed by a line with strictly greater indentation as parents
  for (let i = 0; i < parsedLines.length; i++) {
    const current = parsedLines[i];
    if (i < parsedLines.length - 1) {
      const next = parsedLines[i + 1];
      if (next.indent > current.indent) {
        current.isParent = true;
      }
    }
  }

  // 3. Third pass: construct task names with hierarchical context
  const result: string[] = [];
  const parentStack: { text: string; indent: number }[] = [];

  for (const item of parsedLines) {
    // Pop parents that have greater or equal indentation than current item
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].indent >= item.indent) {
      parentStack.pop();
    }

    const parentPrefix = parentStack.map(p => p.text).join(': ');
    const fullTaskName = parentPrefix ? `${parentPrefix}: ${item.cleanText}` : item.cleanText;

    if (item.isParent) {
      parentStack.push({ text: item.cleanText, indent: item.indent });
    } else {
      result.push(fullTaskName);
    }
  }

  return result;
}
