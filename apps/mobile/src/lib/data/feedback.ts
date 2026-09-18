// Mobile read-back of the submitter's own Notes (ADR 0019) — mirrors the web
// Your notes page. Reads go through Firestore scoped to the signed-in user;
// a Follow-up is posted to the same server endpoints the web app uses and is
// never written to Firestore from the client.
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Feedback, FeedbackReply } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { getApiUrl } from '../apiUrl';

/** The submitter's own Notes, newest first (the owner query is capped at 50). */
export function subscribeMyNotes(
  uid: string,
  cb: (notes: Feedback[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const q = query(
    collection(db, 'feedback'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50),
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: Feedback[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
        } as Feedback);
      });
      cb(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'feedback');
      onError?.(err);
    },
  );

  return unsubscribe;
}

/** A single Note's Follow-up thread, oldest first. */
export function subscribeNoteReplies(
  noteId: string,
  cb: (replies: FeedbackReply[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const q = query(collection(db, 'feedback', noteId, 'replies'), orderBy('createdAt', 'asc'));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: FeedbackReply[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
        } as FeedbackReply);
      });
      cb(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, `feedback/${noteId}/replies`);
      onError?.(err);
    },
  );

  return unsubscribe;
}

interface AuthHeaders {
  token: string | null;
}

async function getToken(uid: string | undefined): Promise<AuthHeaders> {
  if (!uid) return { token: null };
  try {
    const { auth } = await import('../firebase');
    const token = await auth.currentUser?.getIdToken();
    return { token: token ?? null };
  } catch {
    return { token: null };
  }
}

async function post(path: string, body: unknown, uid: string | undefined): Promise<void> {
  const { token } = await getToken(uid);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${getApiUrl()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
}

/** Posts the submitter's own reply to a Note's Follow-up thread. */
export async function postReply(noteId: string, body: string, uid: string | undefined): Promise<void> {
  await post('/api/feedback/reply', { id: noteId, body }, uid);
}

/** Edits one of the submitter's own, non-relayed replies. */
export async function editReply(
  noteId: string,
  replyId: string,
  body: string,
  uid: string | undefined,
): Promise<void> {
  await post('/api/feedback/reply/edit', { id: noteId, replyId, body }, uid);
}