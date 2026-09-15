import type { Contact, Gathering, GatheringAttendance } from '../types';

type LegacyAttendanceMap = Record<string, boolean | 'absent' | 'late'>;

const legacyAttendance = (contact: Contact): LegacyAttendanceMap | undefined =>
  (contact as { attendance?: LegacyAttendanceMap }).attendance;

export interface AttendanceMigrationPlan {
  expected: { id: string; attendance: GatheringAttendance }[];  updates: { id: string; attendance: GatheringAttendance; fromStampsOnly: boolean }[];
  stampedIds: string[];
  orphaned: { contactId: string; gatheringId: string }[];
  legacyContactIds: string[];
}

export function planAttendanceMigration(
  contacts: Contact[],
  gatherings: Gathering[],
): AttendanceMigrationPlan {
  const byGathering = new Map<string, GatheringAttendance>();
  const orphaned: { contactId: string; gatheringId: string }[] = [];
  const legacyContactIds: string[] = [];
  const known = new Set(gatherings.map((g) => g.id));

  for (const contact of contacts) {
    const map = legacyAttendance(contact);
    if (map === undefined) continue;
    legacyContactIds.push(contact.id);
    for (const gatheringId of Object.keys(map)) {
      if (known.has(gatheringId) === false) {
        orphaned.push({ contactId: contact.id, gatheringId });
        continue;
      }
      let entry = byGathering.get(gatheringId);
      if (entry === undefined) {
        entry = { present: [], absent: [] };
        byGathering.set(gatheringId, entry);
      }
      if (map[gatheringId] === 'absent') entry.absent.push(contact.id);
      else entry.present.push(contact.id);
    }
  }

  const expected: { id: string; attendance: GatheringAttendance }[] = [];
  const updates: AttendanceMigrationPlan['updates'] = [];
  const stampedIds: string[] = [];
  for (const gathering of gatherings) {
    const stamped = Boolean((gathering as { attendanceTakenAt?: string }).attendanceTakenAt);
    if (stamped) stampedIds.push(gathering.id);
    const derived = byGathering.get(gathering.id);
    let target = derived;
    if (target === undefined && stamped) target = { present: [], absent: [] };
    if (target === undefined) continue;
    expected.push({ id: gathering.id, attendance: target });
    if (JSON.stringify(gathering.attendance) === JSON.stringify(target)) continue;
    updates.push({ id: gathering.id, attendance: target, fromStampsOnly: derived === undefined });
  }

  return { expected, updates, stampedIds, orphaned, legacyContactIds };
}
