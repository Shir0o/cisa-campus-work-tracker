// Shared (contact) prayer status writes — mirrors the web app's src/lib/prayers.ts.
import { doc, updateDoc } from 'firebase/firestore';
import type { PrayerRecord } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export async function updatePrayerStatus(
  prayerId: string,
  status: PrayerRecord['status'],
  by: { uid?: string | null; name?: string | null },
  answer?: string | null,
  answeredAt?: string | null,
): Promise<void> {
  try {
    const clean: Record<string, unknown> = {
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: by.uid || null,
      updatedByName: by.name || null,
    };
    if (answer !== undefined) clean.answer = answer;
    if (answeredAt !== undefined) clean.answeredAt = answeredAt;
    await updateDoc(doc(db, 'prayers', prayerId), clean);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `prayers/${prayerId}`);
  }
}
