// Task writes — shared Firestore logic behind an injected `db`, so each app's
// data layer just supplies its own Firestore instance + error handling. Mirrors
// the web app's src/lib/todos.ts.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import {
  buildAssignmentNotificationPayload,
  buildCompletionNotificationPayload,
  type TodoNotifyPayload,
} from "../todoNotifications";

export interface NewTodo {
  title: string;
  assigneeId: string | null;
  dueDate: string | null;
  source?: { docId?: string | null; docTitle?: string | null; interactionId?: string | null; interactionTitle?: string | null } | null;
  contactId?: string | null;
  contactName?: string | null;
}

export async function addTodo(
  db: Firestore,
  input: NewTodo,
  me: { uid: string; name: string },
  onNotify?: (payload: TodoNotifyPayload) => void,
): Promise<string> {
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
  });

  if (input.assigneeId && input.assigneeId !== me.uid && onNotify) {
    onNotify(
      buildAssignmentNotificationPayload({
        assigneeId: input.assigneeId,
        title: input.title,
        assignerName: me.name,
        todoId: docRef.id,
      }),
    );
  }

  return docRef.id;
}

export async function updateTodo(
  db: Firestore,
  id: string,
  patch: { title?: string; assigneeId?: string | null; dueDate?: string | null },
  context?: { oldAssigneeId?: string | null; title?: string; meName?: string },
  onNotify?: (payload: TodoNotifyPayload) => void,
): Promise<void> {
  const clean: Record<string, any> = {};
  if (patch.title !== undefined) clean.title = patch.title.trim();
  if (patch.assigneeId !== undefined) clean.assigneeId = patch.assigneeId;
  if (patch.dueDate !== undefined) clean.dueDate = patch.dueDate;
  await updateDoc(doc(db, "tasks", id), clean);

  if (
    patch.assigneeId &&
    patch.assigneeId !== context?.oldAssigneeId &&
    onNotify
  ) {
    onNotify(
      buildAssignmentNotificationPayload({
        assigneeId: patch.assigneeId,
        title: patch.title || context?.title || "To-do",
        assignerName: context?.meName,
        todoId: id,
      }),
    );
  }
}

export async function setTodoDone(
  db: Firestore,
  id: string,
  done: boolean,
  context?: { createdById?: string | null; title?: string; completerName?: string; completerUid?: string },
  onNotify?: (payload: TodoNotifyPayload) => void,
): Promise<void> {
  await updateDoc(doc(db, "tasks", id), { status: done ? "completed" : "pending" });

  if (
    done &&
    context?.createdById &&
    context.createdById !== context.completerUid &&
    onNotify
  ) {
    onNotify(
      buildCompletionNotificationPayload({
        createdById: context.createdById,
        title: context.title || "To-do",
        completerName: context.completerName,
        todoId: id,
      }),
    );
  }
}

export async function deleteTodo(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, "tasks", id));
}

