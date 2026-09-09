# 0015: Around the team is its own destination; My Day is a skim dashboard

## Status
Accepted (supersedes [0011](0011-attention-feed-shape.md))

## Context

Issue [#823](https://github.com/Shir0o/cisa-campus-work-tracker/issues/823) reported that on My Day the "On you" side of the Attention Feed is usually empty while "Around the team" is usually long, so a one-line card sat beside a tall column and left a blank rectangle. [0011](0011-attention-feed-shape.md) answered that by making the feed's shape a pure function of how much there is to show: on a busy day the feed splits into two columns, and My Day *lends* its personal column (On the horizon + Your prayers) upward to fill the space beneath the empty "On you".

That fix treated the problem as a width problem. It was not one. Reading **Around the team** and doing your own work are two different activities, and the split forces them to share a screen: when you are catching up on the team you do not need On the horizon or Your prayers in your peripheral vision, and when you are working through your own list you do not need a wall of other people's activity beside it. Worse, the borrow only relocated the ragged edge — the lent column is uncapped while the team column is capped at five rows, so on a typical day the blank rectangle is now under the *team*, not under "On you".

There is a second, quieter cost. Around the team has never had room: five rows, single-file, with its team/teammate filters (#727) squeezed into a chip row above it. It is the richest thing the app knows — every person the team touched, who touched them, and what happened — and it has been living in the narrowest space on the page.

## Decision

1. **My Day becomes a skim dashboard of your own work.** "On you" stops being a full-bleed feed section and becomes a bento card among the others, keeping its five-row cap, its "show more", and its "Nothing's waiting on you." line. It remains a labelled region.

2. **A pointer card sits beside it, Full-timer only.** A small card counts the team activity the reader has not *seen* — a pure function of the partitioned team stacks and the existing per-stack seen set, so no new persisted state is introduced and the number can never disagree with the dots on the page. The card is a door to `/around` and nothing else: team rows are never read on My Day, so there is exactly one place with one behaviour.

3. **Around the team becomes its own destination at `/around`**, Full-timer floor in the permissions destination list, guarded by the same role-guard wrapper every other gated route uses. It keeps the team and teammate filters, the new-only filter, per-stack seen and completed state, and the reach affordance, and finally gets the width to show them properly, paged by day. Filters are URL state — read on load, written on change, never persisted per user. The page reaches exactly as far as the existing feed subscription (the same live query, the same document limit) and says so plainly.

4. **The shape rule is deleted.** `attentionLayout`, `ATTENTION_LAYOUT_THRESHOLD`, the three layout modes, the personal-column slot prop, My Day's "is the column lent" derivation, the Your sheep / Your week re-pairing, and the multi-up card grid all go, together with their tests.

5. **The component is dissolved, not parameterised.** The Attention Feed component is split into the On you bento card and the Around the team page, both built on the existing worklist card and the existing attention library. No shared component keeps a notion of "two sections" alive — not via a mode prop, not via team-only data passed to the old component.

6. **The partition is untouched.** What lands in "On you" versus "Around the team", the new-people-first grouping, the Full-timer-only visibility of team-scope threads, and the reach rules are all unchanged. This change moves surfaces; it does not redefine categories.

7. **Mobile follows exactly.** Mobile My Day gets the same On you card and pointer card and loses its inline team section. The bottom nav bar is unchanged — it is a fixed four slots around a raised search button, and the pointer card is the only door to the page on mobile. This retires the mobile ordering established in #841 (On you → Around the team → On the horizon), which existed to sequence two things that are no longer on the same page.

8. **A Trainee's My Day shows their own work and nothing else.** No pointer card, no team destination. That is intended, and it is the one deliberate reduction in this change.

## Trade-off, recorded plainly

A shape rule computed from data was a reasonable answer to the wrong question. 0011 asked *how wide should these two things be*; the answer that holds is that they should not share a page at all. The fixed side-by-side pairing that 0011 deliberately gave up is **not being restored** — it is being dissolved, because the two things are no longer on the same page. A future contributor who finds a deleted shape rule with deleted tests should understand it was answered by a page split, not abandoned.

## Consequences

- My Day's layout is the same every day, and no section reflows when another expands.
- Around the team finally has the width to show what it knows, paged by day with real headings.
- The unseen count is testable as a pure function without rendering a page.
- The route's role floor is expressed in the destination list, so the gate is tested where every other gate is tested.
- A Trainee loses sight of team activity. If that proves to be a real loss, the fix is a separate decision about what Trainees should see, not a re-opening of this layout.
- An archive is still separate work (#645-shaped): the page reaches exactly as far as the existing subscription.
