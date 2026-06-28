import type { Contact, Interaction } from "../types";
import { FT_TRAINEES } from "./walking";
import type { ThreadMessage } from "./threads";

// Derives a full-timer's inbox feed: the things their trainees did that the
// full-timer wants to be aware of —
//   • contacts a trainee added
//   • interactions a trainee logged
//   • trainee questions still awaiting a reply from the full-timer
// Newest-first. This is the data layer for Session 2's My Day inbox; it is a
// pure function over already-loaded data so it stays trivially testable.
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
  by: string; // trainee uid
  interactionId?: string | null;
  reviewed?: boolean;
  title?: string;
  body?: string;
}

export type ThreadMessageWithContact = ThreadMessage & { contactId: string };

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
  const trainees = FT_TRAINEES[uid] ?? [];
  if (!trainees.length) return [];

  const items: InboxItem[] = [];

  // Contacts a trainee added (we treat the contact creator as "added by").
  for (const c of data.contacts) {
    if (c.createdBy && trainees.includes(c.createdBy)) {
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

  // Interactions a trainee logged.
  for (const i of data.interactions) {
    const by = i.userId ?? i.createdById;
    if (by && trainees.includes(by) && i.contactId) {
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

  // Trainee questions with no later reply from this full-timer (same level).
  for (const m of data.threads) {
    if (m.kind === "question" && trainees.includes(m.from)) {
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
        });
      }
    }
  }

  return items.sort((a, b) => ms(b.at) - ms(a.at));
}
