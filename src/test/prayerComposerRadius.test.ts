/**
 * Prayer compose-box radius invariant — issue #705.
 *
 * `@theme` in `src/index.css` re-values `--radius-xl` to 32px (Tailwind ships
 * that step at 12px), so every `rounded-xl` in the app asks for 32px. The
 * prayer compose boxes hold short controls: the testimony textarea is 62px
 * tall (`rows={2}` × 20px line + `p-2.5` + border) and the photo dropzone is
 * 38px. When two radii on one side exceed that side's length CSS scales both
 * down, so a 32px ask on a 38px box lands at 19px — exactly half the height —
 * and the control renders as a lozenge rather than a rounded rectangle. That
 * is what #705 reported as "too round".
 *
 * jsdom has no layout engine, so no behavioural test can observe the clamp.
 * This guardrail reads the sources directly, in the style of
 * `accentToken.test.ts`, and asserts the shape contract the design canvas in
 * `docs/design/prayer-composer/` settled on:
 *
 *     card 24px  →  compose panel 14px  →  controls 10px
 *
 * Deliberately NOT covered: the answered-testimony *display* box, the edit
 * textarea, and the other 280-odd `rounded-xl` call sites. Re-basing those is
 * a separate decision — see the canvas README.
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
/** The photo dropzone — the shortest box in the set, at 38px. */
const DROPZONE_CLASS = /className="([^"]*py-2\.5 [^"]*border-dashed[^"]*)"/g;

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

    expect(panels.length).toBeGreaterThan(0);
    for (const panel of panels) {
      expect(panel).toContain(PANEL_RADIUS);
      expect(panel).not.toMatch(/\brounded-(xl|2xl|3xl|lg|full)\b/);
    }
  });

  it('puts every compose textarea on the small-mark radius', () => {
    const textareas = allClassesMatching(TEXTAREA_CLASS);

    expect(textareas.length).toBeGreaterThan(0);
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

  it('keeps the small-mark radius short enough that the 38px dropzone cannot clamp', () => {
    // CSS scales both radii on a side down once their sum exceeds the side.
    // The dropzone is the shortest control in the set at 38px, so anything
    // from 19px up renders as a stadium there however square it looks in the
    // taller textarea.
    expect(themeRadius('--radius-sm')).toBeLessThan(19);
  });

  it('keeps the panel rounder than the controls it holds', () => {
    // The nest has to descend — card 24 → panel 14 → controls 10. It used to
    // invert: a 16px panel holding two children clamped to 31px.
    expect(themeRadius('--radius-sm')).toBeLessThan(themeRadius('--radius'));
  });
});
