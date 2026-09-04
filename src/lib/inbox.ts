import { isTrainee, fullTimerIds } from "./walking";
import type { ThreadKind, ThreadMessageWithContact } from "./threads";

export type { ThreadMessageWithContact };

// The trainee cockpit's "waiting on you" list. The Full-timer oversight inbox
// that used to live here (`inboxItemsFor`) was a second derivation of what
// `attention.ts` already builds, imported by nothing on web — its only consumer,
// `FromTraineesInbox.tsx`, was exported and never mounted (#813). Mobile keeps
// its own copy in packages/core until the two are unified.
//
// Threads live as per-contact subcollections, so each message must be tagged
// with its contactId by the caller.

export type InboxItemType = "contact" | "interaction" | "thread";

export interface InboxItem {
  id: string; // contact:<id> | interaction:<id> | thread:<id>
  type: InboxItemType;
  at: string; // ISO
  contactId: string;
  by: string; // the team member who did it
  interactionId?: string | null;
  title?: string;
  body?: string;
  kind?: ThreadKind; // set on thread items (question / nudge)
}

const ms = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// mirroring inboxItemsFor so the trainee cockpit stays trivially testable.
export function traineeWaitingItems(
  uid: string,
  threads: ThreadMessageWithContact[],
  allowedContactIds?: Set<string>,
): InboxItem[] {
  // A trainee's "what's waiting on you": nudges + questions from ANY full-timer
  // (no pairing — every full-timer stands over every trainee). Newest-first.
  if (!isTrainee(uid)) return [];
  const fts = fullTimerIds();

  const items: InboxItem[] = [];
  for (const m of threads) {
    if (m.scope === "team") continue; // Full-timer-only Discussion
    if (allowedContactIds && !allowedContactIds.has(m.contactId)) continue;
    if (!fts.includes(m.from ?? "")) continue;
    if (m.kind !== "nudge" && m.kind !== "question") continue;
    const answered = threads.some(
      (r) =>
        r.from === uid &&
        r.contactId === m.contactId &&
        (r.interactionId ?? null) === (m.interactionId ?? null) &&
        ms(r.at) > ms(m.at),
    );
    if (!answered) {
      items.push({
        id: "thread:" + m.id,
        type: "thread",
        at: m.at,
        contactId: m.contactId,
        by: m.from,
        interactionId: m.interactionId,
        body: m.body,
        kind: m.kind,
      });
    }
  }

  return items.sort((a, b) => ms(b.at) - ms(a.at));
}
