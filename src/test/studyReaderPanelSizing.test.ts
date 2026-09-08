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
 *   - Proximity snapping is retained: the deck keeps `snap-proximity` (ADR
 *     0014 §1 — proximity, not mandatory, so a Section taller than the deck
 *     can never be skipped or trapped), and the `snap-mandatory` utility
 *     must not be introduced on the deck.
 *
 * If a future change re-introduces viewport-sized panels, this test fails
 * before the change merges.
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

  it('retains proximity snapping on the deck and never applies snap-mandatory', () => {
    // ADR 0014 §1: proximity, not mandatory — mandatory snapping can skip or
    // trap on a Section taller than the deck. The deck's className is the
    // contract; the `snap-mandatory` utility must not be applied to it.
    expect(source).toMatch(/snap-proximity/);
    expect(source).not.toMatch(/snap-mandatory/);
  });
});
