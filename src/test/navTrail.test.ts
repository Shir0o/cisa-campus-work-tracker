import { describe, it, expect } from 'vitest';
import { navTrailFor, sectionHrefFor, isLeafRoute } from '../lib/navTrail';
import { NAV_ITEMS } from '../lib/permissions';

describe('sectionHrefFor (#803)', () => {
  it('resolves a destination to itself', () => {
    expect(sectionHrefFor('/directory')).toBe('/directory');
    expect(sectionHrefFor('/')).toBe('/');
    expect(sectionHrefFor('/prayer')).toBe('/prayer');
  });

  it('resolves a contact route to People — the case the shells missed', () => {
    expect(sectionHrefFor('/people/NduKn2BpBzrRql5Z9mHk')).toBe('/directory');
  });

  it('resolves the other declared leaf routes', () => {
    expect(sectionHrefFor('/messages/room-7')).toBe('/messages');
    expect(sectionHrefFor('/coordination/trash')).toBe('/coordination');
    expect(sectionHrefFor('/admin/feedback')).toBe('/settings');
  });

  it('falls back to the deepest destination an undeclared child sits under', () => {
    // Preserves the shells' old `startsWith(href + "/")` behaviour.
    expect(sectionHrefFor('/board/anything')).toBe('/board');
  });

  it('never resolves an unrelated path to Home by prefix', () => {
    expect(sectionHrefFor('/nowhere')).toBeNull();
  });

  it('ignores a trailing slash', () => {
    expect(sectionHrefFor('/directory/')).toBe('/directory');
  });

  it('resolves every NAV_ITEMS destination to itself', () => {
    for (const item of NAV_ITEMS) {
      expect(sectionHrefFor(item.href)).toBe(item.href);
    }
  });
});

describe('isLeafRoute', () => {
  it('is true only for routes that sit under a destination', () => {
    expect(isLeafRoute('/people/abc')).toBe(true);
    expect(isLeafRoute('/coordination/trash')).toBe(true);
    expect(isLeafRoute('/directory')).toBe(false);
    expect(isLeafRoute('/')).toBe(false);
    expect(isLeafRoute('/nowhere')).toBe(false);
  });
});

describe('navTrailFor', () => {
  it('gives a destination its own name and no way back', () => {
    expect(navTrailFor('/directory', 'admin')).toEqual({
      section: null,
      current: 'People',
      currentIsLabel: true,
    });
  });

  it('names Home per role, matching the rail and the top bar', () => {
    expect(navTrailFor('/', 'admin').current).toBe('My Day');
    expect(navTrailFor('/', 'operator').current).toBe('Home');
  });

  it('gives a contact route a section crumb and the record name', () => {
    expect(navTrailFor('/people/abc', 'admin', 'David Alvarado')).toEqual({
      section: { label: 'People', href: '/directory' },
      current: 'David Alvarado',
      currentIsLabel: false,
    });
  });

  it('keeps the way back when the record name has not resolved', () => {
    expect(navTrailFor('/people/abc', 'admin', null)).toEqual({
      section: { label: 'People', href: '/directory' },
      current: null,
      currentIsLabel: false,
    });
  });

  it('marks a fixed leaf label as translatable and a record name as not', () => {
    expect(navTrailFor('/coordination/trash', 'admin')).toEqual({
      section: { label: 'Coordination Notes', href: '/coordination' },
      current: 'Trash',
      currentIsLabel: true,
    });
  });

  it('names an in-shell route that is deliberately not a destination', () => {
    expect(navTrailFor('/feedback', 'admin').current).toBe('Send feedback');
  });

  it('is empty for a path outside the shell', () => {
    expect(navTrailFor('/nowhere', 'admin')).toEqual({
      section: null,
      current: null,
      currentIsLabel: false,
    });
  });
});
