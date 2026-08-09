// Outreach — once a month a team goes to a park, hands out Bibles, tracts and
// booklets, and talks to whoever stops. Logged AFTER the fact, like a visit —
// but the record exists for the NAMES: whoever leaves a number becomes a real
// contact the same moment, and sits in "people we met, not yet reached" until
// someone rings them, usually the next day.
//
// Ported from the design project (`views/outreach.jsx` + the outreach section
// of `data.jsx`). One deliberate divergence: in the prototype trainees and
// community members could see (and log) outreach; here only full-timers
// (`admin`) can — see `canSeeOutreach` / `canLogOutreach` in permissions.ts.
//
// The Firestore writes live in `./data/outreach.ts` behind an injected `db`;
// this file is the pure, testable part (derivations, dates, stats).
import type { Touch } from "./myday";

export interface OutreachHanded {
  bibles: number;
  tracts: number;
  booklets: number;
}

export interface OutreachName {
  id: string;
  name: string;
  /** Number or email, exactly as written down. */
  contact: string;
  /** Whoever spoke with them — a uid. */
  spokeWith: string;
  note: string;
  /** The contact created the moment the outreach was logged. */
  contactId: string | null;
  /** The uid who said "I'll take this". */
  takenBy: string | null;
}

export interface OutreachRecord {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  where: string;
  /** Uids of the team who went out. */
  went: string[];
  /** "…plus N others from church" — not in the app, so just a count. */
  others: number;
  handed: OutreachHanded;
  how: string;
  /** The design's photos are blob URLs stripped on persist — the COUNT survives. */
  photoCount: number;
  names: OutreachName[];
  createdById?: string | null;
  createdByName?: string | null;
  createdAt?: string;
}

/** One row of the log sheet's "Who left us their number". */
export interface OutreachNameDraft {
  name: string;
  contact: string;
  spokeWith: string;
  note: string;
}

export interface OutreachDraft {
  date: string;
  where: string;
  went: string[];
  others: number;
  handed: OutreachHanded;
  how: string;
  photoCount: number;
  names: OutreachNameDraft[];
}

// ── dates ──────────────────────────────────────────────────────────────────
// Outing dates are stored the way the rest of the app stores dates —
// `new Date().toISOString().slice(0, 10)`, i.e. a UTC calendar date — so every
// parse here is UTC ('Z'). Reading them as local time would shift the day
// near midnight boundaries and, worse, move the "reached" boundary past a
// touch that was really made the next day.

const noon = (dateStr: string) => new Date(dateStr + "T12:00:00Z").getTime();

/** Whole days since an outing date (the design's `outreachDaysSince`). */
export function outreachDaysSince(dateStr: string, now: number = Date.now()): number {
  return Math.round((now - noon(dateStr)) / 86400000);
}

/** "today" · "yesterday" · "N days ago" · "Sep 14" (the design's `otWhen`). */
export function outreachWhen(dateStr: string, now: number = Date.now()): string {
  const n = outreachDaysSince(dateStr, now);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 21) return `${n} days ago`;
  const d = new Date(dateStr + "T12:00:00Z");
  return `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
}

export function outreachDayNum(dateStr: string): number {
  return new Date(dateStr + "T12:00:00Z").getUTCDate();
}

export function outreachMonthShort(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

/** The "YYYY-MM" a record belongs to — the This month / Earlier split. */
export function outreachMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function outreachInitials(name: string): string {
  return name.split(" ").map((x) => x[0] ?? "").join("").slice(0, 2).toUpperCase();
}

/** "34 Bibles · 120 tracts · 26 booklets" (the design's `otHandedLine`). */
export function outreachHandedLine(h?: OutreachHanded | null): string {
  return [
    h && h.bibles ? `${h.bibles} Bibles` : null,
    h && h.tracts ? `${h.tracts} tracts` : null,
    h && h.booklets ? `${h.booklets} booklets` : null,
  ].filter(Boolean).join(" · ");
}

// ── the queue: names still waiting on a first call ─────────────────────────

/** "Reached" = somebody has actually spoken to them SINCE the day we met them.
 * Derived rather than flagged, so following up anywhere clears the queue.
 * `touches` is the app's flat last-touch feed (`subscribeTouches`): any touch
 * on the contact's thread after the outing date counts. */
export function outreachReached(record: OutreachRecord, name: OutreachName, touches: Touch[]): boolean {
  if (!name.contactId) return false;
  const after = new Date(record.date + "T23:59:00Z").getTime();
  return touches.some((t) => t.contactId === name.contactId && t.ms > after);
}

export interface OutreachPendingItem {
  record: OutreachRecord;
  name: OutreachName;
  days: number;
}

/** Every name still waiting, oldest first — the whole point of the page. */
export function outreachPending(records: OutreachRecord[], touches: Touch[]): OutreachPendingItem[] {
  const out: OutreachPendingItem[] = [];
  records.forEach((o) =>
    (o.names || []).forEach((n) => {
      if (!outreachReached(o, n, touches)) out.push({ record: o, name: n, days: outreachDaysSince(o.date) });
    }),
  );
  return out.sort((a, b) => b.days - a.days);
}

export function outreachNewestFirst(records: OutreachRecord[]): OutreachRecord[] {
  return [...records].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** The outing a contact first came in through, if any (contact profile use). */
export function outreachesFor(records: OutreachRecord[], contactId: string): OutreachRecord[] {
  return records.filter((o) => (o.names || []).some((n) => n.contactId === contactId));
}

// ── the figures row ────────────────────────────────────────────────────────

export interface OutreachStats {
  months: number;
  names: number;
  bibles: number;
}

export function outreachStats(records: OutreachRecord[]): OutreachStats {
  return {
    months: records.length,
    names: records.reduce((n, o) => n + (o.names || []).length, 0),
    bibles: records.reduce((n, o) => n + ((o.handed || {}).bibles || 0), 0),
  };
}
