---
name: CISA Campus Work Tracker
description: Ink design system for on-campus collegiate ministry
colors:
  primary: "#131316"
  primary-hover: "#35353C"
  neutral-bg: "#FFFFFF"
  neutral-panel: "#F4F4F5"
  neutral-panel-2: "#EAEAEC"
  neutral-border: "#E4E4E7"
  neutral-border-soft: "#F0F0F2"
  text: "#0A0A0B"
  text-dim: "#52525B"
  text-mute: "#A1A1AA"
  accent-on: "#FFFFFF"
  rail-bg: "#0A0A0B"
  rail-on: "#FFFFFF"
  stage-terracotta: "#CC5533"
  stage-sage: "#4A7C59"
  stage-teal: "#2A7B88"
  stage-plum: "#7D4E75"
  stage-clay: "#B85D35"
  stage-ochre: "#B8860B"
  stage-slate: "#4A6B82"
  success: "#016A1C"
  warning: "#BA5900"
  danger: "#B1000F"
typography:
  display:
    fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4vw, 2.625rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  caption:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  scripture:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  sm: "10px"
  md: "12px"
  interactive: "14px"
  subcontainer: "20px"
  card: "24px"
  shell: "32px"
  outer: "40px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.accent-on}"
    rounded: "{rounded.interactive}"
    padding: "0 22px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.accent-on}"
    rounded: "{rounded.interactive}"
  button-secondary:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.interactive}"
    padding: "0 22px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.interactive}"
    padding: "0 22px"
    height: "44px"
  input-field:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "11px 14px"
  card-container:
    backgroundColor: "{colors.neutral-panel}"
    rounded: "{rounded.card}"
    padding: "24px"
  chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.accent-on}"
    rounded: "{rounded.full}"
    padding: "6px 15px"
  chip-unselected:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.full}"
    padding: "6px 15px"
---

# Design System: CISA Campus Work Tracker

## Overview

**Creative North Star: "The Field Notebook"**

CISA Campus Work Tracker is built on the Ink design system: a calm, high-clarity monochrome shell paired with purposeful stage chroma and warm tactile surfaces suited for on-campus collegiate ministry. Unlike generic SaaS administration portals that spray decorative purple gradients, celebratory confettis, and gamified badges across every screen, Ink creates a quiet, focused canvas where real human beings, scripture passages, and field encounters provide the only color.

The visual architecture is anchored in fill-contrast rather than bordered containment. Crisp white pages hold soft slate cards, tactile rounded controls, and dense typography calibrated for split-second readability under bright campus sunlight. Black ink serves as the primary action and accent signal; when an element calls for attention, its emphasis is unmistakable because saturation has been deliberately reserved.

**Key Characteristics:**
- **Near-Monochrome Shell:** Pure white page canvas, soft zinc/slate cards, and carbon black actions.
- **Reserved Chroma:** Saturated hue is strictly reserved for contact stages on The Journey, urgency signals, and people marks.
- **Fill-Over-Border Contrast:** Cards and surfaces separate by tonal lightness steps rather than wireframe hairline borders.
- **Vocal Typography:** Heavy Plus Jakarta Sans display headlines providing immediate directional leadership, supported by studious Lexend body text and literary Literata scripture.
- **Tactile Monotonic Hierarchy:** A strict descending radius ladder ensures nested elements nest comfortably without visual distortion or stadium-clamped controls.

## Colors

The palette is named "Carbon & Paper": carbon black ink on crisp white paper, supported by soft slate tonal steps and natural earthy field pigments that distinguish discipleship stages on The Journey.

### Primary
- **Carbon Ink** (`#131316` light, `#FAFAFA` dark): The primary action and emphasis token. Used for primary buttons, active filter chips, focused hairline borders, and key headlines.
- **Carbon Hover** (`#35353C` light, `#E4E4E7` dark): The active hover state for primary controls and buttons.

### Neutral
- **Pure Paper** (`#FFFFFF` light, `#0A0A0B` dark): The root background canvas.
- **Soft Slate Card** (`#F4F4F5` light, `#161618` dark): The primary panel and card surface fill, separating from the canvas purely through tonal contrast.
- **Nested Slate** (`#EAEAEC` light, `#202023` dark): Track background for segmented controls, nested panels, and secondary chip states.
- **Hairline Border** (`#E4E4E7` light, `#2A2A2E` dark): Neutral structural edge for text fields, secondary buttons, and table row dividers.
- **Body Text** (`#0A0A0B` light, `#FAFAFA` dark): High-contrast primary reading ink.
- **Dim Text** (`#52525B` light, `#A1A1AA` dark): Supporting body text, secondary labels, and inactive icon signals.
- **Muted Text** (`#A1A1AA` light, `#71717A` dark): Section category headers, placeholders, and inactive count indicators.

### Stage & Field Hues
Data hues are calibrated in OKLCH to preserve uniform perceptual chroma across the board:
- **Terracotta / Clay** (`oklch(0.55 0.15 42)`): Stage marks and progress indicators.
- **Ochre** (`oklch(0.55 0.15 88)`): Early encounter stages.
- **Sage** (`oklch(0.55 0.15 145)`): Developing connections.
- **Aegean Teal** (`oklch(0.55 0.15 196)`): Stable regular attendees.
- **Slate** (`oklch(0.55 0.15 258)`): Core discipleship stage.
- **Deep Indigo** (`oklch(0.55 0.15 276)`): Student leaders.
- **Plum** (`oklch(0.55 0.15 324)`): Gospel partners and long-term relationships.
- **Rose** (`oklch(0.55 0.15 12)`): Urgent follow-up burdens.

### Named Rules
**The Inversion Rule.** Selection and activation are expressed as solid ink inversion (solid black background with white text), never as a faint 6% tint. When an item is selected, it turns inside out.

**The Reserved Chroma Rule.** Color belongs exclusively to people, spiritual journey stages, and urgent status signals (success green, warning amber, danger red). The chrome, navigation, cards, and buttons remain strictly monochrome.

**The Accent Rarity Rule.** Interactive text signals and primary black buttons occupy less than 10% of any viewport. Rarity is what guarantees their command of attention.

## Typography

The type system pairs modern geometric authority with clean reading speed and classical literary reverence.

**Display Font:** Plus Jakarta Sans (`'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif`)
**Body Font:** Lexend (`'Lexend', ui-sans-serif, system-ui, sans-serif`)
**Scripture Font:** Literata (`'Literata', Georgia, 'Times New Roman', serif`)
**Code/Data Font:** ui-monospace (`ui-monospace, 'SF Mono', Menlo, Consolas, monospace`)

**Character:** Plus Jakarta Sans delivers punchy, confident headlines with weights up to 800 so screens never read as undifferentiated grey. Lexend ensures fatigue-free readability on mobile devices during active campus outreach. Literata elevates scripture passages and key lines with warm editorial elegance.

### Hierarchy
- **Display** (800 weight, `clamp(2rem, 4vw, 2.625rem)`, line-height 1.05, tracking -0.03em): Major landing hero titles and primary destination headers.
- **Headline** (700 weight, `1.375rem` / 22px, line-height 1.2, tracking -0.02em): Section headers, modal sheet titles, and board column names.
- **Title** (700 weight, `1.125rem` / 18px, line-height 1.25, tracking -0.015em): Card titles, contact names in detail headers, and item summaries.
- **Body** (400/500 weight, `0.9375rem` / 15px, line-height 1.55, max width 68ch): Primary prose, interaction notes, and conversation threads.
- **Label** (600 weight, `0.75rem` / 12px, line-height 1.2, uppercase, tracking 0.08em): Small category tags, rail section dividers, and table metadata.
- **Caption** (500 weight, `0.6875rem` / 11px, line-height 1.3, tracking normal, sentence case): Timestamps, role suffixes, inline text links, and compact badges. Use 400 or 600 where the surrounding element already does; do not go below 11px.
- **Scripture Passage** (400 weight, `1.25rem` / 20px, line-height 1.6): Dedicated reading passages in the Bible study reader; foregrounded with zero distraction.

### Named Rules
**The Scripture Exclusivity Rule.** The serif typeface (Literata) is strictly reserved for biblical passages and key study lines in the Bible study reader. It is never used for general app titles, cards, or navigation chrome.

**The Vocal Headline Rule.** Headings must lead with heavy weights (700 or 800) and visible size contrast. A page where headings sit at the same weight as body copy fails the Ink standard.

## Layout

The spatial model uses an expansive container architecture with generous 20px outer page insets and clean vertical rhythms.

- **Desktop Shell (Rail Mode):** A 232px wide floating navigation rail (`NavRail`) inset 20px from page boundaries, leaving a clean, unobstructed main content canvas.
- **Top Bar Shell (Fallback Mode):** Standardized horizontal navigation bar with integrated search and quick actions.
- **Mobile PWA Shell:** Full-width content with safe-area insets, a 48px header strip, and a fixed bottom navigation bar for core destinations.
- **Container Widths:** Main content areas standardize on max widths: 1440px wide for multi-column dashboards and The Journey board; 1080px for standard detail pages and document readers; 720px for focused editors and settings forms.
- **Spacing Scale:** Standard 8px spatial grid with major steps at 8px (`sm`), 16px (`md`), 24px (`lg`), 32px (`xl`), and 48px (`2xl`).

## Elevation & Depth

Surfaces are flat by default. Ink rejects generic box-shadows under cards, relying on tonal contrast between white paper (`#FFFFFF`) and slate panels (`#F4F4F5`) to establish visual separation.

### Shadow Vocabulary
- **Shell Floating Shadow** (`box-shadow: 0 8px 32px rgba(10, 10, 11, 0.14)` in light, `0 8px 32px rgba(0, 0, 0, 0.66)` in dark): Reserved exclusively for the floating navigation rail and elevated top-level floating chrome.
- **Popover / Modal Shadow** (`box-shadow: 0 16px 32px rgba(0, 0, 0, 0.16)`): Applied to flyout menus, action sheets, and modal dialogs.
- **Card Shadow** (`none`): Cards rest directly on the page canvas with zero elevation blur.

### Named Rules
**The Flat-By-Default Rule.** Content cards, list rows, and sub-panels carry zero box-shadow at rest. Depth is established purely by background tone and 1px soft hairline boundaries where needed.

**The Single Floating Slab Rule.** In desktop rail mode, the navigation rail is the only persistent elevated floating slab on screen. Multiple floating islands competing for elevation are prohibited.

## Shapes

Corner curvature follows a strict, mathematically monotonic scale (ADR 0009) where outer containers always have larger radii than their nested children.

- **Shell / Slab:** 32px (`--radius-2xl` / `rounded-2xl`). Floating navigation rail.
- **Card / Modal:** 24px (`--radius-xl` / `rounded-xl`). Primary content cards, modals, and slide-over sheets.
- **Sub-container:** 20px (`--radius-lg` / `rounded-lg`). Nested summary containers, embedded boards, and grouped sections.
- **Interactive Panel / Button:** 14px (`--radius` / `rounded-[14px]`). Buttons, tabs, and inner panels.
- **Control / Input:** 10px (`--radius-sm` / `rounded-sm`). Form text inputs, textareas, and compact selectors.
- **Pill / Avatar:** Full circle (`--radius-full` / `rounded-full`). Filter chips, badges, and user avatars.

### Named Rules
**The Monotonic Radius Rule.** Nested elements must strictly descend in corner radius: Shell (32px) → Card (24px) → Panel (14px) → Control (10px). A child element must never have a larger corner radius than its parent container.

**The No-Stadium-Input Rule.** Form inputs, textareas, and search fields shorter than 60px height must never use `rounded-xl` or `rounded-full`. They must strictly use `rounded-sm` (10px) to prevent unsightly stadium/lozenge clamping.

## Components

### Buttons
Tactile, confident, and direct.
- **Primary:** 44px height (32px for small variant), 14px radius (`rounded-[14px]`), solid Carbon Ink background (`#131316`), white text, 500 weight, 0 22px padding. Hover transitions to `#35353C`.
- **Secondary:** 44px height, 14px radius, white background (`#FFFFFF`), 1px hairline border (`#E4E4E7`), black text (`#0A0A0B`).
- **Ghost:** 44px height, 14px radius, transparent background, dim text (`#52525B`), hover fills with 8% neutral overlay.

### Chips & Filters
High-contrast pill selectors.
- **Style:** 9999px pill radius, 6px 15px padding, 13px font size, 500 weight.
- **Selected State:** Solid black fill (`#0A0A0B`), pure white text, 1px solid black border.
- **Unselected State:** Pure white background, soft border (`#F0F0F2`), dim text (`#52525B`). Hover darkens text to `#0A0A0B`.

### Cards / Containers
Restful, borderless surfaces.
- **Corner Style:** 24px radius (`--radius-xl`).
- **Background:** Soft slate (`#F4F4F5` light, `#161618` dark).
- **Shadow:** None.
- **Border:** None (borderless fill separation).
- **Internal Padding:** 24px to 28px standard.

### Inputs / Fields
Quiet, dependable data entry.
- **Style:** 10px radius (`--radius-sm`), 1px solid border (`#E4E4E7`), white background (`#FFFFFF`), 11px 14px padding, 14.5px font size.
- **Focus:** 1px solid black border (`#0A0A0B`) with a 3px outer glow ring (`rgba(10, 10, 11, 0.08)`). No colored focus glows.
- **Error:** 1px solid danger border (`#B1000F`) with soft red highlight.

### Navigation
The desktop floating rail.
- **Style:** 232px width, 20px page inset, 32px radius (`--radius-2xl`), near-black slab (`#0A0A0B`), deep floating shadow.
- **Items:** 38px height, pill radius (`rounded-full`), white icon with 19px stroke. Active item inverts to solid white pill with black text and icon.
- **Sections:** Clean uppercase label dividers (`Today`, `People`, `Gatherings`, `Prayer`) in muted white (`rgba(255, 255, 255, 0.34)`).

### Signature Component: The Bible Study Reader
- **Structure:** Clean reading deck rendered directly on student devices via Entry point slugs (`/s/cisa-wednesday`).
- **Passage:** Set large in Literata serif (`--font-scripture`), foregrounded without distractions.
- **Key Line:** The central theological takeaway lifted out in bold serif with key marker.
- **Blanks:** Interactive cloze device tapping to reveal keywords and maintain active room engagement.

## Do's and Don'ts

### Do:
- **Do** separate cards from the page using tonal background fill (`#F4F4F5` on `#FFFFFF`), not drop shadows or heavy borders.
- **Do** invert selected items to solid black fills with white text (`The Inversion Rule`).
- **Do** enforce the descending radius ladder: Shell 32px → Card 24px → Panel 14px → Input 10px (`The Monotonic Radius Rule`).
- **Do** reserve Literata serif strictly for scripture readings and key study verses (`The Scripture Exclusivity Rule`).
- **Do** use heavy Plus Jakarta Sans weights (700 or 800) for major headers to ensure strong scanability.
- **Do** ensure interactive links and clickable names use `--accent` with persistent underlines (`underline underline-offset-2`).

### Don't:
- **Don't** use faint low-alpha tints (e.g. 6% black) for active selection states — they become invisible.
- **Don't** use `rounded-xl` or `rounded-full` on inputs, search bars, or textareas under 60px height.
- **Don't** add decorative box-shadows to cards or content tiles.
- **Don't** introduce colored focus rings (blue, purple) to form controls; use the black hairline focus ring.
- **Don't** use Literata serif for general UI buttons, navigation items, or system dashboards.
- **Don't** introduce hardcoded hex colors or arbitrary Tailwind palette classes (`bg-blue-500`, `text-indigo-600`); always read from the semantic design tokens.
