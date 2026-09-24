# 0030: A person's kind is set by hand, not derived from their stage

## Status
Accepted

## Context

The Directory mixes three kinds of people the team reasons about differently, and nothing on the page tells them apart ([#1109](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1109), spec in [#1152](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1152)). The reporter asked for saints to be distinguishable from new contacts, for the sake of visitation.

Two false starts are worth recording, because both look right.

**"Saint" is not the distinguishing word.** The design carried it for most of its life, until the team's own usage collapsed it: every believer is a saint, including a student met on campus last week. Belief therefore distinguishes nobody. The axis that actually separates these people is **the church life** — meeting regularly with the church — crossed with whether they are a student of ours. A field valued `saint` / `our own` / `contact` would have asserted something false about **Our own**, who are saints too.

**Stage looks like it already holds the answer.** The board has a *Church Mtg* step, and keying "our own" to it would have cost nothing. Three things rule it out. `contact.stage` stores the stage's **label**, not its id, and the label is free text an admin can rename — a rename orphans every contact sitting in it. A stage is a position people are *moved through*, so the category would flicker as a side effect of routine board housekeeping. And "our own" is a claim about relationship, not attendance: a student who misses meetings for a month is still ours.

## Decision

1. **Two boolean fields on the contact**, `inChurchLife` and `isStudent`, both set by hand by a Full-timer. The three buckets — **Local saint**, **Our own**, **Contact** — are derived from the pair and never stored, so they cannot drift from what they are computed from.

2. **The fourth cell folds into Contact.** A local who is not in the church life is a **Contact**, like a student we just met; `isStudent` still records which, it just does not change the bucket.

3. **The *Church Mtg* step is used once, as a migration seed, never as a live derivation.** Everyone at that step becomes `inChurchLife: true`. The seed deliberately does *not* set `isStudent` — a Local saint sitting at *Church Mtg* would be wrongly marked a student — so `isStudent` comes solely from migrating the existing free-text `role`.

4. **`role` is replaced, not extended.** It was labelled "Status" in the form, written into interaction text as `Group:`, typed free-text, and collided with the staff role (`admin`/`manager`/`operator`). It stops being written; its values migrate; its key stays in the Firestore rules allowlist so legacy documents remain editable.

5. **Full-timers only**, as its own branch in `canUpdateContact` with the admin check hoisted into a `let`. The contacts ruleset has already exceeded the engine's 1000-expression ceiling once in production (#1052 follow-up), and composing role helpers is what did it.

## Consequences

Everyone defaults to `inChurchLife: false`, which asserts something false about every Local saint the seed does not catch, until a Full-timer marks them. Leaving the fields absent and rendering an unsorted group was considered and rejected. To keep the backfill finishable without reopening that, the kind carries a **stamp** — who set it and when — written only when a person decides, never by the default or the seed. Unreviewed is "no stamp", which is what **Not sorted yet** counts, so the work can be stopped and resumed and reaching zero means genuinely done.

A Trainee cannot record that a student of theirs has come into the church life, even for a contact they hold, and must ask a Full-timer.
