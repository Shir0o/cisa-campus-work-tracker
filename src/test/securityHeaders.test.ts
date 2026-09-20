/**
 * The deployed site's response headers are a contract -- issue #1121.
 *
 * Tony's feedback asked, of an app that holds notes about real students,
 * whether we could keep it out of Google "just to be cautious". We could not,
 * fully: `public/robots.txt` is `Disallow: /`, which is advisory, and asks
 * crawlers not to *fetch* the page. Google may still index a URL it discovers
 * elsewhere -- and because it never fetches the page, the `noindex` meta tag
 * PublicStudyReader injects is never read. `/study/:studyId/:date` is a real
 * public-but-unlisted permalink (ADR 0011), so "somewhere else" is as ordinary
 * as a student pasting the link into a group chat.
 *
 * `public/_headers` closes that with an enforcing `X-Robots-Tag`, and carries
 * the rest of the browser hardening the deployment had none of. This guardrail
 * reads the file as text, in the style of radiusToken.test.ts: the file never
 * runs in a test environment, so a typo in it would otherwise surface only as
 * a header silently missing in production.
 *
 * It asserts the `/*` block carries each header, that robots.txt and
 * X-Robots-Tag still agree, and that nobody adds the one header known to break
 * sign-in here (COOP `same-origin` kills signInWithPopup).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');

function parseHeaders(text: string): Record<string, Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  let current: string | null = null;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (!/^\s/.test(line)) {
      current = line.trim();
      blocks[current] ??= {};
      continue;
    }

    if (!current) throw new Error(`header line before any URL pattern: ${line}`);
    const at = line.indexOf(':');
    expect(at, `malformed header line: ${line}`).toBeGreaterThan(0);
    blocks[current][line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }

  return blocks;
}

describe('public/_headers', () => {
  const text = readFileSync(join(root, 'public', '_headers'), 'utf8');
  const blocks = parseHeaders(text);

  it('applies its rules to every path', () => {
    expect(Object.keys(blocks)).toContain('/*');
  });

  it.each([
    ['x-robots-tag', 'noindex, nofollow'],
    ['x-frame-options', 'DENY'],
    ['x-content-type-options', 'nosniff'],
    ['referrer-policy', 'no-referrer'],
  ])('sets %s', (name, value) => {
    expect(blocks['/*'][name]).toBe(value);
  });

  it('sets HSTS for at least a year', () => {
    const hsts = blocks['/*']['strict-transport-security'];
    const maxAge = Number(/max-age=(\d+)/.exec(hsts ?? '')?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
  });

  it('denies the device permissions the app never asks for', () => {
    const policy = blocks['/*']['permissions-policy'] ?? '';
    for (const feature of ['geolocation', 'camera', 'microphone']) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it('does not carry a COOP that would break signInWithPopup', () => {
    expect(blocks['/*']['cross-origin-opener-policy']).toBeUndefined();
  });

  it('agrees with robots.txt: both keep the whole site out of search', () => {
    const robots = readFileSync(join(root, 'public', 'robots.txt'), 'utf8');
    expect(robots).toMatch(/^\s*Disallow:\s*\/\s*$/m);
    expect(blocks['/*']['x-robots-tag']).toContain('noindex');
  });
});
