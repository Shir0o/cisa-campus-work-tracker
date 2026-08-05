// "The Board" — shared coordination surface (Field Notes overhaul, issue #24).
//
// A weekly rhythm of coordination SESSIONS, each carrying an AGENDA (items to
// talk through, delegated sub-steps, carried forward if not covered) and a
// standalone delegated TASK list. Discussion becomes NOTES that live on as a
// record or a learning, findable by event series. Mirrors the design's `BoardFT`.
//
// PURE subset for @cisa/core: types + date/audience helpers only. The web-only
// `CHIP_TONE` Tailwind-class map lives in the app; native maps `Tone` → theme
// colors instead.

import { format, parseISO, isValid, isThisWeek } from 'date-fns';
import { firstName } from './history';
import type { StageToneKey } from './directory';
import type { AppRole } from './permissions';

// ── Categories → warm stage tones (matches BOARD_CATEGORIES in the design) ──
export type BoardCategory = 'gathering' | 'outreach' | 'care' | 'prayer' | 'logistics';
export type Tone = 'accent' | 'amber' | 'teal' | 'violet' | 'neutral';

export const CATEGORY_META: Record<BoardCategory, { label: string; tone: Tone }> = {
  gathering: { label: 'Gathering', tone: 'amber' },
  outreach: { label: 'Outreach', tone: 'accent' },
  care: { label: 'Care', tone: 'teal' },
  prayer: { label: 'Prayer', tone: 'violet' },
  logistics: { label: 'Logistics', tone: 'neutral' },
};

export const CATEGORY_ORDER: BoardCategory[] = ['care', 'gathering', 'outreach', 'prayer', 'logistics'];

// ── Notes & learnings ───────────────────────────────────────────────────────
export type NoteType = 'record' | 'learning';

// Default event series; stored as a plain string so new ones are free-form.
export const BOARD_SERIES = ['Small Groups', 'Outreach', 'Conferences/Trainings', 'Team'];

// ── Firestore document shapes ───────────────────────────────────────────────
export interface AgendaAction {
  id: string;
  text: string;
  who: string; // assignee uid
  done: boolean;
}

export type AgendaStatus = 'open' | 'covered' | 'pushed';

export interface AgendaItem {
  id: string;
  text: string;
  cat: BoardCategory;
  raisedById: string;
  status: AgendaStatus;
  carriedFrom?: string; // weekday it was carried from
  pushedTo?: string; // weekday it was pushed to
  actions: AgendaAction[];
}

export interface BoardTask {
  id: string;
  text: string;
  who: string; // assignee uid
  done: boolean;
}

// board_sessions/{id}
export interface BoardSession {
  id: string;
  event: string;
  date: string; // yyyy-MM-dd
  time: string;
  place: string;
  facilitatorId?: string;
  agenda: AgendaItem[];
  assigned: BoardTask[];
  createdAt?: unknown;
  createdBy?: string;
  createdByName?: string;
  updatedAt?: unknown;
  updatedBy?: string;
  updatedByName?: string;
}

// board_notes/{id}
export interface BoardNote {
  id: string;
  type: NoteType;
  series: string;
  title: string;
  body: string;
  date: string; // yyyy-MM-dd
  contributorIds: string[];
  tags: string[];
  sessionId?: string;
  createdAt?: unknown;
  createdBy?: string;
  createdByName?: string;
  updatedAt?: unknown;
  updatedBy?: string;
  updatedByName?: string;
  deletedAt?: unknown;
  archivedAt?: unknown;
  displayMode?: 'text' | 'list';
}

// ── Pure helpers ────────────────────────────────────────────────────────────

// Short, rule-safe id for array elements (agenda items, actions, tasks).
export function newId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}

export type SessionStatus = 'done' | 'today' | 'upcoming';

// Status is derived from the date so "today" stays accurate without a manual toggle.
export function sessionStatus(date: string): SessionStatus {
  const d = parseISO(date);
  if (!isValid(d)) return 'upcoming';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  if (dd.getTime() < today.getTime()) return 'done';
  if (dd.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  done: 'Wrapped',
  today: 'Today',
  upcoming: 'Upcoming',
};

export const weekdayOf = (date: string): string => {
  const d = parseISO(date);
  return isValid(d) ? format(d, 'EEEE') : '';
};

export const dateLabelOf = (date: string): string => {
  const d = parseISO(date);
  return isValid(d) ? format(d, 'MMM d') : date;
};

export const todayISO = (): string => format(new Date(), 'yyyy-MM-dd');

// Sort sessions chronologically (oldest → newest) for the week switcher.
export const byDateAsc = (a: BoardSession, b: BoardSession) => a.date.localeCompare(b.date);

// ── The Board (doc model) ─────────────────────────────────────────────────────
// The redesign (design bundle `BoardFT`) replaces coordination SESSIONS with a
// folder of dated Markdown DOCUMENTS — one running page per gathering. The
// markdown lives in Firestore as the durable, searchable record; live editing
// rides on a Yjs CRDT over RTDB. status/group/weekday labels are derived.

// board_docs/{id}
export interface BoardDoc {
  id: string;
  date: string; // yyyy-MM-dd
  title: string;
  md: string; // markdown body (derived from the live Y.Doc on save)
  audience?: Audience; // who the page is open to; missing → 'team' (full-timers only)
  facilitatorId?: string;
  place?: string;
  time?: string;
  createdAt?: unknown;
  createdBy?: string;
  createdByName?: string;
  updatedAt?: unknown;
  updatedBy?: string;
  updatedByName?: string;
  deletedAt?: unknown; // soft-delete marker — set means the page is in Trash
  pinned?: boolean; // pinned pages sort first in the Pages list
  pinnedOrder?: number; // order position among pinned pages when reordered
}

// A soft-deleted page (see `deletedAt`) is hidden from the main Pages list
// and only shown in Trash, where it can be restored or purged for good.
export const isTrashedBoardDoc = (doc: Pick<BoardDoc, 'deletedAt'>): boolean => !!doc.deletedAt;

// ── Audience / visibility (design Session 3) ──────────────────────────────────
// Each page is tagged so trainees and students can share the Board without seeing
// the team's private pastoral coordination. Hierarchy (rank): team (full-timers
// only) > trainees (staff + trainees) > everyone (any student in CISA). A role
// sees a page when its board-level >= the page's rank. Role labels only — this is
// visibility, not a permissions-management UI. Enforced in firestore.rules too.
export type Audience = 'team' | 'trainees' | 'everyone';

export const BOARD_AUDIENCE: Record<Audience, { label: string; sub: string; rank: number; icon: 'lock' | 'users' | 'globe' }> = {
  team: { label: 'Team', sub: 'Full-timers', rank: 2, icon: 'lock' },
  trainees: { label: 'Trainees', sub: 'Staff & trainees', rank: 1, icon: 'users' },
  everyone: { label: 'Open', sub: 'Anyone in CISA', rank: 0, icon: 'globe' },
};

// Order shown in the audience picker (most open → most private).
export const AUDIENCE_ORDER: Audience[] = ['everyone', 'trainees', 'team'];

// The same three tiers as a mobile-v2 tone, so the audience pill on a Board row
// is painted from the room's palette rather than a second colour vocabulary.
// Deliberate parity with the Material AudienceBadge this replaces: team reads
// as the most private (violet), everyone as the most open (green).
export const AUDIENCE_TONE_KEY: Record<Audience, StageToneKey> = {
  team: 'pray',
  trainees: 'due',
  everyone: 'note',
};

// A page with no audience defaults to the most private tier.
export const audienceOf = (doc: Pick<BoardDoc, 'audience'>): Audience => doc.audience ?? 'team';

// How far up the audience hierarchy a role can see. Community (viewer) has no
// Board access at all (the nav item stops at Student).
export const boardLevelForRole = (role: AppRole | string | null): number => {
  switch (role) {
    case 'admin':
      return 2;
    case 'manager':
      return 1;
    case 'operator':
      return 0;
    default:
      return -1;
  }
};

export const canSeeBoardDoc = (role: AppRole | string | null, doc: Pick<BoardDoc, 'audience'>): boolean => {
  const level = boardLevelForRole(role);
  return level >= 0 && level >= BOARD_AUDIENCE[audienceOf(doc)].rank;
};

// The audiences a role may query for — used to scope the Firestore listener so
// the rules' per-document checks never reject the list. Admins read everything
// (returned empty so the caller queries unconstrained, including legacy/no-audience
// pages). Higher roles include every tier at or below their level.
export const boardAudiencesForRole = (role: AppRole | string | null): Audience[] => {
  switch (role) {
    case 'admin':
      return [];
    case 'manager':
      return ['trainees', 'everyone'];
    case 'operator':
      return ['everyone'];
    default:
      return [];
  }
};

// Who can reach the Board at all (Student and up) vs. who can edit (Full-timers).
export const canViewBoard = (role: AppRole | string | null): boolean => boardLevelForRole(role) >= 0;
// The Notes & learnings archive is shared by Full-timers + Trainees only.
export const canViewBoardNotes = (role: AppRole | string | null): boolean => boardLevelForRole(role) >= 1;
export const canEditBoard = (isAdmin: boolean): boolean => isAdmin;

// The list groups, in order (Pinned float to their own section at top).
export const DOC_GROUPS = ['Pinned', 'This week', 'Earlier'] as const;
export type DocGroup = (typeof DOC_GROUPS)[number];

// A page is "Pinned" if its pinned flag is true;
// "This week" if its date falls in the current week (Mon–Sun);
// everything else is filed under "Earlier".
export const docGroup = (
  dateOrDoc: string | { date: string; pinned?: boolean },
  pinned?: boolean,
): DocGroup => {
  const isPinned = typeof dateOrDoc === 'object' ? !!dateOrDoc.pinned : !!pinned;
  if (isPinned) return 'Pinned';
  const date = typeof dateOrDoc === 'object' ? dateOrDoc.date : dateOrDoc;
  const d = parseISO(date);
  return isValid(d) && isThisWeek(d, { weekStartsOn: 1 }) ? 'This week' : 'Earlier';
};

// Status chip shown on the open document (reuses sessionStatus from the date).
export const DOC_STATUS: Record<SessionStatus, { label: string; tone: Tone | '' }> = {
  today: { label: 'Today', tone: 'accent' },
  upcoming: { label: 'Coming up', tone: '' },
  done: { label: 'Past', tone: 'teal' },
};

// Row date chip: short weekday + day-of-month.
export const weekdayShort = (date: string): string => {
  const d = parseISO(date);
  return isValid(d) ? format(d, 'EEE') : '';
};
export const dayNum = (date: string): string => {
  const d = parseISO(date);
  return isValid(d) ? format(d, 'd') : '';
};

// ── Mobile v2 copy (the design's `M2Board` / `M2BoardDoc`) ───────────────────
// The Board is read-only on the phone, so what a row and a page SAY is the whole
// screen. Kept here, tested, so the list row and the open page can't drift.

// The line under a Board row's title: "7pm · Kirkbride · Ana leading". Each
// segment is optional — a page with none of the three shows no line at all.
export const boardRowLine = (
  doc: Pick<BoardDoc, 'time' | 'place'>,
  leaderName?: string | null,
): string =>
  [doc.time, doc.place, leaderName ? `${firstName(leaderName)} leading` : null]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' · ');

// The foot of an open page. Naming who keeps it matters more on a phone than on
// the desktop, where the page is being written in front of you.
export const boardKeeperFoot = (keeperName?: string | null): string =>
  `${keeperName ? `${firstName(keeperName)} keeps this page.` : 'The team keeps this page.'} Writing happens on the desktop site — here you're reading.`;

// The count beside the screen title.
export const boardCountNote = (n: number): string =>
  n === 0 ? 'No pages' : `${n} ${n === 1 ? 'page' : 'pages'}`;

// Sort docs newest → oldest for the Pages list.
export const docByDateDesc = (a: BoardDoc, b: BoardDoc) => b.date.localeCompare(a.date);

// Pinned pages float to the top sorted by pinnedOrder (if set); otherwise newest → oldest.
export const docSortOrder = (a: BoardDoc, b: BoardDoc) => {
  if (a.pinned !== b.pinned) {
    return Number(!!b.pinned) - Number(!!a.pinned);
  }
  if (a.pinned && b.pinned) {
    const orderA = a.pinnedOrder ?? Infinity;
    const orderB = b.pinnedOrder ?? Infinity;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
  }
  return docByDateDesc(a, b);
};

// Starter body for a brand-new page.
export const newDocMarkdown = (): string =>
  `# Untitled page\n\nStart writing — everyone on the team sees your edits live.\n`;

// ── Markdown string helpers (ported from src/lib/markdown.ts) ─────────────────
// Operate on the stored markdown string only, for the Pages list's one-line
// preview and open-task count — the rich editor itself (web-only) owns actual
// editing.

// First readable, de-marked-up line of a doc — for the Pages list preview.
export const mdPreview = (md: string | undefined): string => {
  const lines = (md || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const l of lines) {
    if (/^#{1,3}\s/.test(l)) continue; // skip headings
    if (/^\*\*.*\*\*$/.test(l)) continue; // skip a bold-only meta line
    let t = l
      .replace(/^\s*[-*]\s+\[( |x|X)\]\s+/, '') // task marker
      .replace(/^\s*[-*]\s+/, '') // bullet
      .replace(/^\s*\d+\.\s+/, '') // ordered
      .replace(/^>\s?/, ''); // quote
    t = t
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    if (t) return t;
  }
  return 'Empty page';
};

// Count of open ("[ ]") checklist items — for the "x to do" hint.
export const mdOpenTasks = (md: string | undefined): number =>
  ((md || '').match(/^\s*[-*]\s+\[ \]\s+/gm) || []).length;
