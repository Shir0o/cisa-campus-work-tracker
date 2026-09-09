/**
 * Reader card-on-ground guardrail (#922).
 *
 * The reported defect: a short Section reads as a small thing marooned on a
 * large screen — content clings to the top of the panel with an empty band
 * beneath it. The fix puts the Section's content on a raised card and lets
 * the panel around it become ground, so the same emptiness reads as margin
 * around an object rather than a void. While the content fits, the card
 * settles optically in the panel (the offset shrinks continuously to zero
 * as content grows — no jump at the threshold); the peek stays outside the
 * card at the bottom of the panel; an overflowing Section keeps its card,
 * which grows and closes below its last block.
 *
 * jsdom has no layout engine, so behavioural tests cannot catch the settle
 * measurement or the theme swap; this guardrail reads the source the same
 * way `studyReaderPanelSizing.test.ts` reads `StudyReaderView.tsx` for the
 * #913 panel-sizing invariant. The DOM structure (card contains the content,
 * the peek is a sibling) is asserted behaviourally in
 * `StudyReaderView.test.tsx`.
 *
 * The defensive invariants it asserts:
 *   - The Section content sits on a card with radius, internal padding and
 *     elevation, painted with the reader-scoped card tone.
 *   - The settle mechanism exists: a panel settles while its card and peek
 *     fit the deck, and the settle margin is `mt-auto` — which distributes
 *     the slack continuously to zero as content grows, so nothing jumps at
 *     the threshold.
 *   - The reader root carries the reader-scoped surface class and paints
 *     the ground tone.
 *   - Prompt surfaces read as insets within the card (the reader well tone,
 *     radius descending from the card's per ADR 0009), not raised objects.
 *   - The theme swap: in light the ground takes the panel tone and the card
 *     takes the background tone with a layered shadow; in dark the ground
 *     takes the background tone and the card stays lighter with an edge.
 *     No new colour tokens are introduced.
 *   - The app-wide card shadow token is unchanged.
 *
 * If a future change re-introduces top-align or drops the card, this test
 * fails before the change merges.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const READER_PATH = join(process.cwd(), 'src/components/bibleStudy/StudyReaderView.tsx');
const BODY_PATH = join(process.cwd(), 'src/components/bibleStudy/SectionBody.tsx');
const CSS_PATH = join(process.cwd(), 'src/index.css');

describe('reader card-on-ground guardrail (#922)', () => {
  const reader = readFileSync(READER_PATH, 'utf8');
  const body = readFileSync(BODY_PATH, 'utf8');
  const css = readFileSync(CSS_PATH, 'utf8');

  it('sits the Section content on a card with radius, internal padding and elevation', () => {
    const lines = reader.split('\n');
    const cardIdx = lines.findIndex((line) => line.includes('data-reader-card'));
    expect(cardIdx, 'card element should exist').toBeGreaterThanOrEqual(0);
    const cardClassLine = lines
      .slice(cardIdx, cardIdx + 3)
      .find((line) => line.includes('className'));
    expect(cardClassLine, 'card className should exist').toBeDefined();
    expect(cardClassLine!).toMatch(/rounded-\[24px\]/);
    expect(cardClassLine!).toMatch(/px-\[22px\]/);
    expect(cardClassLine!).toMatch(/py-6/);
    expect(cardClassLine!).toMatch(/shadow-\[var\(--reader-elev\)\]/);
    expect(cardClassLine!).toMatch(/bg-\[var\(--reader-card\)\]/);
  });

  it('settles the card optically with a continuous offset — no jump at the threshold', () => {
    // A panel settles while its card and peek fit the deck; the settle
    // margin is `mt-auto`, which distributes the slack continuously to
    // zero as content grows.
    expect(reader).toMatch(/mt-auto/);
    expect(reader).toMatch(/offsetHeight/);
    expect(reader).toMatch(/clientHeight/);
    expect(reader).toMatch(/PANEL_TOP_PAD/);
    // The settle math subtracts the constant, so the constant must equal
    // the panel's top padding class or the threshold silently skews.
    const padLine = reader.split('\n').find((line) => line.includes('PANEL_TOP_PAD ='));
    expect(padLine, 'PANEL_TOP_PAD constant should exist').toBeDefined();
    const value = Number(padLine!.match(/= (\d+)/)?.[1]);
    expect(Number.isFinite(value)).toBe(true);
    expect(reader).toMatch(new RegExp(`pt-\\[${value}px\\]`));
  });

  it('makes the panel around the card ground, in both themes', () => {
    const rootLine = reader.split('\n').find((line) => line.includes('reader-card-surface'));
    expect(rootLine, 'reader root should carry the reader surface class').toBeDefined();
    expect(rootLine!).toMatch(/bg-\[var\(--reader-ground\)\]/);
  });

  it('renders Prompt surfaces as insets within the card, not raised objects', () => {
    const lines = body.split('\n');
    const promptIdx = lines.findIndex((line) => line.includes('data-block-kind="prompt"'));
    expect(promptIdx, 'prompt element should exist').toBeGreaterThanOrEqual(0);
    const promptClassLine = lines
      .slice(promptIdx, promptIdx + 3)
      .find((line) => line.includes('className'));
    expect(promptClassLine, 'prompt className should exist').toBeDefined();
    expect(promptClassLine!).toMatch(/bg-\[var\(--reader-well\)\]/);
    // The prompt's radius descends from the card's (24px card → 20px
    // sub-container, ADR 0009) so it reads as an inset.
    expect(promptClassLine!).toMatch(/rounded-\[20px\]/);
  });

  it('swaps the app pair in light and keeps lightness + edge in dark, with no new colour tokens', () => {
    const lightStart = css.indexOf('.reader-card-surface');
    const darkStart = css.indexOf('.dark .reader-card-surface');
    expect(lightStart, 'light reader surface block should exist').toBeGreaterThanOrEqual(0);
    expect(darkStart, 'dark reader surface block should exist').toBeGreaterThan(lightStart);
    const lightBlock = css.slice(lightStart, darkStart);
    expect(lightBlock).toMatch(/--reader-ground: var\(--panel\)/);
    expect(lightBlock).toMatch(/--reader-card: var\(--bg\)/);
    expect(lightBlock).toMatch(/--reader-elev:/);
    const darkBlock = css.slice(darkStart, css.indexOf('}', darkStart) + 1);
    expect(darkBlock).toMatch(/--reader-ground: var\(--bg\)/);
    expect(darkBlock).toMatch(/--reader-card: var\(--panel\)/);
    expect(darkBlock).toMatch(/--reader-card-edge: var\(--border\)/);
    // No new colour tokens: the reader block defines only the --reader-*
    // namespace and references existing tokens.
    expect(lightBlock).not.toMatch(/--color-/);
    expect(darkBlock).not.toMatch(/--color-/);
  });

  it('leaves the app-wide card shadow token unchanged', () => {
    // The light theme still sets --shadow-card: none — the reader's layered
    // shadow is scoped to the reader, not the app-wide token.
    expect(css).toMatch(/--shadow-card: none/);
  });

  it('reaches the light reader-card mapping inside a light scope, after the dark rule (#937)', () => {
    // #937 — the preview themes the frame independently of the app window:
    // the phone host carries the app's `light`/`dark` class inside whatever
    // theme the app window is in, so a Light island inside a Dark window
    // needs a scoped light mapping that beats `.dark .reader-card-surface`
    // (equal specificity, so it must come after the dark rule). The state
    // before #937 — an attribute and inline colours only — matched no
    // selector and rendered the Light preview in the app's own theme.
    const darkStart = css.indexOf('.dark .reader-card-surface');
    const lightScopedStart = css.indexOf('[data-theme="light"] .reader-card-surface');
    expect(darkStart, 'dark reader surface block should exist').toBeGreaterThanOrEqual(0);
    expect(lightScopedStart, 'scoped light reader surface block should exist').toBeGreaterThan(darkStart);
    const lightScopedBlock = css.slice(lightScopedStart, css.indexOf('}', lightScopedStart) + 1);
    expect(lightScopedBlock).toMatch(/--reader-ground: var\(--panel\)/);
    expect(lightScopedBlock).toMatch(/--reader-card: var\(--bg\)/);
    expect(lightScopedBlock).toMatch(/--reader-card-edge: transparent/);
    expect(lightScopedBlock).not.toMatch(/--color-/);
    // The mirror must be keyed on the host-local data-theme attribute, not
    // the `light` class: the app's theme provider puts class `light`/`dark`
    // on the document root, so a `.light .reader-card-surface` form would
    // also match under a LIGHT app window and override a Dark preview host
    // (equal specificity, later in the file).
    expect(css).not.toMatch(/^ {2}\.light \.reader-card-surface,/m);
  });

  it('lets a nested light host take the light palette inside a dark app (#937)', () => {
    // The light palette lives on `:root`, which a nested host can never
    // match — the preview's Light host is a subtree of a Dark `<html>`.
    // The block's selector also names `.light`, so the host (and the app's
    // own `<html class="light">`) both resolve the light values; no palette
    // values are duplicated anywhere.
    expect(css).toMatch(/:root,\n\s*\.light \{/);
  });

  it('rebinds the utility colour tokens on each data-theme host, after the reader mapping', () => {
    // `@theme` declares every `--color-*` token once on `:root` as
    // `var(--raw-token)`, and a custom property's var() references resolve
    // at the element where it is DECLARED — the root — so a Light island
    // inside a Dark window inherited the root-frozen DARK ink: the Light
    // preview rendered white text on the white card. The bridge redeclares
    // the tokens on the attribute-keyed host so utilities resolve from the
    // host's own palette. It must come after the scoped reader mapping so
    // the reader tokens are set first, and it must never drift back into
    // the @theme block above.
    const readerSurfaceLightEnd = css.indexOf('}', css.indexOf('[data-theme="light"] .reader-card-surface')) + 1;
    const bridgeStart = css.indexOf('[data-theme="light"],');
    expect(bridgeStart, 'data-theme colour bridge should exist').toBeGreaterThan(readerSurfaceLightEnd);
    const bridgeBlock = css.slice(bridgeStart, css.indexOf('}', bridgeStart) + 1);
    expect(bridgeBlock).toMatch(/--color-on-surface: var\(--on-surface\)/);
    expect(bridgeBlock).toMatch(/--color-on-surface-variant: var\(--on-surface-variant\)/);
    expect(bridgeBlock).toMatch(/--color-background: var\(--background\)/);
    expect(bridgeBlock).toMatch(/--color-outline-variant: var\(--outline-variant\)/);
  });
});
