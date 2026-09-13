/**
 * Border radius ladder is declared once, in @theme -- ADR 0009 / issue #983.
 *
 * ADR 0009 settled a monotonic radius ladder on @theme:
 *
 *     10 (sm) < 12 (md) < 14 (base) < 20 (lg) < 24 (xl) < 32 (2xl) < 40 (3xl)
 *
 * and a strict nesting hierarchy: shell 32, card/modal 24, sub-container 20,
 * nested panel 14, control 10, pill round. That shape contract only holds
 * while @theme is the single source of those values.
 *
 * It was not. The light palette block (:root, .light) re-declared
 * --radius-lg: 24px and --radius-xl: 32px -- the pre-ADR Ink values -- and
 * because that block lives in @layer base while @theme emits into the earlier
 * theme layer, the base declarations won. In light --radius-xl and
 * --radius-2xl both resolved to 32px (rounded-xl equaled rounded-2xl), the
 * nesting hierarchy collapsed, and the same component rendered 32px in light
 * but 24px in dark.
 *
 * This guardrail reads src/index.css as text, in the style of
 * accentToken.test.ts, so it does not depend on jsdom resolving custom
 * properties. It asserts three things:
 *
 *   1. @theme carries the ADR 0009 values.
 *   2. The ladder ascends strictly across sm, md, base, lg, xl, 2xl, 3xl.
 *   3. No theme block (:root/.light or .dark) re-declares a radius token.
 *
 * Failures name the offending token, the block, and both values. Component
 * radii are deliberately NOT asserted here -- those are implementation
 * details that change with the design, and are covered by
 * borderRadiusScale.test.ts and prayerComposerRadius.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface ThemeBlock {
  selector: string;
  declarations: Record<string, string>;
}

/** ADR 0009's ladder, in ascending order. */
const ADR_LADDER = [
  { token: '--radius-sm', px: 10 },
  { token: '--radius-md', px: 12 },
  { token: '--radius', px: 14 },
  { token: '--radius-lg', px: 20 },
  { token: '--radius-xl', px: 24 },
  { token: '--radius-2xl', px: 32 },
  { token: '--radius-3xl', px: 40 },
] as const;

/**
 * Selectors whose blocks carry a theme palette. The light block's selector is
 * the list ":root, .light", so a selector may be followed by a comma rather
 * than a brace; blockBody then takes the next brace group.
 */
const THEME_SELECTORS = [':root', '.dark'] as const;

function readIndexCss(): string {
  return readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/** Remove block comments. */
function stripComments(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const start = css.indexOf('/*', i);
    if (start === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, start);
    const end = css.indexOf('*/', start + 2);
    if (end === -1) break;
    i = end + 2;
  }
  return out;
}

/** Body of the brace block whose opening brace is at or after from. */
function blockBody(css: string, from: number): string {
  const open = css.indexOf('{', from);
  if (open === -1) return '';
  let depth = 1;
  let i = open + 1;
  while (i < css.length && depth > 0) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return css.slice(open + 1, i - 1);
}

function parseDeclarations(body: string): Record<string, string> {
  const decls: Record<string, string> = {};
  for (const fragment of body.split(';')) {
    const colon = fragment.indexOf(':');
    if (colon === -1) continue;
    const name = fragment.slice(0, colon).trim();
    if (name.startsWith('--')) {
      decls[name] = fragment.slice(colon + 1).trim();
    }
  }
  return decls;
}

/** Custom-property declarations of the @theme block. */
function themeDeclarations(css: string): Record<string, string> {
  const at = css.indexOf('@theme');
  return at === -1 ? {} : parseDeclarations(blockBody(css, at));
}

/** Resolved px value of a radius token in @theme, or null if absent. */
function themeRadius(css: string, token: string): number | null {
  const raw = themeDeclarations(css)[token];
  if (raw === undefined) return null;
  const px = parseInt(raw, 10);
  return Number.isNaN(px) ? null : px;
}

/**
 * Find each theme-palette block by selector. We only start a block when the
 * selector stands alone: ".dark .reader-card-surface" does not match, because
 * a dot follows the selector rather than whitespace then a brace or comma.
 */
function extractThemeBlocks(css: string): ThemeBlock[] {
  const blocks: ThemeBlock[] = [];
  for (const selector of THEME_SELECTORS) {
    let from = 0;
    while (from <= css.length - selector.length) {
      const at = css.indexOf(selector, from);
      if (at === -1) break;
      let j = at + selector.length;
      while (j < css.length && isSpace(css[j])) j++;
      const next = css[j];
      if (next === '{' || next === ',') {
        blocks.push({
          selector,
          declarations: parseDeclarations(blockBody(css, at)),
        });
      }
      from = at + selector.length;
    }
  }
  return blocks;
}

describe('radius ladder -- @theme is the single source (ADR 0009, #983)', () => {
  const css = stripComments(readIndexCss());

  it('declares the ADR 0009 values in @theme', () => {
    for (const { token, px } of ADR_LADDER) {
      const actual = themeRadius(css, token);
      const found = actual === null ? 'nothing' : actual + 'px';
      expect(
        actual,
        '@theme must declare ' + token + ': ' + px + 'px (found ' + found + ')',
      ).toBe(px);
    }
  });

  it('ascends strictly across sm, md, base, lg, xl, 2xl, 3xl', () => {
    for (let i = 1; i < ADR_LADDER.length; i++) {
      const prev = ADR_LADDER[i - 1];
      const next = ADR_LADDER[i];
      const prevPx = themeRadius(css, prev.token);
      const nextPx = themeRadius(css, next.token);
      expect(prevPx, prev.token + ' must be declared in @theme').not.toBeNull();
      expect(nextPx, next.token + ' must be declared in @theme').not.toBeNull();
      expect(
        nextPx as number,
        next.token + ' (' + nextPx + 'px) must exceed ' + prev.token + ' (' + prevPx + 'px)',
      ).toBeGreaterThan(prevPx as number);
    }
  });

  it('does not let a theme block re-declare a radius token', () => {
    const blocks = extractThemeBlocks(css);
    const selectors = blocks.map((b) => b.selector);
    expect(
      selectors,
      'both the light (:root) and dark (.dark) theme blocks must be found',
    ).toEqual(expect.arrayContaining([...THEME_SELECTORS]));

    const offenders: string[] = [];
    for (const { selector, declarations } of blocks) {
      for (const [name, value] of Object.entries(declarations)) {
        if (name.startsWith('--radius')) {
          const ladder = themeRadius(css, name);
          const conflict =
            ladder === null
              ? '@theme declares no ' + name
              : '@theme declares ' + ladder + 'px';
          offenders.push(
            selector + ' re-declares ' + name + ': ' + value + ' (' + conflict + ')',
          );
        }
      }
    }

    expect(
      offenders,
      offenders.length
        ? 'Theme blocks must not re-declare radius tokens: ' + offenders.join('; ')
        : 'no theme block re-declares a radius token',
    ).toEqual([]);
  });
});
