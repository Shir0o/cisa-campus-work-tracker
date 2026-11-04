# Answered prayers become photo-first

* **Author:** Tony Wang
* **Date:** 2026-11-03
* **Mode:** EGM brainstorm (six lenses, reviewed in one context — see the
  reviewer note below)

## Reviewer note

Two passes, both reduced for the same reason: the synthesizer could not spawn
nested subagents in this harness, so the six lenses were walked in sequence in a
single context instead of six fresh ones. A blind spot shared by the reviewer
stays missing. Every claim kept below was checked against source; two from the
first pass were corrected before being kept, and five from the second pass were
folded in (write order, storage gating, edit-path photo deletion, reserved hero
ratio, stage ordering).

---

## Overview

The answered-prayer wall (`/answered`) is where the team re-reads what God has
done. Today each card leads with a 1:1 portrait block, or an initial when there
is no portrait, and treats any attached photo as a 64×64 thumbnail below the
text. The photo is the evidence of the answer and the reason a reader feels
encouraged, and it is the smallest thing on the card.

This change makes the photo the card's face: the first attached photo renders
full width at its own aspect ratio, uncropped, with arrows to step through the
rest and a tap to open it full size. The avatar block, the thumbnail strip and
the "no url" placeholder frame are removed. The person's name becomes the
accessible route into their contact page, replacing the small avatar button that
is currently the card's only keyboard reachable control. A prayer with no photo
gets a photo-less card, which is designed deliberately because it is the common
case — not a fallback.

Separately, the "On our hearts / Answered" segmented control is removed from
`/prayer` and `/answered`, now that Answered is a route of its own.

**Who this is for:** the team reading a year of answered prayers, and anyone
looking back at what happened after a specific prayer.

---

## Analysis

### 1. Two facts in the original framing were wrong

- **The phone never attaches photos to an answer.** `PrayerListMobile.tsx` calls
  `onUpdateStatus(prayer, 'answered', howDraft, date)` at lines 778 and 796 with
  no `photos` argument. `answeredPhotos` is written in exactly one place,
  `PrayerList.tsx:1265` (`saveAnswer`, through `uploadPrayerAnswerPhotos`). So a
  prayer answered from a phone carries no photos, ever.
- **`PrayerListMobile.tsx:197–210` *is* the toggle**, not a separate "Answered"
  button. It renders both options with the `ans-toggle` classes. Removing the
  CSS without removing this markup leaves two unstyled flex buttons on the
  phone prayer page.

The consequence of the first fact is the largest one in this brief: the
photo-first wall pays off on desktop today, and on a phone it renders as a wall
of photo-less cards. The first pass treated that as acceptable. It is not — the
mobile answer sheet is where most answers get marked — so the phone attach
affordance is now in scope (Stage 5), and until it lands, every phone-created
answer is photo-less.

### 2. The hero reverses a documented decision, and needs its reason stated

`src/index.css:3589` explains why the phone card shrank the portrait to a 56px
chip: a full-width square portrait took 326px of empty tile on a phone and put
every testimony below the fold. A 3:4 phone photo at 326px column width is about
435px before the name, the answer and the date arc. For a photo the trade is
defensible — a photo is content in a way an initial is not — but unbounded, the
phone answered wall becomes a photo feed with a caption you have to scroll to
reach.

**Resolved:** the hero box reserves its height in CSS rather than growing from
zero. A default `aspect-ratio` (4/3) is bounded by `max-height` on desktop and by
a fixed pixel cap on phones — `svh`, not `dvh`, because `dvh` changes as the iOS
URL bar collapses and would resize every card while scrolling. `object-fit:
contain` on a mat keeps the whole image visible. The shift is therefore
"reserved ratio → actual ratio", not "zero → actual height", which is the
difference between a nudge and repaginating the wall.

Setting `aspect-ratio` from `onLoad` does not substitute for this: `onLoad` fires
after the browser has already laid the image out at zero height, so it lands at
the moment of the shift. The reserved default is the only version that helps.

A related fact that bounds the whole interaction: `MAX_ANSWER_PHOTOS` is four
(`src/lib/prayerPhotos.ts`). Stepping is therefore 1–4 frames — arrows disable at
both ends rather than wrapping, and no dot indicator is needed.

### 3. The accepted layout shift is worse than "the card grows"

`.ans-wall` is CSS multi-column (`columns: 3`, `index.css:865`) with
`break-inside: avoid` on `.ans-card`. In a multi-column layout, one image
loading does not nudge its own card down; the balancer re-splits the whole
sequence across all three columns. Every image arrival repaginates the wall
sideways as well as down, and with `loading="lazy"` that happens during scroll.

Storing `width`/`height` on `VisitPhoto` was declined. The mitigation that
actually works is the reserved default ratio in CSS described in section 2.
Reading `naturalWidth`/`naturalHeight` in `onLoad` to set `aspect-ratio` inline
does nothing for the shift (the image has already been laid out at zero height by
then); it only stops a *second* reflow, and is optional.

### 4. Four hit regions in one card, with no visible boundary

Today the card has one control (the avatar button) plus a mouse-only `onClick`
on the `<article>`. The change adds a name link and two arrow buttons and removes
the avatar button. That is up to four intents: hero opens the photo, arrows step,
name opens the person, body opens the person. A `<button>` cannot contain the
arrow buttons, so the hero must be siblings with the arrows rather than a wrapper.
The clean resolution is to delete the article-level `onClick` and its
`is-clickable` hover lift, leaving one rule: controls do things, text does
nothing. That also removes the mouse-only affordance rather than layering a link
beside it.

One missed `stopPropagation` otherwise sends a reader to a person page when they
meant a photo — the most likely bug in this change.

### 5. Removing the avatar block removes the wall's identity and its only colour

On desktop the 1:1 block is the card's visual anchor and the only place the
deterministic `tone-*` palette surfaces (`getToneForId`, `index.css:882`).
**Resolved: no identity mark.** A photo-less card is the name, the answer text and
the date arc, and nothing else.

Two consequences, both accepted rather than hidden:

- The photo-less wall reads as a set of text cards with no faces and no colour.
  Scanability drops even though the information is unchanged. The photo cards
  carry the visual interest; the archive does not.
- `getToneForId`, the `TONES` array and the `.tone-*` rules are used only by this
  card (`src/views/AnsweredList.tsx`), so they become dead with the change. Both
  CSS blocks (`index.css:882–885` and the `.page-answered` overrides at
  `3484–3485`) go in Stage 1 rather than lingering.

### 6. A link that does not look like a link

`.ans-who` is 13px, semibold, `var(--text-dim)`, no underline. Wired as a link,
it is reachable by keyboard and screen reader and invisible to everyone else. It
needs a link affordance (underline on hover and focus, or a chevron). It must
also render as a link only when a contact exists — `name` falls back to
`t('answered.whole_team')` otherwise.

### 7. Arrow counts must come from the URL-filtered list

The current code branches per photo on `ph.url`. If arrows are counted from
`answeredPhotos.length` while entries are filtered on `url`, an arrow steps to
an empty frame — exactly the failure the removed placeholder used to hide.
Filter once per card and use that list for the hero, the arrows and the count.
Related: `VisitPhoto.url` is typed as required (`src/types.ts:210`) while three
call sites treat it as optional; one of the two is wrong and will keep
regenerating this bug.

### 8. There is no photo viewer

`PopupFrame` is the app's dialog primitive and carries the focus trap,
topmost-only Escape, phone bottom sheet and opener focus restore. It is a form
frame: title, subtitle, labelled sections, pinned footer, 960px cap. A photo
needs the mechanics, not the chrome. Reuse `PopupFrame` with a photo variant, or
copy its discipline deliberately. A third dialog implementation is the outcome
to avoid.

### 9. The CSS is duplicated and both copies are live

The `.ans-*` rules exist twice, in the Ink block around `index.css:831–885` and
the reskin block around `3492–3600`, which wins. `.ans-photo` appears in four
places. Deleting the avatar means editing both blocks; missing the later ones
leaves dead rules. The `.ans-photo image-slot` rules at `3518–3533` style a
custom element that no longer exists anywhere and go with this change.

### 10. Tests, guards and infrastructure

- `src/test/AnsweredList.test.tsx:265` asserts the first `img` is the avatar.
  It should be rewritten around the name link and the hero, not deleted.
- `npm run check:i18n` scans added lines for raw English in `aria-label`,
  `alt`, `title` and `placeholder`. Arrow labels and the viewer's close label
  need keys in `en.json` and `es.json`. A filename in `ph.name` is not
  translatable and is not a good accessible name.
- No e2e journey covers `/answered`, so the `E2E:` line is
  `none, covered by unit` unless this becomes a role journey.
- This is a presentation change **for the card itself**: no new fields, no
  migration, no flag. Stage 5 changes that — it adds an upload and a second
  document write from the phone — see section 13. For the card, the one
  infrastructure delta runs the other way: today a four-photo card fetches four
  1600px JPEGs to paint 256px of pixels; a lazy hero fetches one per card and the
  rest only when stepped.

### 11. The mobile navigation change is larger than one slot

`/answered` is a `viewer` route (`permissions.ts:65`) and a `NAV_ITEMS` entry but
is absent from `TRAINEE_ROUTES`, so a Trainee cannot open it. `MobileNav`
renders Home · Messages · Questions · People-or-Prayer, a shape fixed by
ADR 0049 with explicit 64px arithmetic. A fifth slot fits (5 × 64 = 320 of
343px) but amends that ADR and spends a permanent destination on a reading
surface for every role. The cheaper option is replacing the phone segmented
control with a single plain link to `/answered` — about ten lines, no ADR
change, phone reachability preserved.

### 12. Code shape

`AnsweredCard` is 83 lines inside the page file and is about to gain per-card
state (current index, viewer open). That is where it becomes a component:
`src/components/answered/AnsweredCard.tsx`, with the viewer shared under
`src/components/ui/`. The viewer is genuinely reusable — `PrayerList.tsx:1391`
and `VisitCard.tsx:291` render the same `VisitPhoto[]` thumbnails today with no
viewer at all.

### 13. The phone attach stage is a write path, not an affordance

Adding the attach control to the phone composer is not a copy of a UI block; it
changes the order of writes and therefore the failure modes.

- **Write the answer first, upload second, then update `answeredPhotos`.** The
  desktop path uploads first (`PrayerList.tsx:1262`) and then calls
  `onUpdateStatus` without awaiting it, so a failed upload throws inside
  `saveAnswer`, leaves the composer open and the Save button permanently
  disabled. That is a hang, not a failure path, and it is the wrong order for a
  phone on cellular: the testimony should never be gated on four uploads.
- **`handleUpdateStatus` must return a result.** Today it is typed `=> void` and
  swallows every error into `console.error`, so neither surface can tell a saved
  answer from a lost one.
- **The mobile composer has no pending state.** Save must disable while in
  flight, or two taps queue two uploads with different `Date.now()` paths and the
  card ends up with duplicates.
- **Editing an answer from the phone can delete desktop-attached photos.**
  `PrayerList.tsx:1198` seeds `answerPhotos` from `prayer.answeredPhotos`; the
  mobile edit path (`PrayerListMobile.tsx:743`) resets only `howDraft`.
  `handleUpdateStatus` writes `answeredPhotos` whenever the argument is not
  `undefined`, so passing only the new files replaces the array.
- **Upload-before-write leaves orphan blobs.** `storage.rules` gates
  `prayers/{prayerId}/{photoId}` on `request.auth != null` alone — no role check
  is possible there — while `firestore.rules:1068` gates the document on
  `isApprovedUser() && isOperator()`. The roles line up on the happy path, so the
  open question is not "are the rules right" but "which write goes first", and
  the answer above settles it.
- **The control is a component, not a line.** The desktop block
  (`PrayerList.tsx:1466–1527`) is input plus dropzone plus existing-photo previews
  with remove buttons plus new-file previews plus blob-URL cleanup plus the
  `MAX - existing - new` arithmetic at `1251`. Copying it is roughly seventy lines
  and a second copy of the cap logic. Reusing only `uploadPrayerAnswerPhotos`
  lets a reader queue five files and silently lose the fifth at save.

### Kept unchanged

The answer text path (`<Translate>`), grouping, sorting, `parsePrayerDate`, the
`tone-*` palette as a system, and the card's typography. The testimony is what
the photo is being used to honour.

---

## Goals vs. Non-Goals

### In scope

1. Answered card becomes: photo hero (first URL-bearing photo, whole image
   visible, no crop) → name (link when a contact exists) → answer text →
   asked/answered arc. Photo-less cards lose the 1:1 avatar block and carry no
   identity mark.
2. Manual stepping through the remaining photos, plus opening the current photo
   full size in a dialog.
3. Removal of the avatar block, the 64×64 thumbnail strip and the "no url"
   placeholder frame.
4. The name becomes the accessible route into the person; the card stops being
   a mouse-only click target, and the article-level `onClick` and hover lift go
   with it.
5. The photo-less card designed with the `impeccable` skill before code.
6. The `.ans-toggle` control removed from `AnsweredList.tsx`, `PrayerList.tsx`
   and `PrayerListMobile.tsx`, plus its CSS in both blocks.
7. A mobile entry point for `/answered`: a `MobileNav` slot gated on
   `canAccessRoute`, with ADR 0049 amended.
8. New i18n keys in `en.json` and `es.json`; `AnsweredList.test.tsx` rewritten;
   the reserved-ratio decision noted in the PR body.
9. The phone answer sheet gains the attach affordance the desktop sheet has
   (`PrayerList.tsx:1466–1527`), so the photo-first wall is not a desktop-only
   surface. This is a scope addition made after the first review and is staged
   last, because it is the only stage that changes a write path.

### Out of scope

- Adding `width`/`height` to `VisitPhoto`, any change to the upload pipeline's
  output shape, and any backfill.
- Backfilling photos onto answers that were saved from a phone before this
  change. Those cards stay photo-less; there is nothing to recover.
- Raising `MAX_ANSWER_PHOTOS` above four.
- Replacing CSS columns with JS masonry or a column balancer.
- Swipe gestures, pinch-zoom, a carousel with its own physics.
- Captions, photo reordering, photo deletion, editing an answer from this card.
- Wiring the shared viewer into `PrayerList` and `VisitCard` (a follow-up; the
  component is built so it can be).
- Any change to answer text, `Translate`, grouping, sorting or date parsing.
- Reworking the mobile bar beyond the one entry-point decision.
- Trainee access to `/answered` (a deliberate deny, not a bug here).

---

## Alternatives Weighed

| Alternative | Why rejected or kept |
| --- | --- |
| Keep the 1:1 avatar block and add a hero above it | Two representations of the same person on one card, and the block is the tallest element on a desktop card. |
| Keep a small non-interactive avatar or tone chip beside the name | Preserves identity and per-person colour on a photo-less card, and is not the avatar block returning. Rejected by the user in favour of no identity mark. |
| No identity mark at all | **Chosen.** Photo-less cards are name, answer text and dates. Cost: the archive wall loses its faces and colour, and `getToneForId`/`.tone-*` become dead code to remove. |
| Fixed-ratio hero with `object-fit: cover` | Crops, and an uncropped whole image is the point of the hero. |
| Bounded hero with `object-fit: contain` | **Kept as the preferred mitigation.** Whole image visible, hero height bounded, reflow reduced. Letterboxing reads as a mat on the card surface. |
| Store `width`/`height` at upload | Declined by the user. The runtime fallback is needed for old records either way, so the runtime path must exist regardless. |
| Read intrinsics in `onLoad` and set `aspect-ratio` inline | Does not prevent the shift: `onLoad` fires after layout at zero height. Only useful as a refinement on top of a reserved default ratio in CSS. |
| Photo as a full-bleed card background with text over it | Unreadable over arbitrary photographs, and demotes the testimony to a caption. |
| Open the photo in a new tab | Leaves the app, no stepping, and the back button returns to a browser render, not the wall. |
| Photo as a route | A photo is transient media, not a destination; it would add a trail crumb with no name, and returning loses wall scroll position. |
| A bespoke full-screen overlay | Third dialog implementation in a codebase that already has a focus-trapped, Escape-ordered, phone-sheeting dialog. |
| Swipeable gallery with arrows as secondary | Arrows are the agreed interaction; swipe inside a clickable card is a gesture conflict. |
| Keep the article `onClick` for mouse users | Two hit models in one card, and the body tap means something different from the hero tap with no visible boundary. |
| Keep the no-url placeholder frame | A record with no URL is a failed upload, not content. It should not occupy the hero or the count. |
| Add `/answered` to `MobileNav` | **Chosen by the user.** Gives the wall a permanent phone destination. Cost is larger than it looks: it amends ADR 0049, and a fifth slot is 320px of 343px, leaving 23px of slack across five items with a 44px target and "On our hearts" as the longest label. Must be gated on `canAccessRoute`, or a Trainee taps it into a redirect home. |
| Replace the toggle with a single in-page link to `/answered` | The cheaper default: ~10 lines, no ADR change, phone reach preserved. Rejected in favour of the bar slot. |
| Do nothing on mobile | Not an option: the toggle is the only phone route in today. |
| Reuse `PopupFrame` exactly as-is | Letterboxes the photo under a header and a Cancel button in a 640–960px card. Reuse the mechanics, not the chrome. |

---

## Key Decisions & Staging for Next Steps

### Decided

- Hero is the first URL-bearing photo, whole image, no crop, inside a bounded
  box on phones.
- Hero is the first URL-bearing photo, whole image, no crop, inside a box that
  reserves a default `aspect-ratio` and caps height (`svh` on phones, not `dvh`).
- Arrows disable at both ends rather than wrapping; no dots; `MAX_ANSWER_PHOTOS`
  is four.
- The index is clamped at render, and a photo whose URL fails to load is dropped
  from that card's filtered list rather than shown broken.
- No 1:1 avatar button, no placeholder frame, and no identity mark of any kind:
  the photo-less card is name, answer text and dates. `getToneForId`, `TONES` and
  the `.tone-*` rules are removed with it, since this card is their only consumer.
- Hero tap opens the photo full size in a `PopupFrame`-based viewer.
- Name becomes the link to the person; the article-level `onClick` and hover lift
  are removed.
- Dimensions are not added to the record; the reserved ratio absorbs the shift.
- ~~`/answered` gets its own `MobileNav` slot, with the ADR 0049 amendment.~~
  **Superseded during drafting:** ADR 0049 records that a fifth destination must
  displace one of the four. The finalized design uses a single in-page link on
  the phone prayer page and leaves the bar and the ADR untouched. See
  `docs/specs/answered-photo-first.md`.
- The photo-less card is still the common case for the archive and is designed
  first, with `impeccable`.
- Phone attach order: answer write first, upload second, `answeredPhotos` third.
  A failed upload leaves a saved photo-less answer and says so. `handleUpdateStatus`
  returns a result; Save has a pending state and cannot be double-fired. The
  mobile edit path seeds from `prayer.answeredPhotos` so editing does not delete
  desktop-attached photos.

### Still open

1. **Desktop hero numbers.** The clamp values, and the mat colour token.
2. **The hero's accessible name.** A filename is neither translatable nor
   meaningful; decide between the answer text, a generic "photo N of M", or the
   filename as a fallback.
3. **Shared attach component or a copy.** Extracting `AnswerPhotoField` keeps one
   copy of the cap arithmetic; duplicating it is faster and guarantees drift.

### Staging

| Stage | Content | Verified by |
| --- | --- | --- |
| 0 | Decisions above; photo-less card design via `impeccable` | design artefact reviewed, no code |
| 1 | Extract `AnsweredCard`; remove the 1:1 avatar block, `getToneForId`, `TONES` and the `.tone-*` rules; reserve the hero ratio in CSS; name link; article `onClick` and hover lift removed. **Keeps the photo thumbnail strip** until Stage 2 renders photos. | rewritten `AnsweredList.test.tsx`; `npm run typecheck && npm run lint` |
| 2 | Hero with reserved bounds, arrows that disable at the ends, URL-filtered and failure-dropped list; removes the thumbnail strip and the no-URL frame | unit tests: one photo (no arrows), several (stepping, ends disabled), zero (photo-less card), dead URL |
| 3 | Viewer plus hero tap; Escape, focus return, labelled close | unit test on open/close/Escape; one screenshot of the wall, one of the open viewer |
| 4 | Toggle removed on all three surfaces plus CSS; `/answered` `MobileNav` slot gated on `canAccessRoute`; ADR 0049 amendment | `check:i18n`; phone-width screenshot; the four `permissions.test.tsx` bar cases and two `ResponsiveLayout` cases updated |
| 5 | **Phone attach**, after the card can display it: shared `AnswerPhotoField` or a copy, answer-first write order, pending Save, edit preserves existing photos, cap applied at selection | unit tests: save with photos; upload fails and the answer still saves; edit with existing photos keeps them; double tap yields one upload; fifth file refused at selection |

Stage 1 is worth shipping alone: it closes the keyboard and screen-reader hole
and removes the mouse-only trap. Stages 2–3 are the visual feature. Stage 4 is
the only part that touches an ADR. Stage 5 is last because it creates photos the
wall must already be able to show, and because it is the only stage that changes
a write path.
