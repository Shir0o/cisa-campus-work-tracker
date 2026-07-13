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

export interface NewTodo {
  title: string;
  assigneeId: string | null;
  dueDate: string | null;
  source?: { docId: string; docTitle: string } | null;
  contactId?: string | null;
  contactName?: string | null;
}

export async function addTodo(
  db: Firestore,
  input: NewTodo,
  me: { uid: string; name: string },
): Promise<void> {
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
}

export async function updateTodo(
  db: Firestore,
  id: string,
  patch: { title?: string; assigneeId?: string | null; dueDate?: string | null },
): Promise<void> {
  const clean: Record<string, any> = {};
  if (patch.title !== undefined) clean.title = patch.title.trim();
  if (patch.assigneeId !== undefined) clean.assigneeId = patch.assigneeId;
  if (patch.dueDate !== undefined) clean.dueDate = patch.dueDate;
  await updateDoc(doc(db, "tasks", id), clean);
}

export async function setTodoDone(db: Firestore, id: string, done: boolean): Promise<void> {
  await updateDoc(doc(db, "tasks", id), { status: done ? "completed" : "pending" });
}

export async function deleteTodo(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, "tasks", id));
}
