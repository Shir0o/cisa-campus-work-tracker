# 0037: BNPB interaction suggestions on a personal sync token

## Status
Accepted

## Context
BNPB (`~/bnpb`) is a personal, offline-first relationship app that already
turns Simple Time Tracker exports into reviewable Candidate Interactions. Staff
who keep their contact log there re-enter the campus part of it in CISA Tracker
by hand (#1405). ADR 0023 bridged attd into the tracker with a staged intake
behind a team `Sync Token`, but that intake is a Full-timer's team-wide review;
these are one person's own Interactions, and they include family and friends
who have nothing to do with campus.

## Decision
1. **BNPB pushes; the tracker never pulls.** BNPB POSTs its Interactions to a
   tracker intake on app open. Every push carries every BNPB Interaction
   changed since the last push that succeeded, keyed by BNPB `syncId`, so the
   first push *is* the backfill of all history and there is no separate
   backfill path. Re-sending is idempotent, and the tracker ignores anything
   already settled.
2. **Everything is sent; the person filters.** BNPB does not decide what is
   ministry. Each Interaction becomes one Interaction suggestion per named
   person, held in that person's own Suggestion queue.
3. **Suggestions are owner-only.** Only the owner reads or settles them — no
   Full-timer or admin read, unlike `personalPrayers` — because they name
   people from the owner's private life.
4. **A personal sync token, not the team one.** The owner generates a token in
   tracker Settings and pastes it into BNPB once; the server maps it to their
   uid. The token can only add suggestions to its owner's queue — it cannot
   read anything — so the usual risk of a long-lived secret on a phone is
   small, and revoking it in Settings ends it.
5. **Confirmed is the tracker's; dismissed is final.** Edits or deletions in
   BNPB update or withdraw a suggestion only while it is pending. Confirming is
   strictly one at a time and writes an Interaction as the owner; only
   `summary`, `occurredAt`, `durationMinutes` and a mapped `medium` cross —
   BNPB `notes` never leave the phone.
6. **Only the app owner.** BNPB is the owner's own app, so the whole feature
   is gated on the existing app-owner identity — no new allowlist. Token
   generation, every push, the Firestore rules and the UI each check it, so
   no other account can connect, push, read, or even see the feature.

## Considered options
- **Team Sync Token (as attd).** Rejected: it cannot say whose suggestion a
  push is, and a team token plus a uid in the payload lets any holder file
  suggestions as anyone.
- **Google ID token from BNPB's existing Google sign-in.** A real contender,
  and the likely next step if pasting a secret becomes the friction. BNPB is
  already signed into Google for Drive, so it could send that ID token and the
  server could verify it and map its email to the tracker account: nothing to
  paste, nothing durable to leak, hourly expiry, and no Firebase SDK in BNPB.
  Not chosen now because identity would rest on the BNPB Google account having
  the same email as the tracker login (BNPB's account was picked for Drive, and
  the tracker also allows email/password accounts), and the server would have
  to trust each BNPB platform's OAuth client ID as an audience — a new BNPB
  platform or a rotated client would break pushes silently. It cannot be
  revoked from the tracker side either. Switching later only changes how the
  intake resolves the uid; the queue, suggestions and rules stay as they are.
- **Send only Interactions with contacts marked "CISA" in BNPB.** Rejected in
  favour of sending everything and remembering "Not a CISA person" per BNPB
  contact in the tracker, so the filter lives where the review happens.

## Consequences
- Personal, non-campus Interactions land in Firestore, readable only by their
  owner. The privacy boundary is the owner-only rule, not the phone.
- The first push can be hundreds of suggestions; matched ones are listed above
  "Who is this?" ones, and "Not a CISA person" clears a whole person at once.
- The bridge is one-way. Nothing confirmed in the tracker flows back to BNPB.
