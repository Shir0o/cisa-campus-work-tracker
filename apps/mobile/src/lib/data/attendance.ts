// Contact attendance cycling — thin mobile wrapper around the shared
// @cisa/core write (behind an injected `db`), plus mobile's own activity log
// (kept out of core since each platform has its own logActivity).
import * as core from '@cisa/core';
import type { AttendanceStatus, Contact } from '@cisa/core';
import { db, handleFirestoreError, logActivity, OperationType } from '../firebase';

const label = (v: AttendanceStatus | undefined) =>
  v === true ? 'Present' : v === 'late' ? 'Late' : v === 'absent' ? 'Absent' : 'None';

/** Tapping a name cycles present → late → absent → present (see
 * core's cycleAttendanceStatus), persists the write, and logs the change. */
export async function cycleAttendance(
  contact: Contact,
  eventId: string,
  eventName: string | undefined,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  const current = contact.attendance?.[eventId];
  const next = core.cycleAttendanceStatus(current);
  try {
    await core.setContactAttendance(db, contact, eventId, next, by);
    void logActivity({
      action: `updated attendance for "${eventName || 'a gathering'}" to ${label(next)} for`,
      targetId: contact.id,
      targetName: contact.name,
      targetType: 'contact',
      type: 'edit',
      description: `Attendance [${eventName}]: ${label(current)} → ${label(next)}`,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `contacts/${contact.id}`);
  }
}
