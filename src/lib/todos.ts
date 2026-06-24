import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import { db, handleFirestoreError, OperationType } from "./firebase";

const DAY_MS = 86_400_000;

// A person a to-do can be assigned to. Structurally compatible with the
// CoordinationNotes `TeamMember` shape, kept generic so both the composer and
// the row can be reused outside that view.
export interface TodoPerson {
  uid: string;
  name: string;
  photoURL?: string;
  role?: string;
}

// Parse a due date to a Date in the *local* day. A bare `yyyy-MM-dd` (what
// DatePicker and the presets emit) is otherwise parsed as UTC midnight, which
// lands on the previous day in behind-UTC timezones — so build it locally.
const toLocalDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ── Due-date chip ────────────────────────────────────────────────────────────
export type DueTone = "overdue" | "soon" | "normal";

export const dueToneClass: Record<DueTone, string> = {
  overdue: "text-error",
  soon: "text-primary",
  normal: "text-on-surface-variant",
};

// Humanize a to-do's due date into a chip label + tone. Returns null when there
// is no due date.
export function dueChip(dueDate?: string | null): { label: string; tone: DueTone } | null {
  const due = toLocalDate(dueDate);
  if (due == null) return null;
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  if (diff < 0) return { label: "Overdue", tone: "overdue" };
  if (diff === 0) return { label: "Due today", tone: "soon" };
  if (diff === 1) return { label: "Due tomorrow", tone: "soon" };
  if (diff <= 6) return { label: `Due ${format(due, "EEEE")}`, tone: diff <= 2 ? "soon" : "normal" };
  return { label: `Due ${format(due, "MMM d")}`, tone: "normal" };
}

// ── Due-date quick presets for the composer ──────────────────────────────────
export type DuePresetKey = "today" | "tomorrow" | "week" | "none" | "custom";

export const DUE_PRESETS: { key: DuePresetKey; label: string; days: number | null }[] = [
  { key: "today", label: "Today", days: 0 },
  { key: "tomorrow", label: "Tomorrow", days: 1 },
  { key: "week", label: "This week", days: 5 },
  { key: "none", label: "No date", days: null },
];

// yyyy-MM-dd, N local days from today — matches the app's `dueDate` string format
// (the same one `DatePicker` emits).
export function duePresetToISO(days: number | null): string | null {
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

// Best-fit preset for an existing due date, so the composer opens with the right
// pill pre-selected (falls back to "custom" for an arbitrary date).
export function presetForDue(dueDate?: string | null): DuePresetKey {
  if (!dueDate) return "none";
  for (const p of DUE_PRESETS) {
    if (p.days != null && duePresetToISO(p.days) === dueDate) return p.key;
  }
  return "custom";
}

// ── Firestore writes (shared by My Day + The Board) ──────────────────────────
export interface NewTodo {
  title: string;
  assigneeId: string | null;
  dueDate: string | null;
  source?: { docId: string; docTitle: string } | null;
  contactId?: string | null;
  contactName?: string | null;
}

export async function addTodo(input: NewTodo, me: { uid: string; name: string }): Promise<void> {
  try {
    await addDoc(collection(db, "tasks"), {
      title: input.title.trim(),
      dueDate: input.dueDate ?? null,
      priority: "medium",
      status: "pending",
      assigneeId: input.assigneeId ?? null,
      contactId: input.contactId ?? null,
      contactName: input.contactName ?? null,
      sourceInteractionId: null,
      createdById: me.uid || null,
      createdByName: me.name || null,
      sourceDocId: input.source?.docId ?? null,
      sourceDocTitle: input.source?.docTitle ?? null,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "tasks");
  }
}

export async function updateTodo(
  id: string,
  patch: { title?: string; assigneeId?: string | null; dueDate?: string | null },
): Promise<void> {
  try {
    const clean: Record<string, unknown> = {};
    if (patch.title !== undefined) clean.title = patch.title.trim();
    if (patch.assigneeId !== undefined) clean.assigneeId = patch.assigneeId;
    if (patch.dueDate !== undefined) clean.dueDate = patch.dueDate;
    await updateDoc(doc(db, "tasks", id), clean);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, "tasks");
  }
}

export async function setTodoDone(id: string, done: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, "tasks", id), { status: done ? "completed" : "pending" });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, "tasks");
  }
}

export async function deleteTodo(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "tasks", id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, "tasks");
  }
}
