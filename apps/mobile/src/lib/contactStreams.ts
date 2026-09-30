// The person screen's streams over one contact's thread messages (ADR 0033):
// which messages belong to the Conversation, to Full-timers, and to an
// Interaction's Thread. Pure — the screens hand the result to the core stream
// model (`buildStream` / `buildThread`) and draw what it returns.
import { buildThread, type Interaction, type StreamThread, type StreamViewer, type ThreadMessage } from '@cisa/core';

/** The Conversation: the contact-level open stream — never an Interaction's
 *  Thread, never a staff-only message. Replies ride along for the model to
 *  gather under their parents. */
export function conversationMessages(messages: ThreadMessage[]): ThreadMessage[] {
  return messages.filter((m) => !m.interactionId && m.scope !== 'team');
}

/** Full-timers: every staff-only message. A legacy one hung off an Interaction
 *  is shown here rather than lost, since its audience is what matters. */
export function fullTimersMessages(messages: ThreadMessage[]): ThreadMessage[] {
  return messages.filter((m) => m.scope === 'team');
}

/** An Interaction's Thread: the Interaction quoted as its parent, its open
 *  messages as the replies. The parent is drawn from the Interaction, so its
 *  id is namespaced to never collide with a message's. */
export function interactionThread({
  interaction,
  messages,
  viewer,
  now,
}: {
  interaction: Interaction;
  messages: ThreadMessage[];
  viewer: StreamViewer;
  now: number | Date;
}): StreamThread<ThreadMessage> {
  const parentId = `interaction:${interaction.id}`;
  const parent: ThreadMessage = {
    id: parentId,
    interactionId: interaction.id,
    from: interaction.userId ?? interaction.createdById ?? '',
    fromName: interaction.userName ?? interaction.createdByName ?? '',
    kind: 'note',
    body: interaction.content,
    at: interaction.dateTime || interaction.createdAt,
  };
  const replies = messages
    .filter((m) => m.interactionId === interaction.id && m.scope !== 'team')
    .map((m) => ({ ...m, parentId }));
  // The parent is always present, so the model always returns a Thread.
  return buildThread({ messages: [parent, ...replies], viewer, now }, parentId)!;
}
