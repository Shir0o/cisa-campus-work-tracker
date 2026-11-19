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
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, rtdb, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import {
  softDeleteBoardDoc,
  restoreBoardDoc,
  pinBoardDoc,
  reorderPinnedBoardDocs,
  boardDocsQuery,
} from '../lib/data/board';
import { useUndoSnack } from '../hooks/useUndoSnack';
import { UndoSnackbar } from '../components/UndoSnackbar';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { cn, getUserInitials, isServiceAccountName } from '../lib/utils';
import { usePreserveScroll } from '../lib/usePreserveScroll';
import ShareDocModal from '../components/modals/ShareDocModal';
import { Skeleton } from '../components/ui/Skeleton';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Search,
  X,
  ShieldAlert,
  Trash2,
  Feather,
  NotebookPen,
  Bold,
  Italic,
  Strikethrough,
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
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  AtSign,
  Lock,
  Globe,
  Link2,
  Share2,
  Pin,
  GripVertical,
  Maximize2,
  Minimize2,
  Hash,
  FileText,
} from 'lucide-react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Collaboration } from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import { TaskItem } from '@tiptap/extension-task-item';
import { TightTaskList } from '../lib/tightTaskList';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { RtdbYjsProvider } from '../lib/yjsRtdbProvider';
import { peersFromAwareness, colorFor, type Peer } from '../lib/presence';
import {
  BoardDoc,
  DocGroup,
  Audience,
  BOARD_AUDIENCE,
  AUDIENCE_ORDER,
  audienceOf,
  canViewBoard,
  todayISO,
  longDateOf,
  dateLabelOf,
  weekdayShort,
  dayNum,
  docGroup,
  DOC_GROUPS,
  DOC_STATUS,
  sessionStatus,
  docByDateDesc,
  docSortOrder,
  boardDocHref,
  boardDocRefFromHref,
  isStricterAudience,
  newDocMarkdown,
  bodyMarkdownForDisplay,
  persistDocEdit,
  type DocSaveState,
  type DocMarkdownWriter,
  parseDocTasks,
  collectDocTaskNodes,
  planDocTaskEdits,
  slugifyHeading,
  searchBoardContent,
} from '../lib/board';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { mdSummary, mdOpenTasks, htmlToBoardMarkdown } from '../lib/markdown';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Task, Contact } from '../types';
import TodoComposer, { type TodoComposerInitial } from '../components/todos/TodoComposer';
import TodoRow, { PersonAvatar } from '../components/todos/TodoRow';
import { setTodoDone, deleteTodo, addTodo, updateTodo } from '../lib/todos';
import { parseSmartDate } from '../lib/dateParser';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import { useLanguage } from '../components/LanguageProvider';

// ── Team (cursor identities) ──────────────────────────────────────────────────
export interface TeamMember {
  uid: string;
  name: string;
  photoURL?: string;
  role?: string;
}

const SectionHead = ({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) => (
  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
    <h2 className="font-serif text-2xl text-on-surface">{title}</h2>
    {sub && <span className="text-sm text-on-surface-variant">{sub}</span>}
    {action && <div className="ml-auto self-center">{action}</div>}
  </div>
);


// tiptap-markdown augments editor.storage with a `markdown` namespace.
type MarkdownStorage = {
  markdown: { getMarkdown: () => string; parser: { parse: (md: string) => string } };
};
const editorMarkdown = (ed: Editor): string => (ed.storage as unknown as MarkdownStorage).markdown.getMarkdown();

// Prevent caret from jumping to end of document when an undo (Cmd+Z) reverts a change
// where the caret was located.
const CaretPreserveExtension = Extension.create({
  name: 'caretPreserve',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('caretPreserve'),
        appendTransaction(transactions, oldState, newState) {
          const isUndoOrRedo = transactions.some(
            (tr) => tr.getMeta('history$') || tr.getMeta('y-undo$') || tr.getMeta('revert')
          );
          if (!isUndoOrRedo) return null;

          const oldSel = oldState.selection;
          const newSel = newState.selection;
          const docSize = newState.doc.content.size;

          if (newSel.to >= docSize - 1 && oldSel.to < docSize - 5) {
            let targetPos = oldSel.from;
            for (const tr of transactions) {
              targetPos = tr.mapping.map(targetPos);
            }
            const safePos = Math.max(1, Math.min(targetPos, docSize - 1));
            try {
              const $pos = newState.doc.resolve(safePos);
              const sel = TextSelection.near($pos);
              return newState.tr.setSelection(sel);
            } catch {
              return null;
            }
          }
          return null;
        },
      }),
    ];
  },
});

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
  const { t } = useLanguage();
  const label = t(`coordination.audience_${audience}`, meta.label);
  const sub = t(`coordination.audience_${audience}_sub`, meta.sub);
  return (
    <span
      title={sub}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        AUDIENCE_CHIP[audience],
        size === 'xs' ? 'px-1.5 py-px text-[10.5px]' : 'px-2 py-0.5 text-xs',
      )}
    >
      <Icon className={size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'} /> {label}
    </span>
  );
}

// Full-timer control to set who a page is open to.
function AudiencePicker({ audience, onChange }: { audience: Audience; onChange: (a: Audience) => void }) {
  const Icon = AUDIENCE_ICON[BOARD_AUDIENCE[audience].icon];
  const { t } = useLanguage();
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full pl-2 pr-0.5 py-0.5 text-xs font-medium', AUDIENCE_CHIP[audience])}
      title={t('coordination.who_can_see_page')}
    >
      <Icon className="w-3 h-3" />
      <select
        value={audience}
        onChange={(e) => onChange(e.target.value as Audience)}
        aria-label={t('coordination.page_audience')}
        className="bg-transparent border-0 outline-none text-xs font-medium cursor-pointer pr-0.5"
      >
        {AUDIENCE_ORDER.map((a) => (
          <option key={a} value={a}>
            {t(`coordination.audience_${a}`, BOARD_AUDIENCE[a].label)} · {t(`coordination.audience_${a}_sub`, BOARD_AUDIENCE[a].sub)}
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
const slugify = slugifyHeading;

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
  const { t } = useLanguage();
  const text = getHeadingText(children);
  const id = slugify(text);
  const Tag = level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4';

  return (
    <Tag id={id} data-anchor={id} className={cn('group flex items-center gap-2 scroll-mt-20', className)}>
      <span>{children}</span>
      {id && (
        // #1852: hidden only where hover exists — a touch screen has none, so
        // a prefix-less opacity-0 left a tab stop nobody could see. Focus
        // inside the heading reveals it for keyboard users, and the coarse
        // pointer gets a 44px hit area around the 16px icon.
        <a
          href={`#${id}`}
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = id;
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 transition-opacity text-stage-accent hover:text-stage-accent-hover inline-flex items-center justify-center pointer-coarse:min-w-11 pointer-coarse:min-h-11"
          title={t('coordination.link_to_section')}
          aria-label={t('coordination.link_to_section')}
        >
          <Link2 className="w-4 h-4" />
        </a>
      )}
    </Tag>
  );
};

const renderWithAssigneeBadges = (content: React.ReactNode): React.ReactNode => {
  if (typeof content !== 'string') {
    if (Array.isArray(content)) {
      return React.Children.map(content, (child) => renderWithAssigneeBadges(child));
    }
    return content;
  }
  const parts = content.split(/(\(@[^)]+\))/g);
  if (parts.length <= 1) return content;
  return parts.map((part, i) => {
    if (part.startsWith('(@') && part.endsWith(')')) {
      const name = part.slice(2, -1);
      return (
        <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-accent border border-accent-line ml-1.5 font-sans not-italic">
          @{name}
        </span>
      );
    }
    return part;
  });
};

// ── Read-only page render for non-editors (Trainees + Students) ───────────────
// No TipTap/Yjs — just the durable markdown rendered with react-markdown so a
// viewer never loads collaborative editing or writes presence.
const READONLY_MD: Components = {
  h1: ({ children }) => <HeadingWithAnchor level={2} className="font-serif text-2xl text-on-surface mt-6 mb-2 first:mt-0">{children}</HeadingWithAnchor>,
  h2: ({ children }) => <HeadingWithAnchor level={3} className="font-serif text-xl text-on-surface mt-5 mb-2">{children}</HeadingWithAnchor>,
  h3: ({ children }) => <HeadingWithAnchor level={4} className="font-semibold text-on-surface mt-4 mb-1.5">{children}</HeadingWithAnchor>,
  p: ({ children }) => <p className="text-[15px] text-on-surface-variant leading-relaxed my-2">{renderWithAssigneeBadges(children)}</p>,
  ul: ({ children, className }) => (
    <ul className={cn('my-2 space-y-1 text-[15px] text-on-surface-variant', className?.includes('contains-task-list') ? 'list-none pl-1' : 'pl-5')}>
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="pl-5 my-2 space-y-1 text-[15px] text-on-surface-variant">{children}</ol>,
  li: ({ children, className }) => (
    <li className={cn('leading-relaxed', className?.includes('task-list-item') && 'list-none flex items-start gap-2')}>{renderWithAssigneeBadges(children)}</li>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-stage-accent underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-on-surface">{children}</strong>,
  del: ({ children }) => <del className="line-through text-on-surface-variant/70">{children}</del>,
  s: ({ children }) => <del className="line-through text-on-surface-variant/70">{children}</del>,
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
  isFullscreen,
  onToggleFullscreen,
  nativeFs,
  onToggleNativeFs,
  canNativeFs,
}: {
  doc: BoardDoc;
  pagesCollapsed: boolean;
  onTogglePages: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  nativeFs?: boolean;
  onToggleNativeFs?: () => void;
  canNativeFs?: boolean;
}) {
  const st = DOC_STATUS[sessionStatus(d.date)];
  const { t, language } = useLanguage();
  const markdownToRender = d.md
    ? bodyMarkdownForDisplay(d.md, d.title || '')
    : t('coordination.this_page_empty');
  return (
    <div className="bdoc-fs-doc flex flex-col min-w-0 bg-surface overflow-y-auto custom-scrollbar">
      {/* head */}
      <div className="bdoc-fs-head flex items-center justify-between gap-2.5 flex-wrap px-5 lg:px-8 pt-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          {pagesCollapsed && (
            <button
              type="button"
              onClick={onTogglePages}
              title={t('coordination.show_pages')}
              aria-label={t('coordination.show_pages')}
              className="hidden lg:grid w-8 h-8 -ml-1 place-items-center rounded-lg text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
            >
              <PanelLeftOpen className="w-[18px] h-[18px]" />
            </button>
          )}
          {st && (
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', STATUS_CHIP[st.tone] || STATUS_CHIP[''])}>
              {t(st.key)}
            </span>
          )}
          <span className="text-[13px] text-on-surface-variant font-medium">
            {longDateOf(d.date, language)}
            {d.time ? ` · ${d.time}` : ''}
          </span>
          {d.place && (
            <span className="inline-flex items-center gap-1 text-[13px] text-on-surface-variant/70">
              <MapPin className="w-3.5 h-3.5" /> {d.place}
            </span>
          )}
          <AudienceBadge audience={audienceOf(d)} />
          {d.updatedByName && (
            <span className="inline-flex items-center gap-1 text-[12.5px] text-on-surface-variant/80">
              <Feather className="w-3 h-3" /> {t('coordination.last_edited_by').replace('{name}', d.updatedByName)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isFullscreen && onToggleNativeFs && canNativeFs && (
            <button
              type="button"
              onClick={onToggleNativeFs}
              title={nativeFs ? t('coordination.leave_whole_screen') : t('coordination.fill_whole_screen')}
              aria-label={nativeFs ? t('coordination.leave_whole_screen') : t('coordination.whole_screen')}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-outline-variant text-xs font-medium transition-colors',
                nativeFs ? 'bg-stage-accent/10 border-stage-accent/40 text-stage-accent' : 'text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent'
              )}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{nativeFs ? t('coordination.leave_whole_screen') : t('coordination.whole_screen')}</span>
            </button>
          )}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              title={isFullscreen ? t('coordination.back_to_board') + '  (Esc)' : t('coordination.open_full_screen')}
              aria-label={isFullscreen ? t('coordination.close_full_screen') : t('coordination.open_full_screen')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-outline-variant text-xs font-medium text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isFullscreen ? t('coordination.back_to_board') : t('actions.full_screen')}</span>
            </button>
          )}
        </div>
      </div>

      <h1 className="bdoc-fs-title font-serif text-[24px] sm:text-[30px] font-medium tracking-tight text-on-surface leading-tight px-5 lg:px-8 pt-3 pb-3">
        {d.title}
      </h1>

      <div className="bdoc-fs-canvas px-5 lg:px-8 pb-6 bdoc-prose-viewer">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={READONLY_MD}>
          {markdownToRender}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default function CoordinationNotes() {
  const { isAdmin, user, role } = useAuth();
  const { t, language } = useLanguage();
  const isMe = user?.email?.toLowerCase() === 'yilongwang05@gmail.com';
  // Full-timers (admins) edit; a legacy owner account may too. The Board is
  // Full-timers only now (cut-or-keep §19), so no lower role is let in.
  const canEdit = isAdmin || isMe;
  const canView = canEdit || canViewBoard(role);
  const uid = user?.uid || '';
  const meName = user?.displayName || user?.email || t('coordination.someone');

  const [docs, setDocs] = useState<BoardDoc[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
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

  // Fullscreen mode state & handlers for distraction-free editing/viewing.
  // The open page is wrapped in `.bdoc-fs-hold` (fsHoldRef); in-window FS
  // pins that hold over the whole window (design: `.bdoc-hold.is-fs`), and
  // native "Whole screen" requests fullscreen ON THE HOLD, not the document,
  // so only the browser chrome is hidden, not the app's whole frame.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nativeFs, setNativeFs] = useState(false);
  const [canNativeFs, setCanNativeFs] = useState(false);
  const fsHoldRef = useRef<HTMLDivElement | null>(null);

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    if (!next && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const toggleNativeFs = () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (fsHoldRef.current?.requestFullscreen) {
      fsHoldRef.current.requestFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const sync = () => {
      const on = !!document.fullscreenElement;
      setNativeFs(on);
      if (on) setIsFullscreen(true);
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    setCanNativeFs(!!(document.fullscreenEnabled && fsHoldRef.current && fsHoldRef.current.requestFullscreen));
    // Lock the page scroll behind the pinned hold (design: `body.bdoc-fs-on`).
    document.body.classList.add('bdoc-fs-on');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Let the @mention menu take Esc first; the browser owns Esc in native full screen
        if (document.querySelector('.bdoc-mmenu') || document.fullscreenElement) return;
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('bdoc-fs-on');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // When in-window FS is turned off, also exit native FS if it's still active.
  useEffect(() => {
    if (isFullscreen || !document.fullscreenElement) return;
    document.exitFullscreen().catch(() => {});
  }, [isFullscreen]);

  // Live Markdown of the page currently being edited, so its Pages-list row
  // (preview + "to do" count) reflects edits immediately rather than waiting for
  // the debounced Firestore save. Reset when switching pages.
  const [liveActiveMd, setLiveActiveMd] = useState<string | null>(null);
  useEffect(() => setLiveActiveMd(null), [activeId]);

  // unified coordination search state
  const [boardSearchQ, setBoardSearchQ] = useState('');
  const [boardSearchTab, setBoardSearchTab] = useState<'all' | 'heading' | 'task'>('all');
  const [isBoardSearchFocused, setIsBoardSearchFocused] = useState(false);
  const boardSearchRef = useRef<HTMLInputElement>(null);

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
      return;
    }

    // Full-timers read every page; the Board is Full-timers only now
    // (cut-or-keep §19), so there is no audience-scoped query to make.
    const unsubDocs = onSnapshot(
      boardDocsQuery(db),
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
              return !isServiceAccountName(u.member.name);
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
      unsubUsers();
      unsubTodos();
      unsubContacts();
    };
  }, [canView, canEdit, role]);

  // keep a sensible page focused: top pinned → today → soonest upcoming → most recent
  useEffect(() => {
    if (docs.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (activeId && docs.some((d) => d.id === activeId)) return;
    const sorted = [...docs].sort(docSortOrder);
    const topPinned = sorted.find((d) => d.pinned);
    const today = sorted.find((d) => sessionStatus(d.date) === 'today');
    const upcoming = [...sorted].reverse().find((d) => sessionStatus(d.date) === 'upcoming');
    const target = topPinned || today || upcoming || sorted[0];
    setActiveId(target.id);
    document.getElementById('coordination-notes-panel')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [docs, activeId]);

  // Deep-link from a to-do's source link, GlobalSearch, or URL anchor
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  // Deep-link jumps run on a short delay so the target has rendered. Track the
  // timers so unmount cancels them — otherwise a late callback touches
  // `document` after the owner is gone (a jsdom teardown crash in tests).
  const jumpTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scheduleJump = (fn: () => void, ms: number) => {
    jumpTimers.current.push(setTimeout(fn, ms));
  };
  useEffect(() => {
    const timers = jumpTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
    };
  }, []);

  const jumpToAnchor = (docId?: string, anchorId?: string) => {
    if (docId) {
      if (docs.some((d) => d.id === docId)) {
        setActiveId(docId);
        if (anchorId) {
          scheduleJump(() => {
            let el = document.getElementById(anchorId);
            if (!el) {
              const headings = Array.from(
                document.querySelectorAll<HTMLElement>(
                  '#coordination-notes-workspace h1, #coordination-notes-workspace h2, #coordination-notes-workspace h3, #coordination-notes-workspace h4, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4'
                )
              );
              el =
                headings.find(
                  (h) => slugifyHeading(h.textContent || '') === anchorId || h.getAttribute('data-anchor') === anchorId
                ) || null;
            }
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.remove('bdoc-anchor-highlight');
              void el.offsetWidth;
              el.classList.add('bdoc-anchor-highlight');
              scheduleJump(() => el?.classList.remove('bdoc-anchor-highlight'), 2200);
            } else {
              document.getElementById('coordination-notes-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 120);
        } else {
          document.getElementById('coordination-notes-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        showToast(t('coordination.page_no_longer_here'));
      }
    }
  };

  useEffect(() => {
    const locState = location.state as { focusDocId?: string; focusAnchorId?: string } | null;
    const focusDoc = locState?.focusDocId || searchParams.get('focusDoc');
    const focusAnchor = locState?.focusAnchorId || searchParams.get('anchor');

    if (focusDoc) {
      jumpToAnchor(focusDoc, focusAnchor || undefined);
    }
  }, [location.state, location.search, docs, searchParams]);

  // Unified search calculations
  const searchResults = useMemo(() => {
    return searchBoardContent(docs, todos, boardSearchQ, language);
  }, [docs, todos, boardSearchQ, language]);

  const filteredSearchResults = useMemo(() => {
    if (boardSearchTab === 'all') return searchResults;
    if (boardSearchTab === 'heading') return searchResults.filter((r) => r.kind === 'heading' || r.kind === 'doc');
    if (boardSearchTab === 'task') return searchResults.filter((r) => r.kind === 'task');
    return searchResults;
  }, [searchResults, boardSearchTab]);

  // Keyboard shortcut listener: '/' or 'Cmd+K' / 'Ctrl+K' focuses search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key?.toLowerCase() === 'k';
      const isSlash = e.key === '/' && !isInput;
      if (isCmdK || isSlash) {
        e.preventDefault();
        boardSearchRef.current?.focus();
        setIsBoardSearchFocused(true);
      } else if (e.key === 'Escape' && isBoardSearchFocused) {
        setIsBoardSearchFocused(false);
        boardSearchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBoardSearchFocused]);

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

  const jumpToTodoSource = (docId: string) => jumpToAnchor(docId);

  const grouped = useMemo(() => {
    const g: Record<DocGroup, BoardDoc[]> = { Pinned: [], 'This week': [], Earlier: [] };
    [...docs].sort(docSortOrder).forEach((d) => {
      (g[docGroup(d)] ||= []).push(d);
    });
    return g;
  }, [docs]);

  const active = docs.find((d) => d.id === activeId) || null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  const handlePinnedDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const pinnedDocs = grouped['Pinned'] || [];
    const oldIndex = pinnedDocs.findIndex((d) => d.id === active.id);
    const newIndex = pinnedDocs.findIndex((d) => d.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const reordered = arrayMove(pinnedDocs, oldIndex, newIndex);

    const orderMap = new Map(reordered.map((doc, idx) => [doc.id, idx]));
    setDocs((prevDocs) =>
      prevDocs.map((doc) => (orderMap.has(doc.id) ? { ...doc, pinnedOrder: orderMap.get(doc.id) } : doc)),
    );

    try {
      await reorderPinnedBoardDocs(reordered);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
    }
  };

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

  const saveMarkdown = async (id: string, md: string): Promise<boolean> => {
    try {
      const summary = mdSummary(md);
      await updateDoc(doc(db, 'board_docs', id), { md, summary, updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: meName });
      return true;
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
      return false;
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
      showToast(t('coordination.page_now_open_to').replace('{audience}', BOARD_AUDIENCE[audience].sub));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
    }
  };

  const deleteBoardDoc = async (d: BoardDoc) => {
    try {
      await softDeleteBoardDoc(d);
      if (activeId === d.id) setActiveId(null);
      showUndoSnack(t('coordination.page_moved_to_trash'), () => restoreBoardDoc(d));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
    }
  };

  // ── access gate ──────────────────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center" id="coordination-notes-guard">
        <div className="bg-error-container/10 border border-error-container/30 rounded-3xl p-12 max-w-xl mx-auto my-12 flex flex-col items-center">
          <div className="w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="font-serif text-2xl mb-3 text-on-background">{t('coordination.space_for_team')}</h2>
          <p className="text-on-surface-variant leading-relaxed">
            {t('coordination.access_body')}
          </p>
        </div>
      </div>
    );
  }

  // Header copy: the Board is a working surface for Full-timers.
  const heading = t('coordination.coordination_notes');
  const intro = canEdit ? (
    <>
      {t('coordination.page_per_gathering')}
    </>
  ) : (
    <>
      {t('coordination.open_to_everyone_intro')}
    </>
  );

  // People detail is a full page (the design's ContactDetail), not a popup.
  usePreserveScroll(!!(isDetailsModalOpen && selectedContact));
  if (isDetailsModalOpen && selectedContact) {
    return (
      <ContactDetailsModal
        isOpen
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedContact(null);
        }}
        contact={selectedContact}
      />
    );
  }

  const searchBarJSX = (
    <div className="relative mb-6">
      <div className="relative flex items-center">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
        <input
          ref={boardSearchRef}
          value={boardSearchQ}
          onChange={(e) => {
            setBoardSearchQ(e.target.value);
            setIsBoardSearchFocused(true);
          }}
          onFocus={() => setIsBoardSearchFocused(true)}
          placeholder={t('coordination.search_board_placeholder')}
          className="w-full bg-surface border border-outline-variant rounded-xl pl-10 pr-24 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-all "
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
          {boardSearchQ ? (
            <button
              type="button"
              onClick={() => setBoardSearchQ('')}
              className="pointer-events-auto text-on-surface-variant/60 hover:text-on-surface p-1"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-on-surface-variant/70 bg-surface-container-high border border-outline-variant rounded-md">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {/* Search dropdown results */}
      {isBoardSearchFocused && boardSearchQ.trim() && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-surface rounded-2xl border border-outline-variant shadow-xl z-50 overflow-hidden max-h-[420px] flex flex-col">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 p-2 bg-surface-container-low border-b border-outline-variant shrink-0">
            {(
              [
                { id: 'all', label: t('coordination.all'), count: searchResults.length },
                {
                  id: 'heading',
                  label: t('coordination.pages_headings'),
                  count: searchResults.filter((r) => r.kind === 'heading' || r.kind === 'doc').length,
                },
                { id: 'task', label: t('coordination.tasks'), count: searchResults.filter((r) => r.kind === 'task').length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setBoardSearchTab(tab.id)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5',
                  boardSearchTab === tab.id
                    ? 'bg-surface text-on-surface  font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] opacity-70">({tab.count})</span>
              </button>
            ))}
          </div>

          {/* Results list */}
          <div className="overflow-y-auto p-2 space-y-1 divide-y divide-outline-variant/30">
            {filteredSearchResults.length === 0 ? (
              <div className="p-6 text-center text-sm text-on-surface-variant italic">
                No matching results found for "{boardSearchQ}". Try another search term.
              </div>
            ) : (
              filteredSearchResults.map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => {
                    jumpToAnchor(res.docId, res.anchorId);
                    setIsBoardSearchFocused(false);
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-surface-container-low transition-colors flex items-start gap-3 group"
                >
                  <div className="p-2 rounded-lg bg-surface-container text-stage-accent shrink-0 mt-0.5 group-hover:bg-stage-accent-soft">
                    {res.kind === 'heading' ? (
                      <Hash className="w-4 h-4 text-stage-accent" />
                    ) : res.kind === 'doc' ? (
                      <FileText className="w-4 h-4 text-stage-amber" />
                    ) : (
                      <CheckSquare className="w-4 h-4 text-stage-teal" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-on-surface truncate group-hover:text-stage-accent transition-colors">
                        {res.headingText ? res.headingText : res.title}
                      </span>
                      {res.date && (
                        <span className="text-[11px] text-on-surface-variant/70 shrink-0 font-mono">
                          {dateLabelOf(res.date, language)}
                        </span>
                      )}
                    </div>
                    {res.headingText && (
                      <div className="text-xs text-on-surface-variant truncate">
                        Page: <span className="font-medium">{res.title}</span> {res.anchorId && <span className="text-stage-accent ml-1 font-mono">#{res.anchorId}</span>}
                      </div>
                    )}
                    {res.subtitle && !res.headingText && (
                      <div className="text-xs text-on-surface-variant truncate">{res.subtitle}</div>
                    )}
                    {res.snippet && (
                      <p className="text-xs text-on-surface-variant/80 line-clamp-1 mt-0.5">{res.snippet}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-8" id="coordination-notes-panel">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="text-sm text-on-surface-variant mb-1">{longDateOf(todayISO(), language)}</div>
          <h1 className="font-serif text-3xl lg:text-4xl text-on-surface">{heading}</h1>
          <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">{intro}</p>
        </div>
        {canEdit && (
          <button
            onClick={createDoc}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shrink-0"
          >
            <Plus className="w-4 h-4" /> {t('coordination.new_page')}
          </button>
        )}
      </header>

      {/* Unified Search */}
      {searchBarJSX}

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
              {canEdit ? t('coordination.no_pages_yet') : t('coordination.nothing_here_yet')}
            </h3>
            <p className="text-sm text-on-surface-variant max-w-sm mb-5">
              {canEdit
                ? t('coordination.empty_pages_edit')
                : t('coordination.empty_pages_view')}
            </p>
            {canEdit && (
              <button
                onClick={createDoc}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 transition-all"
              >
                <Plus className="w-4 h-4" /> {t('coordination.start_page')}
              </button>
            )}
          </div>
        ) : (
          <div
            data-testid="coordination-notes-workspace"
            className={cn(
              'grid lg:grid-rows-1 bg-surface rounded-2xl border border-outline-variant  overflow-hidden min-h-[560px] lg:min-h-0 lg:h-[calc(100vh-6rem)] transition-all',
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
                <span className="font-serif text-[17px] text-on-surface">{t('coordination.pages')}</span>
                <div className="flex items-center gap-1.5">
                  {canEdit && (
                    <button
                      onClick={createDoc}
                      title={t('coordination.new_page')}
                      className="w-7 h-7 grid place-items-center rounded-lg bg-surface border border-outline text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isAdmin && (
                    <Link
                      to="/coordination/trash"
                      title={t('coordination.trash')}
                      aria-label={t('coordination.trash')}
                      className="w-7 h-7 grid place-items-center rounded-lg bg-surface border border-outline text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Link>
                  )}
                  <button
                    onClick={togglePages}
                    title={t('coordination.collapse_pages')}
                    aria-label={t('coordination.collapse_pages')}
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
                  const isPinnedGroup = g === 'Pinned';
                  return (
                    <div key={g} className="lg:mt-1.5 shrink-0 lg:shrink">
                      <div className="hidden lg:block text-[11px] font-semibold   text-on-surface-variant/70 px-2 pt-3 pb-1.5">
                        {g === 'Pinned' ? t('coordination.pinned') : g === 'This week' ? t('coordination.this_week') : t('coordination.earlier')}
                      </div>
                      {isPinnedGroup ? (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePinnedDragEnd}>
                          <SortableContext items={items.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                            <div className="flex lg:block gap-2 lg:gap-0">
                              {items.map((d) => (
                                <SortableDocRow
                                  key={d.id}
                                  d={d}
                                  active={d.id === activeId}
                                  canEdit={canEdit}
                                  liveMd={d.id === activeId ? liveActiveMd ?? undefined : undefined}
                                  onClick={() => setActiveId(d.id)}
                                  onTogglePin={
                                    canEdit
                                      ? () => {
                                          const nextOrder = (grouped['Pinned'] || []).length;
                                          pinBoardDoc(d, !d.pinned, d.pinned ? undefined : nextOrder);
                                        }
                                      : undefined
                                  }
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      ) : (
                        <div className="flex lg:block gap-2 lg:gap-0">
                          {items.map((d) => (
                            <DocRow
                              key={d.id}
                              d={d}
                              active={d.id === activeId}
                              canEdit={canEdit}
                              liveMd={d.id === activeId ? liveActiveMd ?? undefined : undefined}
                              onClick={() => setActiveId(d.id)}
                              onTogglePin={
                                canEdit
                                  ? () => {
                                      const nextOrder = (grouped['Pinned'] || []).length;
                                      pinBoardDoc(d, !d.pinned, d.pinned ? undefined : nextOrder);
                                    }
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Open page — full editor for full-timers, read-only render otherwise.
                Wrapped in `.bdoc-fs-hold`: in-window full screen pins ONLY this
                hold over the window (design: `.bdoc-hold.is-fs`), covering the
                page list + app chrome instead of keeping them side by side. */}
            {active ? (
              <div
                ref={fsHoldRef}
                data-testid="coordination-doc-hold"
                className={cn('bdoc-fs-hold bg-surface', isFullscreen && 'is-fs')}
              >
              {canEdit ? (
                <DocEditor
                  key={`${active.id}-${language}`}
                  doc={active}
                  pages={docs}
                  meUid={uid}
                  meName={meName}
                  pagesCollapsed={pagesCollapsed}
                  onTogglePages={togglePages}
                  onLiveMarkdownChange={setLiveActiveMd}
                  onSaveMarkdown={saveMarkdown}
                  onSaveTitle={saveTitle}
                  onSaveAudience={saveAudience}
                  onDelete={deleteBoardDoc}
                  team={team}
                  onToast={showToast}
                  contacts={contacts}
                  onSelectContact={setSelectedContact}
                  onOpenContactModal={setIsDetailsModalOpen}
                  todos={todos}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={toggleFullscreen}
                  nativeFs={nativeFs}
                  onToggleNativeFs={toggleNativeFs}
                  canNativeFs={canNativeFs}
                />
              ) : (
                <ReadOnlyDoc
                  key={`${active.id}-${language}`}
                  doc={active}
                  pagesCollapsed={pagesCollapsed}
                  onTogglePages={togglePages}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={toggleFullscreen}
                  nativeFs={nativeFs}
                  onToggleNativeFs={toggleNativeFs}
                  canNativeFs={canNativeFs}
                />
              )}
              </div>
            ) : (
              <div className="grid place-items-center text-sm text-on-surface-variant p-10">{t('coordination.select_page')}</div>
            )}
          </div>
        )}
      </section>

      {/* What we're carrying — every to-do the team is holding, in one list */}
      {canEdit && (
      <section>
        <SectionHead
          title={t('coordination.what_were_holding')}
          sub={t('coordination.todo_sub', 'Every to-do the team is carrying — {count}. Highlight a line in a page above, or add one here.').replace(
            '{count}',
            openTodoCount > 0 ? t('coordination.todo_open_count').replace('{n}', String(openTodoCount)) : t('coordination.all_clear'),
          )}
          action={
            <button
              onClick={() => setTodoComposer({ mode: 'create', initial: { assigneeId: uid } })}
              className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-stage-accent transition-colors"
            >
              <Plus className="w-4 h-4" /> {t('coordination.add_todo')}
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
              <Users className="w-3.5 h-3.5" /> {t('coordination.everyone')}
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
                  {m.uid === uid ? t('coordination.you_suffix') : ''}
                  {n > 0 && (
                    <span className="ml-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary/15 text-accent text-[10px] font-semibold inline-flex items-center justify-center">
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
            {t('coordination.show_done')}
          </button>
        </div>

        {visibleTodos.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-dashed border-outline-variant p-8 text-center flex flex-col items-center">
            <CheckSquare className="w-6 h-6 text-on-surface-variant/50 mb-2" />
            <p className="text-sm text-on-surface-variant max-w-sm">
              {t('coordination.no_todos_yet')}
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

      {/* Notes & learnings is cut (cut-or-keep §19). */}

      <p className="text-center text-sm text-on-surface-variant/70 pt-2 flex items-center justify-center gap-2">
        <Feather className="w-3.5 h-3.5" />{' '}
        {canEdit
          ? 'A shared place to think together — so the team stays one mind.'
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
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] bg-on-surface text-surface text-sm font-medium px-4 py-2.5 rounded-full shadow-lg"
        >
          {flash}
        </div>
      )}

      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </div>
  );
}

// ── Pages list row ────────────────────────────────────────────────────────────
function SortableDocRow({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <DocRow
        d={d}
        active={active}
        canEdit={canEdit}
        liveMd={liveMd}
        onClick={onClick}
        onTogglePin={onTogglePin}
        dragHandleProps={canEdit ? { ...attributes, ...listeners } : undefined}
      />
    </div>
  );
}

function DocRow({
  d,
  active,
  canEdit,
  liveMd,
  onClick,
  onTogglePin,
  dragHandleProps,
}: {
  d: BoardDoc;
  active: boolean;
  canEdit: boolean;
  liveMd?: string;
  onClick: () => void;
  onTogglePin?: () => void;
  dragHandleProps?: Record<string, any>;
}) {
  const md = liveMd ?? d.md;
  const open = mdOpenTasks(md);
  const isToday = sessionStatus(d.date) === 'today';
  const audience = audienceOf(d);
  const { t, language } = useLanguage();
  return (
    <div
      className={cn(
        'relative w-[232px] lg:w-full group rounded-[10px] border transition-colors mt-0 lg:mt-0.5 shrink-0',
        active ? 'bg-stage-accent-soft border-stage-accent/40' : 'border-transparent hover:bg-surface',
      )}
    >
      <button onClick={onClick} className="w-full grid grid-cols-[42px_1fr] gap-3 items-start text-left p-2.5">
        <span className="flex flex-col items-center pt-0.5">
          <span className={cn('text-[10.5px] font-semibold  ', active ? 'text-stage-accent' : 'text-on-surface-variant/70')}>
            {weekdayShort(d.date, language)}
          </span>
          <span className={cn('font-serif text-[22px] leading-none', active || isToday ? 'text-stage-accent' : 'text-on-surface-variant')}>
            {dayNum(d.date)}
          </span>
        </span>
        <span className="min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-on-surface leading-snug truncate pr-12">
            {d.title}
          </span>
          <span className="text-[12.5px] text-on-surface-variant/70 leading-snug line-clamp-2">
            <span>{d.summary || mdSummary(md)}</span>
          </span>
          <span className="flex items-center gap-2 mt-1">
            {isToday && (
              <span className="text-[10.5px] font-semibold   text-stage-accent bg-stage-accent-soft rounded-full px-2 py-px">
                {t('coordination.today')}
              </span>
            )}
            {open > 0 && canEdit && (
              <span className="text-[11.5px] text-on-surface-variant/80 bg-surface-variant border border-outline-variant rounded-full px-2 py-px">
                {t('coordination.to_do_count').replace('{n}', String(open))}
              </span>
            )}
            {(canEdit || audience !== 'everyone') && <AudienceBadge audience={audience} size="xs" />}
          </span>
        </span>
      </button>
      <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            type="button"
            title={t('coordination.drag_reorder')}
            aria-label={t('coordination.drag_reorder_aria').replace('{title}', d.title)}
            className="p-2 rounded-md text-on-surface-variant/40 opacity-0 group-hover:opacity-100 hover:text-stage-accent cursor-grab active:cursor-grabbing transition-colors"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        {onTogglePin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            title={d.pinned ? t('coordination.unpin') : t('coordination.pin_to_top')}
            aria-label={d.pinned ? t('coordination.unpin') : t('coordination.pin_to_top')}
            className={cn(
              'p-2 rounded-md transition-colors',
              d.pinned ? 'text-stage-accent' : 'text-on-surface-variant/50 opacity-0 group-hover:opacity-100 hover:text-stage-accent',
            )}
          >
            <Pin className="w-3.5 h-3.5" fill={d.pinned ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Link Composer Popover (insert a link, or reference another page) ───────
function LinkComposer({
  anchorRect,
  initialText,
  pages,
  currentDocId,
  pageAudience,
  onClose,
  onInsert,
}: {
  anchorRect: { top: number; left: number };
  initialText: string;
  pages: BoardDoc[];
  currentDocId: string;
  pageAudience: Audience;
  onClose: () => void;
  onInsert: (text: string, href: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const [href, setHref] = useState('');
  const [pageQuery, setPageQuery] = useState('');
  const [pickedPage, setPickedPage] = useState<BoardDoc | null>(null);
  const { t } = useLanguage();

  // Pages this author may point at: everything they can already see, minus the
  // page being edited (a self-reference is noise) and anything in Trash.
  const pageOptions = useMemo(() => {
    const needle = pageQuery.trim().toLowerCase();
    return [...pages]
      .filter((p) => p.id !== currentDocId && !p.deletedAt)
      .filter((p) => !needle || (p.title || '').toLowerCase().includes(needle) || (p.date || '').includes(needle))
      .sort(docByDateDesc)
      .slice(0, 40);
  }, [pages, currentDocId, pageQuery]);

  const pageTitle = (p: BoardDoc) => p.title?.trim() || t('coordination.untitled_page');

  const pickPage = (p: BoardDoc) => {
    setPickedPage(p);
    setHref(boardDocHref(p.id));
    // The authored display text wins (the selection flow prefills it); only fill
    // it in when there is nothing to overwrite.
    if (!text.trim()) setText(pageTitle(p));
  };

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
        className="bg-surface rounded-3xl border border-outline-variant p-4 flex flex-col space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-sm font-semibold text-on-surface">{t('coordination.insert_link')}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant">
            <X className="w-4 h-4" />
          </button>
        </div>

        {pages.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-on-surface-variant">{t('coordination.pick_a_page')}</div>
            <input
              value={pageQuery}
              onChange={(e) => setPageQuery(e.target.value)}
              placeholder={t('coordination.search_pages')}
              aria-label={t('coordination.search_pages')}
              className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors"
            />
            {pageOptions.length > 0 ? (
              <div
                data-testid="page-reference-options"
                className="max-h-36 overflow-y-auto rounded-xl border border-outline-variant/60"
              >
                {pageOptions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPage(p)}
                    aria-pressed={pickedPage?.id === p.id}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-surface-container transition-colors',
                      pickedPage?.id === p.id && 'bg-surface-container',
                    )}
                  >
                    <span className="flex-1 truncate text-on-surface">{pageTitle(p)}</span>
                    <span className="shrink-0 text-[10.5px] text-on-surface-variant">{p.date}</span>
                    <AudienceBadge audience={audienceOf(p)} size="xs" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-1 text-[11px] text-on-surface-variant">{t('coordination.no_pages_match')}</p>
            )}
          </div>
        )}

        {pickedPage && isStricterAudience(audienceOf(pickedPage), pageAudience) && (
          <p className="flex items-start gap-1.5 rounded-xl bg-surface-container px-2.5 py-2 text-[11px] text-on-surface-variant">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{t('coordination.private_reference_warning')}</span>
          </p>
        )}

        {pages.length > 0 && <div className="h-px bg-outline-variant/60" />}

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('coordination.text_to_display')}
          className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-stage-accent transition-colors"
          autoFocus
        />
        <input
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            // Typing a different target by hand means the picked page (and its
            // audience warning) no longer describes this link.
            setPickedPage(null);
          }}
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
            {t('coordination.cancel')}
          </button>
          <button
            onClick={handleInsert}
            disabled={!canInsert}
            className="px-3 py-1.5 bg-primary text-on-primary text-xs font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-all"
          >
            {t('coordination.insert_link')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── The live document editor ──────────────────────────────────────────────────
export function DocEditor({
  doc: d,
  pages,
  meUid,
  meName,
  pagesCollapsed,
  onTogglePages,
  onLiveMarkdownChange,
  onSaveMarkdown,
  onSaveTitle,
  onSaveAudience,
  onDelete,
  team,
  onToast,
  contacts,
  onSelectContact,
  onOpenContactModal,
  todos = [],
  isFullscreen,
  onToggleFullscreen,
  nativeFs,
  onToggleNativeFs,
  canNativeFs,
  onSaveStateChange,
}: {
  doc: BoardDoc;
  /** Every page this author can see — the shelf the link picker offers. */
  pages: BoardDoc[];
  meUid: string;
  meName: string;
  pagesCollapsed: boolean;
  onTogglePages: () => void;
  onLiveMarkdownChange: (md: string) => void;
  onSaveMarkdown: DocMarkdownWriter;
  onSaveTitle: (id: string, title: string) => void;
  onSaveAudience: (id: string, audience: Audience) => void;
  onDelete: (d: BoardDoc) => void;
  team: TeamMember[];
  onToast: (msg: string) => void;
  contacts: Contact[];
  onSelectContact: (c: Contact | null) => void;
  onOpenContactModal: (open: boolean) => void;
  todos?: Task[];
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  nativeFs?: boolean;
  onToggleNativeFs?: () => void;
  canNativeFs?: boolean;
  onSaveStateChange?: (state: DocSaveState) => void;
}) {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [shareOpen, setShareOpen] = useState(false);
  // The header button doubles as the sharing indicator: accented + dotted when a
  // live guest link exists, so a Full-timer can see the page is shared at a glance.
  const guestLinkActive = d.guestAccess?.enabled === true && Boolean(d.guestAccess.key);

  // This component is remounted (key={doc.id}) per page, so a fresh Y.Doc +
  // awareness live for exactly one page's lifetime.
  const ydoc = useMemo(() => new Y.Doc(), []);
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);
  const meColor = useMemo(() => colorFor(meUid), [meUid]);

  const [, force] = useReducer((x) => x + 1, 0);
  const [saveState, setSaveState] = useState<DocSaveState>('saved');
  const [live, setLive] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [markdownSource, setMarkdownSource] = useState('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [title, setTitle] = useState(d.title);

  // Highlight → floating bubble menu over selection:
  const canvasRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [fab, setFab] = useState<{ text: string; lines: string[]; top: number; left: number } | null>(null);
  const [todoFromSelection, setTodoFromSelection] = useState<{ rect: { top: number; left: number }; text: string; lines?: string[] } | null>(null);
  const [linkComposer, setLinkComposer] = useState<{ rect: { top: number; left: number }; text: string } | null>(null);
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const linkBtnRef = useRef<HTMLButtonElement>(null);

  const refreshSelectionFab = () => {
    if (todoFromSelection || showSource) {
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
    const href = /^[a-z][a-z0-9+.-]*:/i.test(trimmedHref) || trimmedHref.startsWith('/') ? trimmedHref : `https://${trimmedHref}`;
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
          const parsed = parseSmartDate(line);
          await addTodo(
            {
              title: line,
              assigneeId: member.uid,
              dueDate: parsed.isoDate,
              source: { docId: d.id, docTitle: title || d.title || 'Untitled page' },
            },
            { uid: meUid, name: meName }
          );
        }
        onToast(`Created ${lines.length} tasks assigned to ${member.name.split(' ')[0]}.`);
      } else {
        const parsed = parseSmartDate(fab.text);
        await addTodo(
          {
            title: fab.text,
            assigneeId: member.uid,
            dueDate: parsed.isoDate,
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

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markdownSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didSeed = useRef(false);
  const edRef = useRef<Editor | null>(null);

  const scheduleSave = (md: string) => {
    setSaveState('saving');
    onSaveStateChange?.('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // Only claim "Saved" once the write has actually landed (#1772).
      const result = await persistDocEdit(() => onSaveMarkdown(d.id, md));
      setSaveState(result);
      onSaveStateChange?.(result);
      if (result !== 'saved') return;

      // Bi-directional sync: check if tasks in doc changed status/title/assignee
      const docTasks = parseDocTasks(md);
      for (const dt of docTasks) {
        const existing = todos.find((t) => t.id === dt.id);
        if (existing) {
          const isDone = existing.status === 'completed';
          if (isDone !== dt.done) {
            void setTodoDone(dt.id, dt.done);
          }
          if (dt.title && (existing.title !== dt.title || (dt.assigneeId && existing.assigneeId !== dt.assigneeId))) {
            void updateTodo(dt.id, { title: dt.title, assigneeId: dt.assigneeId ?? existing.assigneeId });
          }
        }
      }
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
      CaretPreserveExtension,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({ html: false, tightLists: true, linkify: true, transformPastedText: true }),
      CustomTab,
      TightTaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Write the page — a heading, some notes, a checklist…' }),
      Collaboration.configure({ document: ydoc }),
      // `uid` rides along untouched by the caret's renderer, and is what lets the
      // presence stack tell one person's several sessions apart from several people.
      CollaborationCaret.configure({ provider: { awareness }, user: { uid: meUid, name: meName, color: meColor } }),
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
          // A page reference jumps inside the Board rather than reloading the app.
          const pageRef = boardDocRefFromHref(href);
          if (pageRef) {
            event.preventDefault();
            navigate('/coordination', {
              state: { focusDocId: pageRef.docId, focusAnchorId: pageRef.anchorId },
            });
            return true;
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

  // Push a raw-source edit into the editor. This one *is* a whole-document rewrite —
  // that is what editing the Markdown by hand means — so only do it when the text really
  // changed, and put the caret back where it was instead of at the end of the document.
  const pushMarkdownToEditor = (md: string) => {
    if (!editor || md === editorMarkdown(editor)) return;
    const { from, to } = editor.state.selection;
    editor.commands.setContent(md);
    const end = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: Math.min(from, end), to: Math.min(to, end) });
  };

  const scheduleMarkdownPush = (md: string) => {
    if (markdownSyncTimer.current) clearTimeout(markdownSyncTimer.current);
    markdownSyncTimer.current = setTimeout(() => pushMarkdownToEditor(md), 1000);
  };

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

  // presence — one face per person, not one per socket (see lib/presence)
  useEffect(() => {
    const update = () => setPeers(peersFromAwareness(awareness.getStates(), awareness.clientID, meUid));
    awareness.on('change', update);
    update();
    return () => awareness.off('change', update);
  }, [awareness, meUid]);

  // Bi-directional sync: reflect task updates made elsewhere (the sidebar, My Day, a
  // teammate) in this page's checklist lines.
  //
  // This patches only the lines that actually went stale. It must never rebuild the
  // document — `setContent` here rewrote the whole Y.Doc on every tasks/users snapshot,
  // which dropped the caret at the bottom of the page, lost whatever was selected, and
  // buried real edits under whole-doc entries in the Yjs undo stack (#174).
  useEffect(() => {
    if (!editor || todos.length === 0) return;
    const tasksMap = new Map(todos.map((t) => [t.id, { title: t.title, status: t.status, assigneeId: t.assigneeId || null }]));
    const teamMap = new Map(team.map((m) => [m.uid, { name: m.name }]));

    const { state } = editor;
    const nodes = collectDocTaskNodes(state.doc);
    const edits = planDocTaskEdits(nodes, tasksMap, teamMap, editor.isFocused ? state.selection : null);
    if (edits.length === 0) return;

    const tr = state.tr;
    for (const edit of edits) {
      if (edit.text) {
        tr.replaceWith(
          tr.mapping.map(edit.text.from),
          tr.mapping.map(edit.text.to),
          state.schema.text(edit.text.value),
        );
      }
      if (edit.checked !== undefined) {
        const pos = tr.mapping.map(edit.pos);
        const node = tr.doc.nodeAt(pos);
        if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: edit.checked });
      }
    }
    // Someone else's change is not something *you* should be able to undo.
    if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false));
  }, [todos, team, editor]);

  // realtime provider + first-open seeding (falls back to Firestore-only)
  useEffect(() => {
    if (!editor) return;
    const seedFromMd = () => {
      if (editor.isEmpty && d.md) editor.commands.setContent(bodyMarkdownForDisplay(d.md, d.title));
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
        
        scheduleMarkdownPush(renumbered);
        
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
          
          scheduleMarkdownPush(renumbered);
          
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
      
      scheduleMarkdownPush(renumbered);

      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + insert.length;
      });
    }
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
    <div className="bdoc-fs-doc flex flex-col min-w-0 bg-surface">
      {/* head */}
      <div className="bdoc-fs-head flex items-center justify-between gap-3 flex-wrap px-5 lg:px-8 pt-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          {pagesCollapsed && (
            <button
              type="button"
              onClick={onTogglePages}
              title={t('coordination.show_pages')}
              aria-label={t('coordination.show_pages')}
              className="hidden lg:grid w-8 h-8 -ml-1 place-items-center rounded-lg text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
            >
              <PanelLeftOpen className="w-[18px] h-[18px]" />
            </button>
          )}
          {st && (
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', STATUS_CHIP[st.tone] || STATUS_CHIP[''])}>
              {t(st.key)}
            </span>
          )}
          <span className="text-[13px] text-on-surface-variant font-medium">
            {longDateOf(d.date, language)}
            {d.time ? ` · ${d.time}` : ''}
          </span>
          {d.place && (
            <span className="inline-flex items-center gap-1 text-[13px] text-on-surface-variant/70">
              <MapPin className="w-3.5 h-3.5" /> {d.place}
            </span>
          )}
          <AudiencePicker audience={audienceOf(d)} onChange={(a) => onSaveAudience(d.id, a)} />
          {d.updatedByName && (
            <span className="inline-flex items-center gap-1 text-[12.5px] text-on-surface-variant/80">
              <Feather className="w-3 h-3" /> {t('coordination.last_edited_by').replace('{name}', d.updatedByName)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            title={t("coordination.share.button_title")}
            aria-label={t("coordination.share.button_title")}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              guestLinkActive
                ? "border-stage-accent/40 bg-stage-accent/10 text-stage-accent"
                : "border-outline-variant text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent",
            )}
          >
            <Share2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t("coordination.share.button")}</span>
            {guestLinkActive && <span className="w-1.5 h-1.5 rounded-full bg-stage-accent" aria-hidden />}
          </button>
          {isFullscreen && onToggleNativeFs && canNativeFs && (
            <button
              type="button"
              onClick={onToggleNativeFs}
              title={nativeFs ? t('coordination.leave_whole_screen') : t('coordination.fill_whole_screen')}
              aria-label={nativeFs ? t('coordination.leave_whole_screen') : t('coordination.whole_screen')}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-outline-variant text-xs font-medium transition-colors',
                nativeFs ? 'bg-stage-accent/10 border-stage-accent/40 text-stage-accent' : 'text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent'
              )}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{nativeFs ? t('coordination.leave_whole_screen') : t('coordination.whole_screen')}</span>
            </button>
          )}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              title={isFullscreen ? t('coordination.back_to_board') + '  (Esc)' : t('coordination.open_full_screen')}
              aria-label={isFullscreen ? t('coordination.close_full_screen') : t('coordination.open_full_screen')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-outline-variant text-xs font-medium text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isFullscreen ? t('coordination.back_to_board') : t('actions.full_screen')}</span>
            </button>
          )}
          {peers.length > 0 && (
            <div className="flex -space-x-1.5" title={t('coordination.peers_editing').replace('{n}', String(peers.length)).replace('{s}', peers.length === 1 ? '' : 's')}>
              {peers.slice(0, 4).map((p) => (
                <span
                  key={p.key}
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
              title={live ? t('coordination.live_title') : t('coordination.connecting')}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', live ? 'bg-tertiary' : 'bg-on-surface-variant/40')} /> {t('coordination.live')}
            </span>
          )}
          <button
            onClick={() => onDelete(d)}
            title={t('coordination.delete_page')}
            className="bdm-delete p-1.5 rounded-lg text-on-surface-variant/60 hover:text-error hover:bg-error-container/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* title */}
      {/* #1852: the field was named only by its placeholder, so a screen
          reader read "Untitled page" over a page that already has a title.
          The label is real and visually hidden; the placeholder stays as
          the sighted hint. Only one DocEditor is mounted at a time. */}
      <label htmlFor="coordination-page-title" className="sr-only">
        {t('coordination.page_title')}
      </label>
      <input
        id="coordination-page-title"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder={t('coordination.untitled_page')}
        spellCheck={false}
        className="bdoc-fs-title w-full bg-transparent border-0 outline-none font-serif text-[24px] sm:text-[30px] font-medium tracking-tight text-on-surface leading-tight px-5 lg:px-8 pt-3 pb-2 placeholder:text-on-surface-variant/50"
      />

      {/* toolbar */}
      <div className="bdoc-fs-toolbar sticky top-0 z-10 flex items-center gap-1 flex-wrap bg-surface border-y border-outline-variant px-4 lg:px-6 py-1.5 mx-1.5">
        {editor && (
          <>
            <div className="flex items-center gap-0.5">
              <ToolBtn title={t('coordination.toolbar_title')} on={editor.isActive('heading', { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
                <Heading1 className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title={t('coordination.toolbar_heading')} on={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
                <Heading2 className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title={t('coordination.toolbar_body')} on={editor.isActive('paragraph')} onClick={() => chain().setParagraph().run()}>
                <Type className="w-4 h-4" />
              </ToolBtn>
            </div>
            <span className="w-px h-5 bg-outline-variant mx-1.5" />
            <div className="flex items-center gap-0.5">
              <ToolBtn title={t('coordination.toolbar_bold')} on={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}>
                <Bold className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title={t('coordination.toolbar_italic')} on={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}>
                <Italic className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title={t('coordination.toolbar_strikethrough')} on={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}>
                <Strikethrough className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title={t('coordination.toolbar_link')} btnRef={linkBtnRef} on={editor.isActive('link')} onClick={openLinkFromToolbar}>
                <Link2 className="w-4 h-4" />
              </ToolBtn>
            </div>
            <span className="w-px h-5 bg-outline-variant mx-1.5" />
            <div className="flex items-center gap-0.5">
              <ToolBtn title={t('coordination.toolbar_bulleted_list')} on={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}>
                <List className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title={t('coordination.toolbar_numbered_list')} on={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}>
                <ListOrdered className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title={t('coordination.toolbar_checklist')} on={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()}>
                <ListChecks className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn title={t('coordination.toolbar_quote')} on={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}>
                <Quote className="w-4 h-4" />
              </ToolBtn>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span
            role="status"
            aria-live="polite"
            title={saveState === 'failed' ? t('coordination.save_failed_hint') : undefined}
            className={cn(
              'bdoc-save-state inline-flex items-center gap-1 text-xs whitespace-nowrap',
              saveState === 'saved' ? 'text-tertiary' : saveState === 'saving' ? 'text-on-surface-variant/70' : 'text-error',
            )}
          >
            {saveState === 'saved' ? (
              <>
                <Check className="w-3 h-3" /> {t('coordination.saved')}
              </>
            ) : saveState === 'saving' ? (
              t('coordination.saving')
            ) : (
              t('coordination.save_failed')
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              if (showSource) {
                if (markdownSyncTimer.current) clearTimeout(markdownSyncTimer.current);
                pushMarkdownToEditor(markdownSource);
              }
              setShowSource((v) => !v);
            }}
            title={t('coordination.view_markdown_source')}
            className={cn(
              'inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-lg px-2.5 py-1 border transition-colors',
              showSource
                ? 'bg-stage-accent-soft border-stage-accent/40 text-stage-accent'
                : 'bg-surface-variant border-outline-variant text-on-surface-variant hover:border-stage-accent/40 hover:text-stage-accent',
            )}
          >
            <Code2 className="w-3.5 h-3.5" /> {t('coordination.markdown')}
          </button>
        </div>
      </div>

      {/* canvas */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Editor Content */}
        <div
          ref={canvasRef}
          className="bdoc-fs-canvas flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-surface"
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
                
                scheduleMarkdownPush(renumbered);
                
                requestAnimationFrame(() => {
                  textarea.selectionStart = start;
                  textarea.selectionEnd = end;
                });
              }}
              onKeyDown={handleTextareaKeyDown}
              spellCheck={false}
              className="block w-full max-w-[760px] mx-auto px-5 lg:px-8 py-7 min-h-[160px] bg-surface border-0 outline-none resize-none font-code text-[13.5px] leading-[1.7] text-on-surface-variant whitespace-pre-wrap focus:ring-1 focus:ring-primary/20 overflow-hidden"
              title={t('coordination.markdown_source_view')}
            />
          ) : (
            <EditorContent editor={editor as Editor} />
          )}
        </div>
      </div>

      {/* Highlight → Selection Menu */}
      {fab && !todoFromSelection && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: 'fixed', top: fab.top - 44, left: fab.left, transform: 'translateX(-50%)' }}
          className="z-[110] flex items-center bg-on-surface text-surface rounded-full shadow-lg h-9 px-1.5 gap-1 select-none"
        >
          <button
            onClick={openTodoFromFab}
            className="flex items-center gap-1.5 px-2.5 h-6 rounded-full hover:bg-surface/10 text-xs font-semibold transition-colors"
            title={t('coordination.make_todo')}
          >
            <CheckSquare className="w-3.5 h-3.5" /> {t('coordination.todo')}
          </button>

          <div className="w-px h-4 bg-surface/20" />

          <button
            onClick={openLinkFromFab}
            className="flex items-center gap-1.5 px-2.5 h-6 rounded-full hover:bg-surface/10 text-xs font-semibold transition-colors"
            title={t('coordination.turn_link')}
          >
            <Link2 className="w-3.5 h-3.5" /> {t('coordination.link')}
          </button>

          <div className="w-px h-4 bg-surface/20" />

          <div className="relative">
            <button
              onClick={() => setAssignMenuOpen(!assignMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 h-6 rounded-full hover:bg-surface/10 text-xs font-semibold transition-colors"
              title={t('coordination.assign_member')}
            >
              <AtSign className="w-3.5 h-3.5" /> {t('coordination.assign')}
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

      {/* Link Composer — toolbar button or the selection pill menu */}
      {linkComposer && (
        <LinkComposer
          anchorRect={linkComposer.rect}
          initialText={linkComposer.text}
          pages={pages}
          currentDocId={d.id}
          pageAudience={audienceOf(d)}
          onClose={() => setLinkComposer(null)}
          onInsert={insertLink}
        />
      )}

      {shareOpen && <ShareDocModal doc={d} currentUserId={meUid} onClose={() => setShareOpen(false)} />}
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
