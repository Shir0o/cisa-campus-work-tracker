# 0035. Help is a build-time-compiled, bilingual, role-filtered markdown corpus

Date: 2026-10-04

## Status

Accepted

## Context

Issue #1150 asks for onboarding documentation as written help, alongside the existing reactive First-Run Checklist. ADR 0010 settled onboarding *away from* recorded video and overlay tours, so the remaining form is text. The question was where that text lives and how it reaches the reader.

Candidates:

1. **Extend the Support page** (`src/views/Support.tsx`) — the existing help-adjacent surface. Rejected: Support is operational contact (email, hours, deletion, compatibility), and onboarding orientation would inherit its "contact us" framing.
2. **A separate docs site** (Docusaurus/VitePress). Rejected: a second deploy, separate navigation, and it breaks in-app context for an internal tool.
3. **Runtime markdown** (Vite `import.meta.glob(..., { query: '?raw' })` + `react-markdown` at render). Rejected: introduces a second content-loading paradigm beside whats-new and parses markdown at runtime.
4. **MDX**. Rejected: new toolchain, invites bespoke React inside content, and is hostile to non-developer authoring.

The closest precedent is the What's New pipeline (ADR 0008): markdown in `content/`, compiled at build time by a pure compiler into a JSON manifest, so the runtime ships no markdown parser.

## Decision

1. **A distinct Help surface at `/help`**, web only for now, kept separate from Support. The glossary distinguishes the two.
2. **Markdown source in `content/help/`, authored per locale** — `<slug>.en.md` and, where available, `<slug>.es.md`. A page with no Spanish authored falls back to English. Spanish coverage is bounded by authoring capacity; the fallback is a safety net, not a translator.
3. **Compiled at build time** by a pure compiler (`src/scripts/compile-help.ts`) into `src/generated/help.json`, mirroring the `compile-whats-new` shape and testability. Rendered with the existing `react-markdown` + `remark-gfm`.
4. **Role-filtered** by an optional `audience:` frontmatter list of canonical `AppRole`s (`admin` | `manager` | `operator` | `viewer`, ADR 0030); omitted means everyone. A page outside the viewer's role is hidden from navigation and its route resolves as not-found. There is no admin super-power over the corpus.
5. **Minimal frontmatter** — `title`, `order`, optional `category` and `audience`. Search is deferred until the corpus justifies it.
6. **Entry points** — Settings and the Support page link to `/help`; First-Run Checklist steps may link to a specific Help page, so the checklist says *what to do* and Help explains *why and how*.

## Consequences

- Help diverges from whats-new on one axis: release notes are English-only, while Help is authored bilingually. That is deliberate — Help is read by Spanish-speaking operators, release notes are read once at launch.
- Mobile is not covered; the corpus is web-only until there is a reason to add a mobile consumer.
- The outward-facing static pages (`docs/support.html`, `docs/privacy.html`) are untouched; Help is in-app only.
- Adding a help page is a content edit plus a compile, with no runtime API and no Firestore reads.
