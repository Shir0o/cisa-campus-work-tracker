// Log tab ("Quick Capture") — pure derivations shared by web and mobile.
// Ported from the Claude Design project's dedicated mobile file,
// views/quick-capture.jsx (not the desktop LogInteractionModal.tsx batch
// logger, which is a different, multi-contact flow). The Firestore reads/
// writes reuse the already-existing addContact/addInteraction/addTodo/
// addPrayer wrappers — see the mobile QuickCaptureSheet component.
import { format } from "date-fns";
import { daysSince, lastTouchByContact, parseMs, type Touch } from "./myday";
import type { Contact } from "./types";

export type QuickCaptureKindId = "gospel" | "appointment" | "gathering" | "phone" | "text" | "meet";

export interface QuickCaptureKind {
  id: QuickCaptureKindId;
  label: string;
}

export const QUICK_CAPTURE_KINDS: QuickCaptureKind[] = [
  { id: "gospel", label: "Gospel" },
  { id: "appointment", label: "Appointment" },
  { id: "gathering", label: "Gathering" },
  { id: "phone", label: "Phone call" },
  { id: "text", label: "Text" },
  { id: "meet", label: "Ran into" },
];

export interface QuickCaptureCandidate {
  contact: Contact;
  days: number;
}

/** "Who did you talk to?" — recents, mine first, then most-recently-touched
 * first. Note this is the OPPOSITE sort direction from Directory's
 * longest-since-touched-first: Quick Capture surfaces who you're likely to
 * log again right now, not who's overdue. A contact with no touch at all
 * falls back to its creation date, then to the very end (Infinity days),
 * matching filterAndSortDirectory's same edge case. */
export function quickCaptureRecents(
  contacts: Contact[],
  touches: Touch[],
  meUid: string | null | undefined,
  limit = 6,
  now: number = Date.now(),
): QuickCaptureCandidate[] {
  const touchMap = lastTouchByContact(touches);
  return contacts
    .map((contact) => {
      const touch = touchMap.get(contact.id);
      const ms = touch?.ms ?? parseMs(contact.createdAt);
      const days = ms == null ? Infinity : daysSince(ms, now);
      return { contact, days };
    })
    .sort((a, b) => {
      const mine = (a.contact.createdBy === meUid ? 0 : 1) - (b.contact.createdBy === meUid ? 0 : 1);
      return mine !== 0 ? mine : a.days - b.days;
    })
    .slice(0, limit);
}

/** Live search-as-you-type matches against a contact's name. */
export function quickCaptureSearchMatches(contacts: Contact[], query: string, limit = 8): Contact[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, limit);
}

export type ReminderPreset = "tom" | "few" | "week";

export const REMINDER_PRESETS: { key: ReminderPreset; label: string; days: number }[] = [
  { key: "tom", label: "Tomorrow", days: 1 },
  { key: "few", label: "In a few days", days: 3 },
  { key: "week", label: "Next week", days: 7 },
];

// No "pick a date" custom option — matches the app's existing task-due-date
// composer (packages/core/src/myday.ts's DUE_PRESETS), which also sticks to
// fixed presets since there's no native date-picker dependency in the app.
const REMINDER_PRESET_DAYS: Record<ReminderPreset, number> = { tom: 1, few: 3, week: 7 };

/** Due date for a reminder preset ("Tomorrow"/"In a few days"/"Next week"),
 * as a bare `yyyy-MM-dd` — the same format Task.dueDate uses everywhere else
 * (see myday.ts's duePresetToISO). Matters beyond consistency: the deployed
 * `tasks` Firestore rule caps `dueDate` at 20 chars, which a full ISO
 * datetime (~24 chars) silently fails — reproduced live as a
 * "Missing or insufficient permissions" error the first time a reminder was
 * set. */
export function reminderDueDate(preset: ReminderPreset, now: number = Date.now()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + REMINDER_PRESET_DAYS[preset]);
  return format(d, "yyyy-MM-dd");
}
