// Shared (contact) prayer status writes — thin mobile wrapper around the
// shared @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
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
    await core.updatePrayerStatus(db, prayerId, status, by, answer, answeredAt);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `prayers/${prayerId}`);
  }
}
