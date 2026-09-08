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
 *
 * If a future change re-introduces pane scrolling or a fixed scale, this
 * test fails before the change merges.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const EDITOR_PATH = join(process.cwd(), 'src/views/BibleStudyEditor.tsx');

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
});
