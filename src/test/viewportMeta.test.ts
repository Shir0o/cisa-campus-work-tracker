/**
 * The viewport meta tag is a contract with Android Chrome -- issue #1735.
 *
 * Tapping a misspelled word on Android opens Chrome's spelling-suggestion
 * menu, which hides the keyboard while it shows. If hiding the keyboard
 * resizes the layout viewport, the whole page reflows under the menu and
 * Chrome dismisses it (and brings the keyboard back) before the suggestion
 * can be picked. `interactive-widget=resizes-visual` pins the layout viewport
 * so the keyboard only shrinks the visual viewport, which the phone sheet
 * already fits itself to (PopupFrame). Chrome's browser tab defaults to it,
 * but we set it explicitly so the installed app gets the same behaviour.
 *
 * Read as text, in the style of securityHeaders.test.ts: index.html never
 * runs in a test environment.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');

describe('index.html viewport meta', () => {
  it('keeps the layout viewport fixed when the on-screen keyboard opens or closes', () => {
    const content = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1] ?? '';
    const keys = content.split(',').map((part) => part.trim());
    expect(keys).toContain('interactive-widget=resizes-visual');
  });
});
