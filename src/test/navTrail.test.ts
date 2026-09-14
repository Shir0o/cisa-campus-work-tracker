import { describe, it, expect } from 'vitest';
import { navTrailFor, sectionHrefFor, isLeafRoute, currentHref } from '../lib/navTrail';
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

  it('names Your notes when /feedback is its own destination', () => {
    // /feedback is a NAV_ITEMS destination (ADR 0019), so the trail gives
    // it a name and no section crumb, like any other top-level route.
    expect(navTrailFor('/feedback', 'admin')).toEqual({
      section: null,
      current: 'Your notes',
      currentIsLabel: true,
    });
  });

  it('is empty for a path outside the shell', () => {
    expect(navTrailFor('/nowhere', 'admin')).toEqual({
      section: null,
      current: null,
      currentIsLabel: false,
    });
  });
});

describe('currentHref (#965)', () => {
  it('carries the query string, which is where the filters live', () => {
    expect(currentHref({ pathname: '/around', search: '?team=yp&who=mei&new=1' })).toBe(
      '/around?team=yp&who=mei&new=1',
    );
  });

  it('is just the path when there is no query', () => {
    expect(currentHref({ pathname: '/around', search: '' })).toBe('/around');
    expect(currentHref({ pathname: '/around' })).toBe('/around');
  });
});

describe('navTrailFor with an origin (#965)', () => {
  const contact = '/people/NduKn2BpBzrRql5Z9mHk';

  it('names where the reader came from, not the section the route belongs to', () => {
    const trail = navTrailFor(contact, 'admin', 'Mei Oyelaran', '/around?team=yp&new=1');
    expect(trail.section).toEqual({ label: 'Around the team', href: '/around?team=yp&new=1' });
    expect(trail.current).toBe('Mei Oyelaran');
  });

  it('keeps the filters on the way back', () => {
    const trail = navTrailFor(contact, 'admin', 'Mei', '/around?team=yp&who=mei&new=1');
    expect(trail.section?.href).toBe('/around?team=yp&who=mei&new=1');
  });

  it('falls back to the declared section when there is no origin', () => {
    const trail = navTrailFor(contact, 'admin', 'Mei', null);
    expect(trail.section).toEqual({ label: 'People', href: '/directory' });
  });

  it('ignores an origin that is not a destination — another contact has no label', () => {
    const trail = navTrailFor(contact, 'admin', 'Mei', '/people/someone-else');
    expect(trail.section).toEqual({ label: 'People', href: '/directory' });
  });

  it('ignores an origin pointing at the route you are already on', () => {
    const trail = navTrailFor('/around', 'admin', null, '/around');
    expect(trail.section).toBeNull();
  });

  it('still honours a fixed leaf label over a record name', () => {
    const trail = navTrailFor('/coordination/trash', 'admin', null, '/around?team=yp');
    expect(trail.current).toBe('Trash');
    expect(trail.currentIsLabel).toBe(true);
  });
});
