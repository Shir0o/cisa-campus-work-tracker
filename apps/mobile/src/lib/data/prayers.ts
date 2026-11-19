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

/** Live subscription to every team prayer (the Prayer tab's full list). */
export function subscribeAllPrayers(
  cb: (prayers: PrayerRecord[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeAllPrayers(db, cb, onError);
}

/** Live subscription to a single contact's prayers (Contact Detail's Prayer
 * tab). */
export function subscribeContactPrayers(
  contactId: string,
  cb: (prayers: PrayerRecord[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeContactPrayers(db, contactId, cb, onError);
}

export async function addPrayer(
  input: { contactId: string; burden: string; teamPrayer: boolean },
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  try {
    await core.addPrayer(db, input, by);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'prayers');
  }
}

/** Bring a burden to the team's prayer list: the prayer and the person's
 *  `teamPrayer` flag are one batch in core, so a failure writes neither. */
export async function addTeamPrayer(
  contactId: string,
  burden: string,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  try {
    await core.addTeamPrayer(db, { contactId, burden }, by);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'prayers');
  }
}

/** Put a person on, or take them off, the team prayer page (§21). The flag
 *  lives on the contact; bringing them to the team also clears the contact's
 *  team removal (core `setTeamPrayer`). */
export async function setTeamPrayer(
  contactId: string,
  on: boolean,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  try {
    await core.setTeamPrayer(db, contactId, on, by);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `contacts/${contactId}`);
  }
}

export async function updatePrayerBurden(
  prayerId: string,
  burden: string,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  try {
    await core.updatePrayerBurden(db, prayerId, burden, by);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `prayers/${prayerId}`);
  }
}
