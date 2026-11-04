# Answered prayers become photo-first

* **Author:** Tony Wang
* **Status:** Draft
* **Date:** 2026-11-03

--------------------------------------------------------------------------------

## Overview

`/answered` is where the team re-reads what happened after a prayer. Each card
today leads with a 1:1 portrait block, or an initial when there is no portrait,
and renders any attached photo as a 64×64 thumbnail beneath the text. The photo
is the evidence that the thing happened, and it is the smallest element on the
card.

This design makes the photo the card's face. The first attached photo renders
full width inside a box that reserves its own ratio, uncropped, with arrows to
step through up to four photos and a tap that opens the current one at full size.
The portrait block, the thumbnail strip, the "no url" placeholder frame and any
identity mark are removed; the person's name becomes the link to their contact.

Two smaller changes travel with it, because they touch the same surface. The
On-our-hearts / Answered segmented control is removed from `/prayer` and
`/answered` now that Answered is a route of its own. On the phone, the answered
count already printed in the page header becomes the link to `/answered`; the
shell drawer already lists the route, so this saves a tap rather than restoring
access. The phone answer sheet gains the photo
attach control the desktop sheet already has, so the photo-first wall is not a
desktop-only surface; that stage is last because it is the only one that changes
a write path.

Three terms this document uses in a specific sense. A **viewer route** is a path
in `ROUTE_MIN_ROLE` (`permissions.ts`) whose minimum role is `viewer`: every role
at or above that level may open it, except a Trainee, who is gated by the
`TRAINEE_ROUTES` allowlist rather than by the role ladder. The three roles this
document names are **Trainee** (`manager`), **Student** (`operator`) and
**Full-timer** (`admin`). The **asked/answered arc** is the two dates on a card,
the date the prayer was asked and the date it was answered, separated by a dot.

## The Problem

**The evidence is demoted.** A prayer answered with a photo shows that photo at
64px while a portrait that carries no information occupies a full-width square.
A reader scrolling for encouragement sees identicons and text; the photograph,
which is the thing they would stop for, is a badge.

**The phone cannot produce photos at all.** `PrayerListMobile.tsx` calls
`onUpdateStatus(prayer, 'answered', howDraft, date)` at lines 778 and 796 with no
`photos` argument. `answeredPhotos` is written in one place only,
`PrayerList.tsx:1265`, through `uploadPrayerAnswerPhotos`. Every answer marked
from a phone is photo-less, permanently, and the wall cannot show what was never
uploaded.

**The card is only partly reachable.** The 1:1 portrait is a real
`<button aria-label={name}>` and the card body is a mouse-only `onClick` on the
`<article>`. Keyboard and screen-reader users have exactly one way into a person
on this page, and it is the element this change removes. Mouse users have a hit
target with no visible boundary.

**The toggle duplicates a destination the shell already offers.** On desktop,
`/answered` has a `TopNav` and `NavRail` slot, so the segmented control
duplicates navigation. On a phone the control is the shortest route in, but not
the only one: the drawer renders every entry in `navItemsForRole(role)`
(`TopNav.tsx:443,480`), and `/answered` is in `NAV_ITEMS` with a `viewer` minimum
(`permissions.ts:156`) for every role that can open it. Removing the control
costs one tap, paid only by a reader already standing on `/prayer`; it does not
cost access. A bar slot is not the replacement either: ADR 0049 records that the
bar is full at four of five controls and that a fifth destination must displace
one of the four that won their place.

## Goals

1. A card with at least one photo leads with the first photo, shown whole and
   uncropped, and the card height is reserved before the image loads so the wall
   does not repaginate on every arrival. The hero's accessible name is a
   translated "photo {n} of {m}", never a filename.
2. A card with more than one photo steps through them with arrows that stop at
   the first and last photo, without looping and without autoplay.
3. A tap on the hero opens the current photo at full size, closes with Escape or
   a labelled control, and returns focus to what opened it.
4. A card with no photo renders as name, answer text and dates, with no portrait
   block, no placeholder frame and no identity mark.
5. The person's name opens their contact page for pointer, keyboard and screen
   reader; the card body no longer navigates anywhere.
6. A photo attached while marking an answer on a phone is saved and appears on
   the wall, and editing that answer from the phone does not delete photos
   attached elsewhere.
7. `/answered` is one tap from `/prayer` on a phone: the answered count in the
   page header is the link, exposing the route to every role that can open it and
   to no one else.
8. No segmented On-our-hearts / Answered control remains on `/prayer` or
   `/answered`.
9. No card renders a control that opens a missing target: a photo whose URL
   fails to load is dropped from that card rather than shown broken, and a
   stepped index always points at a photo that exists. A bounded arrow at the
   first or last photo is a state indicator, not a dead control.
10. Success is the observable outcomes in Goals 1–9, not a tracked number. The
    product records no event for this page, so no metric is defined here and this
    change adds none; if a number is wanted later, it has to be defined first.

## Non-Goals

* Adding `width`/`height` to `VisitPhoto`, changing the upload pipeline's output
  shape, or backfilling existing records.
* Recovering photos for answers that were saved from a phone before this change.
  There is nothing to recover; those cards stay photo-less.
* Raising `MAX_ANSWER_PHOTOS` above four.
* Replacing CSS columns with JavaScript masonry or a column balancer.
* Swipe gestures, pinch-zoom, or a carousel with its own physics.
* Captions, photo reordering, or editing an answer from the answered card.
* Deleting photos that are already stored. The attach field's remove buttons act
  only on files picked in the current session; a photo seeded from
  `answeredPhotos` renders as a preview with no remove control.
* Wiring the new photo viewer into `PrayerList` and `VisitCard`, which render the
  same `VisitPhoto[]` thumbnails today. The viewer is built so that a follow-up
  can do it.
* Any change to answer text, `Translate`, grouping, sorting or date parsing.
* Trainee access to `/answered`, which is a deliberate deny rather than a bug.

## Critical User Journeys (CUJs)

### CUJ 1: Reading an answer with photos on desktop

* **Given**: An answered prayer with two photos, opened at `/answered` in a
  three-column wall.
* **When**: The reader scrolls the wall and the card enters view.
* **Then**: The hero shows the first photo whole and uncropped inside a box whose
  height was reserved before the image loaded, so the wall does not repaginate
  and no other card changes column. A next arrow appears; pressing it shows the
  second photo. The next arrow at the last photo stays present and focusable and
  is marked unavailable with `aria-disabled`, as a state indicator rather than a
  control with a destination. Pressing the hero opens that photo at full size;
  Escape closes it and focus returns to the hero.

### CUJ 2: Reading an answer with no photo

* **Given**: An answered prayer with no `answeredPhotos`, and a contact record
  that exists.
* **When**: The reader views the card.
* **Then**: The card renders the person's name, the answer text and the
  asked/answered arc, with no portrait block, no initial, no placeholder frame
  and no reserved empty box. The name is a link with a visible focus and hover
  treatment and opens the contact page. Clicking the card body does nothing.

### CUJ 3: Marking an answer with photos from a phone

* **Given**: A Full-timer or Student on a phone, in the answer composer for a
  prayer that has no photos.
* **When**: They attach two photos and save.
* **Then**: The answer and date are written first, the two photos upload second,
  and `answeredPhotos` is written third. Save is disabled while the work is in
  flight and cannot be fired twice, from the button or from the ⌘/Ctrl+Enter
  handler. The wall shows the first photo as the hero.

### CUJ 4: Upload fails while marking an answer on a phone

* **Given**: The same composer, with a photo selected and the network dropping
  between the answer write and the upload.
* **When**: They save.
* **Then**: The answer is saved and visible on the wall as a photo-less card, and
  the composer says the photo did not upload. The answer is never discarded
  because the upload failed.

### CUJ 5: Uploads succeed but the document write is rejected

* **Given**: An answer carrying two photos. Since the phone composer was opened,
  a second device has attached a third.
* **When**: The author attaches three more photos on the phone and saves. The
  composer's seeded count is two, so it believes there is room for three.
* **Then**: The answer write succeeds and all three uploads succeed, and the
  `answeredPhotos` write is rejected by `firestore.rules` because the merged list
  would hold five against the three now stored. The answer is saved and visible
  with the photos it already had; the new photos are not attached and the card
  does not claim them. The composer says the answer saved and the photos were not
  attached. The uploaded objects are orphans at their paths and are recorded as
  such rather than retried.

### CUJ 6: Editing an answer from the phone

* **Given**: An answer carrying two photos attached from desktop.
* **When**: The author opens the answer composer on a phone and adds a third
  photo.
* **Then**: All three photos survive the save. The existing two are seeded into
  the composer on open and cannot be removed by omission.

### CUJ 7: Reaching the answered wall on a phone

* **Given**: A Student or Full-timer on `/prayer` at 375px.
* **When**: They look for the answered wall.
* **Then**: No segmented On-our-hearts / Answered control is present. The year's
  answered count in the header is a link that opens `/answered`, with a 44px
  target and an accessible name that says what it opens. There is no second
  element and no repeated number.
* **Given**: A Trainee.
* **Then**: No link renders, and the situation does not arise on this page at
  all: `/prayer` is not in `TRAINEE_ROUTES`, so a Trainee never reaches the
  prayer page and their first tap is the drawer, which lists only their
  allowlist. A direct link to `/answered` is redirected as it is today.

### CUJ 8: A photo whose file is gone

* **Given**: An answered prayer whose first photo URL returns 404 and whose second
  loads.
* **When**: The card renders.
* **Then**: The broken photo is dropped from that card's list, the second photo
  becomes the hero, and no arrow leads to a blank frame. If every photo fails,
  the card renders as CUJ 2.

## Technical Plan (Architecture)

### Shape of the change

The card stops being a render function inside the page file and becomes a component with its own state. The viewer becomes a shared dialog built on `PopupFrame`. The page keeps the data fetching, the contact map and the grouping it already has.

```text
prayers + contacts (two Firestore subscriptions, unchanged)
   │  onSnapshot each; answered filter applied to prayers
   ▼
AnsweredList
   │  grouping memo: one row per prayer, with asked and answered parsed once
   ▼
AnsweredCard  (per prayer; props carry the parsed dates)
   ├── photos = (answeredPhotos ?? []).filter(p => p.url && !failed(p))
   ├── index  = clamped to photos.length - 1 on every render
   ├── Hero   ── tap ──▶ PhotoViewer(photos, initialIndex = index)
   │                        └─ onIndexChange ──▶ card's index
   └── Arrows ── step index ──▶ Hero
```

The card and the viewer do not share state: the card passes the index it is showing when the viewer opens, the viewer owns the frame while it is open, and `onIndexChange` moves the card's index so the hero is on the last photo the reader saw when the dialog closes.

### Component boundaries

**`src/components/answered/AnsweredCard.tsx` (new).** Owns the per-card photo list, the stepped index, the failed-URL set and the viewer's open state.

Props are `{ prayer, asked, answered, contact, locale, t, onOpenContact }`. `asked` and `answered` are `Date | null` produced by the page's grouping memo, which already walks every prayer to sort and bucket it. The card never calls `parsePrayerDate` — the parse exists once, in the memo that also drives the group, the sort and the "this year" count, so a card cannot disagree with the section it sits in.

The card renders: the hero region (photo and arrows, or nothing), the name, the answer text through `Translate`, and the asked/answered arc in its current form.

**Contact resolution.** The page builds `contactMap` from the contacts subscription and passes `contactMap.get(prayer.contactId)`. When that returns `undefined`, the name renders as `t('answered.whole_team')` — "Whole Team" — as plain text, not a link, and the card has no contact target. There is no second lookup, no fetch per card, and no fallback to a placeholder contact.

**`src/components/ui/PhotoViewer.tsx` (new).** Takes `photos`, `initialIndex`, `onIndexChange` and `onClose`. It is uncontrolled from the card's point of view: it owns the current frame while open, steps with previous/next inside the dialog, and calls `onIndexChange` on every step and on close, so the hero follows. It shows one photo at a time in `object-fit: contain` and renders its own labelled Close control, because the frame's header — and with it the header's round Close — is gone in `bare` mode.

**`PopupFrame` (modify).** The component currently requires `title`, renders its own `<h2 id={titleId}>` and sets `aria-labelledby={titleId}` on the dialog element. `chrome="bare"` must keep that labelling, so the prop type becomes a union:

```ts
type PopupFrameProps =
  | { chrome?: 'full'; title: string; /* …existing props */ }
  | { chrome: 'bare'; label: string; /* …existing props, title omitted */ };
```

In `bare` mode the frame renders no header, no footer and no title element; `label` is the id of a visually hidden `<h2>` that the child renders, and the dialog's `aria-labelledby` points at it. `PhotoViewer` supplies that heading itself, as `sr-only`, with the photo's position as its text. Focus trap, topmost-only Escape ordering, the phone sheet and opener focus restore are unchanged; no existing call site changes because `full` remains the default and keeps `title` required.

**The attach field is copied, not extracted.** `PrayerListMobile.tsx` gets its own copy of the desktop attach block (`PrayerList.tsx:1466–1527`): hidden file input, dropzone, previews for stored and pending photos, blob-URL cleanup on change and unmount, and `remaining = MAX_ANSWER_PHOTOS - existing - pending` applied at selection. No `AnswerPhotoField` component is created and no shared module is introduced. The cost is stated once here: the cap arithmetic and the blob-URL cleanup now exist in two files, and a later fix to either has to be made twice. The cap line in particular is the one that drifts, because it is the one that decides whether a save is rejected by `firestore.rules`. If the two copies diverge, extraction happens then, as a separate change.

**Remove controls.** The copied field renders a remove control only for a file picked in this session. Photos seeded from `prayer.answeredPhotos` render as previews with no remove control, so an edit from the phone cannot delete a photo by omission or by a stray tap, and the Non-Goals' "no photo deletion" holds without a guard in the write path. The desktop sheet's existing remove button on stored photos is left as it is; that behaviour is outside this change and is the second cost of copying rather than sharing.

### Data and write flow

No schema change. `PrayerRecord.answeredPhotos` stays `VisitPhoto[]` (`{ path, url, name }`), and `MAX_ANSWER_PHOTOS` stays four.

**Reading.** The page keeps its two existing subscriptions — prayers and contacts — and its client-side filter for `status === 'answered'`. Nothing new is fetched: the hero loads one image lazily where the card used to paint up to four thumbnails, and the rest load only when stepped. The per-card list is `(prayer.answeredPhotos ?? []).filter(p => p.url)`, minus any URL that has fired `onError`. The index is clamped at render against that list's length, because a snapshot can shrink a card's photos while a reader is standing on frame three.

**Writing an answer on the phone** (Stage 5) changes order:

```text
1. updateDoc(prayers/{id}, { status:'answered', answer, answeredAt })
2. upload at most MAX_ANSWER_PHOTOS - existing.length new files
3. updateDoc(prayers/{id}, { answeredPhotos: [...existing, ...uploaded] })
```

Step 1 is the testimony and must land even if 2 or 3 fail. Step 2 is capped against the photos already stored, not against the files picked: `firestore.rules:1054` rejects a list longer than four, the uploader caps only what it is given, and step 3 is unclamped, so two stored photos plus three new ones would upload five and then be rejected — the photos would exist as blobs and never appear. The selection cap and the upload cap are therefore both `MAX_ANSWER_PHOTOS - existing.length`.

Step 3 writes `[...existing, ...uploaded]`, seeded from the prayer when the composer opens, so an edit from the phone keeps photos attached from desktop.

**When step 3 is rejected** the outcome is stated, not inferred: the answer written in step 1 stands and shows on the wall as a photo-less card, the photos that uploaded in step 2 are not attached and are not retried, the composer says so using the upload-failed message, and the uploaded blobs stay in the bucket. That last part is recorded under Risks rather than cleaned up here.

**`handleUpdateStatus`** (`PrayerList.tsx:284–316`) changes from `void` with a swallowed `console.error` to `Promise<boolean>`: `true` when the document write committed, `false` when it did not, never a rejection.

`logActivity` moves out of it into one call made by the user action, so the answer-first flow's two document writes produce one entry rather than two. `handleUpdateStatus` takes an optional `log` flag, defaulting to `true`; the phone's second (photos) write passes `false`, and the first write — the one that always lands — carries the entry.

Callers that branch on the result are the two save paths: both `await` it and render the failure message when it returns `false`. Every other caller — the status pill, the archive handler, the pending/answered menu in `PrayerListMobile` — is fire-and-forget: it ignores the returned promise, and because the function resolves `false` instead of throwing, it needs no `.catch` and cannot produce an unhandled rejection.

`saveAnswer` (`PrayerList.tsx:1258–1268`) today uploads first and calls `onUpdateStatus` without awaiting it, so a rejected upload throws before `setSavingAnswer(false)` and leaves the composer open with a permanently disabled Save button. It moves to the same answer-first order with the pending state reset in a `finally`.

### Rendering and CSS

The `.ans-*` rules exist twice in `src/index.css`: the Ink block and the reskin block around 3481–3600, which wins. Both are edited.

**Verified inventory.**

* `.ans-photo` at 845, 872, 3512, 3569, 3579 and 3592, plus the `.ans-photo-add` rule at 3682 — all removed. The portrait block, the 1:1 ratio, the `button.ans-photo` reset and the phone 56px chip at 3592 have nothing left to apply to.
* `.ans-toggle` at 840–843 and 3499–3508, plus the `.ans-toggle-opt` min-height at 3749 and the `.prm .ans-toggle` overrides at 3848–3851 — all removed with the control.
* `.page-answered` overrides at 3484–3487 — removed, and dead already: no component applies the class to any element. The base `.page-answered` rule at 3481 stays; it is what sets the page width.
* `.tone-violet`, `.tone-amber` and `.tone-sage` at 883–885 — removed. `TONES` and `getToneForId` leave `AnsweredList.tsx` with the portrait block, and nothing else emits those class names.
* `.tone-accent` at 882 — kept. `PrayerListMobile`'s status pill builds `tone-${carry.tone}`, and `prayerCarrySummary` returns `'accent'` for a person with ongoing prayers. The pill's other tones — `pending`, `rest`, `muted` — never matched a rule, so accent is the only one that has to stay. Removing it would leave the pill unstyled for the one state it is seen in most.

**Add.** `.ans-hero` as a reserved box: `position: relative`, `overflow: hidden`, `display: grid`, `place-items: center`, a background of the mat token, `aspect-ratio: 4 / 3`, `max-height: 520px` on desktop and `max-height: 46svh` under 768px. `.ans-hero img` with `width: 100%`, `height: 100%`, `object-fit: contain`. `.ans-hero-arrow` for the two controls, including their `aria-disabled` styling and 44px targets.

These numbers are proposals, chosen so the structure does not depend on them: the ratio, the two caps and the token can each be changed in one place without touching a component. The phone cap uses `svh`, not `dvh`, because `dvh` changes as the iOS URL bar collapses and would resize every card during scroll.

**Keep.** `.ans-wall` (`columns: 3`), `break-inside: avoid`, the card surface, radius and the answer typography. The hover lift and `.is-clickable` are removed with the article-level click handler, because a card is no longer a target.

**The mat token.** Add `--mat: var(--surface-variant)` beside `--surface` in the token block that maps `--surface` (around 217, with the dark/theme copy around 334), so the mat follows the theme instead of being a literal. `npm run check:colors` runs if a literal is introduced instead.

### Accessibility of the card

Each photo card has four tab stops: the hero, the previous arrow, the next arrow and the name link. A photo-less card with a contact has one; a photo-less card without a contact has none. The count does not change with the index, because an arrow at the first or last photo stays focusable — `aria-disabled` with a clamped handler, not the `disabled` attribute — so stepping to an end never drops focus out of the control the reader is holding.

The arrows carry the position in their accessible name, not only in a live region: "Next photo, 2 of 4", "Previous photo, 2 of 4". The name is built from a key that interpolates both numbers, so a language that orders the position differently can say so in its own string. The hero's accessible name is the position as well — "Photo 2 of 4" — never the filename, which is untranslatable and meaningless to a reader.

The viewer is a focus trap that closes on Escape and restores focus to the hero. Because the viewer reports its last frame through `onIndexChange`, focus returns to a hero showing the photo the reader was on, not the one they opened.

### Navigation

`/answered` is a `viewer`-level entry in `permissions.ts` and in `NAV_ITEMS`, and is absent from `TRAINEE_ROUTES`. `canAccessRoute(role, '/answered')` already answers the gating question correctly.

The phone's segmented control duplicated a destination the shell drawer already offers: the drawer lists every destination `navItemsForRole` returns for the role, `/answered` among them, so removing the control costs a tap, not access. The destination is kept for a narrower reason: the page header already prints the year's answered count, and that number is the natural place to act on it.

The header count becomes the link rather than gaining a sibling: the existing `<b>{answeredThisYear}</b>` and its sentence are wrapped in a `Link` to `/answered`, with the 44px target met by padding on the sentence, and an accessible name of "N answered this year — open the answered list". No second element is added and no number is printed twice. The link renders only inside a `canAccessRoute(role, '/answered')` check; outside it, the count stays plain text, so a Trainee never sees a destination they would be redirected away from.

The `MobileNav` bar is not changed. ADR 0049 records that it is full at four of five controls and that a fifth destination must displace one of the four that won their place; this design links the header count rather than spending a bar slot. Keeping the bar untouched keeps the per-role bar tests out of the change and avoids an ADR amendment.

**The role prop thread.** `PrayerListMobile` has no `role` prop today, and the link's gate needs one. `role: AppRole` is added to `PrayerListMobileProps`; `PrayerList` already reads `role` from `useAuth()` and passes it down beside `isOperator` and `isManager`; and `role: 'operator'` is added to `baseProps` in `PrayerListMobile.test.tsx` so the existing renders keep compiling and the gate has a value to read.

### Removal of the segmented control

Three surfaces render `.ans-toggle`:

1. `AnsweredList.tsx` around 289–296 — "On our hearts" navigates to `/prayer`, "Answered" is current.
2. `PrayerList.tsx` around 608–613 — "On our hearts" is current, "Answered" navigates.
3. `PrayerListMobile.tsx` around 197–210 — the phone's own copy of the same two buttons.

All three go, along with the `.ans-toggle` / `.ans-toggle-opt` rules listed above. The page already has a trail and a title, so nothing replaces it on desktop. On the phone the header's answered count becomes the link.

### i18n

Seven keys are added to `src/locales/en.json` and `src/locales/es.json`, with Spanish translated rather than left as an English fallback:

| Key | English |
| --- | --- |
| `answered.photo_prev` | `Previous photo, {n} of {m}` |
| `answered.photo_next` | `Next photo, {n} of {m}` |
| `answered.photo_open` | `Open photo` |
| `answered.photo_close` | `Close photo` |
| `answered.photo_n_of_m` | `Photo {n} of {m}` |
| `answered.photo_upload_failed` | `The answer was saved, but the photo did not upload.` |
| `answered.open_list` | `Open the answered list` |

`answered.open_list` composes with the existing count string into the header link's accessible name. `answered.photo_n_of_m` is the hero's accessible name, the viewer's hidden heading and the visible position text if one is added. The two arrow keys carry their own position because an arrow always has a target frame to name. `answered.photo_upload_failed` is rendered in the phone composer only, next to the Save control, after the answer has already been written.

`npm run check:i18n` scans added lines for raw English in `alt`, `aria-label`, `title`, `placeholder` and `label`, so the hero's name cannot be `ph.name` and cannot be a literal. A filename may appear at most as a `title` fallback on the image, never as the accessible name. `answered.on_our_hearts` is removed if it becomes unused once the toggle goes; the unused `answered.photo` key is left alone.

## Risks

| Risk | What happens | Mitigation | Owner |
| --- | --- | --- | --- |
| Orphan blobs | A phone upload succeeds and the step 3 document write is rejected, so the objects exist at `prayers/{prayerId}/{photoId}` with no record pointing at them. | The answer is never lost; the composer says the photo did not attach. A follow-up can add a delete-on-write-failure call or a period sweep, and `storage.rules` already limits who can read the path. Recorded, not solved, in this change. | Author of the phone-upload stage |
| Stale merge | Two devices edit the same answer; the second save writes `[...existing, ...uploaded]` seeded when its composer opened, so the other device's newly attached photos are dropped. | Accepted: writes are last-writer-wins today for the answer text too, and this makes the photo list behave the same way as the field beside it. If it is seen in use, the fix is a transaction that re-reads `answeredPhotos` before merging. | Feature owner |
| Identity removal before photo coverage | The portrait and tone chip go in Stage 1–2 while phone upload lands last, so until Stage 5 the wall is text cards for every answer marked from a phone — which is every answer marked on a phone so far. | The stages ship in one release train; the archive reads as text cards in the interim, which is the state the design already accepts for photo-less cards. The condition that would reverse the choice is evidence in use that photo-less cards are unreadable without a face — in which case the tone chip returns before the phone stage does. | Design owner |
| Residual reflow | The reserved box is 4:3, not the photo's real ratio, so a 9:16 photo still changes the card's height when it loads and repaginates the column. | Accepted as the cost of "whole image, no crop". The mitigation that removes it entirely is storing `width`/`height` at upload (Alternative C), which the owner declined; it stays the first thing to revisit if the shift is felt in use. | Feature owner |

## Alternatives Considered

Each of these was weighed during ideation. The reason for rejection is stated in
terms of what it does to the reader, not in terms of effort, except where effort
is the actual reason.

### Alternative A: Keep the 1:1 portrait block and add the hero above it

* **Pros**: No identity is lost; the existing avatar button keeps its keyboard
  path; the change is additive and small.
* **Cons**: Two representations of the same person on one card, with the portrait
  block taller than the hero on a desktop card; the card gets longer without
  getting more informative.
* **Reason for Rejection**: The portrait is the element the change exists to
  displace. Keeping both does not make the photo lead; it makes the card taller.

### Alternative B: Fixed-ratio hero with `object-fit: cover`

* **Pros**: Every card in the wall is the same shape; the layout shift disappears
  entirely; the reserved box is exact.
* **Cons**: Crops. A portrait photo of people loses heads at 4:3; a wide photo of
  a room loses its edges at 4:5.
* **Reason for Rejection**: "The whole image, uncropped" is the one property the
  hero exists for. Trading it for layout stability optimises the metric at the
  cost of the feature.

### Alternative C: Store `width` and `height` on `VisitPhoto` at upload

* **Pros**: The exact aspect ratio is known before the image loads, so the card
  reserves its final height and nothing shifts at all. `downscale()` already
  decodes each image through `createImageBitmap`, so the numbers are available
  for a few lines and one optional field.
* **Cons**: A schema addition; every existing record lacks the field, so the
  runtime fallback is still needed; the migration story is "old records shift,
  new ones do not".
* **Reason for Rejection**: For the reader, the wall would still repaginate on
  every card that predates the field, which is most of the archive, so the shift
  they feel would not go away. The owner also declined the schema addition: the
  reserved default ratio absorbs most of the shift without a field, and the
  runtime path would exist either way. This is the option to revisit first if the
  residual shift proves annoying in use.

### Alternative D: The photo as a route (`/answered/:id/photo/:n`)

* **Pros**: Consistent with the project's rule that a thing with identity is a
  page rather than a popup; shareable and back-button correct.
* **Cons**: A photo is transient media, not a record; it would add a trail crumb
  with no record name behind it, and returning to the wall loses scroll position
  in a three-column layout.
* **Reason for Rejection**: The cost lands on the reader returning to where they
  were, for a destination that has nothing to remember.

### Alternative E: A bespoke full-screen photo overlay

* **Pros**: Exact control over the photo's chrome; no compromise with a form
  dialog's header and footer.
* **Cons**: A third dialog implementation in a codebase that already has a focus
  trap, topmost-only Escape handling, a phone bottom sheet and opener focus
  restore. Every one of those has to be re-earned or forgotten.
* **Reason for Rejection**: The mechanics are the expensive part and they already
  exist in `PopupFrame`. The plan extends it with a `chrome: 'bare'` mode instead.

### Alternative F: Open the photo in a new browser tab

* **Pros**: No dialog code at all; the browser's own viewer handles zoom and
  save.
* **Cons**: Leaves the app; no stepping between photos; the back button returns
  to a browser render rather than the wall, and on a phone it is a second app
  switch.
* **Reason for Rejection**: It breaks the card's own interaction — the reader is
  looking at photo 1 of 3 and cannot get to 2.

### Alternative G: Keep the article-level click for mouse users

* **Pros**: Mouse readers keep the whole card as a target, which is forgiving on
  a large card.
* **Cons**: Two hit models in one card: the hero tap opens a photo, the body tap
  opens a person, and nothing on screen says where the boundary is.
* **Reason for Rejection**: The most likely bug in this change is a reader sent to
  a person page when they meant a photo. Deleting the article handler removes the
  class of bug rather than guarding it with `stopPropagation` in four places.

### Alternative H: Put `/answered` in the bottom bar instead of linking the header count

* **Pros**: A destination on the bar at all times, without opening the drawer;
  the phone prayer page loses its last piece of duplicated navigation.
* **Cons**: ADR 0049 records the bar as full at four of five controls: a fifth
  destination leaves 31px of slack across the row at 375px, and the ADR's own
  conclusion is that the next destination must displace one of the four. That
  means either removing someone else's destination or rewriting the geometry
  argument in the same change, for a reading surface rather than a work surface.
* **Reason for Rejection**: For the reader, a fifth slot is paid for by whoever
  used the one it displaces, to save a single tap on a page that already reaches
  the wall through the shell drawer. This design links the header's answered
  count rather than displacing a bar destination. The drawer already lists
  `/answered` for every role that can open it, so removing the control costs one
  tap from `/prayer`, not access.

### Alternative I: Keep a small avatar or tone chip beside the name

* **Pros**: Keeps a face, or at least a per-person colour, on photo-less cards;
  scanability of the archive does not drop; `getToneForId` and the `.tone-*`
  rules survive.
* **Cons**: A portrait returns to the card in miniature, and the photo cards —
  where the hero is the point — gain a second visual element competing with it.
* **Reason for Rejection**: For the reader, the mark would still be doing the
  work the change is trying to give back to the photograph: every card would lead
  with a face or a colour, and the archive would still read as avatars rather
  than testimonies. The owner chose no identity mark. The consequences are
  accepted in writing: photo-less cards read as text, most of them until the
  phone upload lands (see Rollout), and the tone system is removed rather than
  left dead.

### Alternative J: A two-up grid, or a hero with a thumbnail strip

* **Pros**: Every photo is visible without a control. No arrows, no viewer, no
  per-card state, no index to clamp when a snapshot shrinks, and no way to point
  at a photo that is gone.
* **Cons**: Each photo gets a fraction of the card. A two-up grid halves the
  width; a hero plus strip keeps one image large and makes the rest thumbnails,
  which is the 64px badge this change removes, only wider. A strip also restores
  the four-image fetch per card that the hero was going to avoid.
* **Reason for Rejection**: The evidence never gets larger than the card slot it
  already had, which is the thing this change exists to fix. Stepping costs one
  arrow press and buys a card-width image.

--------------------------------------------------------------------------------

## Non-Functional Requirements

**Accessibility (WCAG 2.2 AA).** Every control in the card is reachable and
operable by keyboard: the hero, the two arrows, the name link. Arrows use
`aria-disabled` plus a clamped handler rather than the `disabled` attribute, so
stepping to the last frame does not drop focus out of the control the reader is
holding. The viewer is a focus trap that closes on Escape and restores focus to
the hero. Each control meets the 44px target on touch. The hero has a translated
accessible name; a filename is never the primary name. The photo sits on the mat
token, whose contrast against the card surface must be checked before the value is
fixed.

**Security and privacy.** The photos already exist and are already readable by
any signed-in user: `storage.rules` gates `prayers/{prayerId}/{photoId}` on
`request.auth != null`, with a size and content-type check and no role check. This
design adds no new read surface and widens no rule. The residual risk is the one
the phone upload creates: an upload that succeeds before a failed document write
leaves an orphan blob at a guessable path. The answer-first write order reduces
this to "an extra object", not "a lost answer", and the object is no more exposed
than the photos that already exist. The cap is applied twice — at selection and
again before upload — against the photos the composer seeded when it opened, which
prevents the ordinary over-cap save. It cannot prevent a stale seed: if another
device attaches a photo after the composer opens, the merged list can still exceed
four, `firestore.rules:1054` rejects that write, and CUJ 5 states the outcome.
Either way the answer is already saved, the photos are not attached, and the
composer says so. The blob is recorded rather than cleaned up.

**Performance.** No new Firestore reads or writes on the wall. The current card
fetches up to four stored images (1600px longest edge, `visitPhotos.ts`) to paint
four 64px thumbnails; the hero fetches
one, lazily, and the rest only when stepped. The reserved hero ratio is the
mitigation for layout stability, and it matters more than bytes: in a CSS
multi-column wall, one image arriving repaginates every column. `loading="lazy"`
and `decoding="async"` are set on the hero. The iOS height cap uses `svh` so the
card does not resize as the URL bar collapses.

**Rollout and rollback.** No feature flag, no schema change, no migration and no
data backfill. The document stays one spec; the revert claim holds because the one
forward dependency is named below rather than assumed away.

**Stage sequence.**

| Stage | Change | Depends on |
| --- | --- | --- |
| 1 | Card extraction, name link, portrait and identity removal | — |
| 2 | Hero and arrows | 1 |
| 3 | Photo viewer | 2 |
| 4 | Toggle removal and the phone link | 1 |
| 5 | Phone upload | 2 |
| 6 | Cleanup (dead rules, unused keys and imports) | 1–5 |

Stage 5 is the only stage that depends on a stage other than the one before it: an
upload with no hero to display it is invisible, so stage 5 needs stage 2. Stages
1–4 and 6 revert alone, in reverse order; reverting a stage out of order is the
only case that breaks, and stage 5 is the one to check first. Reverting stage 5
alone leaves the photos already written in `answeredPhotos`, which the wall keeps
showing. No stage changes a document's shape, so no revert needs data repair.

**Identity removal lands before photo coverage.** Stage 1 removes the portrait,
the initial and the tone class; the first answers that can carry a photo from a
phone arrive at stage 5. Between the two, the archive reads as text cards wherever
there is no photo, and every answer marked from a phone produces one. That is the
accepted cost of removing identity in the same change as the hero.

The choice reverses if coverage does not move. A month after stage 5 ships, count
`answeredPhotos` on the answers created since it, read from Firestore; no product
event is needed. If fewer than a third carry a photo — a proposed threshold, not a
measured one — a tone chip returns to photo-less cards, and the hero stays.

**Two pre-existing defects do not need this change.** The desktop `saveAnswer`
that leaves the Save control permanently disabled after a rejected upload, and
the phone edit that deletes photos attached elsewhere, both exist today and are
fixed here because the write order passes through them. If they are urgent, they
can be fixed in a small separate change against the current code, citing the
answers-first order and the seeded-photo requirement from this document; the card
and the phone attach control stay.

--------------------------------------------------------------------------------

### Additional Resources

* `docs/specs/answered-photo-first-brief.md` — the ideation record, including both review passes.
* `docs/adr/0049-mobile-bar-carries-messages-and-questions.md` — the bar decision
  that ruled out a fifth destination.
* `docs/adr/0019-a-feedback-note-becomes-a-conversation.md` — background on how
  this codebase treats a record becoming a conversation rather than a popup.

### Future Improvements

* **Revisit dimensions at upload.** If the residual shift after the reserved
  ratio is noticeable, add `width`/`height` to `VisitPhoto` at upload. Old
  records fall back to the reserved ratio; new ones reserve exactly.
* **Share the viewer.** `PrayerList.tsx:1391` and `VisitCard.tsx:291` render the
  same `VisitPhoto[]` thumbnails with no viewer. Point both at `PhotoViewer`.
* **Extract the attach field.** The owner chose to copy it for this change; if the
  cap arithmetic drifts between the two sheets, extract then.
* **Swipe on the hero.** Arrows are the agreed control. A horizontal swipe inside
  a card that no longer navigates is safe to add later, because the hit model is
  now one action per control.

## Detailed Implementation Plan

### Target Files to Create/Modify

#### 1. `src/components/answered/AnsweredCard.tsx` (Create)

* **Type / Scope**: React component.
* **Proposed Changes**: Move the card out of `AnsweredList.tsx` and give it the
  state the design needs. Props follow the Technical Plan: the prayer, the parsed
  answered date, the resolved contact or `null`, the locale, `t`, and a callback
  to open a contact. The component computes
  `photos = (prayer.answeredPhotos ?? []).filter(p => p.url)`, removes any URL
  that has fired `onError`, clamps the stepped index against the list on every
  render, and owns the viewer's open state. Renders the hero and arrows when the
  list is non-empty, the name as a link only when a contact exists, the answer
  text through `Translate`, and the asked/answered arc unchanged. No portrait
  block, no initial, no tone class, no placeholder, no article-level click.

#### 2. `src/components/ui/PhotoViewer.tsx` (Create)

* **Type / Scope**: React dialog component.
* **Proposed Changes**: Shows the current photo at full size with
  `object-fit: contain`, steps with previous/next inside the open viewer, exposes
  a labelled close control, and returns focus to the opener on close. Built on
  `PopupFrame` in `chrome="bare"` mode rather than a new focus trap. Takes the
  photo list and the frame it opens on, and reports the frame it closed on so the
  hero follows.

#### 3. `src/components/ui/PopupFrame.tsx` (Modify)

* **Type / Scope**: Shared dialog primitive.
* **Proposed Changes**: Add an optional `chrome?: 'full' | 'bare'` prop, default
  `full`. In `bare` mode the header (eyebrow, title, back action) and the footer
  (cancel, primary, destructive, error) are not rendered, and the child owns the
  full box; focus trap, topmost-only Escape, phone sheet behaviour and opener
  focus restore are unchanged. `title` remains required for the `full` mode and
  becomes unnecessary in `bare`; the prop type reflects that. No change to
  existing call sites.

#### 4. `src/views/AnsweredList.tsx` (Modify)

* **Type / Scope**: Page view.
* **Proposed Changes**: Keep the two `onSnapshot` subscriptions, the `answered`
  filter, the recent/earlier split, the grouping memo and `parsePrayerDate`, and
  the empty state. Replace the local `AnsweredCard` function with the imported
  component and pass the resolved contact. Delete `TONES`, `getToneForId` and the
  tone classes, and `ImageIcon` if the card no longer renders a placeholder;
  `Heart` stays, the empty state uses it. Delete the `.ans-toggle` JSX block at
  289–297 only: `useNavigate` and `useLocation` stay, because `openContact` at 235
  calls `navigate`. The page's own header, count and title stay.

#### 5. `src/views/PrayerList.tsx` (Modify)

* **Type / Scope**: Page view and data writer.
* **Proposed Changes**: Remove the `.ans-toggle` block at 608–613 and, with it,
  `navigate` and the `useNavigate` import, which have no other caller in this
  file. Change `handleUpdateStatus` (284–316) to return `Promise<boolean>`: `true`
  when the document write lands, `false` when Firestore rejects it, and no
  `console.error` swallow. Move `logActivity` into a helper called once per user
  action, so the second write in the answer-first flow does not log a second
  entry. Call sites that do not branch on the result call it as
  `void onUpdateStatus(...)`, so the ignored promise is deliberate. Reshape
  `saveAnswer` (1258–1268) into answer-first order — write status, answer and
  date; upload; then write the merged `answeredPhotos` — with the saving flag
  reset in a `finally` so a rejected upload cannot leave Save permanently
  disabled. The desktop sheet already clamps at selection in `addAnswerFiles`
  (1251), so the cap needs no change here. Update the `onUpdateStatus` prop type
  in both prayer views to the new return value.

#### 6. `src/views/PrayerListMobile.tsx` (Modify)

* **Type / Scope**: Page view and data writer.
* **Proposed Changes**: Remove the `.ans-toggle` block at 197–210 and replace it
  by wrapping the existing header count in a `Link` to `/answered` rather than
  adding a sibling element: the count is already printed there, so it becomes the
  target, with 44px of padding on the sentence and an accessible name of
  "N answered this year — open the answered list". Render it only inside
  `canAccessRoute(role, '/answered')`. Add `role: AppRole` to
  `PrayerListMobileProps`, pass `role` from `PrayerList.tsx`, where `useAuth()`
  already supplies it at 148, and add `role: 'operator'` to `baseProps` in
  `PrayerListMobile.test.tsx`.

  In the answer composer, seed `answerPhotos` from `prayer.answeredPhotos` when it
  opens (the desktop `openAnswerComposer` at 1239–1244 is the model), so an edit
  cannot delete photos attached elsewhere. Add the attach control by copying the
  desktop block (`PrayerList.tsx:1466–1527`): hidden file input, previews for
  existing and pending photos, and blob-URL cleanup on change and unmount. The
  remove control renders only on files picked this session; the seeded photos
  render as previews with no remove control.

  Apply the cap twice: at selection, `MAX_ANSWER_PHOTOS - existing.length -
  pending.length`, so a file beyond the remaining slots is refused when picked and
  not silently dropped later; and before upload, where at most
  `MAX_ANSWER_PHOTOS - existing.length` files are sent. The composer then writes
  in the desktop order: status, answer and date first; upload second; the merged
  `answeredPhotos` list third. If the third write is rejected, the answer stays
  saved and visible, the photos are not attached, and the composer says the photo
  could not be attached.

  The double-fire guard covers both entry points: the Save button is disabled
  while the work is in flight, and the Cmd/Ctrl+Enter handler at 776 returns early
  on the same flag. A message reports a failed upload while the answer is
  preserved.

#### 7. `src/index.css` (Modify)

* **Type / Scope**: Stylesheet, two live blocks (Ink around 831–885, reskin
  around 3492–3600, the latter wins).
* **Proposed Changes**: Remove `.ans-photo` at 845, 872, 3512 and 3569, and the
  selectors that carry it at 3579 (`button.ans-photo`), 3592 (the 56px phone chip)
  and 3682 (a forced `ans-photo-add` opacity). With them go `.ans-photo-add`,
  `.ans-initial` and the `image-slot` rules at 3518–3533 that only the portrait
  block used. Remove `.ans-toggle` at 840–843 and 3499–3508, the `ans-toggle-opt`
  entry at 3749 and the `.prm` overrides at 3848–3851. Remove `.tone-violet`,
  `.tone-amber` and `.tone-sage` at 883–885, and the four `.page-answered` tone
  overrides at 3484–3487. Leave the base `.page-answered { max-width }` rule at
  3481 alone: it is out of scope, even though no component applies the class.
  Keep `.tone-accent` at 882: it is no longer the card's palette, but
  `PrayerListMobile` builds the phone status pill as `tone-${carry.tone}` and
  `prayerCarrySummary` returns `accent` for an ongoing load. Remove `.is-clickable`
  from `.ans-card`, and from `.ans-featured`, which no component renders.

  Add `.ans-hero`: a reserved `aspect-ratio: 4 / 3`, a desktop `max-height:
  520px`, a phone `max-height: 46svh` and `overflow: hidden`; `.ans-hero img`
  with `width: 100%`, `height: 100%`, `object-fit: contain` and the mat as its
  background; `.ans-hero-arrow` for the two controls, including the 44px target
  and the `aria-disabled` treatment. Add `--mat: var(--surface-variant)` beside
  `--surface` in each theme block. The ratio, both heights and the token value are
  proposals; changing them changes no structure.

#### 8. `src/locales/en.json` and `src/locales/es.json` (Modify)

* **Type / Scope**: Translation catalogues, both locales in lockstep.
* **Proposed Changes**: Add seven keys under `answered`:

  | Key | English |
  | --- | --- |
  | `answered.photo_prev` | Previous photo |
  | `answered.photo_next` | Next photo |
  | `answered.photo_open` | Open photo |
  | `answered.photo_close` | Close photo |
  | `answered.photo_n_of_m` | Photo {n} of {m} |
  | `answered.photo_upload_failed` | The answer was saved, but the photo did not upload. |
  | `answered.open_list` | Open the answered list |

  Spanish gets a written translation of each, not an English fallback. Remove
  `answered.on_our_hearts` once the toggle goes. No key is added for a filename;
  `ph.name` stays untranslated and is used at most as a `title` fallback, never as
  the accessible name.

#### 9. `src/test/AnsweredList.test.tsx` (Modify)

* **Type / Scope**: Unit tests.
* **Proposed Changes**: Five existing assertions break and are rewritten, not
  patched around:

  * The first-`img` avatar check at 263–265 no longer holds; the first image is
    the hero or there is none. Assert on the name link and the hero instead.
  * `getAllByRole('img')).toHaveLength(1)` for the photo-less cards at 365 and 367
    becomes zero, because the contact avatar is gone; the photo cards at 351 and
    357 drop the avatar too.
  * `getByAltText('Argentina trip')` at 351 and `getByAltText('Argentina team')` at
    357 assert a filename. The alt is now `answered.photo_n_of_m`; assert the hero
    `src` and the translated name.
  * `getByTitle('Pending photo')` at 360 describes a url-less photo rendered as a
    titled placeholder. That photo is now dropped before render; assert it adds no
    frame and no title.
  * The toggle-navigation test at 370–379 ("handles navigation toggle to active
    prayers") is deleted with the button. Replace it with an assertion that no
    "On our hearts" button exists on the page.

  Keep the #1823 test at 381: clicking the name still reaches `/people/c1` with
  `/answered` as the trail. Add cases for a photo-less card with no identity mark
  and no image, a single photo having no arrows, several photos stepping and
  stopping at the ends, and a failed URL being dropped.

#### 10. `src/test/AnsweredCard.test.tsx` (Create)

* **Type / Scope**: Unit tests for the extracted component.
* **Proposed Changes**: Cover index clamping when the photo list shrinks under a
  live snapshot, the `onError` drop path, a photo with no URL never counting as a
  frame, and the viewer opening on the current frame and closing back to the hero.

#### 11. `src/test/PhotoViewer.test.tsx` (Create)

* **Type / Scope**: Unit tests.
* **Proposed Changes**: Open, close, Escape, focus return, labelled close, and
  stepping inside the viewer.

#### 12. `src/test/PrayerList.test.tsx` (Modify)

* **Type / Scope**: Unit tests.
* **Proposed Changes**: Assert the toggle is gone. Cover `saveAnswer` in
  answer-first order, and the failure path where the upload rejects: the answer is
  still written, and the Save control is enabled afterwards. The existing test at
  1017–1025 reads the last `updateDoc` patch and expects `answer` and
  `answeredPhotos` together; it changes to assert the first patch carries the
  answer and the last carries `answeredPhotos`.

#### 13. `src/test/PrayerListMobile.test.tsx` (Modify)

* **Type / Scope**: Unit tests.
* **Proposed Changes**: Add `role` to `baseProps`, then assert the toggle is gone
  and the header count is a link for `operator` and plain text for `manager` (a
  Trainee).
  Cover attaching photos and saving in answer-first order (first patch the answer,
  last patch the merged list), the upload-failure message with the answer
  preserved, an edit that keeps the seeded photos, and a fifth file refused at
  selection rather than at upload, since `MAX_ANSWER_PHOTOS` is four. The
  double-fire case fires the Save button twice, and fires Cmd+Enter then
  Ctrl+Enter, asserting one upload each; the existing ⌘/Ctrl+Enter testimony
  tests at 445–489 now exercise a guarded path.

### Verification Plan

* **Compilation/Build**: `npm run typecheck` and, before the PR, `npm run build`.
* **Unit Tests**: the targeted files above, one at a time while iterating
  (`npx vitest run src/test/AnsweredList.test.tsx`, and so on). The full suite runs
  in CI, not locally.
* **Static Analysis & Linting**: `npm run lint`, plus `npm run check:i18n` for the
  new keys. `npm run check:colors` only if the mat ends up as a literal; as
  proposed it points at `--surface-variant` and adds none.
* **Test Coverage Requirement**: the repository's configured thresholds in
  `vitest.config.ts`; they are not lowered.
* **E2E/Integration**: the upload path crosses two surfaces — the phone composer
  in `PrayerListMobile` writes `answeredPhotos`, and the wall in `AnsweredList`
  reads it — so neither unit test can prove the shape one writes is the shape the
  other renders, because each mocks Firestore with its own fixture. One case is
  added to the existing role journey rather than a new spec:
  `e2e/journeys/full-timer.spec.ts`, at 375×812, marks a seeded prayer answered
  with one photo, opens `/answered`, and asserts the card's hero `src` is that
  photo with no portrait block on the card. The case goes green only when stages 2
  and 5 have both landed, which is the dependency Rollout names. The issue's
  `E2E:` line names that journey and that assertion.
* **Visual**: one screenshot of the wall with a photo card and a photo-less card,
  and one of the open viewer. Phone width checked at 375px for the hero cap and
  the linked header count.

--------------------------------------------------------------------------------

*Drafted with EGM*
