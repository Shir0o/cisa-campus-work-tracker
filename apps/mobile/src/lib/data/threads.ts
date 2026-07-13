// "Walking together" thread reads/writes for the "From the team" inbox —
// mirrors the subset of the web app's src/lib/threads.ts that My Day uses
// (subscribeAllThreads, addThreadMessage). The pure types/helpers live in
// @cisa/core; reactions + per-contact subscription aren't needed here.
import { addDoc, collection, collectionGroup, onSnapshot, query } from 'firebase/firestore';
import type { ThreadKind, ThreadMessage, ThreadMessageWithContact, ThreadReaction } from '@cisa/core';
import { THREAD_NOTIFY_TITLE } from '@cisa/core';
import { db, handleFirestoreError, OperationType, sendNotification } from '../firebase';

const col = (contactId: string) => collection(db, 'contacts', contactId, 'threads');

/** Live subscription to every thread message across all contacts, tagged with contactId. */
export function subscribeAllThreads(
  cb: (messages: ThreadMessageWithContact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collectionGroup(db, 'threads')),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data() as Partial<ThreadMessage>;
          return {
            id: d.id,
            contactId: d.ref.parent.parent?.id ?? '',
            interactionId: data.interactionId ?? null,
            from: data.from ?? '',
            fromName: data.fromName ?? '',
            kind: (data.kind as ThreadKind) ?? 'comment',
            body: data.body ?? '',
            at: data.at ?? new Date().toISOString(),
            reactions: Array.isArray(data.reactions) ? data.reactions : [],
          };
        }),
      ),
    (e) => (onError ? onError(e) : console.error('all-threads subscription error', e)),
  );
}

/** Post a new message to a contact; pings `notify.to`'s bell when set. */
export async function addThreadMessage(
  contactId: string,
  input: { interactionId?: string | null; from: string; fromName: string; kind: ThreadKind; body: string },
  notify?: { to?: string | null; contactName?: string },
): Promise<void> {
  const body = input.body.trim();
  try {
    await addDoc(col(contactId), {
      interactionId: input.interactionId ?? null,
      from: input.from,
      fromName: input.fromName,
      kind: input.kind,
      body,
      at: new Date().toISOString(),
      reactions: [] as ThreadReaction[],
    });
    if (notify?.to) {
      const who = (input.fromName || 'Someone').trim().split(/\s+/)[0];
      void sendNotification({
        userId: notify.to,
        title: THREAD_NOTIFY_TITLE[input.kind](who, notify.contactName || 'this person'),
        message: body.length > 140 ? body.slice(0, 140).trimEnd() + '…' : body,
        type: 'info',
        targetId: contactId,
      });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `contacts/${contactId}/threads`);
  }
}
