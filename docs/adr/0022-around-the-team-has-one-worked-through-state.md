# 0022: Around the team has one worked-through state, and reads the conversation in place

## Status

Accepted (narrows [0015](0015-around-the-team-own-destination.md) decision 2; decision 6 is reaffirmed, not reopened)

## Context

Two pieces of feedback, [#965](https://github.com/Shir0o/cisa-campus-work-tracker/issues/965) and [#966](https://github.com/Shir0o/cisa-campus-work-tracker/issues/966), landed on the same seam from opposite sides.

#965: the text on a card is too clipped to read, so you open the person — and the in-app back drops you at a bare `/around` with every filter reset, because `state.from` carries `location.pathname` and not the search string. You then re-pick the team, re-pick the teammate, and hunt for where you were.

#966: "I can't see the comments I posted." Reading the code, that is worse than a display gap. Pressing Post on an Around card does four things: it writes the message, closes the composer, calls `InboxState.markSeen`, and calls `onToast`. But `<AroundTheTeam />` is mounted with no props at all, so `onToast` is `undefined` and the "Posted" confirmation has never once fired on that page — the same is true of the encouragement toast. The `markSeen` call then clears the card's accent dot. And the message itself never renders: `buildAttentionItems` drops thread items on contacts you are not tied to, so a plain message on an untied contact becomes no item anywhere, in Around or in On you.

The net behaviour: you write something, the composer disappears, the card gets *dimmer*, and nothing else happens. **Around the team has been a write-only conversation surface.** It subscribes to every thread in the product and renders none of them.

Underneath both sits a third thing. `Seen` and `Completed` are defined as independent axes — passive and deliberate. On Around, the passive one had already stopped earning its place: the New/All filter cuts on `isCompleted`, the header pill counts not-completed, and `CONTEXT.md` has said in plain words that "the worklist count is the number **not completed**, so opening things never makes the number fall." Seen survived there as an accent dot and a "Mark all seen" button. Meanwhile My Day's pointer card counts *unseen* stacks — a different axis from the one the page it points at displays. 0015 decision 2 promised "the number can never disagree with the dots on the page." It disagrees with the pill.

## Decision

1. **Around the team has one state, `Reviewed`.** Seen and Completed stop being two things on that page. A card is either worked through or it is not, and the card's own button is what says so. On Around that button always reads "Reviewed", because `worklistVerbFor` only ever sees `contact` and `interaction` items there; the other three verbs and the no-button case belong to On you.

2. **Only a deliberate act sets it.** The Reviewed button, and "Mark all reviewed" — which acts on the cards the current filter is showing and nothing else, so working inside `?team=yp` can never silently clear `campus`. Opening the person does not set it. Writing in the person's Conversation from the card does not set it. The rule the code already stated for itself — "seen is set here and only here" — was violated by the composer; the answer is not to restore the old invariant but to stop recording a passive state that nothing on the page reads.

3. **The accent dot goes.** Under one state, every card in the New segment is un-reviewed, so a dot on every card marks nothing. The pill carries the count and the dimmed treatment marks the reviewed ones.

4. **The pointer card counts what the page counts.** My Day's pointer switches from unseen stacks to *to work through*, and its label changes with it. This ships in the same change, not after: the moment `seen` stops being written, a count derived from it does not degrade, it freezes.

5. **Existing `seen` stamps are abandoned, never migrated.** They go inert and the existing staleness prune clears them. Promoting a glance to "worked through" would claim on a teammate's behalf that they had dealt with a person they had only scrolled past — the same false claim the completion-verb table already refuses to make elsewhere.

6. **A card reads the person's threads in place — both of them.** The messages render on the card itself, collapsed by default, with the composer at the foot of them, so a post lands directly below where it was typed. This is what makes #966 whole: the confirmation that a message posted is the message, appearing.

   A contact has two staff threads, and the strip carries both as tabs in the order the contact page uses: **Conversation**, open to everyone tied to the contact, and **Full-timers**, staff-only (`scope: "team"`). Conversation opens first, because it is the thread the card's composer has always posted into. Around is Full-timer-only, so the second tab needs no role branch here — it is always permitted on this page. The composer writes into whichever tab is open, which is the single behavioural change: today the card can only ever write to Conversation.

7. **The partition is untouched, again.** Cards render from the thread subscription the page already holds; `buildAttentionItems` and `partitionAttentionStacks` are not modified, so no stack moves between On you and Around. A message does not re-date, re-sort, or relocate its card either: Around's day headings mean *when the team touched this person*, and a page that reshuffled as you commented down it would be unusable. 0015 decision 6 stands exactly as written.

8. **On you is not changed.** `WorklistCard` is shared, so the seen-on-post behaviour becomes a prop the page owns rather than a rule inside the component. On you keeps all four verbs, its `null` case, and both axes. 0015 decision 5 warned against one component carrying two pages' worth of behaviour; this honours it.

## Trade-off, recorded plainly

The count gets bigger and stickier. Today it falls when you read; now it falls only when you review, so a Full-timer who skims without acting will watch it climb. That is the point — it is a measure of work remaining, and the old number's habit of shrinking as you scrolled was flattering rather than useful. The risk is real, though: if the number is allowed to sit permanently high it stops being a prompt and becomes wallpaper, and the fix at that point is to narrow what reaches Around, not to make the count decay on its own again.

A future reader will find `Seen` still defined, still populated for On you, and inert data under `seen` in old `inboxState` documents. That is deliberate. Seen was not a mistake; it stopped being load-bearing on one page and was removed only there.

## Consequences

- The page's pill and My Day's pointer are the same number by construction and cannot drift apart.
- Reading what a teammate wrote, and writing back, no longer costs the reader their filters — the common case stops leaving the page at all.
- Posting from a card has visible evidence: the message itself. The revived toast is a secondary confirmation, not the only one.
- `UserEntityState.setRead` stops being called for attention ids on Around. Nothing in production reads it back for those ids — every real consumer uses `isDone` — so no surface loses information.
- "Mark all seen" becomes "Mark all reviewed" and is a heavier action than it was; it keeps its undo.
- The back-navigation, nav-trail, and dead-toast defects are correctness bugs with no design content and land separately and first.
