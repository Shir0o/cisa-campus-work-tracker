// "Walking together" threads — a light conversation between a trainee and the
// full-timer walking with them, attached to a contact and (optionally) to one
// logged interaction.
//
// This is the PURE subset shared across platforms: message types + tone/label
// metadata + pure filter/count helpers. The Firestore CRUD + subscriptions
// (subscribeThreads, addThreadMessage, toggleReaction, useThreads, …) stay in
// each app's data layer because they need a platform Firebase init. Phase 1 will
// re-home those here behind an injected `db`.

export type ThreadKind = "note" | "question" | "comment" | "encouragement" | "nudge";

export type ThreadTone = "accent" | "teal" | "amber" | "violet" | "warn";

export interface ThreadReaction {
  by: string;
  emoji: string;
}

export interface ThreadMessage {
  id: string;
  interactionId: string | null;
  /** Team-scoped discussion is a Full-timer surface; undefined/null = walking-together thread. */
  scope?: 'team' | null;
  from: string; // staff uid
  fromName: string;
  kind: ThreadKind;
  body: string;
  at: string; // ISO
  reactions: ThreadReaction[];
}

/** A thread message tagged with the contact it belongs to. */
export type ThreadMessageWithContact = ThreadMessage & { contactId: string };

// The small reaction set offered on every message.
export const THREAD_REACTIONS = ["🙏", "❤️", "🌱", "✅"] as const;

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
  nudge: (who, c) => `${who} nudged a follow-up about ${c}`,
};
