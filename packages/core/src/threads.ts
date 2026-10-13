// "Walking together" threads — a light conversation between a trainee and the
// full-timer walking with them, attached to a contact and (optionally) to one
// logged interaction.
//
// This is the PURE subset shared across platforms: message types + tone/label
// metadata + pure filter/count helpers. The Firestore CRUD + subscriptions
// (subscribeThreads, addThreadMessage, useThreads, …) stay in
// each app's data layer because they need a platform Firebase init. Phase 1 will
// re-home those here behind an injected `db`.

export type ThreadKind = "note" | "question" | "comment" | "encouragement" | "nudge";

export type ThreadTone = "accent" | "teal" | "amber" | "violet" | "warn";

export interface ThreadMessage {
  id: string;
  interactionId: string | null;
  /** A reply in a Thread (ADR 0033): the message it answers. One level deep. */
  parentId?: string | null;
  /** Team-scoped discussion is a Full-timer surface; undefined/null = walking-together thread. */
  scope?: 'team' | null;
  from: string; // staff uid
  fromName: string;
  kind: ThreadKind;
  body: string;
  at: string; // ISO
  /** When the author last rewrote the body; a row shows "Edited" when set. */
  editedAt?: string | null;
  /** Follow-up asks only: who said they did it, and when (#813). */
  closedBy?: string | null;
  closedByName?: string | null;
  closedAt?: string | null;
  /** Teammates explicitly @mentioned when this was written (ADR 0007), already
   *  reconciled against the body — a name edited out before sending notifies
   *  nobody. */
  mentionedUserIds?: string[];
}

/** A thread message tagged with the contact it belongs to. */
export type ThreadMessageWithContact = ThreadMessage & { contactId: string };

// Each kind gets its own tone + label. Icons live in the Thread component (so
// this stays free of JSX). nudge = a follow-up reminder, rendered distinctly.
//
// `v2Label` is the same kind said in the mobile v2 voice (the design's
// `M2C_THREAD_KIND`, views/mobile/contact.jsx) — it sits alongside `label`
// rather than replacing it, so the Material callers keep the terser words.
export const THREAD_KINDS: Record<
  ThreadKind,
  { label: string; v2Label: string; tone: ThreadTone; verb: string }
> = {
  note: { label: "Note", v2Label: "Note", tone: "accent", verb: "noted" },
  comment: { label: "Comment", v2Label: "Wrote back", tone: "teal", verb: "commented" },
  question: { label: "Question", v2Label: "A question", tone: "amber", verb: "asked" },
  encouragement: { label: "Encourage", v2Label: "Encouragement", tone: "violet", verb: "encouraged" },
  nudge: { label: "Follow-up", v2Label: "Follow-up", tone: "warn", verb: "nudged" },
};

const norm = (v: string | null | undefined): string | null => v ?? null;

/** Messages at a given level — null = the contact-level thread. */
export function threadsFor(
  messages: ThreadMessage[],
  interactionId: string | null = null,
): ThreadMessage[] {
  return messages.filter((m) => norm(m.interactionId) === norm(interactionId));
}

/** Count of messages at a given level (null = contact-level). */
export function countFor(
  messages: ThreadMessage[],
  interactionId: string | null = null,
): number {
  return threadsFor(messages, interactionId).length;
}

// Plain-spoken bell title for a posted message, from the poster's view. Kept
// here (data, not JSX) so both the web and native notify paths share the copy.
export const THREAD_NOTIFY_TITLE: Record<ThreadKind, (who: string, contact: string) => string> = {
  note: (who, c) => `${who} left a note on ${c}`,
  comment: (who, c) => `${who} commented on ${c}`,
  question: (who, c) => `${who} asked about ${c}`,
  encouragement: (who, c) => `${who} encouraged you about ${c}`,
  nudge: (who, c) => `${who} asked for a follow-up on ${c}`,
};

/** The bell title for a Full-timers message, whatever its kind. */
export const TEAM_THREAD_NOTIFY_TITLE = (who: string, contact: string) =>
  `${who} posted in the Full-timers thread on ${contact}`;

/** Everyone tied to a contact: they added them, they are the adder's gospel
 *  partner, or they are a co-creator. The fourth tie — teammates keeping this
 *  person on their own My Day — is private to each of them and is resolved on
 *  their own feed, never fanned out from a write. */
export interface ThreadStakeholders {
  createdBy?: string | null;
  addedBy?: string | null;
  coCreators?: string[] | null;
  founders?: string[] | null;
  carers?: string[] | null;
  unfollowedBy?: string[] | null;
  /** Who can open the person besides those who see everyone. Never a reason to
   *  notify; it only bounds who In the Conversation may still hear (#1604). */
  visibleTo?: string[] | null;
}

/** Extracts all stakeholders from a contact record. */
export function contactStakeholdersOf(
  contact?: Pick<import("./types").Contact, "createdBy" | "addedBy" | "coCreators" | "founders" | "carers" | "unfollowedBy" | "visibleTo"> | null,
): ThreadStakeholders {
  if (!contact) return {};
  const stakeholders: ThreadStakeholders = {
    createdBy: contact.createdBy ?? null,
    addedBy: contact.addedBy ?? null,
    coCreators: contact.coCreators ?? null,
    founders: contact.founders ?? null,
    carers: contact.carers ?? null,
  };
  if (contact.unfollowedBy) {
    stakeholders.unfollowedBy = contact.unfollowedBy;
  }
  if (contact.visibleTo) {
    stakeholders.visibleTo = contact.visibleTo;
  }
  return stakeholders;
}

/** The uids on the contact document, deduped, minus the poster and any unfollowedBy teammates. */
export function stakeholderUidsOf(
  stakeholders: ThreadStakeholders | null | undefined,
  from: string,
): string[] {
  if (!stakeholders) return [];
  const unfollowed = new Set(stakeholders.unfollowedBy || []);
  const all = [
    stakeholders.createdBy,
    stakeholders.addedBy,
    ...(stakeholders.coCreators || []),
    ...(stakeholders.founders || []),
    ...(stakeholders.carers || []),
  ].filter((id): id is string => !!id && !unfollowed.has(id));
  return [...new Set(all)].filter((id) => id !== from);
}

// ── In the Conversation (#1604, CONTEXT.md, ADR 0007 amendment) ─────────────
// Having written in a stream within the last 14 days reaches you with what
// others write there after, whether or not it answers you. Worked out from the
// messages themselves: nothing is stored on the contact and it grants nothing.
// Mirrored in the other app's copy; src/test/inTheConversation.test.ts runs
// both against one corpus.

export const IN_THE_CONVERSATION_DAYS = 14;

/** The fields that place a message in its stream and in time. */
export interface ConversationMessage {
  from?: string | null;
  at: string;
  contactId?: string | null;
  interactionId?: string | null;
  scope?: "team" | null;
}

/** Each stream stands alone: a person's Conversation, their Full-timers
 *  stream, and each Interaction's thread. */
export function sameStream(a: ConversationMessage, b: ConversationMessage): boolean {
  return (
    (a.contactId ?? null) === (b.contactId ?? null) &&
    (a.interactionId || null) === (b.interactionId || null) &&
    (a.scope || null) === (b.scope || null)
  );
}

/** Teammates In the Conversation that `of` is written into, as of when it was
 *  written: anyone but its author with a message in the same stream in the 14
 *  days before it. */
export function inTheConversation(messages: readonly ConversationMessage[], of: ConversationMessage): string[] {
  const at = Date.parse(of.at);
  const since = at - IN_THE_CONVERSATION_DAYS * 24 * 60 * 60 * 1000;
  const uids = new Set<string>();
  for (const m of messages) {
    if (!m.from || m.from === of.from || !sameStream(m, of)) continue;
    const t = Date.parse(m.at);
    if (t >= since && t <= at) uids.add(m.from);
  }
  return [...uids];
}
