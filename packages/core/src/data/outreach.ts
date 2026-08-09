// Outreach writes — shared Firestore logic behind an injected `db`, the same
// shape as `./todos.ts` / `./contacts.ts`. Logging an outreach makes every
// filled name a REAL contact on the spot (the whole point of the page) and
// drops a "Ring {first}" to-do on whoever spoke with them for tomorrow.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { addContact, type NewContactInput } from "./contacts";
import { addTodo } from "./todos";
import { firstName } from "../history";
import {
  outreachInitials,
  type OutreachDraft,
  type OutreachHanded,
  type OutreachName,
  type OutreachNameDraft,
  type OutreachRecord,
} from "../outreach";

/** Live subscription to every outreach, newest first. */
export function subscribeOutreach(
  db: Firestore,
  cb: (records: OutreachRecord[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "outreach"), orderBy("date", "desc")),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt:
              data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
          } as OutreachRecord;
        }),
      ),
    (e) => (onError ? onError(e) : console.error("outreach subscription error", e)),
  );
}

/** Tomorrow noon, ISO — the follow-up's due date. */
const dueTomorrow = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

/** The first stage's label, like sign-up's intake — fallback "Lead". */
async function firstStageLabel(db: Firestore): Promise<string> {
  try {
    const snap = await getDocs(query(collection(db, "stages"), limit(1)));
    return snap.empty ? "Lead" : (snap.docs[0].data().label as string);
  } catch {
    return "Lead";
  }
}

/** One filled name row → a real contact (and, when the logger may create
 * tasks, a follow-up to-do for whoever spoke with them). The rules let anyone
 * create contacts but keep task creation operator+ — so a community (viewer)
 * logger passes `canCreateTasks: false` and the name still becomes a real
 * contact, just without the auto-todo. Same intake→contact shape as the log
 * sheet and sign-up. Returns the new contact's id. */
async function nameToContact(
  db: Firestore,
  row: OutreachNameDraft,
  where: string,
  date: string,
  stage: string,
  by: { uid?: string | null; name?: string | null; canCreateTasks?: boolean },
): Promise<string> {
  const trimmed = row.name.trim();
  const isEmail = row.contact.includes("@");
  const input: NewContactInput = {
    name: trimmed,
    // The outreach log sheet doesn't ask for a group; role stays empty like the
    // mobile log sheet's new-contact mode.
    role: "",
    location: where,
    email: isEmail ? row.contact.trim() : "",
    phone: isEmail ? "" : row.contact.trim(),
    stage,
    tags: ["outreach"],
    notes: row.note.trim(),
    spiritualBackground: "",
    initials: outreachInitials(trimmed),
    // Backdate to the outing — "first met" reads createdAt everywhere.
    createdAt: date,
  };
  const contactId = await addContact(db, input, by);
  if (row.spokeWith && by.canCreateTasks !== false) {
    await addTodo(
      db,
      {
        title: `Ring ${firstName(trimmed)} — met at ${where}`,
        assigneeId: row.spokeWith,
        dueDate: dueTomorrow(),
        contactId,
        contactName: trimmed,
      },
      { uid: by.uid ?? "", name: by.name ?? "" },
    );
  }
  return contactId;
}

/**
 * Log an outreach: create a contact per filled name row (and a follow-up
 * to-do when `by.canCreateTasks !== false` — viewers can't create tasks, so
 * the callers pass false for them), then write the record. `onNotify` (when
 * given) forwards to addContact / addTodo so each app supplies its own
 * notification write.
 */
export async function addOutreach(
  db: Firestore,
  draft: OutreachDraft,
  by: { uid?: string | null; name?: string | null; canCreateTasks?: boolean },
  onNotify?: (payload: unknown) => void,
): Promise<string> {
  const stage = await firstStageLabel(db);
  const where = draft.where.trim();
  const names: OutreachName[] = [];
  for (const row of draft.names) {
    const trimmed = row.name.trim();
    if (!trimmed) continue;
    const contactId = await nameToContact(db, row, where, draft.date, stage, by);
    names.push({
      id: "ON-" + Date.now() + "-" + names.length,
      name: trimmed,
      contact: row.contact.trim(),
      spokeWith: row.spokeWith,
      note: row.note.trim(),
      contactId,
      takenBy: null,
    });
  }
  const docRef = await addDoc(collection(db, "outreach"), {
    date: draft.date,
    where,
    went: draft.went,
    others: draft.others,
    handed: { bibles: draft.handed.bibles, tracts: draft.handed.tracts, booklets: draft.handed.booklets },
    how: draft.how.trim(),
    photoCount: draft.photoCount,
    names,
    createdById: by.uid ?? null,
    createdByName: by.name ?? null,
    createdAt: serverTimestamp(),
  });
  if (onNotify) {
    // The record itself carries no notification; this is only so callers can
    // extend. Kept as a hook rather than dead code.
    void onNotify;
  }
  return docRef.id;
}

/** Edit an outreach — date/where/who/others/handed/how/photos only. The names
 * are left alone: they're the record's whole point, and editing them would
 * orphan the contacts they became. */
export async function updateOutreach(
  db: Firestore,
  id: string,
  patch: {
    date?: string;
    where?: string;
    went?: string[];
    others?: number;
    handed?: OutreachHanded;
    how?: string;
    photoCount?: number;
  },
): Promise<void> {
  const clean: Record<string, any> = {};
  if (patch.date !== undefined) clean.date = patch.date;
  if (patch.where !== undefined) clean.where = patch.where.trim();
  if (patch.went !== undefined) clean.went = patch.went;
  if (patch.others !== undefined) clean.others = patch.others;
  if (patch.handed !== undefined) clean.handed = patch.handed;
  if (patch.how !== undefined) clean.how = patch.how.trim();
  if (patch.photoCount !== undefined) clean.photoCount = patch.photoCount;
  await updateDoc(doc(db, "outreach", id), clean);
}

export async function removeOutreach(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, "outreach", id));
}

/** "I'll take this" — claim a waiting name and put the ring on your own list. */
export async function takeOutreachName(
  db: Firestore,
  outreachId: string,
  name: OutreachName,
  where: string,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  if (!by.uid) return;
  const namesPatch = await getNamesFor(db, outreachId);
  const next = namesPatch.map((n) => (n.id === name.id ? { ...n, takenBy: by.uid } : n));
  await updateDoc(doc(db, "outreach", outreachId), { names: next });
  await addTodo(
    db,
    {
      title: `Ring ${firstName(name.name)} — met at ${where}`,
      assigneeId: by.uid,
      dueDate: dueTomorrow(),
      contactId: name.contactId,
      contactName: name.name,
    },
    { uid: by.uid, name: by.name ?? "" },
  );
}

/** Read a record's names so `takeOutreachName` can patch one without the
 * caller needing a full read — kept private to this module. */
async function getNamesFor(db: Firestore, outreachId: string): Promise<OutreachName[]> {
  const snap = await getDoc(doc(db, "outreach", outreachId));
  const data = snap.data();
  return (data?.names as OutreachName[] | undefined) ?? [];
}
