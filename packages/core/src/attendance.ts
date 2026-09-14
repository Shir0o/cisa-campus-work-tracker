// Gatherings attendance - pure derivations shared by web and mobile, ported
// from src/views/Attendance.tsx. The Firestore write lives in
// ./data/attendance.ts behind an injected db.
//
// Attendance lives on the Gathering (#958). The legacy per-Contact map is
// bridged exactly once, by `hydrateGatherings`, so every other reader only
// ever sees `Gathering.attendance`.
import { parseMs } from "./myday";
import type { Contact, Event, GatheringAttendance } from "./types";

/** A contact's mark for one occasion. `present` means they were there;
 *  `absent` is only ever set deliberately. */
export type GatheringAttendanceStatus = "present" | "absent";

/** The pre-#958 per-Contact map (gatheringId -> true | 'absent' | 'late'),
 *  read only by the migration bridge below. */
type LegacyContactAttendance = Record<string, boolean | "absent" | "late">;

/** Reads the deprecated per-Contact attendance map without it being part of
 *  the Contact type. Delete with `hydrateGatherings` after cutover. */
const legacyAttendance = (contact: Contact): LegacyContactAttendance | undefined =>
  (contact as { attendance?: LegacyContactAttendance }).attendance;

/** Reads a legacy attendance-taken stamp without it being part of the
 *  Gathering type. Delete with `hydrateGatherings` after cutover. */
const legacyTakenAt = (gathering: Event): boolean =>
  Boolean((gathering as { attendanceTakenAt?: string }).attendanceTakenAt);

/** True when attendance has been taken for this occasion, even if nobody came.
 *  `undefined` on the record means nobody has marked it yet. */
export function isAttendanceTaken(gathering: Event): boolean {
  return gathering.attendance !== undefined;
}

/** Present counts as "here"; absent or unmarked does not. */
export function here(gathering: Event, contactId: string): boolean {
  return gathering.attendance?.present.includes(contactId) ?? false;
}

/** Explicitly marked absent (distinct from merely unmarked). */
export function explicitlyAbsent(gathering: Event, contactId: string): boolean {
  return gathering.attendance?.absent.includes(contactId) ?? false;
}

/** How many people were present at this occasion. */
export function presentCount(gathering: Event): number {
  return gathering.attendance?.present.length ?? 0;
}

/** Tapping a name cycles present -> absent -> present. Anyone missed
 * (absent or unmarked) jumps to present on the first tap. */
export function cycleAttendanceStatus(
  current: GatheringAttendanceStatus | undefined,
): GatheringAttendanceStatus {
  return current === "present" ? "absent" : "present";
}

/** Applies one contact's new mark, returning a fresh record. `undefined`
 *  current means the occasion was unmarked; any tap marks it. */
export function applyAttendance(
  current: GatheringAttendance | undefined,
  contactId: string,
  next: GatheringAttendanceStatus,
): GatheringAttendance {
  const present = (current?.present ?? []).filter((id) => id !== contactId);
  const absent = (current?.absent ?? []).filter((id) => id !== contactId);
  if (next === "present") present.push(contactId);
  else absent.push(contactId);
  return { present, absent };
}

/** Fills `attendance` on Gatherings that predate the move, from the legacy
 *  per-Contact maps and the attendance-taken stamps. Gatherings that already
 *  carry `attendance` are returned untouched, so this becomes a no-op once
 *  the backfill has run. `'late'` is folded into present (they attended). */
export function hydrateGatherings(gatherings: Event[], contacts: Contact[]): Event[] {
  const legacyByGathering = new Map<string, GatheringAttendance>();
  for (const contact of contacts) {
    const map = legacyAttendance(contact);
    if (!map) continue;
    for (const [gatheringId, value] of Object.entries(map)) {
      let entry = legacyByGathering.get(gatheringId);
      if (!entry) {
        entry = { present: [], absent: [] };
        legacyByGathering.set(gatheringId, entry);
      }
      if (value === true || value === "late") entry.present.push(contact.id);
      else if (value === "absent") entry.absent.push(contact.id);
    }
  }
  return gatherings.map((gathering) => {
    if (gathering.attendance) return gathering;
    const legacy = legacyByGathering.get(gathering.id);
    const taken = Boolean(legacy) || legacyTakenAt(gathering);
    return taken ? { ...gathering, attendance: legacy ?? { present: [], absent: [] } } : gathering;
  });
}

/** Gatherings newest first, ties broken by `order`. */
export function sessionsNewestFirst(events: Event[]): Event[] {
  return [...events].sort((a, b) => {
    const am = parseMs(a.date) ?? 0;
    const bm = parseMs(b.date) ?? 0;
    return bm - am || (b.order ?? 0) - (a.order ?? 0);
  });
}

export interface MissedContact {
  contact: Contact;
  since: number;
  lastSeen: Event;
}

/** Who's attended before but missed the last 2+ gatherings (relative to
 * `sessions`, newest first), longest-absent first, capped to `limit`. */
export function whoWeMissed(
  contacts: Contact[],
  sessions: Event[],
  limit: number = 4,
): MissedContact[] {
  const out: MissedContact[] = [];
  contacts.forEach((c) => {
    let since = 0;
    let lastSeen: Event | null = null;
    for (const s of sessions) {
      if (here(s, c.id)) {
        lastSeen = s;
        break;
      }
      since++;
    }
    if (lastSeen && since >= 2) out.push({ contact: c, since, lastSeen });
  });
  return out.sort((a, b) => b.since - a.since).slice(0, limit);
}

/** Average number of people present per gathering. */
export function avgAttendance(events: Event[]): number {
  if (events.length === 0) return 0;
  const slots = events.reduce((n, e) => n + presentCount(e), 0);
  return Math.round(slots / events.length);
}

/** CSV text: header row (Name, Role, one column per event as "{name} ({date})"),
 * one row per contact with Present/Absent/None per event. */
export function buildAttendanceCsv(contacts: Contact[], events: Event[]): string {
  const headers = ['Name', 'Role', ...events.map((e) => `${e.name} (${e.date})`)];
  const rows = contacts.map((c) => [
    c.name,
    c.role,
    ...events.map((e) => (here(e, c.id) ? 'Present' : explicitlyAbsent(e, c.id) ? 'Absent' : 'None')),
  ]);
  return [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
}
