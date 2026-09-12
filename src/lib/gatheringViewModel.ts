import type { Contact, Gathering, Rhythm } from '../types';
import { resolveRoster } from './attendanceRoster';

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

export type ChipState = 'taken' | 'happened-not-taken' | 'current-week' | 'ahead' | 'cancelled';

/** One Gathering in the term, rendered as a chip on a Rhythm row. */
export interface Chip {
  id: string;
  /** Date the Gathering falls on, yyyy-MM-dd. */
  date: string;
  /** Gathering name (the Rhythm's live name; children inherit). */
  name: string;
  state: ChipState;
  /** True for "still ahead" — the renderer tints the chip faintly. */
  faint: boolean;
  /** People marked present for this Gathering. */
  presentCount: number;
  /** How many were expected — the resolved roster's size for this occasion. */
  expectedCount: number;
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
/** A Rhythm, rendered as one row carrying its term as a chip strip. */
export interface RhythmRow {
  /** The Rhythm doc's id. */
  id: string;
  name: string;
  location?: string;
  /** Cadence + location, for the row's subtitle (Story 31). */
  subtitle: string;
  /** Denominator for the row — the selected chip's resolved roster size. */
  expectedCount: number;
  /** Chip in time order, oldest first. */
  chips: Chip[];
  /** The chip the view should show in the row summary. */
  selectedChipId: string;
  selectedChip?: Chip;
  rhythm: Rhythm;
}

/** A Gathering that doesn't belong to a Rhythm, listed below. */
export interface OneOffGathering {
  id: string;
  name: string;
  date: string;
  presentCount: number;
  expectedCount: number;
  cancelled: boolean;
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
  /** Rhythm rows, day-of-week order then by name (Story 32). */
  rhythms: RhythmRow[];
  /** One-offs newest-first, past only. Future one-offs surface separately
   *  (Story 20/36) — the "When we met" list is what's happened. */
  oneOffs: OneOffGathering[];
  /** Future one-offs, faint-rendered (Story 36). */
  upcomingOneOffs: OneOffGathering[];
}

// ─── internals ─────────────────────────────────────────────────────────────

const isStamped = (e: Gathering, nowMs: number): boolean => {
  // Attendance can only be "taken" for a Gathering that has already happened —
  // a future-dated Gathering with a stamp should still read as `ahead`.
  const dateMs = parseLocalDate(e.date)?.getTime();
  if (dateMs == null || dateMs > nowMs) return false;
  return !!e.attendanceTakenAt;
};

const chipState = (e: Gathering, mondayMs: number, sundayMs: number, nowMs: number): ChipState => {
  if (e.cancelled) return 'cancelled';
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

const presentCountFor = (e: Gathering, contacts: Contact[]): number =>
  contacts.reduce(
    (n, c) => (c.attendance?.[e.id] === true ? n + 1 : n),
    0,
  );

/** Pick the default selected chip: current-week first, then most-recent past,
 *  then earliest future. */
const defaultSelectedChipId = (chips: Chip[]): string | undefined => {
  if (chips.length === 0) return undefined;
  const cur = chips.find((c) => c.state === 'current-week');
  if (cur) return cur.id;
  const past = chips.filter((c) => c.state === 'happened-not-taken' || c.state === 'taken' || c.state === 'cancelled');
  if (past.length > 0) return past[past.length - 1].id; // chips are time-ordered asc
  const ahead = chips.filter((c) => c.state === 'ahead');
  if (ahead.length > 0) return ahead[0].id;
  return chips[0].id;
};

const CADENCE_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Cadence text + location for the Rhythm row subtitle (Story 31). */
function rhythmSubtitle(rhythm: Rhythm): string {
  let cadenceText: string;
  if (rhythm.cadence.type === 'weekly') {
    const names = rhythm.cadence.days.map((d) => CADENCE_DAY_NAMES[d] ?? '').filter(Boolean);
    cadenceText = names.length > 0 ? `Every ${names.join(', ')}` : 'Weekly';
  } else {
    cadenceText = rhythm.cadence.monthlyType === 'relative-day' ? 'Monthly' : 'Monthly';
  }
  return [cadenceText, rhythm.location].filter(Boolean).join(' · ');
}

// ─── entry point ───────────────────────────────────────────────────────────

export function buildGatheringViewModel(input: {
  events: Gathering[];
  rhythms: Rhythm[];
  contacts: Contact[];
  now: Date;
}): GatheringViewModel {
  const { events, rhythms, contacts, now } = input;
  const nowMs = now.getTime();
  const monday = startOfWeekMonday(now);
  const sunday = endOfWeekSunday(now);
  const mondayMs = monday.getTime();
  const sundayMs = sunday.getTime();

  const rhythmsById = new Map<string, Rhythm>();
  for (const r of rhythms) rhythmsById.set(r.id, r);

  const gatheringsByRhythm = new Map<string, Gathering[]>();
  for (const e of events) {
    if (!e.rhythmId) continue;
    const arr = gatheringsByRhythm.get(e.rhythmId);
    if (arr) arr.push(e);
    else gatheringsByRhythm.set(e.rhythmId, [e]);
  }

  const toOneOff = (e: Gathering): OneOffGathering => ({
    id: e.id,
    name: e.name,
    date: e.date,
    presentCount: presentCountFor(e, contacts),
    expectedCount: (e.roster || []).length,
    cancelled: !!e.cancelled,
    takenByName: e.attendanceTakenAt ? e.attendanceTakenBy : undefined,
    takenAt: e.attendanceTakenAt,
  });

  // ── this-week band ───────────────────────────────────────────────────────
  const thisWeekMap = new Map<string, OneOffGathering[]>();
  for (const e of events) {
    const d = parseLocalDate(e.date);
    if (!d) continue;
    if (!isInWeek(d, monday, sunday)) continue;
    const entry = toOneOff(e);
    const arr = thisWeekMap.get(e.date);
    if (arr) arr.push(entry);
    else thisWeekMap.set(e.date, [entry]);
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
  const rhythmRows: RhythmRow[] = [];
  for (const rhythm of rhythms) {
    const groupEvents = gatheringsByRhythm.get(rhythm.id) ?? [];
    const ordered = sortByDate(groupEvents);
    const chips: Chip[] = ordered.map((e) => {
      const state = chipState(e, mondayMs, sundayMs, nowMs);
      const resolved = resolveRoster(e, rhythm, now);
      return {
        id: e.id,
        date: e.date,
        name: rhythm.name,
        state,
        faint: state === 'ahead',
        presentCount: presentCountFor(e, contacts),
        expectedCount: resolved.length,
        takenByName: state === 'taken' ? e.attendanceTakenBy : undefined,
        takenAt: state === 'taken' ? e.attendanceTakenAt : undefined,
      };
    });
    const selectedChipId = defaultSelectedChipId(chips);
    const selectedChip = chips.find((c) => c.id === selectedChipId);

    rhythmRows.push({
      id: rhythm.id,
      name: rhythm.name,
      location: rhythm.location,
      subtitle: rhythmSubtitle(rhythm),
      expectedCount: selectedChip?.expectedCount ?? rhythm.roster.length,
      chips,
      selectedChipId: selectedChipId || chips[0]?.id || rhythm.id,
      selectedChip,
      rhythm,
    });
  }
  rhythmRows.sort((a, b) => {
    const da = a.rhythm.cadence.days[0] ?? 0;
    const db = b.rhythm.cadence.days[0] ?? 0;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  // ── one-offs: no rhythmId (Story 20/36) ──────────────────────────────────
  const allOneOffEvents = events.filter((e) => !e.rhythmId);
  const oneOffs: OneOffGathering[] = sortByDateDesc(
    allOneOffEvents
      .filter((e) => {
        const ms = parseLocalDate(e.date)?.getTime();
        return ms == null || ms <= nowMs;
      })
      .map(toOneOff),
  );
  const upcomingOneOffs: OneOffGathering[] = sortByDate(
    allOneOffEvents
      .filter((e) => {
        const ms = parseLocalDate(e.date)?.getTime();
        return ms != null && ms > nowMs;
      })
      .map(toOneOff),
  );

  return {
    weekStart: formatLocal(monday),
    weekEnd: formatLocal(sunday),
    thisWeekEmpty: thisWeek.length === 0,
    thisWeek,
    rhythms: rhythmRows,
    oneOffs,
    upcomingOneOffs,
  };
}

const formatLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
