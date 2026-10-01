// The reminder schedule (#1289): the two reminders for asks and questions,
// run on the campus clock. The rule that decides what is due lives once in the
// shared core package; this is the thin writer around it — it reads the open
// asks and unanswered questions, asks the rule, writes each bell entry, and
// marks the ask or question reminded so it is never reminded twice. The
// Firestore trigger on `notifications` sends the push (ADR 0031).
import {
  remindersDue,
  type DueReminder,
  type ReminderCandidate,
  type ReminderNotification,
} from "../../packages/core/src/reminders";
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
