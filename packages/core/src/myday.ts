// My Day — the flagship "cockpit" screen. PURE derivations shared by web and
// mobile, ported from src/views/MyDay.tsx (the container) and
// src/components/landing/helpers.ts + src/lib/todos.ts (the date/task helpers).
// The Firestore subscriptions + writes stay in each app's data layer (they need
// a platform Firebase init); this is the behavior oracle both ports share.
import { format } from "date-fns";
import type { Contact, Event, PrayerRecord, Task } from "./types";

export const DAY_MS = 86_400_000;

export const parseMs = (s?: string | null): number | null => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
};

export const daysSince = (ms: number, now: number = Date.now()): number =>
  Math.max(0, Math.floor((now - ms) / DAY_MS));

export const connectedLabel = (d: number): string =>
  d === 0
    ? "Connected today"
    : d === 1
      ? "Last connected yesterday"
      : `Last connected ${d} days ago`;

export const getGreeting = (now: number = Date.now()): string => {
  const hour = new Date(now).getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

export const agoLabel = (iso?: string | null, now: number = Date.now()): string => {
  const ms = parseMs(iso);
  const d = ms == null ? 0 : daysSince(ms, now);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
};

// ── Your sheep (leaders you're personally walking with) ─────────────────────

export interface Touch {
  contactId: string;
  ms: number;
  note: string;
}

export interface Leader {
  contact: Contact;
  days: number;
  note: string;
}

/** Most-recent touch (+ its note) per contact, from a flat list of touches. */
export function lastTouchByContact(
  touches: Touch[],
): Map<string, { ms: number; note: string }> {
  const map = new Map<string, { ms: number; note: string }>();
  for (const t of touches) {
    const cur = map.get(t.contactId);
    if (!cur || t.ms > cur.ms) map.set(t.contactId, { ms: t.ms, note: t.note });
  }
  return map;
}

/** The effective personal-contacts set: explicit picker choice, else created-by-me. */
export function personalContactIdsOf(
  prefContactIds: string[] | null | undefined,
  contacts: Contact[],
  uid?: string | null,
): Set<string> {
  if (prefContactIds != null) return new Set(prefContactIds);
  const set = new Set<string>();
  for (const c of contacts) if (uid && c.createdBy === uid) set.add(c.id);
  return set;
}

/** Leaders I'm caring for — my personal contacts, longest-since-connected first. */
export function deriveLeaders(
  contacts: Contact[],
  personalContactIds: Set<string>,
  touches: Touch[],
  now: number = Date.now(),
): Leader[] {
  const touchMap = lastTouchByContact(touches);
  return contacts
    .filter((c) => personalContactIds.has(c.id))
    .map((c) => {
      const touch = touchMap.get(c.id);
      const ms = touch?.ms ?? parseMs(c.createdAt);
      const days = ms == null ? Infinity : daysSince(ms, now);
      return { contact: c, days, note: touch?.note || c.notes || "" };
    })
    .sort((a, b) => b.days - a.days);
}

/** The leader I've gone longest without sitting with (for the prose nudge). */
export function staleLeaderOf(leaders: Leader[]): Leader | undefined {
  return leaders.find((l) => Number.isFinite(l.days) && l.days >= 7);
}

// ── On the horizon (tasks) ───────────────────────────────────────────────────

// done first? then due ascending — the shared ordering for both task groups.
const taskSort = (a: Task, b: Task) => {
  const rank = (t: Task) => (t.status === "completed" ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return (parseMs(a.dueDate) ?? Infinity) - (parseMs(b.dueDate) ?? Infinity);
};

export interface SplitTasks {
  assignedTasks: Task[];
  personalTasks: Task[];
  leftToDo: number;
}

// Team todos have a source (or were assigned by someone else); personal tasks
// are your own, sourceless.
export function splitTasks(tasks: Task[], uid?: string | null): SplitTasks {
  const activeTasks = tasks.filter((t) => t.status !== "canceled");
  const assignedTasks = activeTasks
    .filter((t) => t.sourceDocId || t.createdById !== uid)
    .sort(taskSort);
  const personalTasks = activeTasks
    .filter((t) => !t.sourceDocId && t.createdById === uid)
    .sort(taskSort);
  const leftToDo = activeTasks.filter((t) => t.status === "pending").length;
  return { assignedTasks, personalTasks, leftToDo };
}

// ── Due-date quick presets (composer) ────────────────────────────────────────

export type DuePresetKey = "today" | "tomorrow" | "week" | "none" | "custom";

export const DUE_PRESETS: { key: DuePresetKey; label: string; days: number | null }[] = [
  { key: "today", label: "Today", days: 0 },
  { key: "tomorrow", label: "Tomorrow", days: 1 },
  { key: "week", label: "This week", days: 5 },
  { key: "none", label: "No date", days: null },
];

// yyyy-MM-dd, N local days from today — matches the app's `dueDate` string format.
export function duePresetToISO(days: number | null): string | null {
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

// Best-fit preset for an existing due date, so the composer opens with the right
// pill pre-selected (falls back to "custom" for an arbitrary date).
export function presetForDue(dueDate?: string | null): DuePresetKey {
  if (!dueDate) return "none";
  for (const p of DUE_PRESETS) {
    if (p.days != null && duePresetToISO(p.days) === dueDate) return p.key;
  }
  return "custom";
}

// Parse a due date to a Date in the *local* day. A bare `yyyy-MM-dd` is
// otherwise parsed as UTC midnight, which lands on the previous day in
// behind-UTC timezones — so build it locally.
export const toLocalDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export type DueTone = "overdue" | "soon" | "normal";

// Humanize a to-do's due date into a chip label + semantic tone. Returns null
// when there is no due date. Tone is a semantic key (not a CSS class) — each
// platform maps it to its own color.
export function dueChip(dueDate?: string | null): { label: string; tone: DueTone } | null {
  const due = toLocalDate(dueDate);
  if (due == null) return null;
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  if (diff < 0) return { label: "Overdue", tone: "overdue" };
  if (diff === 0) return { label: "Due today", tone: "soon" };
  if (diff === 1) return { label: "Due tomorrow", tone: "soon" };
  if (diff <= 6) return { label: `Due ${format(due, "EEEE")}`, tone: diff <= 2 ? "soon" : "normal" };
  return { label: `Due ${format(due, "MMM d")}`, tone: "normal" };
}

// ── Your week (events) ───────────────────────────────────────────────────────

// Events dated within the next 7 days, soonest first.
export function thisWeekEvents(
  events: Event[],
  now: number = Date.now(),
): { ev: Event; ms: number }[] {
  const horizon = now + 7 * DAY_MS;
  return events
    .map((ev) => ({ ev, ms: parseMs(ev.date) }))
    .filter((x): x is { ev: Event; ms: number } => x.ms != null)
    .filter((x) => x.ms >= now - DAY_MS && x.ms <= horizon)
    .sort((a, b) => a.ms - b.ms || (a.ev.order ?? 0) - (b.ev.order ?? 0));
}

// ── Your prayers ──────────────────────────────────────────────────────────────

export type PersonalPrayerStatus = "open" | "answered" | "archived";

// Mirrors src/lib/personalPrayers.ts's PersonalPrayer (private, per-user
// prayers under users/{uid}/personalPrayers — never shared).
export interface PersonalPrayer {
  id: string;
  title: string;
  contactId?: string | null;
  date: string; // ISO
  status: PersonalPrayerStatus;
  answeredAt?: string | null;
  answeredBody?: string | null;
}

export interface SplitPrayers {
  contactPrayers: PrayerRecord[];
  activePersonalPrayers: PersonalPrayer[];
  prayersCount: number;
}

// Contact (corporate) prayers — shared prayers on my personal contacts that
// aren't archived (unanswered = archived-equivalent), oldest first. Personal
// prayers are assumed already date-ascending (the Firestore query orders them)
// — this only filters, matching the web behavior.
export function splitPrayers(
  prayers: PrayerRecord[],
  personalContactIds: Set<string>,
  personalPrayers: PersonalPrayer[],
): SplitPrayers {
  const contactPrayers = prayers
    .filter((p) => p.contactId && personalContactIds.has(p.contactId) && p.status !== "unanswered")
    .sort((a, b) => (parseMs(a.date) ?? 0) - (parseMs(b.date) ?? 0));
  const activePersonalPrayers = personalPrayers.filter((p) => p.status !== "archived");
  return {
    contactPrayers,
    activePersonalPrayers,
    prayersCount: contactPrayers.length + activePersonalPrayers.length,
  };
}
