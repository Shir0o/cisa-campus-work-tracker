# Cut or keep: the feature audit

Date: 2026-11-17. Decided with Tony, one feature at a time, part by part.

## Intent

The app should not have tons of features. It should have only features that
cannot be taken away. Each part was judged by one test: would a Full-timer or
Trainee be stopped from their ministry work without it, with no reasonable
substitute?

- **Users who count:** Full-timers and Trainees only. No Student or Community
  partner uses the app (one Student account exists and has never been used).
- **"Cut" means delete the code** and the feature, not hide it.
- **Non-goal:** redesigning what is kept, beyond the few reworks listed.
- **Anti-goal:** losing data people rely on. Cutting a page never deletes the
  record underneath it unless stated.

## Cross-cutting decisions

| Decision | Detail |
|---|---|
| Student and Community roles | Cut: roles `operator`/`viewer`, their homes, permission and rules branches, role picker entries, view-as personas. Two roles remain: Full-timer (`admin`), Trainee (`manager`). |
| Spanish | Cut entirely: app strings web and phone, `.es` help articles, language switch, server translation functions. The translation-file system stays (English only). |
| Phone versions | Cut where noted per feature; kept for My Day, Prayer, Directory/People, To ask, Global Search (person only), Messages-replacement surfaces. |
| Stats and counts | Header stats and number strips are cut everywhere they appear. |

## Per feature

### 1. Roles — cut (see above)
Sign-up form and "Moving up a year" are about contacts, judged separately.

### 2. Outreach (monthly park outings) — cut
Cut: log an outing, handed-out counts, names-to-contacts from outings, "met,
not yet reached" queue, Gospel nav (web and phone), the `outreach` collection
and rules. Keep: the "where we met" field on a contact (sign-up writes it).
Not affected: the Journey board's code name `OutreachBoard`; text-reach logic
in to-asks.

### 3. Credential Vault — keep
Keep: unlock, entries, reveal/copy, change passphrase, reset after lost
passphrase, Help card. Cut: the activity (audit) log, including the
attendance-sync-token rotation it records.

### 4. Suggestions queue (BNPB sync) — cut
Cut: `/api/bnpb/sync`, personal sync token, `/suggestions`, "who is this?"
matching (check first whether sign-up shares it). File a ticket in the BNPB
repo: its push will start failing.

### 5. Visits — page cut
Cut: Visits page, its list, stats, "Who we haven't seen", phone version.
"Visit" becomes an interaction type logged on the contact, with several people
selectable at once. Each visited person's story shows it.

### 6. Around the Team — keep
Keep: feed, read/reply in place, Reviewed, team/teammate filters, new-only
filter. Cut: the Reach button. **Open:** Tony will ask the other Full-timers
whether they use it; if nobody does, it comes back for a full cut.

### 7. Looking back (History) — lean
Keep: the stream with "show older", search (the traceback tool), the activity
record. Cut: kind filter, teammate filter, stats, phone version.

### 8. Gatherings (attendance) — lean
Keep: rhythms and one-offs, mark who came, cancel a week, "Who we've missed",
to-do from a missed person, "Coming up", Attendance Tracker sync. Cut: stats
card, kinds filter, RSVPs, phone version.

### 9. Questions for the team — cut
Cut: board, ask panel, phone "Ask the team", My Day question stacks. Open
questions keep working until answered (same rule as old question items in the
2026-11-10 mentions decision). @mentions replace it.

### 10. To ask — keep, more visible
Keep: lines by Trainee, automatic lines, own lines, mark asked/undo, "Add to To
ask" from a contact, My Day pointer, phone version. Cut: Delegate, team filter,
"Clear done". **New:** a web nav item for Full-timers (where Questions was).

### 11. Combine — lean
Keep: combine contacts, Undo combine, "Not the same person", duplicate
suggestions, standard tags list. Cut: Combine tags, tag guesses.

### 12. Sign-up form — keep all
All fields, team notification (now Full-timers only, see 28), spam trap, staff
strip. **Open gap, separate from this audit:** no neutral age check on a public
form collecting personal info.

### 13. Moving up a year — keep, more visible
Keep: bulk confirm, per-row override. Cut: confirmed-by stamp. **New:** a
one-line banner at the top of the Directory for Full-timers, shown only while
years are due ("12 students' years to confirm · Review"); it replaces the
button in the filter menu. **New years:** "High school junior" and "High school
senior", listed before Freshman, everywhere a year is picked (web and core
lists). Move-up: HS junior → HS senior → Freshman (overridable per row).

### 14. Smart Text Import — lean
Keep: contacts from pasted text, preview and confirm. Cut: interactions and
discussion notes from paste, "Load sample text". The server parse is kept and
extended for Quick add (26).

### 15. Reports — lean
Keep: report button, GitHub issue, Your reports, fixed outcome sentences,
outcome push. Cut: PR-written "What came of it", replies mirrored with GitHub,
owner view, `/admin/feedback`.

### 16. Help, What's New, Support, Privacy — lean
Keep: Privacy, Support, help articles "getting started" and "privacy", Vault
card. Cut: other help articles, What's New (records and Settings section),
"How this works".

### 17. Spanish — cut (see above)

### 18. Bible study — lean
Keep: editor, present mode, public reader, terms, stable QR links (entry
points), weeks list. Cut: signed-in reader `/bible-study/read` (it serves
Trainees too, not only Students), the index's second column.

### 19. Coordination Notes — lean
Keep: dated pages, live co-editing, team to-dos, guest share link, trash,
pin/reorder, link to another page, full screen, page search. Cut: Trainee read
access (Trainees see no pages), Notes & learnings, AI Insights, phone version.
Annual events are found by page search and by linking last year's page at the
top of this year's. If a to-do is ever assigned to a Trainee, Trainee read
access comes back.

### 20. Messages — cut; Announcements reworked
Cut: chats (one-to-one, group), read receipts, filters, pins, hide,
attachments, embeds, the Announcements room, threaded replies under
announcements. @mentions keep working wherever people write (e.g. a contact's
conversation) and land on the mentioned person's list.
**Announcements, new shape:** Full-timers post; it pushes to every phone,
shows as a card on everyone's home until "Got it", and the poster sees who has
not got it yet. No replies, no separate page.

### 21. On our hearts (prayer) and Answered — lean
Keep: people we're holding, a prayer per person per week, marks, testimony,
brothers/sisters split, photos, archive reason, remove + undo, Answered, Bring
to team prayer, phone prayer tab, the "no interaction in N days" line on the
card. Cut: to-do and log-interaction shortcuts on the card, the separate phone
prayer log.
**Rule change:** team prayer becomes per person, not per prayer. Once a person
is on team prayer, all their prayers show on On our hearts. Accepted
trade-off: no single private prayer for someone on team prayer.

### 22. The Journey board — cut
The Directory's step filter replaces it. "Not yet placed" becomes a Directory
filter option. Step add/rename/reorder/remove moves to Settings. Cut: the
board, drag, leader track / partner pipeline views, step colours, board search,
"Welcome someone new".

### 23. Directory / People — lean
Keep: list and search, step and tag filters, "not reached yet" and kind
filters, sort, last connected per row, bulk change step and remove, copy
emails, doors to Combine / Moving up (banner) / Smart Import. Cut: background,
interests, has-phone and custom date filters, bulk set kind and bulk tag,
header counts, row Reach button.

### 24. A contact's page — lean
Keep: head, story, log an interaction (gains Visit and multi-person),
conversation (where @mentions live), prayer card, About sheet, add a carer,
follow-up reminder, release from queue, combined-from banner, Add to To ask,
remove interaction + undo. Cut: Full-timers pane, threads under interactions,
the ask part of Delegate, reach prompt.

### 25. My Day — lean
Keep: announcement card (new), On you, your people, not reached yet, to-dos,
Around pointer, To ask pointer, this week's gatherings, prayers to hold, phone
home. Cut: "on the horizon", team numbers, first-run card, Questions and BNPB
cards.

### 26. Settings — lean
Keep: account and 2FA, team management, Gospel Partners, teams, steps (moved
from the board), notifications, weekly reminders, attendance sync token, Vault
door, appearance, navigation style. Cut: roles & access cards, SMS / WhatsApp /
GroupMe, the Siri recipe and its text endpoint, the natural-language
playground, API & webhook console, language, What's New.
**The day's goal:** becomes "Show the goal until [date]" so it switches itself
off after the first weeks of a semester.
**Quick add, new:**
- Long-press the app icon (iPhone and Android) → "Quick add" opens one text
  box; type or dictate with the keyboard mic.
- A home screen widget, iPhone and Android, that opens the same box.
- The AI parses as much as it can about a person: name, phone, email, year,
  step, tags, an interaction (type, when, notes), a prayer request, a
  follow-up reminder. Matched against existing contacts. A preview card shows
  everything; nothing saves until Save.
- Text goes to Gemini, as Smart Import does today.

### 27. Global Search — trimmed
Keep: find a person (with recent people), web ⌘K and phone. Cut: jump to
page, quick actions, conversation / coordination / learnings / history
results.

### 28. Notifications and view-as — lean
Keep: bell, phone push, browser push, mention reminders, weekly reminders,
delivery receipts, view as a teammate (impersonation; verify it shows exactly
what that Trainee or Full-timer sees and nothing more). Cut: translation
functions, bell filters ("set aside", hide updates, show all).
**Rule:** a notification only when something is addressed to you or needs
you. Sends: @mention (+ reminder), announcement, to-do assigned or due, report
outcome, sign-up (Full-timers only). Stops: every conversation message,
teammate logged an interaction on your person, new contact added, chat.

## Constraints

- Rules, query contracts and e2e journeys must follow each cut: removing a role
  or collection removes its rules branch, contract and spec (AGENTS.md §8).
- Existing data stays readable: open question/nudge items, team-prayer flags
  (migrate per-prayer flags to per-person), visits already logged (show as
  interactions on the person).
- `e2e/seams.json` must still map every seam to a file (`npm run check:seams`).

## Approaches

| Approach | Trade-off |
|---|---|
| **A. One big removal PR** | Fastest to land, unreviewable, one regression hides in thousands of lines |
| **B. One PR per feature, cuts before builds** (chosen as default, builder may adjust) | Each cut is reviewable and revertable; the new pieces (Announcements, Quick add, banners, per-person team prayer) build on a smaller app |
| **C. Hide first, delete later** | Rejected by Tony: cut means delete |

## Left to the builder

- Order of the per-feature PRs (role cut first is likely, since many later cuts
  shrink once it is gone).
- Exact copy for new UI (Announcements card, Quick add, Directory banner).
- Data migrations: per-person team prayer, visits to interactions, role
  downgrade of the one Student account.
