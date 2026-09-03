/**
 * Contact-detail phantom-scroll guardrail (#780).
 *
 * The reported defect was that `.cd-page` is `height: 100%` inside a `main`
 * carrying bottom padding. `height: 100%` resolves against the content box
 * while the padding is added below it, producing a ~32px outer scroll under
 * the inner one. jsdom has no layout engine, so behavioural tests cannot catch
 * it; this guardrail reads `src/index.css` directly the same way
 * `accentToken.test.ts` does for the `--accent` invariant.
 *
 * The defensive invariants it asserts:
 *   - `.cd-page` is a single-column layout (`grid-template-columns: minmax(0, 1fr)`)
 *     — the 320px aside column from before #780 must not return.
 *   - `.cd-page-main` does not pin `height: 100%` (the original trap).
 *   - The `min-h-[400px]` floor that forced a scrollbar on an empty tab is gone.
 *   - `.cd-page-content` is a flex container, so a tab can opt into fill layout
 *     with `.cd-pane`.
 *   - `.cd-pane-thread` keeps the message list above the composer — the pane
 *     layout is wired so the composer pins to the bottom of Discussion and
 *     Follow up.
 *
 * If a future change re-introduces the phantom scroll, this test fails before
 * the change merges.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS_PATH = join(process.cwd(), 'src/index.css');

/**
 * Extract the body of a top-level rule with the given selector. Tolerant
 * enough for src/index.css where the file structure is fixed. Returns
 * `null` if the selector is not present.
 */
function ruleBody(css: string, selector: string): string | null {
  const idx = css.indexOf(selector + ' {');
  if (idx === -1) return null;
  let depth = 0;
  const start = idx + selector.length + 2;
  for (let i = start; i < css.length; i++) {
    const c = css[i];
    if (c === '{') depth++;
    else if (c === '}') {
      if (depth === 0) return css.slice(start, i);
      depth--;
    }
  }
  return null;
}

describe('contact-detail phantom-scroll guardrail (#780)', () => {
  const css = readFileSync(CSS_PATH, 'utf8');

  it('.cd-page is a single-column layout (no 320px aside column)', () => {
    const body = ruleBody(css, '.cd-page');
    expect(body, '.cd-page rule should exist').not.toBeNull();
    expect(body!).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    // The pre-#780 rule had a second 320px column; forbid re-introducing it.
    expect(body!).not.toMatch(/320px/);
  });

  it('.cd-page-main does not pin `height: 100%` (phantom-scroll source)', () => {
    const body = ruleBody(css, '.cd-page-main');
    expect(body, '.cd-page-main rule should exist').not.toBeNull();
    expect(body!).not.toMatch(/\bheight:\s*100%/);
  });

  it('no min-h-[400px] floor remains on the tab content region', () => {
    // The pre-#780 wrapper forced a scrollbar on an empty tab. The class
    // name `min-h-[400px]` (Tailwind utility) should be absent from the file.
    expect(css).not.toMatch(/min-h-\[400px\]/);
  });

  it('.cd-page-content is a flex container (tabs can opt into fill)', () => {
    const body = ruleBody(css, '.cd-page-content');
    expect(body, '.cd-page-content rule should exist').not.toBeNull();
    expect(body!).toMatch(/display:\s*flex/);
    expect(body!).toMatch(/flex-direction:\s*column/);
  });

  it('.cd-pane-thread pins the message list above the composer', () => {
    // (list flexes, composer is non-flex and pins to the bottom).
    const pane = ruleBody(css, '.cd-pane-thread');
    expect(pane, '.cd-pane-thread rule should exist').not.toBeNull();
    expect(pane!).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(pane!).toMatch(/overflow:\s*hidden/);

    const list = ruleBody(css, '.cd-pane-thread > [data-thread-list]');
    expect(list, '.cd-pane-thread > [data-thread-list] rule should exist').not.toBeNull();
    expect(list!).toMatch(/flex:\s*1\s+1\s+auto/);

    const composer = ruleBody(css, '.cd-pane-thread > [data-thread-composer]');
    expect(composer, '.cd-pane-thread > [data-thread-composer] rule should exist').not.toBeNull();
    expect(composer!).toMatch(/flex:\s*none/);
  });
  it('container query sizes the form grid against the column (not the viewport)', () => {
    // The form-grid rule inside @container cd-main (min-width: 560px) must
    // exist so the form lays out two columns based on the column's actual
    // width (the rail's 232/76px collapse changes that width without the
    // viewport moving).
    expect(css).toMatch(/@container\s+cd-main\s*\(min-width:\s*560px\)/);
    expect(css).toMatch(/\.cd-form-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });
});