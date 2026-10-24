/**
 * Study-reader panel-sizing guardrail (#913).
 *
 * The reported defect was that a Section panel could never come to rest: panels
 * were sized against the browser viewport (`min-h-[100dvh]`, `sm:min-h-[844px]`),
 * but the box they snap inside is the reader's scroll container — shorter than
 * the viewport by the sticky header and the sticky progress rail. Every panel
 * was therefore taller than the box it snaps in, no `start` snap position was
 * reachable, and the deck parked wherever the finger left it.
 *
 * jsdom has no layout engine, so behavioural tests cannot catch this; this
 * guardrail reads `StudyReaderView.tsx` directly the same way
 * `contactDetailPhantomScroll.test.ts` reads `src/index.css` for the #780
 * phantom-scroll invariant.
 *
 * The defensive invariants it asserts:
 *   - A Section panel is `min-h-full` — sized to the reader's scroll
 *     container, not the viewport. The viewport-sized `100dvh` / `844px`
 *     measurements must not return.
 *   - The empty-Meeting placeholder is sized the same way as a panel.
 *   - The deck does not snap (#1777). Proximity snapping was retained for the
 *     same reason this file was written — "so a Section taller than the deck
 *     can never be skipped or trapped" — and the browser disagreed: a tall
 *     panel could not be scrolled to its end. See the third test for the
 *     measurements.
 *
 * If a future change re-introduces viewport-sized panels or snapping, this
 * test fails before the change merges.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const READER_PATH = join(process.cwd(), 'src/components/bibleStudy/StudyReaderView.tsx');

describe('study-reader panel sizing guardrail (#913)', () => {
  const source = readFileSync(READER_PATH, 'utf8');

  it('sizes a Section panel to the scroll container, not the viewport', () => {
    // The panel is the element carrying `data-section-panel`; its className
    // sits on the same line or the next. It must be `min-h-full` (100% of
    // the deck) and must not carry viewport sizing.
    const lines = source.split('\n');
    const panelIdx = lines.findIndex((line) => line.includes('data-section-panel'));
    expect(panelIdx, 'panel element should exist').toBeGreaterThanOrEqual(0);
    const panelClassLine = lines
      .slice(panelIdx, panelIdx + 3)
      .find((line) => line.includes('className'));
    expect(panelClassLine, 'panel className should exist').toBeDefined();
    expect(panelClassLine!).toMatch(/min-h-full/);
    expect(panelClassLine!).not.toMatch(/100dvh|844px/);
  });

  it('sizes the empty-Meeting placeholder the same way as a panel', () => {
    // The empty-Meeting placeholder is the `reader-end` element that also
    // carries a className (the end-of-Meeting treatment inside a Panel has
    // `data-testid="reader-end"` on its own line and is not a placeholder).
    const placeholderLine = source
      .split('\n')
      .find((line) => line.includes('data-testid="reader-end"') && line.includes('className'));
    expect(placeholderLine, 'empty-Meeting placeholder should exist').toBeDefined();
    expect(placeholderLine!).toMatch(/min-h-full/);
    expect(placeholderLine!).not.toMatch(/100dvh|844px/);
  });

  it('leaves the deck unsnapped, because proximity still traps a tall Section (#1777)', () => {
    // ADR 0014 §1 asked for proximity snapping "so a Section taller than the
    // deck can never be skipped or trapped". Measured in Chromium at 375×812
    // with Section 1 at 924px in a 744px deck: eight wheel gestures of 120px
    // all returned `scrollTop` to 180 (the deepest position where the panel
    // still fills the deck), and every programmatic position from 680 to 900
    // settled at 924 — the next Section's top. The tail of a long Section was
    // unreadable, so the deck no longer snaps at all: the peek, the counter
    // and the rail carry position instead.
    const lines = source.split('\n');
    const deckIdx = lines.findIndex((line) => line.includes('data-testid="reader-deck"'));
    expect(deckIdx, 'deck element should exist').toBeGreaterThanOrEqual(0);
    const deckClassLine = lines
      .slice(deckIdx, deckIdx + 12)
      .find((line) => line.includes('className'));
    expect(deckClassLine, 'deck className should exist').toBeDefined();
    expect(deckClassLine!).not.toMatch(/snap-y|snap-mandatory|snap-proximity/);
    // Panels still fill the deck, so a short Section settles and the peek
    // stays at the bottom of the panel.
    expect(source).toMatch(/min-h-full/);
    expect(source).not.toMatch(/snap-always/);
  });
});
