// The person screen's stream over one contact's thread messages (ADR 0033):
// which messages belong to the Conversation. Pure — the screen hands the
// result to the core stream model (`buildStream` / `buildThread`) and draws
// what it returns. Threads under an Interaction, and the Full-timers stream,
// are cut (cut-or-keep §24).
import type { ThreadMessage } from '@cisa/core';

/** The Conversation: the contact-level open stream — never an Interaction's
 *  Thread, never a legacy staff-only message. Replies ride along for the model
 *  to gather under their parents. */
export function conversationMessages(messages: ThreadMessage[]): ThreadMessage[] {
  return messages.filter((m) => !m.interactionId && m.scope !== 'team');
}
