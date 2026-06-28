// "The Board" — shared coordination surface (Field Notes overhaul, issue #24).
//
// A weekly rhythm of coordination SESSIONS, each carrying an AGENDA (items to
// talk through, delegated sub-steps, carried forward if not covered) and a
// standalone delegated TASK list. Discussion becomes NOTES that live on as a
// record or a learning, findable by event series. Mirrors the design's `BoardFT`.

import { format, parseISO, isValid, isThisWeek } from 'date-fns';

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

// Full static class strings so Tailwind's scanner keeps them (same approach as
// OutreachBoard.tsx TONE_CLASSES).
export const CHIP_TONE: Record<Tone, { dot: string; bg: string; text: string }> = {
  accent: { dot: 'bg-stage-accent', bg: 'bg-stage-accent-soft', text: 'text-stage-accent' },
  amber: { dot: 'bg-stage-amber', bg: 'bg-stage-amber-soft', text: 'text-stage-amber' },
  teal: { dot: 'bg-stage-teal', bg: 'bg-stage-teal-soft', text: 'text-stage-teal' },
  violet: { dot: 'bg-stage-violet', bg: 'bg-stage-violet-soft', text: 'text-stage-violet' },
  neutral: { dot: 'bg-on-surface-variant/50', bg: 'bg-surface-variant', text: 'text-on-surface-variant' },
};

// ── Notes & learnings ───────────────────────────────────────────────────────
export type NoteType = 'record' | 'learning';

// Default event series; stored as a plain string so new ones are free-form.
export const BOARD_SERIES = ['Friday Gathering', 'Small Groups', 'Outreach', 'Retreat', 'Team'];

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
  facilitatorId?: string;
  place?: string;
  time?: string;
  createdAt?: unknown;
  createdBy?: string;
  createdByName?: string;
  updatedAt?: unknown;
  updatedBy?: string;
  updatedByName?: string;
}

// The two list groups, in order.
export const DOC_GROUPS = ['This week', 'Earlier'] as const;
export type DocGroup = (typeof DOC_GROUPS)[number];

// A page is "This week" if its date falls in the current week (Mon–Sun);
// everything else is filed under "Earlier".
export const docGroup = (date: string): DocGroup => {
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

// Sort docs newest → oldest for the Pages list.
export const docByDateDesc = (a: BoardDoc, b: BoardDoc) => b.date.localeCompare(a.date);

// Starter body for a brand-new page.
export const newDocMarkdown = (): string =>
  `# Untitled page\n\nStart writing — everyone on the team sees your edits live.\n`;
