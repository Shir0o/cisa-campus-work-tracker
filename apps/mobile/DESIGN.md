---
name: CISA Campus Mobile
description: Bento V2 design system for on-campus collegiate ministry
colors:
  primary: "#5C17E5"
  primary-container: "rgba(92, 23, 229, 0.08)"
  neutral-room: "#F6F8FB"
  neutral-card: "#FFFFFF"
  neutral-card-sub: "#F6F8FB"
  neutral-border: "#DEE4ED"
  neutral-line: "#ECEFF4"
  text-ink: "#1A212B"
  text-ink2: "#525E6F"
  text-ink3: "#728197"
  tone-follow: "#8C3A16"
  tone-ask: "#5C17E5"
  tone-due: "#8A6410"
  tone-pray: "#5C4478"
  tone-note: "#2E5C3C"
  success: "#016A1C"
  warning: "#BA5900"
  danger: "#B1000F"
typography:
  display:
    fontFamily: "Lexend_600SemiBold, system-ui, sans-serif"
    fontSize: "1.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Lexend_600SemiBold, system-ui, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Lexend_600SemiBold, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Lexend_400Regular, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Lexend_500Medium, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  badge: "8px"
  interactive: "16px"
  card: "24px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.interactive}"
    padding: "0 20px"
    height: "44px"
  button-warm:
    backgroundColor: "{colors.warning}"
    textColor: "#FFFFFF"
    rounded: "{rounded.interactive}"
    padding: "0 20px"
    height: "44px"
  card-focus:
    backgroundColor: "{colors.neutral-card}"
    rounded: "{rounded.card}"
    padding: "20px"
  chip-pill:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  input-field:
    backgroundColor: "{colors.neutral-card-sub}"
    textColor: "{colors.text-ink}"
    rounded: "{rounded.interactive}"
    padding: "12px 16px"
---

# Design System: CISA Campus Mobile

## Overview

**Creative North Star: "The Handheld Compass"**

CISA Campus Mobile is built on the Bento V2 design system: a tactile, three-layer mobile visual architecture structured specifically for collegiate field workers walking campus. While the web application has moved to the near-monochrome Ink system, the mobile app operates on Bento's proven mobile foundations: cool blue-leaning neutrals (`#F6F8FB`), pure white hairline cards (`#FFFFFF`), energetic violet `#5C17E5` brand accents, and Lexend-driven typographic rhythm.

Every screen in the mobile app stands in a clearly defined physical layer: the **Room** (the ground canvas and ambient chrome), the **Card** (the focused queue card, modal sheet, or pushed person view), and the **Widget** (scrollable dashboard furniture). This separation guarantees that whether a trainee is flipping through today's outreach queue or a full-timer is reviewing widget summaries, touch targets stay generous, card footers never scroll out of view, and text remains comfortably legible under intense campus sunlight.

**Key Characteristics:**
- **Three-Layer Architecture:** Rigid semantic separation between Room ground, Card focus surfaces, and Widget furniture.
- **Electric Violet Signal:** Violet (`#5C17E5`) serves as the active brand fill, interactive link tint, and primary focus indicator.
- **Cool Hairline Framing:** Crisp 1px borders (`#DEE4ED` light, `#3C4959` dark) outline clean white cards against a soft grey-blue room.
- **One-Thumb Touch Ergonomics:** Every interactive element satisfies a strict 44×44 pt minimum touch floor.
- **Static Card Feet:** In focus cards and detail sheets, action footers remain anchored while interior bodies scroll.

## Colors

The mobile palette uses cool blue-grey neutrals accented by vibrant violet and role-specific action tones.

### Primary
- **Electric Violet** (`#5C17E5` light, `#5C17E5` dark): The primary brand fill for main action buttons, chat bubbles, deep widget grounds, and selected reaction borders.
- **Violet Container / Tint** (`rgba(92, 23, 229, 0.08)` light, `rgba(154, 143, 255, 0.18)` dark): Subtle background tint for selected reaction chips and active category badges.

### Neutral
- **Room Ground** (`#F6F8FB` light, `#1A212B` dark): The base canvas background of every screen.
- **Card Surface** (`#FFFFFF` light, `#27313F` dark): The surface fill of the daily focus card, bottom sheets, and pushed contact screens.
- **Card Secondary Fill** (`#F6F8FB` light, `#202936` dark): Text fields, notes containers, and nested blocks inside cards.
- **Hairline Border** (`#DEE4ED` light, `#3C4959` dark): The 1px perimeter border that defines cards and sheets.
- **Hairline Divider** (`#ECEFF4` light, `#333E4C` dark): Subtle separator lines between rows and sections.
- **Primary Ink (`ink`)** (`#1A212B` light, `#F6F8FB` dark): Highest-contrast text for headers and primary information.
- **Secondary Ink (`ink2`)** (`#525E6F` light, `#B6C2D3` dark): Supporting body copy, labels, and timestamps.
- **Floor Ink (`ink3`)** (`#728197` light, `#9AA8BC` dark): The absolute contrast floor for subtle captions and metadata.

### Action Tones (Pills & Dots)
- **Follow** (Band: `#FBE8DE`, Text: `#8C3A16`, Dot: `#C9622F`): Follow-up actions and reminders.
- **Ask** (Band: `#ECE9FB`, Text: `#5C17E5`, Dot: `#5C17E5`): Questions and trainee asks.
- **Due** (Band: `#FCEED4`, Text: `#8A6410`, Dot: `#C99A2F`): Urgent to-dos and overdue items.
- **Pray** (Band: `#EFE9F7`, Text: `#5C4478`, Dot: `#8D7AA8`): Prayer requests and burdens.
- **Note** (Band: `#E5F0E6`, Text: `#2E5C3C`, Dot: `#5C8A6C`): Field coordination notes.

### Named Rules
**The Ink Floor Rule.** No text element on any layer may use an ink color lighter than that layer's `ink3` token (`#728197` in light, `#9AA8BC` in dark). Low-contrast text that washes out in daylight is strictly forbidden.

**The Layer Coherence Rule.** Components must read color tokens from their immediate structural layer (`c.room`, `c.card`, or `c.widget`). A card component must never mix room tokens into its interior.

## Typography

Mobile typography relies exclusively on the **Lexend** family across all weights, optimized for rapid, fatigue-free reading on handheld devices.

**Font Family:** Lexend (`Lexend_400Regular`, `Lexend_500Medium`, `Lexend_600SemiBold`)

**Scale Scaling Function:** All font sizes pass through the dynamic viewport scale function `fs(size)` driven by `v2FontScale`, clamping between 11px and 13px base size so shorter and taller devices maintain comfortable vertical layouts.

### Hierarchy
- **Display** (600 SemiBold, `27px` / `fs(27)`, line-height 1.2, tracking -0.02em): Major screen titles and focus card names.
- **Headline** (600 SemiBold, `21px` / `fs(21)`, line-height 1.25, tracking -0.015em): Section titles and modal sheet headers.
- **Title** (600 SemiBold, `17px` / `fs(17)`, line-height 1.3): Card subtitles and list row headings.
- **Body** (400 Regular, `15px` / `fs(15)`, line-height 1.55): Contact encounter notes and thread messages.
- **Label / SemiBold** (500/600, `13px` / `fs(13)`, line-height 1.2): Category chips, button labels, and status badges.
- **Caption** (400 Regular, `11px` / `fs(11)`, line-height 1.2): Timestamps, metadata, and helper text.

### Named Rules
**The Single Typeface Rule.** The mobile application uses Lexend exclusively. No serifs or secondary display families appear in mobile chrome or content cards.

**The Scaled Font Rule.** Font sizes in components must be expressed via the theme's `fs(drawnSize)` helper to ensure proper scaling on compact screens.

## Layout

The spatial model is strictly designed for handheld ergonomics and vertical scrolling on phones.

- **Safe-Area Insets:** Content always stays within device top notches, Dynamic Islands, and bottom home indicators.
- **Role Shells:**
  - **Queue Shell (`queue`):** For Trainees. Focused single-card queue view (`QueueScreen`) with on-campus status strip.
  - **Full-Timer Shell (`ft`):** For Administrators. Compact overview dashboard (`FtHomeScreen`) featuring widget tiles and stats glance.
  - **Member Shell:** For Students. Rhythms feed (`MemberHomeScreen`) displaying gatherings and prayer burdens.
- **Touch Target Floor:** Every interactive button, chip, and list row satisfies at least **44×44 pt** on iOS (and 48×48 dp on Android).
- **Padding & Gutters:** Screen containers use 16px (`lg`) horizontal margins; card interiors use 20px padding.

## Elevation & Depth

Surfaces in Bento V2 are flat. Cards separate from the room via hairline borders (`1px solid #DEE4ED`) and background contrast, not drop shadows.

### Shadow Vocabulary
- **Card & Tile Shadow:** Flat (`shadowOpacity: 0, elevation: 0`). Zero shadow blur.
- **Floating Action Button (FAB):** `shadowColor: #000, shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3`.

### Named Rules
**The Flat-Card Rule.** Cards, list rows, bottom sheets, and widget tiles carry zero drop shadow. The Floating Action Button (`＋`) is the sole elevated element permitted a drop shadow.

## Shapes

Corner curvature follows a simple, two-tiered standard:

- **Containers & Focus Cards:** 24px radius (`v2Radius.card = 24`, bottom sheet radius = 24px).
- **Interactive Elements:** 16px radius (`v2Radius.button = 16`, `v2Radius.tile = 16`, `v2Radius.row = 16`, text field inputs = 16px).
- **Badges:** 8px radius (`v2Radius.badge = 8`).
- **Pills & Avatars:** Full circle (`v2Radius.chip = 999`).

### Named Rules
**The 16/24 Shape Rule.** Interactive items (buttons, rows, inputs) use 16px radius; parent containers and modal sheets use 24px radius.

## Components

### Focus Card (`FocusCard.tsx`)
The centerpiece of the Trainee queue.
- **Surface:** 24px radius, white fill (`c.card.bg`), 1px hairline border (`#DEE4ED`).
- **Structure:** Pinned header with contact name and stage, scrollable body for notes/interactions, and pinned static action footer.
- **Footer Actions:** 44px buttons for "Follow up" (warm), "Log interaction", and "Advance stage".

### Bottom Action Sheets (`@gorhom/bottom-sheet`)
Gesture-dismissible sheets for fast data entry.
- **Chrome:** 24px top radius, white sheet background, 4px grab handle (`#DEE4ED`), dim semi-transparent scrim (`rgba(26, 33, 43, 0.5)`).
- **Behavior:** Interactive swipe-to-dismiss with native spring physics.

### Action Buttons
Direct and thumb-friendly.
- **Primary:** 44px height, 16px radius, solid violet background (`#5C17E5`), white text, 600 weight.
- **Warm / Due:** 44px height, 16px radius, warm amber background (`#BA5900`), white text.
- **Secondary / Row:** 44px height, 16px radius, soft grey fill (`#F6F8FB`), primary ink text.

### Category Tone Chips
Small metadata pills with colored indicator dots.
- **Structure:** Pill shape (`999px` radius), 6px 12px padding, 8px solid colored dot inside, colored band background matching tone.

### Form Text Fields
- **Style:** 16px radius, `#F6F8FB` interior fill, 1px solid border (`#DEE4ED`), 44px minimum height, 12px 16px padding.
- **Focus:** 1px solid violet border (`#5C17E5`).

## Do's and Don'ts

### Do:
- **Do** maintain a minimum touch target size of 44×44 pt for every tappable element.
- **Do** pin card and sheet action footers so only the content body scrolls (`The Non-Scrolling Card Foot Rule`).
- **Do** ensure all text colors satisfy the ink floor (`ink3` or darker).
- **Do** scale font sizes using `fs(size)` from `useV2Theme`.
- **Do** use 24px radius for outer containers and sheets, and 16px radius for buttons and inputs (`The 16/24 Shape Rule`).

### Don't:
- **Don't** add drop shadows or elevation blur to cards or sheets (cards are flat).
- **Don't** let card action buttons scroll out of the viewport.
- **Don't** use serifs or secondary fonts in mobile UI components.
- **Don't** reduce touch targets below 44pt to cram extra items onto a phone screen.
- **Don't** mix room ground colors into card interiors.
