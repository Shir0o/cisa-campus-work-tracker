/**
 * Editor preview pane guardrail (#916).
 *
 * The reported defect: the preview pane scrolled, which pushed the reader's
 * sticky header and progress rail out of sight — the two pieces of chrome the
 * preview exists to let the author check. The fix stops the pane scrolling:
 * the phone takes the height genuinely available and the Present mode panel
 * sits beneath it as a row; the only scroller in the preview is the reader's
 * own deck.
 *
 * jsdom has no layout engine, so behavioural tests cannot catch a pane that
 * scrolls again; this guardrail reads `BibleStudyEditor.tsx` directly the
 * same way `studyReaderPanelSizing.test.ts` reads `StudyReaderView.tsx` for
 * the #913 panel-sizing invariant.
 *
 * The defensive invariants it asserts:
 *   - The right preview pane never scrolls: its container carries
 *     `overflow-hidden` and no `overflow-y-auto` / `overflow-y-scroll`.
 *   - The fixed `scale(0.86)` constant is gone — the scale is measured from
 *     the pane, so a hard-coded scale must not return.
 *   - The Present card is a pinned SIBLING of the preview scroller, never a
 *     child of it: it must not be reachable only by scrolling the phone.
 *   - The phone frame clips with `overflow: clip`, not `overflow: hidden` —
 *     an overflow-hidden frame is programmatically scrollable, and the
 *     reader's caret-follow jump scrolled it, sliding the phone up under
 *     its bezel and slicing the sticky header (title / count / type size)
 *     off at the top.
 *   - The scale is fed BOTH pane dimensions, so the phone shrinks to stay
 *     whole instead of overflowing the pane into a scrolling column.
 *
 * If a future change re-introduces pane scrolling, a fixed scale, a Present
 * card inside the scroller, a hidden (scrollable) frame, or width-only
 * scaling, this test fails before the change merges.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const EDITOR_PATH = join(process.cwd(), 'src/views/BibleStudyEditor.tsx');

/** Index just past the JSX element that opens with `data-testid` marker. */
function closeIndexAfter(source: string, openMarker: string): number {
  const open = source.indexOf(openMarker);
  expect(open, `${openMarker} should exist`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let i = source.indexOf('>', open);
  for (; i < source.length; ) {
    const lt = source.indexOf('<', i);
    if (lt === -1) break;
    const rest = source.slice(lt, lt + 8);
    const tagEnd = source.indexOf('>', lt);
    if (tagEnd === -1) break;
    const selfClosing = source[tagEnd - 1] === '/';
    if (rest.startsWith('<div') && !selfClosing) depth += 1;
    else if (rest.startsWith('</div')) depth -= 1;
    i = tagEnd + 1;
    if (depth === 0) return i;
  }
  return -1;
}

describe('editor preview pane guardrail (#916)', () => {
  const source = readFileSync(EDITOR_PATH, 'utf8');

  it('never scrolls the preview pane — the phone takes the available height', () => {
    // The right pane is the container that holds "Live Preview" and the
    // Present mode panel. It must clip (`overflow-hidden`) and must not
    // scroll on either axis.
    const paneLine = source
      .split('\n')
      .find((line) => line.includes('Right Pane: Live Phone Preview'));
    expect(paneLine, 'right pane container should exist').toBeDefined();
    const paneClassLine = source
      .split('\n')
      .slice(source.split('\n').findIndex((l) => l.includes('Right Pane: Live Phone Preview')))
      .find((line) => line.includes('className'));
    expect(paneClassLine, 'right pane className should exist').toBeDefined();
    expect(paneClassLine!).toMatch(/overflow-hidden/);
    expect(paneClassLine!).not.toMatch(/overflow-y-auto|overflow-y-scroll/);
  });

  it('measures the scale from the pane — the fixed 0.86 constant must not return', () => {
    expect(source).not.toMatch(/scale\(0\.86\)/);
    expect(source).toMatch(/ResizeObserver/);
  });

  it('feeds both pane dimensions into the scale, so the phone stays whole', () => {
    expect(source).toMatch(/previewScale\(paneSize\?\.width \?\? 0, paneSize\?\.height \?\? 0\)/);
  });

  it('keeps the Present card OUTSIDE the preview scroller as a pinned sibling', () => {
    const scrollerClose = closeIndexAfter(source, 'data-testid="preview-scroll"');
    expect(scrollerClose, 'preview scroller should close').toBeGreaterThan(0);
    const present = source.indexOf('data-testid="present-card"');
    expect(present, 'Present card should exist').toBeGreaterThan(0);
    expect(present, 'Present card must not be nested inside the preview scroller').toBeGreaterThan(scrollerClose);
    // The Present card itself must not scroll: it carries no overflow-y.
    const lines = source.split('\n');
    const presentIdx = lines.findIndex((line) => line.includes('data-testid="present-card"'));
    const presentCardLine = lines.slice(presentIdx, presentIdx + 8).find((line) => line.includes('className'));
    expect(presentCardLine).toMatch(/mt-4/);
    // #946: and it must not share the preview pane's ground, or a separate,
    // differently-purposed card reads as the preview's bottom strip.
    expect(presentCardLine).toMatch(/bg-surface-variant/);
  });

  it('leaves the preview box no way to scroll at all — clip, not hidden (#946)', () => {
    // previewScale fits both axes on FLOORED pane dimensions, so the box can
    // never need to scroll, and the old 0.5 legibility floor (which guaranteed
    // an oversized frame below a 422px pane) is gone.
    //
    // `hidden` is NOT sufficient, and this assertion exists to say so: an
    // overflow-hidden box is still programmatically scrollable — verified in a
    // real browser, scrollTop moved it 122px — and the reader's caret-follow
    // scrollIntoView scrolls every scrollable ancestor. That is the #939 bug
    // one level out from the frame. `clip` paints the same and cannot be
    // scrolled by scrollTop or scrollIntoView.
    const lines = source.split('\n');
    const idx = lines.findIndex((line) => line.includes('data-testid="preview-scroll"'));
    expect(idx, 'preview box should exist').toBeGreaterThanOrEqual(0);
    const classLine = lines.slice(idx, idx + 22).find((line) => line.includes('className'));
    expect(classLine, 'preview box className should exist').toBeDefined();
    expect(classLine!).toMatch(/overflow-clip/);
    expect(classLine!).not.toMatch(/overflow-hidden|overflow-y-auto|overflow-y-scroll/);
  });

  it('floors the frame\'s pixel box, so an exact fit cannot round into an overflow (#946)', () => {
    expect(source).toMatch(/Math\.floor\(PREVIEW_PHONE_WIDTH \* scale\)/);
    expect(source).toMatch(/Math\.floor\(PREVIEW_PHONE_HEIGHT \* scale\)/);
  });

  it('clips the phone frame with overflow: clip, never overflow: hidden', () => {
    const lines = source.split('\n');
    const frameIdx = lines.findIndex((line) => line.includes('data-testid="preview-frame"'));
    expect(frameIdx, 'preview frame should exist').toBeGreaterThanOrEqual(0);
    const frameClassLine = lines.slice(frameIdx, frameIdx + 8).find((line) => line.includes('className'));
    expect(frameClassLine, 'preview frame className should exist').toBeDefined();
    expect(frameClassLine!).toMatch(/overflow-clip/);
    expect(frameClassLine!).not.toMatch(/overflow-hidden/);
  });
});
