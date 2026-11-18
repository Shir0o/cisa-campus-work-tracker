// Announcements — Firestore reads/writes behind an injected `db`. Posting also
// writes one bell entry per recipient through `onNotify` (each app supplies its
// own notification write), which is how an announcement reaches every phone: the
// notification function pushes every bell entry.
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import {
  ANNOUNCEMENT_MAX_LENGTH,
  announcementNotification,
  type Announcement,
  type AnnouncementNotifyPayload,
} from "../announcements";

const iso = (value: unknown): string | null =>
  (value as { toDate?: () => Date } | null | undefined)?.toDate?.()?.toISOString() ?? null;

function mapAnnouncement(d: { id: string; data: () => Record<string, any> }): Announcement {
  const data = d.data();
  const gotIt: Record<string, string | null> = {};
  for (const [uid, at] of Object.entries((data.gotIt ?? {}) as Record<string, unknown>)) gotIt[uid] = iso(at);
  return {
    id: d.id,
    body: data.body ?? "",
    authorId: data.authorId ?? "",
    authorName: data.authorName ?? "",
    createdAt: iso(data.createdAt),
    gotIt,
  };
}

/** The newest announcements, live. Every approved Full-timer and Trainee may
 *  read the collection (firestore.rules). */
export function subscribeAnnouncements(
  db: Firestore,
  cb: (list: Announcement[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(50)),
    (snap) => cb(snap.docs.map(mapAnnouncement)),
    (e) => (onError ? onError(e) : console.error("announcements subscription error", e)),
  );
}

/** Post an announcement as a Full-timer, then write the bell entry for each of
 *  `recipientUids` (never the poster). Resolves to the new announcement's id. */
export async function postAnnouncement(
  db: Firestore,
  author: { uid: string; name: string },
  body: string,
  recipientUids: string[],
  onNotify: (payload: AnnouncementNotifyPayload) => void,
): Promise<string> {
  const text = body.trim();
  if (!text || text.length > ANNOUNCEMENT_MAX_LENGTH) {
    throw new Error(`An announcement is 1 to ${ANNOUNCEMENT_MAX_LENGTH} characters.`);
  }
  const created = await addDoc(collection(db, "announcements"), {
    body: text,
    authorId: author.uid,
    authorName: author.name,
    createdAt: serverTimestamp(),
    gotIt: {},
  });
  const posted = { id: created.id, body: text, authorName: author.name };
  for (const uid of new Set(recipientUids)) {
    if (!uid || uid === author.uid) continue;
    onNotify(announcementNotification(posted, uid));
  }
  return created.id;
}

/** Say Got it as `uid`. The rules let a person set only their own entry. */
export async function markGotIt(db: Firestore, announcementId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "announcements", announcementId), { [`gotIt.${uid}`]: serverTimestamp() });
}
