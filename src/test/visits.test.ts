import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

import {
  andList,
  groupVisits,
  initialsOf,
  lastVisitFor,
  overdueVisits,
  visitDaysAgo,
  visitInteractionId,
  visitMirrorContent,
  visitMonth,
  visitStats,
  visitWeeksAgo,
  visitWhen,
  visitsFor,
} from '../lib/visits';
import type { Contact, Visit } from '../types';

// A Thursday. The Monday of its week is 2026-08-10; the Monday before is 2026-08-03.
const NOW = new Date('2026-08-13T12:00:00');

const visit = (overrides: Partial<Visit> = {}): Visit => ({
  id: 'v1',
  date: '2026-08-13',
  contactIds: ['c1'],
  contactNames: ['Ama Osei'],
  went: ['u1'],
  wentNames: ['Mei Tanaka'],
  where: 'Whitman Hall',
  purpose: '',
  how: 'Sat on the floor and talked about her dad.',
  followUp: '',
  photos: [],
  createdAt: NOW.toISOString(),
  createdById: 'u1',
  createdByName: 'Mei Tanaka',
  ...overrides,
});

const contact = (id: string, name: string): Contact =>
  ({ id, name, initials: initialsOf(name) }) as Contact;

describe('visitDaysAgo', () => {
  it('counts whole days back from today', () => {
    expect(visitDaysAgo('2026-08-13', NOW)).toBe(0);
    expect(visitDaysAgo('2026-08-12', NOW)).toBe(1);
    expect(visitDaysAgo('2026-07-13', NOW)).toBe(31);
  });

  it('goes negative for a date in the future', () => {
    expect(visitDaysAgo('2026-08-14', NOW)).toBe(-1);
  });
});

describe('visitWhen', () => {
  it('reads the last week in words, then falls back to a date', () => {
    expect(visitWhen('2026-08-13', NOW)).toBe('today');
    expect(visitWhen('2026-08-12', NOW)).toBe('yesterday');
    expect(visitWhen('2026-08-10', NOW)).toBe('Monday');
    expect(visitWhen('2026-08-07', NOW)).toBe('Friday');
    expect(visitWhen('2026-08-05', NOW)).toBe('Aug 5');
  });

  it('reads a future date as today rather than as a negative', () => {
    expect(visitWhen('2026-08-20', NOW)).toBe('today');
  });
});

describe('visitWeeksAgo', () => {
  it('counts Monday-start weeks, so Sunday belongs to the week that began', () => {
    expect(visitWeeksAgo('2026-08-13', NOW)).toBe(0);
    expect(visitWeeksAgo('2026-08-10', NOW)).toBe(0);
    expect(visitWeeksAgo('2026-08-09', NOW)).toBe(1); // Sunday — still last week
    expect(visitWeeksAgo('2026-08-03', NOW)).toBe(1);
    expect(visitWeeksAgo('2026-07-20', NOW)).toBe(3);
  });
});

describe('groupVisits', () => {
  it('splits into this week, last week and earlier, newest first in each', () => {
    const list = [
      visit({ id: 'a', date: '2026-08-10' }),
      visit({ id: 'b', date: '2026-08-13' }),
      visit({ id: 'c', date: '2026-08-03' }),
      visit({ id: 'd', date: '2026-08-09' }),
      visit({ id: 'e', date: '2026-07-20' }),
    ];
    const g = groupVisits(list, NOW);
    expect(g.thisWeek.map((v) => v.id)).toEqual(['b', 'a']);
    expect(g.lastWeek.map((v) => v.id)).toEqual(['d', 'c']);
    expect(g.earlier.map((v) => v.id)).toEqual(['e']);
  });

  it('leaves every group empty for no visits', () => {
    expect(groupVisits([], NOW)).toEqual({ thisWeek: [], lastWeek: [], earlier: [] });
  });
});

describe('visitsFor / lastVisitFor', () => {
  const list = [
    visit({ id: 'a', date: '2026-07-01', contactIds: ['c1', 'c2'] }),
    visit({ id: 'b', date: '2026-08-01', contactIds: ['c2'] }),
    visit({ id: 'c', date: '2026-06-01', contactIds: ['c1'] }),
  ];

  it('finds every visit a person was part of, newest first', () => {
    expect(visitsFor(list, 'c1').map((v) => v.id)).toEqual(['a', 'c']);
    expect(visitsFor(list, 'c2').map((v) => v.id)).toEqual(['b', 'a']);
  });

  it('returns null when we have never been round', () => {
    expect(lastVisitFor(list, 'c1')?.id).toBe('a');
    expect(lastVisitFor(list, 'nobody')).toBeNull();
  });
});

describe('overdueVisits', () => {
  const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen'), contact('c3', 'Never Visited')];

  it('lists only people we have been to before, longest-neglected first', () => {
    const list = [
      visit({ id: 'a', date: '2026-07-01', contactIds: ['c1'] }), // 43 days
      visit({ id: 'b', date: '2026-07-20', contactIds: ['c2'] }), // 24 days
    ];
    const out = overdueVisits(list, contacts, NOW);
    expect(out.map((o) => o.contact.id)).toEqual(['c1', 'c2']);
    expect(out[0].daysAgo).toBe(43);
    expect(out[0].visit.id).toBe('a');
  });

  it('leaves out people seen inside the threshold, and never-visited people entirely', () => {
    const list = [
      visit({ id: 'a', date: '2026-08-01', contactIds: ['c1'] }), // 12 days — still fresh
      visit({ id: 'b', date: '2026-07-01', contactIds: ['c2'] }),
    ];
    expect(overdueVisits(list, contacts, NOW).map((o) => o.contact.id)).toEqual(['c2']);
  });

  it('caps the strip so it stays a nudge, not a backlog', () => {
    const many = Array.from({ length: 8 }, (_, i) => contact(`p${i}`, `Person ${i}`));
    const list = many.map((c, i) => visit({ id: `v${i}`, date: '2026-06-01', contactIds: [c.id] }));
    expect(overdueVisits(list, many, NOW)).toHaveLength(4);
    expect(overdueVisits(list, many, NOW, { limit: 2 })).toHaveLength(2);
  });

  it('honours a custom threshold', () => {
    const list = [visit({ id: 'a', date: '2026-08-05', contactIds: ['c1'] })]; // 8 days
    expect(overdueVisits(list, contacts, NOW)).toHaveLength(0);
    expect(overdueVisits(list, contacts, NOW, { minDays: 7 })).toHaveLength(1);
  });
});

describe('visitStats', () => {
  it('counts visits, distinct people seen, and distinct people who went', () => {
    const list = [
      visit({ id: 'a', contactIds: ['c1', 'c2'], went: ['u1', 'u2'] }),
      visit({ id: 'b', contactIds: ['c2'], went: ['u1'] }),
    ];
    expect(visitStats(list)).toEqual({ visits: 2, peopleSeen: 2, wentOut: 2 });
  });

  it('is all zeroes for an empty record', () => {
    expect(visitStats([])).toEqual({ visits: 0, peopleSeen: 0, wentOut: 0 });
  });
});

describe('andList', () => {
  it('joins names the way a person would say them', () => {
    expect(andList([])).toBe('');
    expect(andList(['Ama'])).toBe('Ama');
    expect(andList(['Ama', 'Bo'])).toBe('Ama and Bo');
    expect(andList(['Ama', 'Bo', 'Cai'])).toBe('Ama, Bo and Cai');
  });
});

describe('initialsOf', () => {
  it('takes the first two initials, and copes with one name or none', () => {
    expect(initialsOf('Mei Tanaka')).toBe('MT');
    expect(initialsOf('Ama Serwaa Osei')).toBe('AS');
    expect(initialsOf('Prince')).toBe('PR');
    expect(initialsOf('  ')).toBe('?');
  });
});

describe('visitMonth', () => {
  it('gives the short month for a date chip', () => {
    expect(visitMonth('2026-08-13')).toBe('Aug');
    expect(visitMonth('2026-01-02')).toBe('Jan');
  });
});

describe('visitMirrorContent', () => {
  it('leads with where we went, then what was written down', () => {
    expect(visitMirrorContent({ where: 'Whitman Hall', how: 'Sat and talked.', purpose: '' })).toBe(
      'Visited at Whitman Hall — Sat and talked.',
    );
  });

  it('falls back to why we went, then to the bare fact of having gone', () => {
    expect(visitMirrorContent({ where: 'Whitman Hall', how: '', purpose: "She's been quiet." })).toBe(
      "Visited at Whitman Hall — She's been quiet.",
    );
    expect(visitMirrorContent({ where: '', how: '', purpose: '' })).toBe('Visited at home');
  });
});

describe('visitInteractionId', () => {
  it('derives an id the contacts rules accept', () => {
    expect(visitInteractionId('abc123')).toBe('visit_abc123');
    expect(visitInteractionId('abc123')).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
