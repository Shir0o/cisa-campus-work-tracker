# CISA Campus Work Tracker — Redesign Context

A relational/pastoral ministry tool for campus staff who walk students from a
first conversation toward faith. React + Babel app, mock data, no backend.
Entry point: `index.html` → loads `data.jsx`, `ui.jsx`, `views/*.jsx`, `app.jsx`,
`styles.css`, `tweaks-panel.jsx`. Repo: github.com/Shir0o/cisa-campus-work-traker

## The brief
Original design felt "too dense and technical" — a dev-tool / sales-CRM skin
(near-black bg, monospace ID codes like C-0142, KPI sparklines, "Stage Board"
pipeline framing, 30px rows) on top of genuinely human data. Goal: keep ALL
features, just reskin to feel warm, pastoral, people-first.

User decisions (locked):
- De-emphasize metrics → reframe around people & care, not KPIs.
- Keep the kanban, reframe it as a warm "journey" (not a sales pipeline).
- Role labels only — do NOT build a permissions UI.
- Redesign ONE SCREEN AT A TIME.
- Both light + dark themes matter (toggle via Tweaks). Both devices matter.
- One strong direction (not multiple variations).

## The design system — "Field notes" (warm, editorial, pastoral)
Defined in `styles.css` `:root` (warm DARK) and `[data-theme="light"]` (warm
PAPER, the default). Theme is set on `document.documentElement` via the `theme`
tweak; default is now "light".
- Type: **Newsreader** serif for headings/greetings (`--font-serif`),
  **Hanken Grotesk** sans for body (`--font-sans`). `--font-mono` is aliased to
  the sans on purpose — we are removing visible monospace everywhere.
- Palette: slate-blue primary (`--accent` #3a5a82 light / #7aa0cc dark) on cool
  paper, sage `--success`, with stage tones accent/amber/teal/violet (slate-blue/
  terracotta/sage/plum) at matched chroma.
- Roomier scale: 15px body, `--row-h` 46px, `--radius` 10 / `--radius-lg` 16.
- Accent tweak options are earthy (terracotta/sage/plum/ink), see `app.jsx`.

## What's DONE (this is the reference quality bar for the rest)
- **Shell**: sidebar + topbar reskinned, mono dropped, nav relabeled to warm
  language (Today / People / The Journey / Gatherings / Prayer / History),
  director role shown in sidebar foot. `views/sidebar.jsx`, shell CSS in styles.
- **Dashboard** (`views/dashboard.jsx`): fully redesigned. Plain-language
  greeting + prose summary, then "People to reach out to", "New faces",
  "This week", "Prayers we're carrying". Metrics demoted to a quiet figures
  footer ("Numbers are just a way of noticing people."). No KPIs/sparklines/IDs.
- Fixed latent scroll bug: `.main` needed `min-height: 0` so `.content` scrolls.
- Tweaks updated (theme default light, earthy accents, preview default desktop).
- **The Journey** (`views/stage-board.jsx`): kanban reframed as a warm L→R
  progression; cards lead with person + "last connected", IDs/mono dropped.
- **People** (`views/contacts.jsx` + `views/contact-detail.jsx`): warm directory
  (people-first, no table) + warm profile; C-0xxx IDs gone from the UI.
- **Prayer** (`views/prayer.jsx`): "weekly walk" — one card per person (this
  week / last week / earlier), inline mark + edit. `prayer-original.jsx` is the
  old backup, unused.
- **Gatherings** (`views/attendance.jsx`): replaced the contacts×sessions grid.
  Leads with "Who we've missed lately" (absence → care), then "When we gathered"
  (warm session cards; tap to expand a Gathered/We-missed roster, tap a name to
  cycle present→late→absent), then "Coming up" + quiet figures. New `.gth-*` CSS
  block replaced the old `.att-*` one; reuses dashboard `.dash-sec`/`.reach`/`.fig`
  classes for consistency.
- **History** (`views/edit-log.jsx`): reframed "Edit log" → **"Looking back"** —
  a warm record of the work of care, not an audit trail. Dropped Export +
  "searchable/exportable/never lost"; mono uppercase day labels → plain language
  (Today / Yesterday / weekday). Each change humanized via `HIST_ACTION` map
  (moved→"walked … a step further", created prayer→"started praying for", etc.)
  and `histDetail()` scrubs IDs / "(+34 chars)" / masked digits. Polished (Jun
  2026): one CONTINUOUS stream — single thread (`.hist-stream::before`, uses
  `--border`, NOT `--border-soft` which is invisible on light bg) with small
  serif date markers (`.hist-datemark`) where the day changes; no day blocks.
  Each entry = one tonal 28px icon node (steps/prayer/talk/gather =
  accent/violet/amber/teal) on the thread — no avatars in the spine. Controls
  are one row: kind pills + "Whole team ▾" native select (`.hist-sel`) + search.
  Thread stops at last node via `.hist-item:last-child::after` bg cover. Old
  shared `.feed-item` now only used by the unused `prayer-original.jsx`.
- **My Day** (`views/board.jsx` `MyDayFT`): FT's personal cockpit, counterpart
  to The Board. Prose greeting → "On your plate" (checkable to-do from his tasks
  + board commitments, due chips, live count) → "The leaders you're walking with"
  (his owned contacts as reach cards) → "Your week" (featured prayer-huddle card
  + gatherings with his role) → "Prayers you're carrying" (with "I prayed today")
  → quiet figures. Data keyed off `persona.staffId` (u1). New `.md-*` CSS block;
  old `.bd-soon` placeholder styles now legacy.
- **Sign-up** (`views/signup.jsx`): already redesigned — warm two-panel welcome,
  no mono, no visible C-0xxx ID line.
- **Notifications** (`views/notifications.jsx` `NotificationBell`): NEW feature
  the original repo had (`NotificationCenter.tsx`) but the redesign lacked. A
  bell + unread badge in the topbar (both staff `.omni` branch and member
  `.topbar-me` branch, wired in `app.jsx`) opens a warm **"What's stirring"**
  panel — not an alert feed. Items are generated by `buildNotifications(role,
  persona)` from live mock data (new faces, new/answered prayers, overdue care,
  gatherings, journey moves, tasks); each is a plain-spoken line on a tonal 28px
  icon node (accent/violet/amber/teal/sage = `.ntf-ico` tones, matching History).
  Grouped **Worth a look** (unread) / **Earlier** (read). Mark-all-read + per-item
  set-aside (dismiss); read & dismissed sets persist in localStorage namespaced
  by role (`cisa.notif.read.<role>` / `cisa.notif.dismiss.<role>`). On a clean
  slate, non-`fresh` items start read so the badge shows a believable count (4).
  Members get a gentler, smaller feed (gathering reminders, "the team prayed for
  you"). New `.ntf-*` CSS block. GOTCHA: entrance keyframe animates transform
  ONLY (no opacity) — a backgrounded iframe freezes animations at frame 0, so an
  opacity-from-0 keyframe would render the panel invisible in screenshots.
  Added a `bell` icon to `ui.jsx`.

- **Submit Feedback** (`views/feedback-fab.jsx`): `FeedbackFAB` — fixed pencil
  FAB (bottom-right, above bottom nav on mobile) visible to ALL roles. Opens a
  warm panel: four kind pills (A thought / An idea / Something's off / A request),
  textarea (⌘↵ to submit), persona name/role footer, success state. Submitted
  items push to `window.FEEDBACK` so `FeedbackInbox` sees them on next mount.
  GOTCHA: same as Notifications — keyframe animates transform ONLY (no opacity).

- **Global Search** (`views/global-search.jsx`): unified search replacing the
  old dead topbar input + Add button. ⌘K or clicking the input expands a
  dropdown panel in-place (desktop) or a full-screen fixed overlay (mobile).
  Default/empty state: recent contacts (sorted by `lastTouch` asc) + quick
  actions (New contact / Log a visit / Sign-up / The Journey). Results grouped
  as: **People** (name, notes, major, year, hall, tags → open contact),
  **Conversations** (interaction title + body, staff only → open contact),
  **The Board** (BOARD_NOTES + COORDINATION_NOTES, ft only → navigate to board).
  **History** is opt-in — hidden behind a pill toggle at the bottom of results
  (staff only). Keyboard: ↑↓ navigate, ↵ open, Esc close+clear. `onNewContact`
  opens QuickAdd in `initialMode="contact"` (new prop added to QuickAdd). Mobile
  bottom-nav FAB changed from + to 🔍. New `.gs-*` CSS block in `styles.css`.
  GOTCHA: panel is `position: absolute` on desktop (inside `.omni` with inline
  `position: relative`), `position: fixed; top: 52px` on mobile — works because
  no ancestor has `transform`. Click-away uses a `.gs-scrim` fixed div
  (z-index 49) rendered just before the QuickAdd modal in `app.jsx`.

## What's LEFT
All screens, Notifications, Submit Feedback, Global Search, and all formerly-stub
buttons are now wired. No remaining feature gaps vs. the original repo.

~~**Google Sheets sync**~~ — not needed; dropped.

## Wired interactions (formerly stubs)
All live — they mutate the in-memory mock data and persist across the session:

- **Log interaction** (`views/contact-detail.jsx` `LogInteractionModal`): two
  entry points (header action row + Conversations tab). Type pills (coffee/text/
  phone/meal/small-group/meeting/gathering/ran-into), title (auto-suggested per
  type), notes, duration, date. On save: pushes to `INTERACTIONS`, logs to
  `EDIT_LOG`, resets `lastTouch` to 0, opens Conversations tab. ⌘↵ to save.
  Reusable `.li-*` CSS block (shared with Add Prayer + Log Gathering).

- **Add a prayer** (`views/contact-detail.jsx` `AddPrayerModal`): two entry
  points (header + Prayer tab). Title, context, tag pills (family/faith/health/
  provision/school/future/mental-health/leadership/grief/work), priority
  (normal/high), huddle toggle. On save: pushes to `PRAYERS` with status "open",
  logs to `EDIT_LOG`, opens Prayer tab.

- **+ add tag** (inline, contact-detail sidebar): click "+ add" → inline input
  appears in the tags row; Enter confirms (spaces→hyphens, deduped); × on hover
  removes a tag. Both actions log to `EDIT_LOG`. New `.cd-tag-*` CSS block.

- **Log a gathering** (`views/attendance.jsx` `LogGatheringModal`): renamed from
  "New gathering". Name, type pills (Weekly/Small Group/Special/Outreach), date,
  location. On save: pushes to `ATTENDANCE_SESSIONS`, initialises all contacts
  as "absent" in `ATTENDANCE`, syncs local marks state, auto-expands the new
  session for immediate marking. Logs to `EDIT_LOG`.

- **Call / Text / Email** (contact-detail header): `tel:` / `sms:` / `mailto:`
  URIs via `window.open`. Call also shows a toast + opens Log Interaction modal
  after 800 ms. Text shows a nudge toast. Email is silent. `onToast` prop passed
  from `app.jsx` → `ContactDetail`.

## Conventions / gotchas
- Helpers live in `data.jsx`: `staffById`, `contactById`, `dayNum`, `dayMonth`,
  `relTime`, etc. Data shapes: CONTACTS have `lastTouch`/`joinedDays`/`stage`/`owner`;
  PRAYERS have `status`/`prayedBy`/`contactId`; EVENTS have `attended`/`time`/`location`.
- StageChip uses `.chip` + tone class from STAGE_BY_ID (`accent/amber/teal/violet`).
- Each `<script type="text/babel">` has its own scope — components export to
  `window` at file end (e.g. `window.Dashboard = Dashboard`). Keep that pattern.
- IDs (C-0142 etc.) are DB keys — never show them in the UI in the redesign.
- Preview opens desktop by default now; mobile bottom-nav + phone frame still exist.
