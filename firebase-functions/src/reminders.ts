// The reminder schedule (#1289): the two reminders for asks and questions,
// run on the campus clock. The rule that decides what is due lives once in the
// shared core package; this is the thin writer around it — it reads the open
// asks and unanswered questions, asks the rule, writes each bell entry, and
// marks the ask or question reminded so it is never reminded twice. The
// Firestore trigger on `notifications` sends the push (ADR 0031).
import {
  campusWeekdayHour,
  DEFAULT_REMINDER_SCHEDULE,
  remindersDue,
  weeklyRemindersDue,
  type DueReminder,
  type ReminderCandidate,
  type ReminderNotification,
  type ReminderSchedule,
  type WeeklyReminderStaff,
} from "../../packages/core/src/reminders";
import {
  aroundTeamToWorkThrough,
  reviewedStackIds,
  type AroundTeamInput,
} from "../../packages/core/src/aroundTeam";
import type { Firestore } from "firebase-admin/firestore";

export interface ReminderDeps {
  /** Open Follow-up asks and questions, with a question's Thread replies. */
  candidates(): Promise<ReminderCandidate[]>;
  writeBell(notification: ReminderNotification): Promise<void>;
  markReminded(source: DueReminder["source"]): Promise<void>;
  now(): number;
}

export interface ReminderRunResult {
  written: number;
}

/** One tick: write exactly the bell entries the rule returns, and record each
 *  ask or question reminded. */
export async function runAskReminders(deps: ReminderDeps): Promise<ReminderRunResult> {
  const due = remindersDue(await deps.candidates(), deps.now());
  for (const { notification, source } of due) {
    await deps.writeBell(notification);
    await deps.markReminded(source);
  }
  return { written: due.length };
}

/** The live deps over Firestore. `collectionGroup("threads")` reaches every
 *  contact Conversation; the Full-timers stream lives in `teamThreads` and is
 *  deliberately out of scope. */
export function firestoreReminderDeps(db: Firestore): ReminderDeps {
  return {
    async candidates() {
      const snap = await db.collectionGroup("threads").where("kind", "in", ["nudge", "question"]).get();
      const candidates: ReminderCandidate[] = [];
      for (const doc of snap.docs) {
        const data = doc.data();
        const kind = data.kind === "nudge" ? "ask" : "question";
        let replies: ReminderCandidate["replies"];
        if (kind === "question") {
          const replySnap = await doc.ref.parent.where("parentId", "==", doc.id).limit(50).get();
          replies = replySnap.docs.map((r) => ({ from: r.data().from ?? "", at: r.data().at ?? "" }));
        }
        candidates.push({
          contactId: doc.ref.parent.parent?.id ?? "",
          messageId: doc.id,
          kind,
          from: data.from ?? "",
          body: data.body ?? "",
          at: data.at ?? "",
          closedAt: data.closedAt ?? null,
          remindedAt: data.remindedAt ?? null,
          replies,
        });
      }
      return candidates;
    },
    async writeBell(notification) {
      await db.collection("notifications").add({
        ...notification,
        read: false,
        createdAt: new Date().toISOString(),
      });
    },
    async markReminded({ contactId, messageId }) {
      await db.doc(`contacts/${contactId}/threads/${messageId}`).update({
        remindedAt: new Date().toISOString(),
      });
    },
    now: () => Date.now(),
  };
}

// ── Weekly reminders (#1301) ────────────────────────────────────────────────
// The rhythm reminders share the rule module with the ask reminders above; this
// is the thin writer that gathers each staff member's waiting counts, calls the
// rule, writes the bell entries, and records that it reminded them. The
// Firestore trigger on `notifications` sends the push (ADR 0031).

export interface WeeklyReminderDeps {
  /** Every staff member, with what is waiting on them. */
  staff(): Promise<WeeklyReminderStaff[]>;
  /** The stored schedule, or null when only the defaults exist. */
  schedule(): Promise<ReminderSchedule | null>;
  writeBell(notification: ReminderNotification): Promise<void>;
  markReminded(uid: string): Promise<void>;
  now(): number;
}

export interface WeeklyReminderRunResult {
  written: number;
}

/** One tick: write exactly the weekly bell entries the rule returns, and mark
 *  each person reminded so a retry never sends twice in a day. */
export async function runWeeklyReminders(deps: WeeklyReminderDeps): Promise<WeeklyReminderRunResult> {
  const due = weeklyRemindersDue(await deps.staff(), await deps.schedule(), deps.now());
  for (const { notification, uid } of due) {
    await deps.writeBell(notification);
    await deps.markReminded(uid);
  }
  return { written: due.length };
}

const DAY_MS = 86_400_000;
const UNREACHED_TAG_WINDOW_DAYS = 30;

function parseMs(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** One person the weekly counts read: whether they are a Contact, when they
 *  were added, and every tie that makes a teammate a recipient. */
interface WaitingPerson {
  id: string;
  isContact: boolean;
  createdAtMs: number | null;
  tiedUids: string[];
}

function isTiedTo(person: WaitingPerson | undefined, uid: string): boolean {
  return !!person && person.tiedUids.includes(uid);
}

/** How many Contact-kind people added in the last 30 days nobody has reached,
 *  among one Trainee's own ties. The web/core reach model (#1293) is the
 *  behaviour oracle; this is the same reading over
 *  the raw docs the functions package already gathers, like #1289's candidates.
 *  Reach itself is ever — the 30-day limit is on when the person was added. */
function waitingCount(
  people: readonly WaitingPerson[],
  reached: ReadonlySet<string>,
  uid: string,
  nowMs: number,
): number {
  const floor = nowMs - UNREACHED_TAG_WINDOW_DAYS * DAY_MS;
  let count = 0;
  for (const p of people) {
    if (!p.isContact || p.createdAtMs == null || p.createdAtMs < floor) continue;
    if (reached.has(p.id)) continue;
    if (!isTiedTo(p, uid)) continue;
    count += 1;
  }
  return count;
}

type AroundTeamDocs = Omit<AroundTeamInput, "uid" | "personalContactIds">;

/** The team half of a Full-timer's **to work through** count (#1336): the same
 *  docs Around the team and My Day's pointer card read — every contact, the
 *  500 newest interactions, and every message in `threads` and `teamThreads`. */
async function aroundTeamDocs(db: Firestore, nowIso: string): Promise<AroundTeamDocs> {
  const [contactsSnap, interactionsSnap, threadsSnap, teamThreadsSnap] = await Promise.all([
    db.collection("contacts").get(),
    db.collectionGroup("interactions").orderBy("createdAt", "desc").limit(500).get(),
    db.collectionGroup("threads").get(),
    db.collectionGroup("teamThreads").get(),
  ]);
  const toThread = (d: (typeof threadsSnap.docs)[number]) => {
    const data = d.data();
    return {
      id: d.id,
      contactId: d.ref.parent.parent?.id ?? "",
      from: data.from ?? "",
      kind: data.kind ?? "comment",
      at: data.at ?? nowIso,
      interactionId: data.interactionId ?? null,
      mentionedUserIds: Array.isArray(data.mentionedUserIds) ? data.mentionedUserIds : null,
    };
  };
  return {
    contacts: contactsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    interactions: interactionsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      contactId: d.ref.parent.parent?.id ?? "",
    })),
    threads: [...threadsSnap.docs.map(toThread), ...teamThreadsSnap.docs.map(toThread)],
  };
}

/** One Full-timer's to-work-through count: the shared Around the team rule
 *  over the team docs, their Reviewed stamps, and the people they keep. */
async function toWorkThroughFor(
  db: Firestore,
  uid: string,
  docs: AroundTeamDocs,
  nowMs: number,
): Promise<number> {
  const [inboxSnap, prefsSnap] = await Promise.all([
    db.doc(`inboxState/${uid}`).get(),
    db.doc(`userPreferences/${uid}`).get(),
  ]);
  const completed = inboxSnap.exists ? inboxSnap.data()?.completed : undefined;
  // My Day falls back to "the people I created" when nothing is picked; those
  // are already tied to the reader, so that fallback is the same as no set.
  const kept = prefsSnap.exists ? prefsSnap.data()?.personalContactIds : undefined;
  return aroundTeamToWorkThrough(
    { ...docs, uid, personalContactIds: Array.isArray(kept) ? new Set<string>(kept) : null },
    reviewedStackIds(completed, nowMs),
  );
}

/** The live deps over Firestore: the schedule doc, every staff member, and the
 *  waiting counts the rule reads. */
export function firestoreWeeklyDeps(db: Firestore): WeeklyReminderDeps {
  return {
    async staff() {
      const nowMs = Date.now();
      // Cheap guard: the cron runs hourly, but most hours no schedule covers.
      // Read the little schedule doc first so a quiet hour reads nothing else.
      const scheduleSnap = await db.doc("settings/reminder_schedule").get();
      const schedule = scheduleSnap.exists
        ? (scheduleSnap.data() as ReminderSchedule)
        : DEFAULT_REMINDER_SCHEDULE;
      const { weekday, hour } = campusWeekdayHour(nowMs);
      const covers = (plan: ReminderSchedule["fullTimers"]) =>
        plan.days.includes(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6) && plan.hour === hour;
      const fullTimersDue = covers(schedule.fullTimers);
      const anyDue = fullTimersDue || Object.values(schedule.teams ?? {}).some(covers);
      if (!anyDue) return [];

      const [usersSnap, contactsSnap, interactionsSnap, eventsSnap, nudgeSnap] = await Promise.all([
        db.collection("users").get(),
        db.collection("contacts").get(),
        db.collectionGroup("interactions").get(),
        db.collection("events").get(),
        db.collectionGroup("threads").where("kind", "==", "nudge").get(),
      ]);

      // Reach: anyone with a logged Interaction, or ever present at a Gathering.
      const reached = new Set<string>();
      for (const d of interactionsSnap.docs) {
        const data = d.data();
        const id = data.contactId ?? d.ref.parent.parent?.id ?? "";
        if (id) reached.add(id);
      }
      for (const d of eventsSnap.docs) {
        const present = (d.data().attendance?.present ?? []) as string[];
        for (const id of present) if (id) reached.add(id);
      }

      const people: WaitingPerson[] = contactsSnap.docs.map((d) => {
        const data = d.data();
        const tiedUids = [
          data.createdBy,
          data.addedBy,
          ...(data.coCreators ?? []),
          ...(data.founders ?? []),
          ...(data.carers ?? []),
        ].filter((t): t is string => typeof t === "string" && t.length > 0);
        return {
          id: d.id,
          isContact: data.inChurchLife !== true,
          createdAtMs: parseMs(data.createdAt),
          tiedUids,
        };
      });
      const personById = new Map(people.map((p) => [p.id, p]));

      const openAsksByContact = new Map<string, number>();
      for (const doc of nudgeSnap.docs) {
        const data = doc.data();
        if (data.closedAt) continue;
        const contactId = doc.ref.parent.parent?.id ?? "";
        openAsksByContact.set(contactId, (openAsksByContact.get(contactId) ?? 0) + 1);
      }

      // Around the team's docs are read only in an hour the Full-timers'
      // schedule covers.
      const around = fullTimersDue ? await aroundTeamDocs(db, new Date(nowMs).toISOString()) : null;

      return Promise.all(usersSnap.docs.map(async (d) => {
        const data = d.data();
        const uid = d.id;
        const staff: WeeklyReminderStaff = {
          uid,
          role: data.role ?? "viewer",
          team: data.team ?? null,
          weeklyRemindersOff: data.weeklyRemindersOff === true,
          lastWeeklyReminderAt: data.weeklyReminderAt ?? null,
        };
        if (staff.role === "admin") {
          if (around && !staff.weeklyRemindersOff) {
            staff.toWorkThrough = await toWorkThroughFor(db, uid, around, nowMs);
          }
        } else if (staff.role === "manager") {
          staff.notReachedYet = waitingCount(people, reached, uid, nowMs);
          let openAsks = 0;
          for (const [contactId, count] of openAsksByContact) {
            if (isTiedTo(personById.get(contactId), uid)) openAsks += count;
          }
          staff.openAsks = openAsks;
        }
        return staff;
      }));
    },
    async schedule() {
      const snap = await db.doc("settings/reminder_schedule").get();
      return snap.exists ? (snap.data() as ReminderSchedule) : null;
    },
    async writeBell(notification) {
      await db.collection("notifications").add({
        ...notification,
        read: false,
        createdAt: new Date().toISOString(),
      });
    },
    async markReminded(uid) {
      await db.collection("users").doc(uid).update({ weeklyReminderAt: new Date().toISOString() });
    },
    now: () => Date.now(),
  };
}
