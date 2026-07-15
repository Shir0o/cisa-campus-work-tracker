// Contact attendance write — shared Firestore logic behind an injected `db`.
// Mirrors the web app's src/views/Attendance.tsx's cycleAttendance. Activity
// logging is left to each platform (each has its own logActivity) so this
// module stays free of that side effect.
import { doc, updateDoc, type Firestore } from "firebase/firestore";
import type { AttendanceStatus } from "../attendance";
import type { Contact } from "../types";

export async function setContactAttendance(
  db: Firestore,
  contact: Contact,
  eventId: string,
  next: AttendanceStatus,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  const newAttendance = { ...(contact.attendance || {}), [eventId]: next };
  await updateDoc(doc(db, "contacts", contact.id), {
    attendance: newAttendance,
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid ?? null,
    updatedByName: by.name ?? null,
  });
}
