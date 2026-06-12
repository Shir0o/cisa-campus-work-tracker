# Design reference — "Field notes" overhaul

**Reference material only. Nothing here is shipped or imported by the app.**

This is the handoff bundle exported from [Claude Design](https://claude.ai/design): an
HTML/React + Babel prototype of the **"Field notes"** redesign — a warm, editorial, pastoral
reskin of the CISA Campus Work Tracker. It exists so the design-overhaul issues
(label: `design-overhaul`) can point at exact source files.

## What's here
- `project/CLAUDE.md` — **the master spec.** Per-screen intent, what's done, conventions, gotchas.
  Read this first.
- `project/styles.css` — the full design system. `:root` = warm **dark** theme;
  `[data-theme="light"]` = warm **paper** theme (the default).
- `project/views/*.jsx` — per-screen prototype views (dashboard, stage-board, contacts,
  contact-detail, attendance, prayer, edit-log, board (My Day), signup, global-search,
  notifications, feedback-fab, settings*).
- `project/index.html`, `app.jsx`, `data.jsx`, `ui.jsx` — prototype shell, mock data, helpers.
- `screenshots/` — rendered screens for visual reference.

## How to use it
The prototype is a mockup, not production code. **Recreate the visual output** in the real app
(React 19 + TS + Tailwind 4 + Firebase) — don't copy the prototype's internal structure.
Each `design-overhaul` issue maps one prototype screen to its live `src/...` counterpart.

Token mapping (MD3 → Field Notes) lives in the Foundation issue and in `project/styles.css`.
