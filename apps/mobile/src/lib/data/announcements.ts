// Announcements — thin mobile wrapper around the shared @cisa/core logic
// (behind an injected `db`). Posting writes one bell entry per person through
// this app's own notification write, so push follows from the bell.
import * as core from '@cisa/core';
import type { Announcement, AppUser } from '@cisa/core';
import { collection, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sendNotification } from '../firebase';

export function subscribeAnnouncements(
  cb: (list: Announcement[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeAnnouncements(db, cb, onError);
}

/** Everyone on the team, live — the poster reads who has not got it from this. */
export function subscribeTeam(cb: (users: AppUser[]) => void, onError?: (e: unknown) => void): () => void {
  return core.subscribeUsers(db, cb, onError);
}

/** Post as a Full-timer, and write the bell entry for every other approved
 *  Full-timer and Trainee. Resolves to the new announcement's id. */
export async function postAnnouncement(author: { uid: string; name: string }, body: string): Promise<string> {
  try {
    const users = await getDocs(collection(db, 'users'));
    const team = users.docs.map((d) => ({ uid: d.id, ...d.data() })) as AppUser[];
    const recipients = core.announcementAudience(team, author.uid).map((u) => u.uid);
    return await core.postAnnouncement(db, author, body, recipients, (payload) => {
      void sendNotification(payload);
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'announcements');
    throw e;
  }
}

export async function markGotIt(announcementId: string, uid: string): Promise<void> {
  try {
    await core.markGotIt(db, announcementId, uid);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `announcements/${announcementId}`);
  }
}
