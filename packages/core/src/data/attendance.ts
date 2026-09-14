import { doc, writeBatch, type Firestore } from "firebase/firestore";
import { applyAttendance, type GatheringAttendanceStatus } from "../attendance";
import type { Contact, Gathering } from "../types";
import { buildContactActivityPatch, shouldTouchActivityForAttendance } from "./contactActivity";

/** Legacy per-Contact attendance map. Mirrored on write so a rollback keeps
 *  working during the #958 migration; delete once the backfill is verified. */
type LegacyContactAttendance = Record<string, boolean | "absent" | "late">;

/**
 * Records one contact's mark on a Gathering (#958): the Gathering owns the
 * record, and the legacy per-Contact map is mirrored alongside it until the
 * cutover. Attendance still stamps the contact's activity fields.
 */
export async function setGatheringAttendance(
  db: Firestore,
  gathering: Gathering,
  contact: Contact,
  next: GatheringAttendanceStatus,
  by: { uid?: string | null; name?: string | null },
  eventDate?: string,
): Promise<void> {
  const attendance = applyAttendance(gathering.attendance, contact.id, next);

  const contactUpdate: Record<string, unknown> = {
    // Legacy mirror - remove with the rest of the migration bridge.
    attendance: {
      ...((contact as { attendance?: LegacyContactAttendance }).attendance ?? {}),
      [gathering.id]: next === "present" ? true : "absent",
    },
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid ?? null,
    updatedByName: by.name ?? null,
  };
  if (shouldTouchActivityForAttendance(next) && eventDate) {
    Object.assign(
      contactUpdate,
      buildContactActivityPatch({ date: eventDate, by, type: "attendance" }),
    );
  }

  const batch = writeBatch(db);
  batch.update(doc(db, "events", gathering.id), { attendance });
  batch.update(doc(db, "contacts", contact.id), contactUpdate);
  await batch.commit();
}
