# Release from my queue: disassociating without losing creation history

When students sign up on a staff member's device (e.g. at Club Rush or Org Fair intake), the contact is stamped with the signed-in user's `createdBy`. Because `createdBy` ties the user to the contact, the staff member becomes an automatic stakeholder: receiving all notifications and seeing the contact on their personal "On you" card.

Previously, the only way to sever this tie was for a Full-timer to reassign `createdBy` to someone else or remove collaborators/founders. However, reassigning `createdBy` rewrites creation history, and trainees had no self-service way to step back from accidental attributions.

We decided to support **Release from my queue**:
1. **Preserve audit history**: `createdBy` and `createdTime` are never cleared or rewritten.
2. **Clear personal ties**: The user is removed from `carers`, `coCreators`, and `founders`.
3. **Explicit unfollow stamp**: The user's UID is appended to `unfollowedBy` on the contact.
4. **Attention & notifications**:
   - `isTiedTo` treats `unfollowedBy` as severing the `createdBy` tie for that user, so the contact leaves their "On you" card.
   - Stakeholder notification fan-out in `threads.ts` skips users present in `unfollowedBy` (unless explicitly `@mentioned`).
   - The contact remains in the unassigned pool and accessible on "Around the team" for Full-timers to sort.
5. **Reversible**: A user can re-engage with the contact by taking them back into "Your sheep" or by a teammate sharing/delegating to them.
