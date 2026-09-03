import type { Contact, Interaction } from "./types";
import { isFullTimer, isTrainee, fullTimerIds } from "./walking";
import type { ThreadKind, ThreadMessageWithContact } from "./threads";

// Derives a full-timer's inbox feed: the whole team's activity the full-timer
// wants to be aware of — everyone's work except their own —
//   • contacts anyone added
//   • interactions anyone logged
//   • questions (from anyone) still awaiting a reply from the full-timer
// Newest-first. This is the data layer for the My Day "From the team" inbox; it
// is a pure function over already-loaded data so it stays trivially testable.
//
// Threads live as per-contact subcollections, so each message must be tagged
// with its contactId by the caller (Session 2's collection-group query supplies
// it from each doc's parent).

export type InboxItemType = "contact" | "interaction" | "thread";

export interface InboxItem {
  id: string; // contact:<id> | interaction:<id> | thread:<id>
  type: InboxItemType;
  at: string; // ISO
  contactId: string;
  by: string; // the team member who did it
  interactionId?: string | null;
  reviewed?: boolean;
  title?: string;
  body?: string;
  kind?: ThreadKind; // set on thread items (question / nudge)
}

const ms = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

export function inboxItemsFor(
  uid: string,
  data: {
    contacts: Contact[];
    interactions: Interaction[];
    threads: ThreadMessageWithContact[];
  },
): InboxItem[] {
  // Only full-timers get this oversight inbox.
  if (!isFullTimer(uid)) return [];

  const items: InboxItem[] = [];

  // Contacts anyone on the team added (the creator doubles as "added by"); skip
  // the full-timer's own.
  for (const c of data.contacts) {
    if (c.createdBy && c.createdBy !== uid) {
      items.push({
        id: "contact:" + c.id,
        type: "contact",
        at: c.createdAt ?? "",
        contactId: c.id,
        by: c.createdBy,
        reviewed: !!c.reviewed,
      });
    }
  }

  // Interactions anyone on the team logged; skip the full-timer's own.
  for (const i of data.interactions) {
    const by = i.userId ?? i.createdById;
    if (by && by !== uid && i.contactId) {
      items.push({
        id: "interaction:" + i.id,
        type: "interaction",
        at: i.createdAt ?? i.dateTime,
        contactId: i.contactId,
        by,
        interactionId: i.id,
        body: i.content,
      });
    }
  }

  // Questions from anyone but the full-timer, with no later reply from the
  // full-timer (same level).
  for (const m of data.threads) {
    if (m.kind === "question" && m.from && m.from !== uid) {
      const answered = data.threads.some(
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
          kind: "question",
        });
      }
    }
  }

  return items.sort((a, b) => ms(b.at) - ms(a.at));
}

// Derives a trainee's "what's waiting on you" feed: nudges and questions from
// the full-timer walking with them that they haven't replied to yet (no later
// trainee message at the same contact/interaction level). Newest-first. Pure,
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
