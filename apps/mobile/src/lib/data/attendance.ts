// Gathering attendance cycling: thin mobile wrapper around the shared
// @cisa/core write (behind an injected `db`), plus mobile's own activity log
// (kept out of core since each platform has its own logActivity).
import * as core from '@cisa/core';
import type { Contact, Gathering } from '@cisa/core';
import { db, handleFirestoreError, logActivity, OperationType } from '../firebase';

const label = (v: 'present' | 'absent' | undefined) =>
  v === 'present' ? 'Present' : v === 'absent' ? 'Absent' : 'None';

/** Tapping a name cycles present -> absent -> present (see core's
 * cycleAttendanceStatus), persists the Gathering-owned write, and logs it. */
export async function cycleAttendance(
  gathering: Gathering,
  contact: Contact,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  const current = core.here(gathering, contact.id)
    ? 'present'
    : core.explicitlyAbsent(gathering, contact.id)
      ? 'absent'
      : undefined;
  const next = core.cycleAttendanceStatus(current);
  try {
    await core.setGatheringAttendance(db, gathering, contact, next, by, gathering.date);
    void logActivity({
      action: `updated attendance for "${gathering.name || 'a gathering'}" to ${label(next)} for`,
      targetId: contact.id,
      targetName: contact.name,
      targetType: 'contact',
      type: 'edit',
      description: `Attendance [${gathering.name}]: ${label(current)} to ${label(next)}`,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `contacts/${contact.id}`);
  }
}
