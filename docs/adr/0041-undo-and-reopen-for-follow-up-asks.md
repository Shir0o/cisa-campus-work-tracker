# 0041: Undo and reopen for Follow-up asks

## Status
Accepted. Extends [ADR 0033](./0033-one-written-stream-grammar.md) and [ADR 0034](./0034-contact-page-is-a-story-beside-a-conversation.md).

## Context

A **Follow-up ask** is raised in a contact's Conversation stream. Anyone tied to the contact may mark it done with "I followed up", and the asker may retract it with "Never mind" (#813, ADR 0033).

When a Follow-up ask is closed from the worklist cards (**On you**, **Around the team**) or from a contact row menu, an undo snackbar is shown immediately, calling `reopenFollowUpAsk(contactId, messageId)`. However, when closed directly inside the contact's Conversation pane or any Stream instance (`Stream.tsx`), closing was immediate and irreversible in the UI:
1. No undo snackbar was offered upon pressing "I followed up" or "Never mind".
2. A closed or withdrawn ask row displayed only a static status line (`{name} followed up · {when}` or `{name} withdrew this · {when}`) with no reopen control.

If someone accidentally clicked "I followed up" on the contact page, or realized later that the errand had not actually been handled, they could not reopen the ask.

## Decision

1. **Transient Undo Snackbar on Close**:
   Closing an ask in `Stream` via either "I followed up" or "Never mind" exposes an undo callback to the host surface (or triggers a toast/snackbar: `Followed up · Undo` or `Withdrawn · Undo`). Clicking Undo invokes `reopenFollowUpAsk(contactId, messageId)`.

2. **Persistent In-Place Reopen Action**:
   On a closed or withdrawn ask (`ask.status === 'followedUp' || ask.status === 'withdrawn'`), any teammate with write access to the Conversation stream sees a subtle **Reopen** button beside the status text.
   Clicking **Reopen** invokes `reopenFollowUpAsk(contactId, messageId)` (already supported by Firestore security rules, which permit clearing `closedBy`, `closedByName`, and `closedAt` back to `null`).

## Consequences

- Accidental clicks in the stream pane can be immediately undone via the snackbar.
- Asks closed prematurely or erroneously can be reopened later by anyone tied to the person without requiring database edits or re-typing the ask from scratch.
- `StreamAdapter` gains optional `reopenAsk?(message: M): unknown` method implemented by `conversationAdapter` and `interactionAdapter`.
