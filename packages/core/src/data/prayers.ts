// Shared (contact) prayer status writes — shared Firestore logic behind an
// injected `db`. Mirrors the web app's src/lib/prayers.ts.
import { addDoc, collection, deleteField, doc, onSnapshot, query, updateDoc, where, writeBatch, type Firestore } from "firebase/firestore";
import type { PrayerRecord } from "../types";

/** Live subscription to every team prayer, normalizing legacy docs (mirrors
 * the web app's src/views/PrayerList.tsx mapping). */
export function subscribeAllPrayers(
  db: Firestore,
  cb: (prayers: PrayerRecord[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "prayers")),
    (snap) => {
      const list: PrayerRecord[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (data.date && data.burden) {
          list.push({ id: d.id, ...data } as PrayerRecord);
        } else if (data.prayedFor) {
          list.push({
            id: d.id,
            contactId: data.contactId,
            date: data.updatedAt || new Date().toISOString(),
            burden: data.prayedFor,
            status: data.unanswered ? "unanswered" : "pending",
            updatedAt: data.updatedAt || new Date().toISOString(),
            updatedBy: data.updatedBy,
            updatedByName: data.updatedByName,
          } as PrayerRecord);
        }
      });
      cb(list);
    },
    (e) => (onError ? onError(e) : console.error("prayers subscription error", e)),
  );
}

/** Live subscription to a single contact's prayers, newest first (Contact
 * Detail's Prayer tab). */
export function subscribeContactPrayers(
  db: Firestore,
  contactId: string,
  cb: (prayers: PrayerRecord[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "prayers"), where("contactId", "==", contactId)),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as PrayerRecord)
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      cb(list);
    },
    (e) => (onError ? onError(e) : console.error("contact prayers subscription error", e)),
  );
}

/** Create a new burden for a contact (from the log sheet's saved step and the
 *  contact's Pray sheet). Neither is the prayer page, so no `prayerPage` stamp.
 *
 *  `teamPrayer` is required and always written. An absent flag reads as the
 *  team's (`isTeamPrayer`, for the prayers that predate the toggle), so a caller
 *  that forgot to choose would silently put the burden on the team page
 *  (#1042, #1406) — the compiler makes each caller say which. */
export async function addPrayer(
  db: Firestore,
  input: { contactId: string; burden: string; teamPrayer: boolean },
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(collection(db, "prayers"), {
    contactId: input.contactId,
    date: now,
    burden: input.burden.trim(),
    status: "pending",
    teamPrayer: input.teamPrayer,
    updatedAt: now,
    updatedBy: by.uid || null,
    updatedByName: by.name || null,
  });
}

/** Bring a burden to the team's prayer list: the prayer and the person's
 *  `teamPrayer` flag are ONE batch, so a failure writes neither. Turning the
 *  log sheet's "Bring it to team prayer" on must surface the burden (§21), and
 *  half a write would leave the prayer private or the person on the list with
 *  nothing new. Clears `prayerListRemoved` in the same write, as the web's
 *  `addTeamPrayer` does, so the person really lands on "On our hearts". */
export async function addTeamPrayer(
  db: Firestore,
  input: { contactId: string; burden: string },
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "prayers")), {
    contactId: input.contactId,
    date: now,
    burden: input.burden.trim(),
    status: "pending",
    teamPrayer: true,
    updatedAt: now,
    updatedBy: by.uid || null,
    updatedByName: by.name || null,
  });
  batch.update(doc(db, "contacts", input.contactId), {
    teamPrayer: true,
    prayerListRemoved: deleteField(),
    updatedAt: now,
    updatedBy: by.uid || null,
    updatedByName: by.name || null,
  });
  await batch.commit();
}

/** Edit an existing prayer's burden text. */
export async function updatePrayerBurden(
  db: Firestore,
  prayerId: string,
  burden: string,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  await updateDoc(doc(db, "prayers", prayerId), {
    burden: burden.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid || null,
    updatedByName: by.name || null,
  });
}

/** Put a person on, or take them off, the team prayer page (§21). The flag
 *  lives on the contact now, not on a single prayer: once on, every prayer of
 *  theirs shows on "On our hearts". Bringing them to the team also puts them
 *  back on the list in the same write (clears `prayerListRemoved`, as the web's
 *  `addTeamPrayer` does); taking them off leaves that flag alone. */
export async function setTeamPrayer(
  db: Firestore,
  contactId: string,
  on: boolean,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    teamPrayer: on,
    updatedAt: now,
    updatedBy: by.uid || null,
    updatedByName: by.name || null,
  };
  if (on) patch.prayerListRemoved = deleteField();
  await updateDoc(doc(db, "contacts", contactId), patch);
}

export async function updatePrayerStatus(
  db: Firestore,
  prayerId: string,
  status: PrayerRecord["status"],
  by: { uid?: string | null; name?: string | null },
  answer?: string | null,
  answeredAt?: string | null,
): Promise<void> {
  const clean: Record<string, any> = {
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid || null,
    updatedByName: by.name || null,
  };
  if (answer !== undefined) clean.answer = answer;
  if (answeredAt !== undefined) clean.answeredAt = answeredAt;
  await updateDoc(doc(db, "prayers", prayerId), clean);
}

export const STALE_INTERACTION_DAYS = 30;

export function getDaysSinceLastInteraction(
  contact: { lastContactedDate?: string | null; lastSeen?: string | null },
  now: Date | number = Date.now(),
): number | null {
  const rawDate = contact.lastContactedDate || contact.lastSeen;
  if (!rawDate) return null;
  const ms = typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime();
  if (Number.isNaN(ms)) return null;
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const diff = nowMs - ms;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function isContactStale(
  contact: { lastContactedDate?: string | null; lastSeen?: string | null },
  thresholdDays: number = STALE_INTERACTION_DAYS,
  now: Date | number = Date.now(),
): boolean {
  const days = getDaysSinceLastInteraction(contact, now);
  if (days === null) return true;
  return days > thresholdDays;
}
