// Contact Detail screen — pure derivations shared by web and mobile, ported
// from src/components/modals/ContactDetailsModal.tsx. The Firestore reads/
// writes live in ./data/{contacts,threads,activities,prayers,interactions,comments}.ts
// behind an injected db.
import type { Activity, Contact } from "./types";

export interface ContactEditFields {
  firstName: string;
  lastName: string;
  role: string;
  location: string;
  email: string;
  phone: string;
  stage: string;
  tags: string[];
  notes: string;
  spiritualBackground: string;
}

/** Diffs an edit form against the live contact, producing the audit-log
 * change lines (`handleUpdate`'s change block). Location's label swaps
 * between "residence hall"/"first met" depending on the 'New Sign Up' tag,
 * matching the edit form's own dynamic field label. */
export function diffContactFields(before: Contact, after: ContactEditFields): string[] {
  const changes: string[] = [];
  const fullName = `${after.firstName} ${after.lastName}`.trim();

  if (fullName !== before.name) changes.push(`name: "${before.name}" → "${fullName}"`);
  if (after.email !== before.email) changes.push(`email: "${before.email}" → "${after.email}"`);
  if (after.phone !== before.phone) changes.push(`phone: "${before.phone}" → "${after.phone}"`);
  if (after.location !== before.location) {
    const locLabel = after.tags?.includes("New Sign Up") ? "residence hall" : "first met";
    changes.push(`${locLabel}: "${before.location}" → "${after.location}"`);
  }
  if (after.role !== before.role) changes.push(`group: "${before.role}" → "${after.role}"`);
  if (after.stage !== before.stage) changes.push(`stage: "${before.stage}" → "${after.stage}"`);
  if (after.spiritualBackground !== before.spiritualBackground) {
    changes.push(
      `spiritualBackground: "${before.spiritualBackground || ""}" → "${after.spiritualBackground}"`,
    );
  }
  if (after.notes !== before.notes) changes.push("notes updated");

  return changes;
}

/** Maps a logged interaction's `type` to the activity feed's narrower
 * `Activity['type']` union (`handleAddInteraction`'s mapping). Also covers
 * Quick Capture's kind vocabulary (gospel/appointment/gathering/phone/text/
 * meet — see quickCapture.ts), which doesn't otherwise overlap with the
 * Conversations tab's chat/call/meeting/email set. */
export function interactionActivityType(type: string): Activity["type"] {
  if (type === "meeting") return "event";
  if (type === "chat") return "comment";
  if (type === "phone") return "call";
  if (type === "appointment" || type === "gathering") return "event";
  if (type === "gospel" || type === "text" || type === "meet") return "comment";
  return type as Activity["type"];
}

/** Builds the audit-log description for a contact deletion, capturing its
 * fields + subcollection counts before the doc is gone (`handleDelete`'s
 * fieldsLog, joined with a real newline — the web version joins with the
 * literal two-char string "\\n", which its own reader never actually
 * splits on; this is a deliberate fix, not a divergence in intent). */
export function contactDeleteFieldsLog(
  contact: Contact,
  interactionCount: number,
  commentCount: number,
): string {
  return [
    `Group: ${contact.role}`,
    `Stage: ${contact.stage}`,
    `Location: ${contact.location}`,
    `Email: ${contact.email || "N/A"}`,
    `Phone: ${contact.phone || "N/A"}`,
    `Total Interactions: ${interactionCount}`,
    `Total Comments: ${commentCount}`,
  ].join("\n");
}
