import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import * as core from "../../packages/core/src/data/announcements";
import { subscribeUsers } from "../../packages/core/src/data/users";
import {
  announcementAudience,
  openAnnouncements,
  type Announcement,
} from "../../packages/core/src/announcements";
import type { AppUser } from "../../packages/core/src/types";
import { auth, db, handleFirestoreError, OperationType, sendNotification } from "./firebase";

// Announcements (cut-or-keep §20): a Full-timer posts, it pushes to every phone
// (one bell entry per person, and the notification function pushes every bell
// entry), shows as a card on everyone's home until "Got it", and the poster
// sees who has not. The shaping is the shared @cisa/core module, re-exported
// whole so web and phone read the same answer; only the storage is mirrored
// here, because this app initialises its own Firebase `db`.
export * from "../../packages/core/src/announcements";

/** Post an announcement as the signed-in Full-timer, and write the bell entry
 *  for every other approved Full-timer and Trainee. Resolves to its id. */
export async function postAnnouncement(body: string): Promise<string> {
  const me = auth.currentUser;
  if (!me) throw new Error("Sign in to post an announcement.");
  try {
    const users = await getDocs(collection(db, "users"));
    const team = users.docs.map((d) => ({ uid: d.id, ...d.data() })) as AppUser[];
    const recipients = announcementAudience(team, me.uid).map((u) => u.uid);
    return await core.postAnnouncement(
      db,
      { uid: me.uid, name: me.displayName || "A Full-timer" },
      body,
      recipients,
      (payload) => void sendNotification(payload),
    );
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "announcements");
    throw e;
  }
}

/** Say Got it as the signed-in person. */
export async function markGotIt(announcementId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to mark an announcement.");
  try {
    await core.markGotIt(db, announcementId, uid);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `announcements/${announcementId}`);
  }
}

/** The newest announcements, live. */
export function useAnnouncements(): Announcement[] {
  const [list, setList] = useState<Announcement[]>([]);
  useEffect(() => core.subscribeAnnouncements(db, setList, () => setList([])), []);
  return list;
}

/** What `uid` has not marked Got it, newest first — the cards on their home. */
export function useOpenAnnouncements(uid: string | null | undefined): Announcement[] {
  const list = useAnnouncements();
  return useMemo(() => (uid ? openAnnouncements(list, uid) : []), [list, uid]);
}

/** Everyone on the team, live — the poster reads who has not got it from this. */
export function useTeamUsers(enabled: boolean): AppUser[] {
  const [users, setUsers] = useState<AppUser[]>([]);
  useEffect(() => {
    if (!enabled) return;
    return subscribeUsers(db, setUsers, () => setUsers([]));
  }, [enabled]);
  return users;
}
