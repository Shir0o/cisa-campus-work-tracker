import { describe, it, expect } from 'vitest';
import { scrollTargetAfterEdit, restoreScrollAfterEdit } from '../lib/editorScroll';

// #917 — a toolbar click must not throw the author back to the top. The
// scroll decision is pure: given the caret line's [top, bottom] within the
// textarea's scrollable content, the offset captured before the value
// changed, and the visible height, it returns the offset to scroll to. The
// caret line is visible at the captured offset → restore it exactly; the
// caret sits above the captured viewport → scroll it to the top; below →
// scroll it to the bottom. (The mirror-div measurement that produces the
// caret geometry is browser territory — jsdom has no layout, so it reports
// a scroll offset of zero and cannot prove this.)
describe('scrollTargetAfterEdit', () => {
  it('restores the captured offset when the caret line is visible there', () => {
    // Viewport at offset 100 spans [100, 600]; the caret line [400, 420]
    // sits inside it.
    expect(scrollTargetAfterEdit(400, 420, 100, 500)).toBe(100);
  });

  it('restores the captured offset when the caret line touches the viewport edges', () => {
    // The line [100, 600] exactly fills the viewport [100, 600].
    expect(scrollTargetAfterEdit(100, 600, 100, 500)).toBe(100);
  });

  it('scrolls the caret to the top when it sits above the captured viewport', () => {
    expect(scrollTargetAfterEdit(50, 70, 100, 500)).toBe(50);
  });

  it('clamps the upward scroll at the top of the document', () => {
    expect(scrollTargetAfterEdit(-10, 10, 100, 500)).toBe(0);
  });

  it('scrolls the caret to the bottom when it sits below the captured viewport', () => {
    // Caret line [700, 720]; scrolling to 220 puts its bottom at the
    // viewport's bottom edge (220 + 500 = 720).
    expect(scrollTargetAfterEdit(700, 720, 100, 500)).toBe(220);
  });

  it('scrolls a caret line straddling the bottom edge fully into view', () => {
    // Line [580, 620] pokes past the viewport bottom (600); scrolling to
    // 120 brings its bottom to the edge.
    expect(scrollTargetAfterEdit(580, 620, 100, 500)).toBe(120);
  });

  it('restores the captured offset when the caret geometry is unmeasurable', () => {
    // jsdom has no layout: the mirror div measures zero height, so the
    // restore must fall back to the captured offset rather than invent a
    // position. This is the jsdom path — the browser supplies the truth.
    const el = document.createElement('textarea');
    el.value = 'line one\nline two';
    el.scrollTop = 42;
    restoreScrollAfterEdit(el, 42, 5);
    expect(el.scrollTop).toBe(42);
  });
});
