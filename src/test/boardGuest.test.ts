import { describe, it, expect } from 'vitest';
import { createGuestAccess, guestAccessUrl, randomGuestKey, GUEST_KEY_PREFIX } from '../lib/board';

describe('randomGuestKey', () => {
  it('mints a prefixed, url-safe, unpadded 256-bit key', () => {
    const key = randomGuestKey();
    expect(key.startsWith(GUEST_KEY_PREFIX)).toBe(true);
    expect(key).toMatch(/^sec_[A-Za-z0-9_-]{43}$/);
    expect(key).not.toContain('=');
    expect(key).not.toContain('+');
    expect(key).not.toContain('/');
  });

  it('never repeats across many draws', () => {
    const keys = new Set(Array.from({ length: 500 }, () => randomGuestKey()));
    expect(keys.size).toBe(500);
  });
});

describe('createGuestAccess', () => {
  it('enables the link and records who made it', () => {
    const g = createGuestAccess('edit', 'u-1');
    expect(g.enabled).toBe(true);
    expect(g.permission).toBe('edit');
    expect(g.createdBy).toBe('u-1');
    expect(g.key.startsWith(GUEST_KEY_PREFIX)).toBe(true);
  });
});

describe('guestAccessUrl', () => {
  it('builds the public link, normalising the origin and encoding parts', () => {
    expect(guestAccessUrl('https://app.test/', 'doc 1', 'sec_a/b+c')).toBe(
      'https://app.test/c/doc%201?key=sec_a%2Fb%2Bc',
    );
    expect(guestAccessUrl('https://app.test', 'd1', 'sec_x')).toBe('https://app.test/c/d1?key=sec_x');
  });
});
