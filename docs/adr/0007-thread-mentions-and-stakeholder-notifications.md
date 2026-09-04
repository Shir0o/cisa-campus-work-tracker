# 0007. Thread Mentions and Stakeholder Notification Propagation

Date: 2026-09-03

## Status

Accepted

## Context

When team members write follow-up notes, comments, or discussions on contacts, teammates caring for that person need to stay coordinated without being swamped by broadcast noise. Previously, contact thread comments only notified a single user via `walkingRecipient` (notifying the trainee creator when a full-timer commented, or notifying nobody when a trainee commented). There was no mechanism to directly call out another teammate (`@mention`), nor were co-creators (gospel partners sharing the contact) kept in the loop automatically. Furthermore, pinning a contact to one's personal My Day list (`personalContactIds`) should not result in receiving push notifications for every comment made by other teammates.

Issue #790 (and #763) asked how follow-up comments and `@` mentions should propagate to notification bells, system push notifications, and the My Day view.

## Decision

We adopt a **Dual Model: Stakeholder Auto-notification + Explicit `@` Mentions**:

1. **Recipients on Contact Follow-up Comments**:
   - **Automatic Stakeholders**: The contact's creator (`contact.createdBy`) and co-creators (`contact.coCreators`, e.g. gospel partners) automatically receive an in-app notification when a new thread comment or reply is posted on the contact.
   - **Mentioned Users**: Any teammate explicitly tagged via `@DisplayName` in the comment body also receives an in-app notification.
   - **Self-Exclusion**: The author of the comment (`currentUid`) is strictly excluded from notifications (no self-notifications).
   - **Non-Stakeholders**: Users who merely have the contact pinned on My Day (`personalContactIds`) do *not* receive automatic notifications unless they are the creator, a co-creator, or explicitly `@mentioned`.

2. **Full-Timer Discussion Scope (`scope === 'team'`)**:
   - Team Discussion threads are strictly Full-timers-only.
   - The mention autocomplete picker in Discussion threads only displays Full-timers.
   - Non-full-timers never receive notifications for team-scoped comments.

3. **Data Representation**:
   - The message text preserves plain readable text in `body` (e.g. `Hey @Tony Wang, let's connect...`).
   - The thread document stores `mentionedUserIds: string[]` containing the resolved user IDs.
   - On submission, `mentionedUserIds` is reconciled against `body` so removing a mention before sending strips the notification target.

4. **Delivery Channels**:
   - **In-App Bell & Web Push**: Writes a doc to the `notifications` collection with clear copy:
     - Mention: `${who} mentioned you on ${contactName}`
     - Comment: `${who} commented on ${contactName}`
   - **My Day Attention Feed ("On you")**: Mentions and direct stakeholder comments surface under the contact's stack in the "On you" column, allowing immediate awareness and in-context reply.

## Consequences

- **Pros**: Clean signal-to-noise ratio. Gospel partners remain in sync automatically on shared contacts. Teammates can easily loop in any other member using `@`. Team discussion privacy invariants remain intact.
- **Cons**: Requires building a lightweight autocomplete input component for `@` triggers.
