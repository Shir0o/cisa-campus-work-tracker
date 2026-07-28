// "The Board" — shared coordination surface (Field Notes overhaul, issue #24).
//
// A weekly rhythm of coordination SESSIONS, each carrying an AGENDA (items to
// talk through, delegated sub-steps, carried forward if not covered) and a
// standalone delegated TASK list. Discussion becomes NOTES that live on as a
// record or a learning, findable by event series. Mirrors the design's `BoardFT`.

import { format, parseISO, isValid, isThisWeek } from 'date-fns';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
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
}

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

// Sort docs newest → oldest for the Pages list.
export const docByDateDesc = (a: BoardDoc, b: BoardDoc) => b.date.localeCompare(a.date);

// Pinned pages float to the top; otherwise newest → oldest.
export const docSortOrder = (a: BoardDoc, b: BoardDoc) =>
  (Number(!!b.pinned) - Number(!!a.pinned)) || docByDateDesc(a, b);

// Starter body for a brand-new page.
export const newDocMarkdown = (): string =>
  `# Untitled page\n\nStart writing — everyone on the team sees your edits live.\n`;

// ── Doc-linked Tasks & Notes (Markdown Sync Helpers) ─────────────────────────

export interface ParsedDocTask {
  id: string;
  done: boolean;
  title: string;
  assigneeId: string | null;
  assigneeName: string | null;
  rawLine: string;
}

export interface ParsedDocNote {
  id: string;
  type: NoteType;
  rawLine: string;
}

/** The text a task line carries *after* its checkbox — i.e. what a `taskItem` node holds. */
export function formatDocTaskText(task: {
  id: string;
  title: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
}): string {
  const namePart = task.assigneeName ? ` (@${task.assigneeName.trim()})` : '';
  const assigneeAttr = task.assigneeId ? ` assignee:${task.assigneeId}` : '';
  return `${task.title.trim()}${namePart} <!-- task:${task.id}${assigneeAttr} -->`;
}

export function formatDocTaskMarkdown(task: {
  id: string;
  title: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  done?: boolean;
}): string {
  const checkbox = task.done ? '[x]' : '[ ]';
  return `- ${checkbox} ${formatDocTaskText(task)}`;
}

export function formatDocNoteMarkdown(note: {
  id: string;
  title: string;
  body?: string;
  type: NoteType;
  series?: string;
}): string {
  const typeLabel = note.type === 'learning' ? 'Learning' : 'Record';
  const bodyText = note.body ? ` — ${note.body.trim()}` : '';
  return `> 📝 **Note (${typeLabel})**: ${note.title.trim()}${bodyText} <!-- note:${note.id} type:${note.type} -->`;
}

const TASK_TEXT_RE = /^\s*(.*?)\s*<!--\s*task:([^\s>]+)(?:\s+assignee:([^\s>]+))?\s*-->/;
const TASK_CHECKBOX_RE = /-\s*\[([ xX])\]\s*(.*)$/;

/** Parse the text of one task line (no checkbox) — the `taskItem` counterpart of `parseDocTasks`. */
export function parseDocTaskText(text: string): Omit<ParsedDocTask, 'done' | 'rawLine'> | null {
  const match = TASK_TEXT_RE.exec(text);
  if (!match) return null;

  let title = match[1].trim();
  let assigneeName: string | null = null;
  const atMatch = /\s*\(@([^)]+)\)$/.exec(title);
  if (atMatch) {
    assigneeName = atMatch[1];
    title = title.slice(0, atMatch.index).trim();
  }

  return { id: match[2], title, assigneeId: match[3] || null, assigneeName };
}

export function parseDocTasks(markdown: string): ParsedDocTask[] {
  const tasks: ParsedDocTask[] = [];

  for (const line of markdown.split('\n')) {
    const checkbox = TASK_CHECKBOX_RE.exec(line);
    if (!checkbox) continue;
    const parsed = parseDocTaskText(checkbox[2]);
    if (!parsed) continue;
    tasks.push({ ...parsed, done: checkbox[1].toLowerCase() === 'x', rawLine: line });
  }

  return tasks;
}

export function parseDocNotes(markdown: string): ParsedDocNote[] {
  const notes: ParsedDocNote[] = [];
  const lines = markdown.split('\n');
  const noteRegex = /<!--\s*note:([^\s>]+)(?:\s+type:([^\s>]+))?\s*-->/;

  for (const line of lines) {
    const match = noteRegex.exec(line);
    if (match) {
      notes.push({
        id: match[1],
        type: (match[2] as NoteType) || 'record',
        rawLine: line,
      });
    }
  }

  return notes;
}

/** One checklist line as it currently stands in the editor, with its document positions. */
export interface DocTaskNode {
  pos: number;
  textFrom: number;
  textTo: number;
  checked: boolean;
  text: string;
}

/** A change to make to one checklist line. Absent fields are already correct. */
export interface DocTaskEdit {
  pos: number;
  checked?: boolean;
  text?: { from: number; to: number; value: string };
}

/** Find every checklist line in the document, with the range its text occupies. */
export function collectDocTaskNodes(doc: ProseMirrorNode): DocTaskNode[] {
  const nodes: DocTaskNode[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'taskItem') return;
    const para = node.firstChild;
    if (!para?.isTextblock) return;
    const textFrom = pos + 2; // into the taskItem, then into its paragraph
    nodes.push({
      pos,
      textFrom,
      textTo: textFrom + para.content.size,
      checked: node.attrs.checked === true,
      text: para.textContent,
    });
  });

  return nodes;
}

/**
 * Work out which checklist lines a task change made elsewhere (the sidebar, My Day, a
 * teammate) has left stale.
 *
 * Deliberately node-level and minimal: the caller patches only these lines, so the
 * document is never replaced wholesale and the caret never moves. A line the current
 * `selection` touches is left alone — it re-syncs once the caret moves off it, rather
 * than rewriting text out from under someone mid-sentence.
 */
export function planDocTaskEdits(
  nodes: DocTaskNode[],
  tasksMap: Map<string, { title: string; status: string; assigneeId: string | null }>,
  teamMap: Map<string, { name: string }>,
  selection: { from: number; to: number } | null,
): DocTaskEdit[] {
  const edits: DocTaskEdit[] = [];

  for (const node of nodes) {
    const parsed = parseDocTaskText(node.text);
    if (!parsed) continue;
    const task = tasksMap.get(parsed.id);
    if (!task) continue;
    if (selection && selection.from <= node.textTo && selection.to >= node.textFrom) continue;

    const checked = task.status === 'completed';
    const assigneeName = task.assigneeId ? teamMap.get(task.assigneeId)?.name?.split(' ')[0] || null : null;
    const value = formatDocTaskText({
      id: parsed.id,
      title: task.title,
      assigneeId: task.assigneeId,
      assigneeName,
    });

    const edit: DocTaskEdit = { pos: node.pos };
    if (node.checked !== checked) edit.checked = checked;
    if (node.text !== value) edit.text = { from: node.textFrom, to: node.textTo, value };
    if (edit.checked !== undefined || edit.text) edits.push(edit);
  }

  return edits;
}

