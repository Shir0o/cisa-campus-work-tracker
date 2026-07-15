// Feedback — Firestore reads/writes behind an injected `db`. Mirrors the
// admin-review parts of web's src/views/FeedbackList.tsx and the write shape
// of src/views/SubmitFeedback.tsx — but written directly against Firestore
// (the existing `feedback` rules already permit everything below) rather
// than through the web app's Express /api/feedback server routes, which
// exist only to support browser-only screenshot capture and best-effort
// GitHub issue creation (out of scope for mobile — see MIGRATION.md).
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import type { Feedback, FeedbackKind } from "../types";
import { kindToType, type FeedbackStatus } from "../feedback";

/** Live subscription to every feedback doc, newest first (admin-only per rules). */
export function subscribeFeedback(
  db: Firestore,
  cb: (list: Feedback[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const q = query(collection(db, "feedback"), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          } as Feedback;
        }),
      );
    },
    onError,
  );
}

export interface NewFeedbackInput {
  userId: string;
  userEmail: string;
  userName: string;
  kind: FeedbackKind;
  message: string;
}

/**
 * Creates a new feedback doc, self-attested per the `feedback` rules'
 * `data.userId == request.auth.uid` + `data.createdAt == request.time`
 * (hence `serverTimestamp()`, not a client-generated ISO string).
 */
export async function submitFeedback(db: Firestore, input: NewFeedbackInput): Promise<string> {
  const docRef = await addDoc(collection(db, "feedback"), {
    userId: input.userId,
    userEmail: input.userEmail,
    userName: input.userName,
    type: kindToType(input.kind),
    kind: input.kind,
    message: input.message.trim(),
    status: "new" as const,
    archived: false,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateFeedbackStatus(db: Firestore, id: string, status: FeedbackStatus): Promise<void> {
  await updateDoc(doc(db, "feedback", id), { status });
}

export async function toggleFeedbackArchive(db: Firestore, id: string, archived: boolean): Promise<void> {
  await updateDoc(doc(db, "feedback", id), { archived });
}

export async function deleteFeedback(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, "feedback", id));
}
