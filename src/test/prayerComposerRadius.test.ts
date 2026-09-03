/**
 * Prayer compose-box radius invariant — issue #705.
 *
 * `@theme` in `src/index.css` re-values `--radius-xl` to 32px (Tailwind ships
 * that step at 12px), so every `rounded-xl` in the app asks for 32px. The
 * prayer compose boxes hold short controls, and not all at one height: the
 * desktop textarea is 62px (`rows={2}` × 20px line + `p-2.5` + border), the
 * mobile one 54px (`text-xs`, so a 16px line) and the photo dropzone 38px.
 * When two radii on one side exceed that side's length CSS scales both down,
 * so a 32px ask lands at 31 / 27 / 19px respectively — exactly half of each
 * box — and every one of them paints a lozenge rather than a rounded
 * rectangle. That is what #705 reported as "too round".
 *
 * jsdom has no layout engine, so no behavioural test can observe the clamp.
 * This guardrail reads the sources directly, in the style of
 * `accentToken.test.ts`, and asserts the shape contract the design canvas in
 * `docs/design/prayer-composer/` settled on:
 *
 *     card 24px  →  compose panel 14px  →  controls 10px
 *
 * The counts are pinned rather than merely non-zero: if a compose box is added,
 * removed, or has its `bg-surface-variant/30` marker renamed, this test should
 * fail and be read, not silently guard fewer sites than it claims to.
 *
 * Deliberately NOT covered: the display and compose *panels* other than these,
 * the edit textarea, and the remaining `rounded-xl` call sites. Re-basing those
 * is a separate decision — see the canvas README.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Files carrying a prayer compose box. */
const COMPOSER_FILES = [
  join('src', 'views', 'PrayerList.tsx'),
  join('src', 'views', 'PrayerListMobile.tsx'),
  join('src', 'components', 'landing', 'PrayerRows.tsx'),
] as const;

/** Ink's interactive step, `--radius`. The compose panel sits here. */
const PANEL_RADIUS = 'rounded-[14px]';
/** Ink's small-mark step, `--radius-sm`. Every control inside sits here. */
const CONTROL_RADIUS = 'rounded-sm';

/** Every compose panel: `p-3 bg-surface-variant/30` with a border. */
const PANEL_CLASS = /className="([^"]*bg-surface-variant\/30[^"]*)"/g;
/** Every compose textarea: `w-full p-2.5 … bg-surface`. */
const TEXTAREA_CLASS = /className="(w-full p-2\.5 [^"]*bg-surface [^"]*)"/g;
/** The photo dropzone — the shortest box in the set. */
const DROPZONE_CLASS = /className="([^"]*py-2\.5 [^"]*border-dashed[^"]*)"/g;
/** Every 64px answer thumbnail, in the composer and in the display box alike. */
const THUMBNAIL_CLASS = /className="(w-16 h-16 [^"]*)"/g;

/** Compose boxes: testimony + archive-reason, on desktop, mobile and landing. */
const COMPOSE_BOX_COUNT = 7;
/** Height in px of the shortest control in the set, the photo dropzone. */
const DROPZONE_HEIGHT = 38;

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

function classesMatching(pattern: RegExp, source: string): string[] {
  return [...source.matchAll(new RegExp(pattern.source, 'g'))].map((m) => m[1]);
}

function allClassesMatching(pattern: RegExp): string[] {
  return COMPOSER_FILES.flatMap((file) => classesMatching(pattern, read(file)));
}

/** Resolved px value of a custom property declared in the `@theme` block. */
function themeRadius(token: string): number {
  const css = read(join('src', 'index.css'));
  const theme = css.slice(css.indexOf('@theme'), css.indexOf('@layer'));
  const match = new RegExp(`${token}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(theme);
  if (!match) throw new Error(`${token} is not declared in @theme`);
  return Number(match[1]);
}

describe('prayer compose boxes — radius (#705)', () => {
  it('puts every compose panel on the interactive radius', () => {
    const panels = allClassesMatching(PANEL_CLASS);

    expect(panels).toHaveLength(COMPOSE_BOX_COUNT);
    for (const panel of panels) {
      expect(panel).toContain(PANEL_RADIUS);
      expect(panel).not.toMatch(/\brounded-(xl|2xl|3xl|lg|full)\b/);
    }
  });

  it('puts every compose textarea on the small-mark radius', () => {
    const textareas = allClassesMatching(TEXTAREA_CLASS);

    expect(textareas).toHaveLength(COMPOSE_BOX_COUNT);
    for (const textarea of textareas) {
      expect(textarea).toContain(CONTROL_RADIUS);
      expect(textarea).not.toMatch(/\brounded-(xl|2xl|3xl|lg|full)\b/);
    }
  });

  it('puts the photo dropzone on the small-mark radius', () => {
    const dropzones = allClassesMatching(DROPZONE_CLASS);

    expect(dropzones.length).toBeGreaterThan(0);
    for (const dropzone of dropzones) {
      expect(dropzone).toContain(CONTROL_RADIUS);
      expect(dropzone).not.toMatch(/\brounded-(xl|2xl|3xl|lg|full)\b/);
    }
  });

  it('gives every 64px answer thumbnail one shape', () => {
    // These never clamp — a 24px radius on a 64px square is legal. They move
    // because the same thumbnail renders in the compose box and in the
    // answered-testimony display box directly above it, and one control
    // wearing two shapes in one row is the thing this change is fixing.
    const thumbnails = allClassesMatching(THUMBNAIL_CLASS);

    expect(thumbnails.length).toBeGreaterThan(0);
    for (const thumbnail of thumbnails) {
      expect(thumbnail).toContain(CONTROL_RADIUS);
    }
  });

  it('keeps the small-mark radius short enough that the shortest control cannot clamp', () => {
    // CSS scales both radii on a side down once their sum exceeds the side, so
    // any radius at or above half a box's height renders it as a stadium. The
    // dropzone is the shortest control in the set, so it sets the ceiling for
    // all of them — this is why the answer is 10 and not 14.
    expect(themeRadius('--radius-sm')).toBeLessThan(DROPZONE_HEIGHT / 2);
  });

  it('keeps the panel rounder than the controls it holds', () => {
    // The nest has to descend — card 24 → panel 14 → controls 10. It used to
    // invert: a 16px panel holding two children clamped to 31px.
    expect(themeRadius('--radius-sm')).toBeLessThan(themeRadius('--radius'));
  });
});
