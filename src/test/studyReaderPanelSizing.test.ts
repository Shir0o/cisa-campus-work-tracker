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
const ROUTE_PATH = join(process.cwd(), 'src/views/BibleStudyRead.tsx');

describe('study-reader panel sizing guardrail (#913)', () => {
  const source = readFileSync(READER_PATH, 'utf8');
  const route = readFileSync(ROUTE_PATH, 'utf8');

  it('sizes a Section panel to the scroll container, not the viewport', () => {
    // The panel is the element carrying `data-section-panel`; its className
    // sits on the same line or the next. It must be `min-h-full` (100% of
    // the deck) and must not carry viewport sizing.
    const lines = source.split('\n');
    const panelIdx = lines.findIndex((line) => line.includes('data-section-panel'));
    expect(panelIdx, 'panel element should exist').toBeGreaterThanOrEqual(0);
    const panelClassLine = lines
      .slice(panelIdx, panelIdx + 10)
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

  it('gives the reader a definite height inside the shell’s scrolling <main> (#1770)', () => {
    // The shell's <main> is a *block* that scrolls the page, so the route's
    // `flex-1` wrapper was inert and the reader's `h-full` resolved against
    // 3,031px of content instead of the 611px the pane can show. Measured at
    // 375×812: the deck's clientHeight equalled its scrollHeight (3,031), it
    // never scrolled, the page's own pane scrolled instead, and every piece of
    // reader chrome sat at content coordinates — the counter read 02/04 over
    // Section 1, the progress rail was 2,327px below the fold, the Section
    // index grip was 1,448px down, and the "sticky" header was 1,143px above
    // the viewport after one screen of scrolling. With a claimed height the
    // deck is 539px and scrolls, the rail sits at 647, the grip at 303, and
    // the counter follows 01 → 04.
    const readerIdx = route.split('\n').findIndex((line) => line.includes('<StudyReaderView'));
    expect(readerIdx, 'the route should render StudyReaderView').toBeGreaterThanOrEqual(0);
    // The wrapper immediately above the reader's own `w-full h-full` box. It
    // has to be `h-full` (the pane's 611px) and never `flex-1` (inert, because
    // the shell's <main> is display:block).
    expect(route).toMatch(/<div className="h-full min-h-0 flex">/);
    expect(route).not.toMatch(/<div className="flex-1 min-h-0 flex">/);
  });

  it('keeps a readable measure on a 375px phone (#1770)', () => {
    // Measured at 375×812 at the 20px default: the 24px panel padding plus the
    // 22px card inset spent 92px of the 375 on margins and left a 270px column
    // — 26 characters on the rendered first line and 24 in the 23px Passage.
    // On the scrolling (phone) deck the insets are now 12 + 16: a 340px card
    // and a 306px column, 34 characters on the first line.
    const lines = source.split('\n');
    const panelIdx = lines.findIndex((line) => line.includes('data-section-panel'));
    const panelClassLine = lines.slice(panelIdx, panelIdx + 10).find((line) => line.includes('className'))!;
    expect(panelClassLine).toMatch(/\bpx-3\b/);
    expect(panelClassLine).not.toMatch(/\bpx-6\b/);

    const cardIdx = lines.findIndex((line) => line.includes('data-reader-card'));
    const cardClassLine = lines.slice(cardIdx, cardIdx + 6).find((line) => line.includes('className'))!;
    expect(cardClassLine).toMatch(/\bpx-4\b/);
    expect(cardClassLine).not.toMatch(/px-\[22px\]/);
  });
});
