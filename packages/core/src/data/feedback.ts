// Feedback — the write path behind an injected `db`. Mirrors the write shape
// of src/views/SubmitFeedback.tsx, written directly against Firestore (the
// existing `feedback` rules permit it) rather than through the web app's
// Express /api/feedback server route, which supports browser-only screenshot
// capture and best-effort GitHub issue creation (out of scope for mobile — see
// MIGRATION.md).
import { addDoc, collection, serverTimestamp, type Firestore } from "firebase/firestore";
import type { FeedbackKind } from "../types";
import { kindToType } from "../feedback";

export interface NewFeedbackInput {
  userId: string;
  userEmail: string;
  userName: string;
  kind: FeedbackKind;
  message: string;
  /** Base64 JPEG data URL, best-effort. Rules cap this at 200000 chars. */
  screenshot?: string;
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
    ...(input.screenshot ? { screenshot: input.screenshot } : {}),
  });
  return docRef.id;
}
