/**
 * Stage tones clear WCAG AA at 11px — #1784.
 *
 * The Journey's stage chips, a tag chip in its own tone, the dashboard's stage
 * pills and `KindChip` all draw **11px ink on the same hue at 14%** over the
 * page. It is the smallest text in the product and the easiest to under-set:
 * at the pre-#1784 light values the teal chip measured 3.20:1 on `--surface`,
 * and all eight tones failed on white.
 *
 * This guardrail reads the three `--tone-*` scalars out of both theme blocks in
 * `src/index.css`, derives the eight hue angles from the `--t-*` declarations,
 * and recomputes every ink-on-wash ratio at the four backgrounds the chips
 * actually sit on. A future "make the chips softer" pass cannot quietly undo
 * it.
 *
 * Two colour details are modelled rather than assumed:
 *
 *  - CSS composites `color / alpha` in **gamma-encoded sRGB**, not in linear
 *    light. Mixing the wash in linear space makes a light-on-dark chip look
 *    much lower-contrast than the browser draws it.
 *  - An `oklch()` outside sRGB has two renderings: Chrome clamps each RGB
 *    channel, the CSS Color 4 algorithm reduces chroma while holding lightness.
 *    The tokens must clear AA under both, so both are measured and the worse
 *    one counts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The eight stage tones, in the order the product presents them. */
const TONES = ['slate', 'clay', 'ochre', 'sage', 'teal', 'indigo', 'plum', 'rose'] as const;

const THEMES = [
  { name: 'light', selector: ':root', backgrounds: ['#FFFFFF', '#F4F4F5'] },
  { name: 'dark', selector: '.dark', backgrounds: ['#0A0A0B', '#161618'] },
] as const;

/** WCAG 2.1 AA for normal-size text. The chips are 11px. */
const AA_NORMAL_TEXT = 4.5;

/** A tone that drifts under this channel spread has been neutralised, not fixed. */
const MIN_CHROMA_SPREAD = 0.25;

interface ToneScale {
  l: number;
  c: number;
  a: number;
  hues: Record<string, number>;
}

// --- src/index.css, as text -------------------------------------------------

function readIndexCss(): string {
  return readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Declarations of every rule body introduced by `selector` (optionally in a list). */
function blocksFor(css: string, selector: string): Record<string, string>[] {
  const re = new RegExp(`${escapeForRegex(selector)}\\s*(?:,[^{]*)?\\{`, 'g');
  const blocks: Record<string, string>[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    const open = match.index + match[0].length - 1;
    let depth = 1;
    let i = open + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    const declarations: Record<string, string> = {};
    for (const fragment of css.slice(open + 1, i - 1).split(';')) {
      const colon = fragment.indexOf(':');
      if (colon === -1) continue;
      const name = fragment.slice(0, colon).trim();
      if (name.startsWith('--')) declarations[name] = fragment.slice(colon + 1).trim();
    }
    blocks.push(declarations);
  }
  return blocks;
}

function readToneScale(css: string, selector: string): ToneScale {
  const body = blocksFor(css.replace(/\/\*[\s\S]*?\*\//g, ''), selector).find(
    (declarations) => '--tone-l' in declarations,
  );
  if (!body) throw new Error(`no --tone-l found under ${selector}`);

  const hues: Record<string, number> = {};
  for (const tone of TONES) {
    // `oklch(var(--tone-l) var(--tone-c) 258)` — the hue is the last token.
    const value = body[`--t-${tone}`];
    if (!value) throw new Error(`--t-${tone} missing under ${selector}`);
    const hue = Number(value.replace(/^oklch\(/, '').replace(/\)$/, '').trim().split(/\s+/).pop());
    if (!Number.isFinite(hue)) throw new Error(`--t-${tone} has no hue: ${value}`);
    hues[tone] = hue;
  }

  return {
    l: Number(body['--tone-l']),
    c: Number(body['--tone-c']),
    a: Number(body['--tone-a']),
    hues,
  };
}

// --- colour ----------------------------------------------------------------

const IN_SRGB = 1e-4;

const linearToSrgb = (v: number): number =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;

/** OKLCH → linear sRGB, unclipped. */
function oklchToLinear(l: number, c: number, hueDeg: number): [number, number, number] {
  const h = (hueDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const lc = l + 0.3963377774 * a + 0.2158037573 * b;
  const mc = l - 0.1055613458 * a - 0.0638541728 * b;
  const sc = l - 0.0894841775 * a - 1.291485548 * b;
  const L = lc ** 3;
  const M = mc ** 3;
  const S = sc ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

const inSrgb = (rgb: number[]): boolean =>
  rgb.every((v) => v >= -IN_SRGB && v <= 1 + IN_SRGB);

/**
 * An `oklch()` as the renderer draws it, back in gamma-encoded sRGB.
 * `clip` is Chrome (clamp channels); `reduce` is the CSS Color 4 gamut map
 * (bisect chroma until the colour is representable).
 */
function renderOkLch(l: number, c: number, hue: number, mode: 'clip' | 'reduce'): number[] {
  let linear = oklchToLinear(l, c, hue);
  if (!inSrgb(linear) && mode === 'reduce') {
    let low = 0;
    let high = c;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (inSrgb(oklchToLinear(l, mid, hue))) low = mid;
      else high = mid;
    }
    linear = oklchToLinear(l, low, hue);
  }
  return linear.map((v) => linearToSrgb(Math.min(1, Math.max(0, v))));
}

function hexToSrgb(hex: string): number[] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const toLinear = (v: number): number =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

function relativeLuminance(srgb: number[]): number {
  const [r, g, b] = srgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: number[], background: number[]): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Ink over its own `color / alpha` wash, composited the way CSS does. */
function inkOnWash(
  scale: ToneScale,
  hue: number,
  backgroundHex: string,
  mode: 'clip' | 'reduce',
): number {
  const background = hexToSrgb(backgroundHex);
  const ink = renderOkLch(scale.l, scale.c, hue, mode);
  const wash = ink.map((channel, i) => scale.a * channel + (1 - scale.a) * background[i]);
  return contrast(ink, wash);
}

// --- the guardrail ----------------------------------------------------------

const css = readIndexCss();

describe('stage tone chips (#1784)', () => {
  for (const theme of THEMES) {
    it(`clears AA at 11px on every tone in ${theme.name}`, () => {
      const scale = readToneScale(css, theme.selector);
      expect(Object.keys(scale.hues)).toHaveLength(TONES.length);

      const failures: string[] = [];
      for (const tone of TONES) {
        for (const background of theme.backgrounds) {
          for (const mode of ['clip', 'reduce'] as const) {
            const ratio = inkOnWash(scale, scale.hues[tone], background, mode);
            if (ratio < AA_NORMAL_TEXT) {
              failures.push(
                `${tone} on ${background} (${mode}): ${ratio.toFixed(2)}:1 < ${AA_NORMAL_TEXT}:1`,
              );
            }
          }
        }
      }

      expect(failures).toEqual([]);
    });
  }

  it('keeps all eight tones chromatic and distinct', () => {
    for (const theme of THEMES) {
      const scale = readToneScale(css, theme.selector);
      expect(new Set(Object.values(scale.hues)).size).toBe(TONES.length);

      for (const tone of TONES) {
        for (const mode of ['clip', 'reduce'] as const) {
          const ink = renderOkLch(scale.l, scale.c, scale.hues[tone], mode);
          const spread = Math.max(...ink) - Math.min(...ink);
          expect(
            spread,
            `${tone} (${theme.name}, ${mode}) is too close to neutral to read as its hue`,
          ).toBeGreaterThanOrEqual(MIN_CHROMA_SPREAD);
        }
      }
    }
  });
});
