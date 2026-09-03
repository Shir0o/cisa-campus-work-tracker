import type { Contact, Event } from '../types';

// ─── week bounds ───────────────────────────────────────────────────────────
// Mon–Sun, in the viewer's local zone. Date-only strings (yyyy-MM-dd) are
// parsed as LOCAL midnight deliberately, never via `new Date(s)` (which would
// shift a day in negative-offset zones). Matches Attendance.tsx's `evtDate`.

/** Parse a yyyy-MM-dd string as LOCAL midnight. Null for missing/invalid. */
const parseLocalDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Monday 00:00 local time of the week containing `d`. */
export function startOfWeekMonday(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): 0 = Sun, 1 = Mon, …, 6 = Sat. We want Mon → Sun, so:
  //   Sunday → 6 days back, Monday → 0, Tuesday → -1, …, Saturday → -5.
  const dow = out.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  out.setDate(out.getDate() - back);
  return out;
}

/** Sunday 23:59:59.999 local time of the week containing `d`. */
export function endOfWeekSunday(d: Date): Date {
  const start = startOfWeekMonday(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

const isInWeek = (date: Date, monday: Date, sunday: Date): boolean =>
  date.getTime() >= monday.getTime() && date.getTime() <= sunday.getTime();

const sortByDate = <T extends { date: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.date.localeCompare(b.date));

const sortByDateDesc = <T extends { date: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => b.date.localeCompare(a.date));

// ─── chip state ────────────────────────────────────────────────────────────
// Computed in this module from the Gathering's own stamp + the week bounds.
// Deriving "taken" from a non-empty present list is explicitly rejected — it
// would permanently mislabel a Gathering nobody attended.

export type ChipState = 'taken' | 'happened-not-taken' | 'current-week' | 'ahead';

/** One Gathering in the term, rendered as a chip on a Rhythm row. */
export interface Chip {
  id: string;
  /** Date the Gathering falls on, yyyy-MM-dd. */
  date: string;
  /** Gathering name (taken from the row anchor; children inherit). */
  name: string;
  state: ChipState;
  /** True for "still ahead" — the renderer tints the chip faintly. */
  faint: boolean;
  /** People marked present for this Gathering. */
  presentCount: number;
  /** Who recorded attendance (if stamped). */
  takenByName?: string;
  takenAt?: string;
}
/** This-week band: one entry per date with one or more Gatherings. */
export interface ThisWeekGroup {
  /** The date as a sortable id — `week-2026-09-10`. */
  id: string;
  /** yyyy-MM-dd, sortable. */
  date: string;
  dateObj: Date;
  gatherings: OneOffGathering[];
}
/** A series of Gatherings sharing an identity — one row in the page. */
export interface RhythmRow {
  /** The rhythm anchor: parentEventId when set, else this Gathering's own id. */
  id: string;
  name: string;
  type?: string;
  /** Denominator for the row — union of roster IDs across the term. */
  expectedCount: number;
  /** Chip in time order, oldest first. */
  chips: Chip[];
  /** The chip the view should show in the row summary. */
  selectedChipId: string;
  selectedChip?: Chip;
}

/** A Gathering that doesn't belong to a Rhythm, listed below. */
export interface OneOffGathering {
  id: string;
  name: string;
  date: string;
  type?: string;
  presentCount: number;
  expectedCount: number;
  takenByName?: string;
  takenAt?: string;
}

/** Plain view model returned to the renderer. No grouping/ordering logic
 *  lives in the view. */
export interface GatheringViewModel {
  /** Monday of the week containing `now`. */
  weekStart: string;
  /** Sunday of that week. */
  weekEnd: string;
  /** Empty weeks say so plainly rather than reading as a page that failed. */
  thisWeekEmpty: boolean;
  /** One entry per date with a Gathering in the current week. */
  thisWeek: ThisWeekGroup[];
  /** Rhythm rows in day-of-week order, then by name. */
  rhythms: RhythmRow[];
  /** One-offs newest-first, past only. Future one-offs belong in "Coming up"
   *  (or in a This-week band when the week arrives); the "When we met" page
   *  lists what has happened, not what's ahead. (Story 20.) */
  oneOffs: OneOffGathering[];
}

// ─── internals ─────────────────────────────────────────────────────────────

const isStamped = (e: Event, nowMs: number): boolean => {
  // Attendance can only be "taken" for a Gathering that has already happened —
  // a future-dated Gathering with a stamp should still read as `ahead`.
  const dateMs = parseLocalDate(e.date)?.getTime();
  if (dateMs == null || dateMs > nowMs) return false;
  return !!e.attendanceTakenAt;
};

const chipState = (e: Event, mondayMs: number, sundayMs: number, nowMs: number): ChipState => {
  const dateMs = parseLocalDate(e.date)?.getTime();
  if (dateMs == null) return 'happened-not-taken';
  // Current-week wins over taken: the spec says a current-week chip must be
  // "marked distinctly from the rest". A stamped current-week Gathering reads
  // as current-week first; the "taken" reading is reserved for past weeks
  // whose attendance has been recorded.
  if (dateMs >= mondayMs && dateMs <= sundayMs) return 'current-week';
  if (dateMs > sundayMs) return 'ahead';
  return isStamped(e, nowMs) ? 'taken' : 'happened-not-taken';
};

const presentCountFor = (e: Event, contacts: Contact[]): number =>
  contacts.reduce(
    (n, c) => (c.attendance?.[e.id] === true ? n + 1 : n),
    0,
  );

const rhythmId = (e: Event): string => e.parentEventId || e.id;

const rhythmName = (e: Event, byRhythmId: Map<string, Event>): string =>
  byRhythmId.get(rhythmId(e))?.name || e.name;

const rhythmType = (e: Event, byRhythmId: Map<string, Event>): string | undefined =>
  byRhythmId.get(rhythmId(e))?.type ?? e.type;

/** Union of all roster contact IDs across a Rhythm's Gatherings. */
const expectedCountForRhythm = (gatherings: Event[]): number => {
  const ids = new Set<string>();
  for (const g of gatherings) for (const cid of g.roster || []) ids.add(cid);
  return ids.size;
};

/** Pick the default selected chip: current-week first, then most-recent past,
 *  then earliest future. */
const defaultSelectedChipId = (chips: Chip[]): string | undefined => {
  if (chips.length === 0) return undefined;
  const cur = chips.find((c) => c.state === 'current-week');
  if (cur) return cur.id;
  const past = chips.filter((c) => c.state === 'happened-not-taken' || c.state === 'taken');
  if (past.length > 0) return past[past.length - 1].id; // chips are time-ordered asc
  const ahead = chips.filter((c) => c.state === 'ahead');
  if (ahead.length > 0) return ahead[0].id;
  return chips[0].id;
};

// ─── entry point ───────────────────────────────────────────────────────────

export function buildGatheringViewModel(input: {
  events: Event[];
  contacts: Contact[];
  now: Date;
}): GatheringViewModel {
  const { events, contacts, now } = input;
  const nowMs = now.getTime();
  const monday = startOfWeekMonday(now);
  const sunday = endOfWeekSunday(now);
  const mondayMs = monday.getTime();
  const sundayMs = sunday.getTime();

  // Index by rhythm anchor id for name/type/roster resolution.
  const byRhythmId = new Map<string, Event>();
  for (const e of events) byRhythmId.set(rhythmId(e), e);

  // Group events by rhythm anchor.
  const groups = new Map<string, Event[]>();
  for (const e of events) {
    const key = rhythmId(e);
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }

  // ── this-week band ───────────────────────────────────────────────────────
  const thisWeekMap = new Map<string, OneOffGathering[]>();
  for (const e of events) {
    const d = parseLocalDate(e.date);
    if (!d) continue;
    if (!isInWeek(d, monday, sunday)) continue;
    const key = e.date;
    const entry: OneOffGathering = {
      id: e.id,
      name: e.name,
      date: e.date,
      type: e.type,
      presentCount: presentCountFor(e, contacts),
      expectedCount: (e.roster || []).length,
      takenByName: e.attendanceTakenBy,
      takenAt: e.attendanceTakenAt,
    };
    const arr = thisWeekMap.get(key);
    if (arr) arr.push(entry);
    else thisWeekMap.set(key, [entry]);
  }
  const thisWeek: ThisWeekGroup[] = sortByDate(
    Array.from(thisWeekMap.entries()).map(([date, gatherings]) => ({
      id: `week-${date}`,
      date,
      dateObj: parseLocalDate(date) || monday,
      gatherings: sortByDate(gatherings),
    })),
  );

  // ── Rhythms ─────────────────────────────────────────────────────────────
  const rhythms: RhythmRow[] = [];
  for (const [id, groupEvents] of groups) {
    // Any event with a parentEventId belongs to a Rhythm — it might be the
    // anchor (parentEventId === self for first-of-series) or a child of one.
    // Events without parentEventId and no children are one-offs.
    const isSeries = groupEvents.length > 1 || groupEvents[0]?.parentEventId === id;
    if (!isSeries) continue;
    const ordered = sortByDate(groupEvents);
    const chips: Chip[] = ordered.map((e) => {
      const state = chipState(e, mondayMs, sundayMs, nowMs);
      return {
        id: e.id,
        date: e.date,
        name: e.name,
        state,
        faint: state === 'ahead',
        presentCount: presentCountFor(e, contacts),
        takenByName: state === 'taken' ? e.attendanceTakenBy : undefined,
        takenAt: state === 'taken' ? e.attendanceTakenAt : undefined,
      };
    });
    const selectedChipId = defaultSelectedChipId(chips);
    const anchor = byRhythmId.get(id) || ordered[0];

    rhythms.push({
      id,
      name: rhythmName(anchor, byRhythmId),
      type: rhythmType(anchor, byRhythmId),
      expectedCount: expectedCountForRhythm(groupEvents),
      chips,
      selectedChipId: selectedChipId || chips[0]?.id || id,
      selectedChip: chips.find((c) => c.id === selectedChipId),
    });
  }
  rhythms.sort((a, b) => {
    const da = parseLocalDate(a.chips[0]?.date)?.getDay() ?? 0;
    const db = parseLocalDate(b.chips[0]?.date)?.getDay() ?? 0;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  const oneOffs: OneOffGathering[] = sortByDateDesc(
    events
      .filter((e) => {
        const key = rhythmId(e);
        const group = groups.get(key);
        if (!group) return true;
        // A first-of-series with no children is a Rhythm anchor, not a one-off.
        if (group.length === 1 && group[0].parentEventId === group[0].id) return false;
        return group.length === 1;
      })
      // Story 20: future Gatherings don't belong on a past-tense list.
      .filter((e) => {
        const ms = parseLocalDate(e.date)?.getTime();
        return ms == null || ms <= nowMs;
      })
      .map((e) => ({
        id: e.id,
        name: e.name,
        date: e.date,
        type: e.type,
        presentCount: presentCountFor(e, contacts),
        expectedCount: (e.roster || []).length,
        takenByName: e.attendanceTakenAt ? e.attendanceTakenBy : undefined,
        takenAt: e.attendanceTakenAt,
      })),
  );

  return {
    weekStart: formatLocal(monday),
    weekEnd: formatLocal(sunday),
    thisWeekEmpty: thisWeek.length === 0,
    thisWeek,
    rhythms,
    oneOffs,
  };
}

const formatLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};