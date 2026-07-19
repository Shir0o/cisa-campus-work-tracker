// Gatherings attendance — pure derivations shared by web and mobile, ported
// from src/views/Attendance.tsx. The Firestore write lives in
// ./data/attendance.ts behind an injected db.
import { parseMs } from "./myday";
import type { Contact, Event } from "./types";

export type AttendanceStatus = boolean | "absent" | "late";

/** Present or late counts as "here"; absent/unmarked doesn't. */
export function here(contact: Contact, eventId: string): boolean {
  const s = contact.attendance?.[eventId];
  return s === true || s === "late";
}

/** Tapping a name cycles present → late → absent → present. Anyone missed
 * (absent or unmarked) jumps to present on the first tap. */
export function cycleAttendanceStatus(current: AttendanceStatus | undefined): AttendanceStatus {
  if (current === true) return "late";
  if (current === "late") return "absent";
  return true; // 'absent' or undefined → present
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
      if (here(c, s.id)) {
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
export function avgAttendance(contacts: Contact[], events: Event[]): number {
  if (events.length === 0) return 0;
  let slots = 0;
  contacts.forEach((c) => events.forEach((e) => { if (here(c, e.id)) slots++; }));
  return Math.round(slots / events.length);
}

/** CSV text: header row (Name, Role, one column per event as "{name} ({date})"),
 * one row per contact with Present/Late/Absent/None per event. Ported from
 * web's Attendance.tsx handleExport row shape. */
export function buildAttendanceCsv(contacts: Contact[], events: Event[]): string {
  const headers = ['Name', 'Role', ...events.map((e) => `${e.name} (${e.date})`)];
  const rows = contacts.map((c) => [
    c.name,
    c.role,
    ...events.map((e) => {
      const s = c.attendance?.[e.id];
      return s === true ? 'Present' : s === 'late' ? 'Late' : s === 'absent' ? 'Absent' : 'None';
    }),
  ]);
  return [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
}
