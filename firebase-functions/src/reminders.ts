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
import { contactKind } from "../../packages/core/src/directory";
import {
  isTiedTo,
  reachByContact,
  unreachedContacts,
  type ReachGathering,
  type ReachInteraction,
  type ReachPerson,
  type ReachReading,
} from "../../packages/core/src/reach";
import { parseMs } from "../../packages/core/src/myday";
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

/** How many Contact-kind people added in the last 30 days nobody has reached,
 *  for a Full-timer (the whole roster) or one Trainee's own ties. */
function waitingCount(
  people: readonly ReachPerson[],
  reach: ReadonlyMap<string, ReachReading>,
  uid: string,
  nowMs: number,
  scope: "team" | "yours",
): number {
  return unreachedContacts(people, reach, { scope, viewerUid: uid, nowMs }).length;
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
      const anyDue = [schedule.fullTimers, ...Object.values(schedule.teams ?? {})].some(
        (plan) => plan.days.includes(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6) && plan.hour === hour,
      );
      if (!anyDue) return [];

      const [usersSnap, contactsSnap, interactionsSnap, eventsSnap, nudgeSnap] = await Promise.all([
        db.collection("users").get(),
        db.collection("contacts").get(),
        db.collectionGroup("interactions").get(),
        db.collection("events").get(),
        db.collectionGroup("threads").where("kind", "==", "nudge").get(),
      ]);

      const interactions: ReachInteraction[] = interactionsSnap.docs.map((d) => {
        const data = d.data();
        return {
          contactId: data.contactId ?? d.ref.parent.parent?.id ?? "",
          ms: parseMs(data.dateTime) ?? parseMs(data.createdAt) ?? 0,
        };
      });
      const gatherings: ReachGathering[] = eventsSnap.docs.map((d) => {
        const data = d.data();
        return { date: data.date ?? "", attendance: data.attendance };
      });
      const reach = reachByContact({ interactions, gatherings });

      const people: ReachPerson[] = contactsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          kind: contactKind(data),
          createdAtMs: parseMs(data.createdAt),
          createdBy: data.createdBy ?? null,
          addedBy: data.addedBy ?? null,
          coCreators: data.coCreators ?? null,
          founders: data.founders ?? null,
          carers: data.carers ?? null,
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

      return usersSnap.docs.map((d) => {
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
          staff.toWorkThrough = waitingCount(people, reach, uid, nowMs, "team");
        } else if (staff.role === "manager") {
          staff.notReachedYet = waitingCount(people, reach, uid, nowMs, "yours");
          let openAsks = 0;
          for (const [contactId, count] of openAsksByContact) {
            if (isTiedTo(personById.get(contactId), uid)) openAsks += count;
          }
          staff.openAsks = openAsks;
        }
        return staff;
      });
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
