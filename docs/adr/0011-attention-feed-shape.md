# 0011: The Attention Feed's shape is a pure function of two counts

## Status
Accepted

## Context
Issue [#823](https://github.com/Shir0o/cisa-campus-work-tracker/issues/823) reported that on My Day the "On you" side of the Attention Feed is usually empty while "Around the team" is usually long. The feed rendered a fixed side-by-side pair of equal-width columns, so a one-line "On you" card sat beside a tall team column and left a large blank rectangle beneath it. The blank space read as something broken, and it pushed the reader's actual work — Next up, the figures, On the horizon, Your prayers — further down the page.

To be clear about what was *not* the problem: "On you" being empty is a true statement about the data. The partition that decides what lands there (`partitionAttentionStacks`) is correct and is unchanged by this decision. An empty "On you" is good news, and no fix may manufacture content to fill a box.

Alternatives were considered and rejected:

- **Dissolving the empty "On you" card** — loses the landmark and the daily reassurance that the partition ran and found nothing.
- **Capping "Around the team" to match "On you"'s height** — hides real information to fix an appearance; internal scrolling is worse than the gap it would fix.
- **Merging My Day into one page-wide grid** — dissolves the feed into the page, forces Next up and the figures to find a new home, and permanently couples every future edit of either to the other.
- **Deriving the shape from measured column heights** — resize observers, reflow feedback, and a value that can differ between server and client render for a purely cosmetic decision.
- **A callback from the feed to its host** — creates a render-order dependency between two components to communicate a value both can derive independently, and makes the rule reachable only through a rendered tree.
- **Borrowing only "On the horizon" into the split column** — leaves "Your prayers" alone against two cards on the right: the same ragged column this decision deletes, relocated one section down.

## Decision

1. **The shape rule lives in the attention library as a pure function.** `attentionLayout(onYou, aroundTeam)` takes the two partitioned stack arrays (or their lengths) and nothing else, and returns `"strip" | "stacked" | "split"`. No DOM, no refs, no measurement. The threshold is one named constant, `ATTENTION_LAYOUT_THRESHOLD = 5` — a starting value, not a finding, tunable in one line after real use.

2. **The rule, evaluated in order:**
   - `aroundTeam` empty → `"stacked"`: "On you" full width, alone (the pre-existing single-column behaviour).
   - total ≥ threshold → `"split"`: "On you" beside "Around the team".
   - total < threshold, `onYou` empty → `"strip"`: "On you" as a single full-width line, "Around the team" full width beneath.
   - total < threshold, `onYou` non-empty → `"stacked"`: both sections full width.

   The count is checked **before** the empty-"On you" case on purpose: the day this decision exists for — nothing waiting on you, plenty around the team — must split (with the borrowed column beneath), never strip the reader's own work away to one thin line above a wall of team activity.

3. **The shape counts all stacks, not the visible ones.** The collapsed limit (`COLLAPSED_LIMIT`) caps what renders; the shape describes how much there is. Otherwise "show them" would reflow the page under the cursor mid-read.

4. **Both consumers call the same function.** The Attention Feed calls `attentionLayout` to pick its own shape; My Day calls it over the same partition to decide whether to omit the bento column it has lent upward. My Day passes its raw interactions and threads to the feed, so both derive the mode from identical data and can neither render the personal column twice nor drop it.

5. **Split mode borrows My Day's personal column.** The feed accepts an optional `personalSlot` node rendered beneath "On you", and only in split mode. My Day passes its left bento column — **On the horizon** and **Your prayers** together — and omits that column from its bento when the mode is split; **Your sheep** and **Your week** then pair up side by side. The feed renders a slot and never knows what the node is.

6. **The borrow is desktop-only.** Mobile My Day is single-column, has no gap, and already renders "On the horizon" directly beneath the feed (#841). Letting the slot apply there would reorder a surface nobody complained about. Mobile keeps On you → Around the team → On the horizon.

7. **Full-width sections lay their cards out multi-up.** In `strip` and `stacked` (and when the team is empty), a section spanning the page shows its stack cards in a responsive multi-column grid, so the extra width buys density instead of whitespace. Split columns stay single-file.

8. **The empty state says so plainly.** "All clear here." — written to sit inside a tall card — is replaced by **"Nothing's waiting on you."**, still a translated string. The "On you" region remains a labelled region in every shape, including when it is empty.

The fixed side-by-side pairing of "On you" and "Around the team" was deliberate when introduced and is **given up here on purpose**. A future contributor seeing a two-column feed should not innocently restore a fixed grid: the grid must be chosen by `attentionLayout` from the data, never hardcoded.

## Consequences
- On a typical day the space beneath an empty "On you" is the reader's own to-dos and prayers; My Day shows work where the blank rectangle used to be.
- The partition rule, the filters, "show more" affordances, and the mobile ordering are all untouched.
- Every branch of the shape rule is unit-testable without a DOM; the component tests assert accessible regions and structure, not class names or grid spans.
- The mode is derived twice (feed and My Day). They agree because both call the same function over the same arrays; the My Day test that asserts the personal column renders exactly once is the guard against future drift.
- Tuning the threshold after a week of real use is a one-line change to `ATTENTION_LAYOUT_THRESHOLD`.
