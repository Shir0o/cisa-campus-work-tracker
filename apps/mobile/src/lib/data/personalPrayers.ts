// Personal (private, per-user) prayers — mirrors the web app's
// src/lib/personalPrayers.ts. Live under users/{uid}/personalPrayers; never
// shared. The PersonalPrayer type lives in @cisa/core (shared with splitPrayers).
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import type { PersonalPrayer, PersonalPrayerStatus } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export type { PersonalPrayer, PersonalPrayerStatus } from '@cisa/core';

const col = (uid: string) => collection(db, 'users', uid, 'personalPrayers');
const ref = (uid: string, id: string) => doc(db, 'users', uid, 'personalPrayers', id);

export function subscribePersonalPrayers(
  uid: string,
  cb: (prayers: PersonalPrayer[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(uid), orderBy('date', 'asc')),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data() as Partial<PersonalPrayer>;
          return {
            id: d.id,
            title: data.title ?? '',
            contactId: data.contactId ?? null,
            date: data.date ?? new Date().toISOString(),
            status: data.status ?? 'open',
            answeredAt: data.answeredAt ?? null,
            answeredBody: data.answeredBody ?? null,
          };
        }),
      ),
    (e) => (onError ? onError(e) : console.error('personalPrayers subscription error', e)),
  );
}

export async function addPersonalPrayer(
  uid: string,
  input: { title: string; contactId?: string | null },
): Promise<void> {
  try {
    await addDoc(col(uid), {
      title: input.title.trim(),
      contactId: input.contactId ?? null,
      date: new Date().toISOString(),
      status: 'open' as PersonalPrayerStatus,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `users/${uid}/personalPrayers`);
  }
}

export async function updatePersonalPrayer(
  uid: string,
  id: string,
  patch: {
    title?: string;
    contactId?: string | null;
    status?: PersonalPrayerStatus;
    answeredAt?: string | null;
    answeredBody?: string | null;
  },
): Promise<void> {
  try {
    const clean: Record<string, unknown> = {};
    if (patch.title !== undefined) clean.title = patch.title.trim();
    if (patch.contactId !== undefined) clean.contactId = patch.contactId;
    if (patch.status !== undefined) clean.status = patch.status;
    if (patch.answeredAt !== undefined) clean.answeredAt = patch.answeredAt;
    if (patch.answeredBody !== undefined) clean.answeredBody = patch.answeredBody;
    await updateDoc(ref(uid, id), clean);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `users/${uid}/personalPrayers/${id}`);
  }
}

export async function deletePersonalPrayer(uid: string, id: string): Promise<void> {
  try {
    await deleteDoc(ref(uid, id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `users/${uid}/personalPrayers/${id}`);
  }
}
