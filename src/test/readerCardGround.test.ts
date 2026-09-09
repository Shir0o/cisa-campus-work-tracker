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
    expect(cardClassLine!).toMatch(/rounded-xl/);
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
    expect(promptClassLine!).toMatch(/rounded-lg/);
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
});
