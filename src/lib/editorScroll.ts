// #917 — a toolbar click must not throw the author back to the top. The
// scroll decision is pure: given the caret line's [top, bottom] within the
// textarea's scrollable content, the offset captured before the value
// changed, and the visible height, it returns the offset to scroll to. The
// caret line is visible at the captured offset → restore it exactly; the
// caret sits above the captured viewport → scroll it to the top; below →
// scroll it to the bottom. (The mirror-div measurement that produces the
// caret geometry is browser territory — jsdom has no layout, so it reports
// a scroll offset of zero and cannot prove this.)

/**
 * The scroll offset to apply after an edit, given the caret line's geometry
 * within the textarea's scrollable content, the offset captured before the
 * value changed, and the visible height. Returns the captured offset when
 * the caret line is visible there; otherwise the offset that brings the
 * caret line to the top or bottom edge of the viewport.
 */
export function scrollTargetAfterEdit(
  caretTop: number,
  caretBottom: number,
  capturedOffset: number,
  clientHeight: number,
): number {
  const viewportBottom = capturedOffset + clientHeight;
  const caretAbove = caretTop < capturedOffset;
  const caretBelow = caretBottom > viewportBottom;
  if (!caretAbove && !caretBelow) {
    return capturedOffset;
  }
  if (caretAbove) {
    return Math.max(0, caretTop);
  }
  return Math.max(0, caretBottom - clientHeight);
}

/**
 * The geometry of the caret's line within the textarea's scrollable content,
 * measured with a hidden mirror div carrying the same text-layout styles.
 * Content coordinates: the mirror's offsetHeight minus the textarea's
 * vertical padding, so the first line starts at 0 and the last line's bottom
 * equals the content height (scrollHeight minus padding). Returns null when
 * the measurement is degenerate (no layout — jsdom), so callers fall back to
 * the captured offset instead of inventing a position.
 */
function caretLineGeometry(
  el: HTMLTextAreaElement,
  offset: number,
): { top: number; bottom: number } | null {
  const cs = getComputedStyle(el);
  const padTop = parseFloat(cs.paddingTop);
  const padBottom = parseFloat(cs.paddingBottom);
  const mirror = document.createElement('div');
  mirror.style.cssText = [
    'position:absolute',
    'visibility:hidden',
    'pointer-events:none',
    'box-sizing:border-box',
    'white-space:pre-wrap',
    'word-wrap:break-word',
    `font-family:${cs.fontFamily}`,
    `font-size:${cs.fontSize}`,
    `font-weight:${cs.fontWeight}`,
    `line-height:${cs.lineHeight}`,
    `letter-spacing:${cs.letterSpacing}`,
    `width:${el.clientWidth}px`,
    `padding:${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
    'border:0',
  ].join(';');
  document.body.appendChild(mirror);
  const lineStart = el.value.lastIndexOf('\n', offset - 1) + 1;
  let lineEnd = el.value.indexOf('\n', offset);
  if (lineEnd === -1) lineEnd = el.value.length;
  mirror.textContent = el.value.substring(0, lineStart);
  const top = mirror.offsetHeight - padTop - padBottom;
  mirror.textContent = el.value.substring(0, lineEnd);
  const bottom = mirror.offsetHeight - padTop - padBottom;
  document.body.removeChild(mirror);
  if (bottom <= 0) return null;
  return { top, bottom };
}

/**
 * Restores the scroll offset captured before an edit, unless the caret now
 * sits outside the captured viewport — then it scrolls the caret into view
 * (top or bottom edge) so the author sees that the click did something.
 */
export function restoreScrollAfterEdit(
  el: HTMLTextAreaElement,
  capturedScrollTop: number,
  caretOffset: number,
): void {
  const line = caretLineGeometry(el, caretOffset);
  if (!line) {
    el.scrollTop = capturedScrollTop;
    return;
  }
  const cs = getComputedStyle(el);
  const contentHeight = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  el.scrollTop = scrollTargetAfterEdit(line.top, line.bottom, capturedScrollTop, contentHeight);
}
