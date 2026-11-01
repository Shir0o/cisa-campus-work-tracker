# 0049: A Trainee's bottom bar carries Messages and Questions, and the answers owed to them

## Status
Accepted

## Context
At 375×812 the phone bar held **two destinations and a search button**: `Home`,
a centred raised `Search` FAB, and `People` for a Trainee, a Student or a
Full-timer; `On our hearts` instead of `People` for a Community member. Every
other destination — Messages, Questions, The Journey, Your notes, the Sign-up
form — sat behind the top bar's hamburger at two taps.

That is the wrong two for a Trainee. Messages and Questions are the only two
places with work in them that is *addressed to them*: a room they were added to,
a reply on a question they asked. A Trainee could not see either was waiting
without opening the drawer, and the waiting-asks badge the rail and the top bar
carry had no phone equivalent at all (#1779, #1806).

Two shapes were drawn for #1806:

- **A** — Messages and Questions become destinations; the bar reads four for a
  trainee and three for everyone else.
- **B** — the bar is untouched and the hamburger and drawer's Questions row carry
  the count.

B was rejected on its own acceptance line: the bar is the surface a Trainee
already has open, so a count that only appears inside the drawer tells someone
who already opened the drawer.

The slot that made A look expensive was not a destination at all. The FAB was a
**duplicate**: `TopNav.tsx` renders a `lg:hidden` search button in the phone
header, wired to the same `setSearchOpen`. The bar was spending 56 of its 343
usable pixels on a second door to the same overlay.

Separately, "what is waiting on the reader" is **not one number**. The rail's and
top bar's badge is `useWaitingAsksCount`, gated on `isAdmin`: other people's
unanswered questions, which is a full-timer's queue. A Trainee is staff enough
to *read* the asks feed (`askVisibleFor`, `firestore.rules` `allow get, list`
via `isManager()`), but what they are owed is different — `askUnreadFor`
(#563) defines a trainee's unread as replies on their own questions, and never
another person's thread.

## Decision
1. **Messages and Questions are destinations**, between Home and the last
   destination: `Home · Messages · Questions · People` for a Trainee and a
   Full-timer, `Home · Messages · People` for a Student, `Home · Messages · On our
   hearts` for a Community member. Questions follows the route allowlist
   (`canAccessRoute(role, '/questions')`), not a role rung, so it appears for the
   Trainee manager and above and never for a Student or Community member, whose
   `create` the rules already deny.
2. **The search FAB leaves the bar.** Search stays in the phone header, where it
   already was; quick-add stays in the overlay's empty state. Nothing else leaves
   the bar, so the bar still holds four controls with room to spare
   (4 × 64px = 256px of 343px) and keeps a 44px target per control.
3. **The bar carries one waiting count, on Questions, and it is the reader's
   own.** A Full-timer sees the team's unanswered backlog — the same number the
   rail and the top bar show, from `useWaitingAsksCount`. A Trainee sees the
   replies owed on their own questions, from `useMyAskRepliesCount`, which is
   `askUnreadFor` with `isFullTimer: false` — the reading the Messages channel
   header already uses. Neither is a new query: both read the asks feed the
   shells already subscribe to.
4. **The count rides the disc and is spoken after the label**, so a tab bar
   announces "Questions, 3 waiting" the way a native one does, rather than
   moving the number into an `aria-label` that replaces the destination's name.

## Consequences
- **A Trainee gains one-tap reach to the two surfaces with live work in them**,
  and can see that something is waiting without opening the drawer. The bar now
  satisfies the acceptance in #1806 rather than the drawer.
- **Search costs one tap instead of zero** on the phone — but the header button
  is the same 44px target at the same edge of the screen, and the bar's FAB was
  the same overlay. Nothing became unreachable: quick-add, new contact and the
  rest of the palette are all inside that overlay.
- **A Trainee's bar count is not comparable to a Full-timer's.** The two read
  different things by design (#563), so "3" on a trainee's phone and "3" on a
  full-timer's mean different work. The rail and the top bar still badge only
  the full-timer's team count, so a Trainee's desktop shell shows no count at
  all — a pre-existing asymmetry this ADR does not close.
- **Unread messages are deliberately not badged.** `chatUnread.ts` costs one
  aggregate read per room, and the bar mounts on every route; a Messages badge
  is a separate decision with its own read budget, not a free addition to this
  one.
- **The bar is at four of its five controls at 375px.** There is one slot left,
  and a fifth destination would leave 31px of slack across the row — so the next
  destination to want the bar has to displace one, and this ADR is the record of
  why the four that are there won.
