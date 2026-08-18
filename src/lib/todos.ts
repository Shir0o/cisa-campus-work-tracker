import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import { db, handleFirestoreError, OperationType, sendNotification } from "./firebase";

function firstName(name?: string | null): string {
  if (!name || !name.trim()) return "Someone";
  return name.trim().split(/\s+/)[0];
}

export function buildAssignmentNotificationPayload(params: {
  assigneeId: string;
  title: string;
  assignerName?: string | null;
  todoId?: string;
}) {
  const who = firstName(params.assignerName);
  const truncatedTitle = params.title.length > 300 ? params.title.slice(0, 300) + "…" : params.title;
  return {
    userId: params.assigneeId,
    title: "New to-do",
    message: `${who} assigned you: ${truncatedTitle}`,
    type: "assignment" as const,
    link: "/",
    targetId: params.todoId,
  };
}

export function buildCompletionNotificationPayload(params: {
  createdById: string;
  title: string;
  completerName?: string | null;
  todoId?: string;
}) {
  const who = firstName(params.completerName);
  const truncatedTitle = params.title.length > 300 ? params.title.slice(0, 300) + "…" : params.title;
  return {
    userId: params.createdById,
    title: "To-do completed",
    message: `${who} completed: ${truncatedTitle}`,
    type: "success" as const,
    link: "/",
    targetId: params.todoId,
  };
}

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
  soon: "text-accent",
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
export interface SubtaskItem {
  id: string;
  title: string;
  done: boolean;
}

// Where a to-do came from. A to-do can be born out of a Board page
// (`docId`/`docTitle`) or out of a live item — a chat message, a prayer, a
// gathering absence (`interactionId`/`interactionTitle`). The distinction is
// kept so a row can render the source without pretending an interaction is a
// page to open.
export interface TodoSource {
  docId?: string | null;
  docTitle?: string | null;
  interactionId?: string | null;
  interactionTitle?: string | null;
}

export interface NewTodo {
  title: string;
  assigneeId: string | null;
  dueDate: string | null;
  source?: TodoSource | null;
  contactId?: string | null;
  contactName?: string | null;
  subtasks?: SubtaskItem[];
}

// Shared source builders — each site links the to-do back to wherever it was
// born (a Board page, or a live item like a message, prayer or gathering).
export const docSource = (docId: string, docTitle: string): TodoSource => ({ docId, docTitle });

export const interactionSource = (interactionId: string, interactionTitle: string): TodoSource => ({
  interactionId,
  interactionTitle,
});

export async function addTodo(input: NewTodo, me: { uid: string; name: string }): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, "tasks"), {
      title: input.title.trim(),
      dueDate: input.dueDate ?? null,
      priority: "medium",
      status: "pending",
      assigneeId: input.assigneeId ?? null,
      contactId: input.contactId ?? null,
      contactName: input.contactName ?? null,
      sourceInteractionId: input.source?.interactionId ?? null,
      sourceInteractionTitle: input.source?.interactionTitle ?? null,
      createdById: me.uid || null,
      createdByName: me.name || null,
      sourceDocId: input.source?.docId ?? null,
      sourceDocTitle: input.source?.docTitle ?? null,
      createdAt: serverTimestamp(),
      subtasks: input.subtasks ?? [],
    });
    const newId = docRef?.id ?? "mock-task-id";
    if (input.assigneeId && input.assigneeId !== me.uid) {
      void sendNotification(
        buildAssignmentNotificationPayload({
          assigneeId: input.assigneeId,
          title: input.title,
          assignerName: me.name,
          todoId: newId,
        }),
      );
    }
    return newId;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "tasks");
    return "failed-task-id";
  }
}

export async function updateTodo(
  id: string,
  patch: {
    title?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    subtasks?: SubtaskItem[];
    source?: TodoSource | null;
  },
  context?: { oldAssigneeId?: string | null; title?: string; meName?: string; meUid?: string },
): Promise<void> {
  try {
    const clean: Record<string, unknown> = {};
    if (patch.title !== undefined) clean.title = patch.title.trim();
    if (patch.assigneeId !== undefined) clean.assigneeId = patch.assigneeId;
    if (patch.dueDate !== undefined) clean.dueDate = patch.dueDate;
    if (patch.subtasks !== undefined) clean.subtasks = patch.subtasks;
    if (patch.source !== undefined) {
      clean.sourceDocId = patch.source?.docId ?? null;
      clean.sourceDocTitle = patch.source?.docTitle ?? null;
      clean.sourceInteractionId = patch.source?.interactionId ?? null;
      clean.sourceInteractionTitle = patch.source?.interactionTitle ?? null;
    }
    await updateDoc(doc(db, "tasks", id), clean);

    if (
      patch.assigneeId &&
      patch.assigneeId !== context?.oldAssigneeId &&
      patch.assigneeId !== context?.meUid
    ) {
      void sendNotification(
        buildAssignmentNotificationPayload({
          assigneeId: patch.assigneeId,
          title: patch.title || context?.title || "To-do",
          assignerName: context?.meName,
          todoId: id,
        }),
      );
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, "tasks");
  }
}

export async function toggleSubtask(id: string, currentSubtasks: SubtaskItem[], subtaskId: string, done: boolean): Promise<void> {
  const updated = (currentSubtasks || []).map((s) => (s.id === subtaskId ? { ...s, done } : s));
  await updateTodo(id, { subtasks: updated });
}

export async function setTodoDone(
  id: string,
  done: boolean,
  context?: { createdById?: string | null; title?: string; completerName?: string; completerUid?: string },
): Promise<void> {
  try {
    await updateDoc(doc(db, "tasks", id), { status: done ? "completed" : "pending" });
    if (
      done &&
      context?.createdById &&
      context.createdById !== context.completerUid
    ) {
      void sendNotification(
        buildCompletionNotificationPayload({
          createdById: context.createdById,
          title: context.title || "To-do",
          completerName: context.completerName,
          todoId: id,
        }),
      );
    }
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

