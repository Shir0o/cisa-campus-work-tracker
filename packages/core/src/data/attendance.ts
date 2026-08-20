import { doc, updateDoc, type Firestore } from "firebase/firestore";
import type { AttendanceStatus } from "../attendance";
import type { Contact } from "../types";
import { buildContactActivityPatch, shouldTouchActivityForAttendance } from "./contactActivity";

export async function setContactAttendance(
  db: Firestore,
  contact: Contact,
  eventId: string,
  next: AttendanceStatus,
  by: { uid?: string | null; name?: string | null },
  eventDate?: string,
): Promise<void> {
  const newAttendance = { ...(contact.attendance || {}), [eventId]: next };
  const updateData: Record<string, unknown> = {
    attendance: newAttendance,
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid ?? null,
    updatedByName: by.name ?? null,
  };
  if (shouldTouchActivityForAttendance(next)) {
    const activityPatch = buildContactActivityPatch({
      date: eventDate || new Date().toISOString(),
      by,
      type: "attendance",
    });
    Object.assign(updateData, activityPatch);
  }
  await updateDoc(doc(db, "contacts", contact.id), updateData);
}
