# 0023: Guest links let coordination docs leave the team without leaving the app

## Status

Accepted (implements [#1023](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1023))

## Context

Outside collaborators - guest speakers, visiting pastors, student committee
leaders - need to read or contribute to a specific coordination doc (a
`BoardDoc`) without an account and without installing the mobile app. The
standing workaround is copy-pasting to Google Docs, which creates two sources of
truth: edits diverge, notes get lost, and someone reconciles by hand.

The app's coordination doc is not a file. Its durable markdown lives in
Firestore, and live editing rides a Yjs CRDT replicated over Firebase Realtime
Database (`src/lib/yjsRtdbProvider.ts`). Bi-directional Google Docs sync into
that model was considered and rejected: mapping a rich-text CRDT onto the Docs
API loses formatting, makes cursors jump, and cannot represent concurrent edits.

A coordination doc is also not public. Firestore's `board_docs` rules read by
audience tier, and the surrounding collections (contacts, threads, attention
feed, chat) are staff-only. Any external surface has to be narrower than the
app, not a second front door into it.

## Decision

1. **Google Docs sync is rejected; the TipTap / Yjs document is the single
   source of truth.** External collaboration is handled inside the product, not
   by exporting the page to another one.

2. **A guest link is an unguessable secret URL.** `board_docs/{id}.guestAccess`
   holds `{ enabled, key, permission, createdAt, createdBy }`, where `key` is
   `sec_` plus 256 bits of CSPRNG entropy (`randomGuestKey`). The URL is
   `/c/:docId?key=sec_...`. The key *is* the capability: it is never derived
   from the doc id, and revoking deletes the config rather than merely setting
   a flag.

3. **Permission is `view` or `edit` and defaults to `view`.** A full-timer
   creates the link from a Share dialog in the doc editor, can switch
   `view <-> edit` without rotating the URL, can regenerate (new key, same
   content), and can revoke. The dialog warns explicitly when the page's
   audience is `team` (full-timers only).

4. **The server validates the key on every read and write.** `GET
   /api/guest-doc/:docId?key=...` returns a fixed public subset of the doc
   (title, date, audience, markdown) and nothing else; `POST` persists only the
   markdown for `edit` links. Both compare the provided key against the stored
   one through fixed-length digests so a wrong key cannot be probed by length or
   timing. This is the app's only unauthenticated surface, so it is rate-limited
   and the payload is intentionally narrow.

5. **Live editing reuses the team's Yjs session, on a scoped credential.** For
   an `edit` link the read endpoint mints a custom token whose claims are
   `{ guest: true, guestDoc: docId }`. The guest exchanges it on a separate
   Firebase app (so it never becomes the main app's session) and connects to
   `board_docs_rtdb/{docId}`. `database.rules.json` allows a guest token to
   touch that one doc's node and nothing else.

6. **A guest token unlocks no Firestore.** `firestore.rules` treats
   `request.auth.token.guest == true` as signed out, so a guest credential
   cannot read contacts, threads, chat, users, or any other board doc. Even if
   someone extracted the token from the browser, it is only good for the one
   RTDB node named in its claim.

7. **The guest surface is a standalone route outside the app shell.** `/c/:docId`
   mounts the reader or editor with no nav rail, no contacts, and no unrelated
   tabs. View guests get read-only markdown with task checkboxes locked; edit
   guests are asked for a display name so their cursor is attributable, then
   edit prose and tasks live.

## Trade-off, recorded plainly

An `edit` guest is a real participant in the team's document, not a sandbox.
Their name is self-declared, and a revoked link stops new sessions but cannot
retroactively un-see what someone already read. Time-based expiry is deliberately
absent for now: revocation is manual, and adding expiry later is additive.

The guest token is bearer-like, exactly as the URL is. That is the feature: the
key is the credential. The bound that makes it safe is not secrecy of the
credential but the narrowness of what the credential unlocks.

## Consequences

- Full-timers hand out one URL per page and can cut it off in one click.
- The page a guest reads is the same live document the team edits, so there is
  no second copy to reconcile.
- Guests are invisible to the rest of the app: no directory, no feed, no
  conversations.
- `board_docs` gains a `guestAccess` field; only full-timers can write it, and
  revoking nulls it.
