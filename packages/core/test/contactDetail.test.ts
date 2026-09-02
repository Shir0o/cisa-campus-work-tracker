import { describe, it, expect } from 'vitest';
import {
  diffContactFields,
  interactionActivityType,
  contactDeleteFieldsLog,
  contactCareLine,
  contactConnectedLine,
  interactionSnippet,
  lastTimeLine,
  storyRowLine,
  splitContactPrayers,
  prayerCardKicker,
  mergedContactThread,
  composeKindsFor,
} from '../src/contactDetail';
import { THREAD_KINDS } from '../src/threads';
import type { Contact, ContactEditFields, Interaction, PrayerRecord, ThreadMessage } from '../src';

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Alex Johnson',
  role: 'Student',
  location: 'Campus Coffee',
  email: 'alex@campus.edu',
  phone: '(555) 000-0000',
  stage: 'Contact',
  lastSeen: '',
  initials: 'AJ',
  tags: [],
  notes: 'Met at the fall picnic.',
  spiritualBackground: 'Exploring',
  ...overrides,
});

const fields = (overrides: Partial<ContactEditFields> = {}): ContactEditFields => ({
  firstName: 'Alex',
  lastName: 'Johnson',
  role: 'Student',
  location: 'Campus Coffee',
  email: 'alex@campus.edu',
  phone: '(555) 000-0000',
  stage: 'Contact',
  tags: [],
  notes: 'Met at the fall picnic.',
  spiritualBackground: 'Exploring',
  ...overrides,
});

describe('diffContactFields', () => {
  it('produces no changes when nothing differs', () => {
    expect(diffContactFields(contact(), fields())).toEqual([]);
  });

  it('reports a name change', () => {
    const changes = diffContactFields(contact(), fields({ lastName: 'Nguyen' }));
    expect(changes).toEqual(['name: "Alex Johnson" → "Alex Nguyen"']);
  });

  it('reports email/phone changes', () => {
    const changes = diffContactFields(
      contact(),
      fields({ email: 'alex@new.edu', phone: '(555) 111-1111' }),
    );
    expect(changes).toEqual([
      'email: "alex@campus.edu" → "alex@new.edu"',
      'phone: "(555) 000-0000" → "(555) 111-1111"',
    ]);
  });

  it('does not surface a "how we met" change — the form no longer exposes metVia', () => {
    // #730: the new-contact and contact-edit forms removed the metVia field.
    // Even if a legacy value still sits on the contact, changing it is no
    // longer surfaced as a change line — the field is no longer user-facing.
    const before = contact({ metVia: 'Outreach' });
    const changes = diffContactFields(before, fields({ metVia: undefined }));
    expect(changes.find((c) => /how we met/i.test(c))).toBeUndefined();
  });

  it('does not surface an "address" change — the form no longer exposes location', () => {
    // #730: the new-contact and contact-edit forms removed the location field.
    // Even if a legacy value still sits on the contact, changing it is no
    // longer surfaced as a change line.
    const changes = diffContactFields(contact(), fields({ location: 'Library' }));
    expect(changes.find((c) => /address/i.test(c))).toBeUndefined();
  });

  it('reports group (role) and stage changes', () => {
    const changes = diffContactFields(contact(), fields({ role: 'Faculty', stage: 'Engaged' }));
    expect(changes).toEqual([
      'group: "Student" → "Faculty"',
      'stage: "Contact" → "Engaged"',
    ]);
  });

  it('reports a spiritual background change, defaulting the before-value to empty', () => {
    const before = contact({ spiritualBackground: undefined });
    const changes = diffContactFields(before, fields({ spiritualBackground: 'Christian' }));
    expect(changes).toEqual(['spiritualBackground: "" → "Christian"']);
  });

  it('reports notes as "updated" rather than diffing the text', () => {
    const changes = diffContactFields(contact(), fields({ notes: 'New notes here.' }));
    expect(changes).toEqual(['notes updated']);
  });

  it('reports an instagram change', () => {
    const before = contact({ instagram: undefined });
    const changes = diffContactFields(before, fields({ instagram: '@alex_on_campus' }));
    expect(changes).toEqual(['instagram: "" → "@alex_on_campus"']);
  });
});

describe('interactionActivityType', () => {
  it('maps meeting to event', () => {
    expect(interactionActivityType('meeting')).toBe('event');
  });

  it('maps chat to comment', () => {
    expect(interactionActivityType('chat')).toBe('comment');
  });

  it('passes other types through unchanged', () => {
    expect(interactionActivityType('call')).toBe('call');
    expect(interactionActivityType('email')).toBe('email');
  });

  it('maps Quick Capture kinds to activity types', () => {
    expect(interactionActivityType('phone')).toBe('call');
    expect(interactionActivityType('appointment')).toBe('event');
    expect(interactionActivityType('gathering')).toBe('event');
    expect(interactionActivityType('gospel')).toBe('comment');
    expect(interactionActivityType('text')).toBe('comment');
    expect(interactionActivityType('meet')).toBe('comment');
  });
});

describe('contactDeleteFieldsLog', () => {
  it('joins the captured fields and subcollection counts with real newlines', () => {
    const log = contactDeleteFieldsLog(contact(), 3, 5);
    expect(log).toBe(
      [
        'Group: Student',
        'Stage: Contact',
        'Email: alex@campus.edu',
        'Phone: (555) 000-0000',
        'Total Interactions: 3',
        'Total Comments: 5',
      ].join('\n'),
    );
  });

  it('falls back to "N/A" for missing email/phone', () => {
    const log = contactDeleteFieldsLog(contact({ email: '', phone: '' }), 0, 0);
    expect(log).toContain('Email: N/A');
    expect(log).toContain('Phone: N/A');
  });
});

// ── mobile v2's person screen ──────────────────────────────────────────────

const NOW = new Date('2026-08-01T12:00:00.000Z').getTime();
const daysBefore = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const interaction = (overrides: Partial<Interaction> = {}): Interaction => ({
  id: 'i1',
  content: 'Coffee after class. He asked why anyone still goes to church.',
  dateTime: daysBefore(3),
  createdAt: daysBefore(3),
  userId: 'u-mei',
  userName: 'Mei Tanaka',
  ...overrides,
});

const prayer = (overrides: Partial<PrayerRecord> = {}): PrayerRecord => ({
  id: 'p1',
  contactId: 'c1',
  date: daysBefore(2),
  burden: 'His mum is unwell.',
  status: 'pending',
  updatedAt: daysBefore(2),
  ...overrides,
});

const message = (id: string, at: string, interactionId: string | null = null): ThreadMessage => ({
  id,
  interactionId,
  from: 'u-mei',
  fromName: 'Mei Tanaka',
  kind: 'note',
  body: 'Worth following up.',
  at,
  reactions: [],
});

describe('contactCareLine', () => {
  it('says so when they are in your care', () => {
    expect(contactCareLine(true, 'Mei Tanaka')).toBe('In your care');
  });

  it('names whoever added them otherwise', () => {
    expect(contactCareLine(false, 'Mei Tanaka')).toBe('Mei added them');
  });

  it('says nothing when nobody is recorded', () => {
    expect(contactCareLine(false, null)).toBe('');
    expect(contactCareLine(false, undefined)).toBe('');
  });
});

describe('contactConnectedLine', () => {
  it('speaks in the first person', () => {
    expect(contactConnectedLine(0)).toBe('You connected today');
    expect(contactConnectedLine(1)).toBe('You connected yesterday');
    expect(contactConnectedLine(9)).toBe('9 days since you connected');
  });

  it('handles a person you have never logged', () => {
    expect(contactConnectedLine(null)).toBe("You haven't connected yet");
    expect(contactConnectedLine(undefined)).toBe("You haven't connected yet");
    expect(contactConnectedLine(Infinity)).toBe("You haven't connected yet");
  });
});

describe('interactionSnippet / lastTimeLine', () => {
  it('quotes the first sentence as written', () => {
    expect(interactionSnippet(interaction())).toBe('Coffee after class.');
  });

  it('keeps the casing of names inside the prose', () => {
    expect(interactionSnippet(interaction({ content: 'Walked Rio to the library.' }))).toBe(
      'Walked Rio to the library.',
    );
  });

  it('clips a long single sentence', () => {
    const long = 'a'.repeat(90);
    const said = interactionSnippet(interaction({ content: long }))!;
    expect(said.endsWith('…')).toBe(true);
    expect(said.length).toBeLessThanOrEqual(61);
  });

  it('adds the full stop the staffer left off', () => {
    expect(interactionSnippet(interaction({ content: 'Quick chat at the bus stop' }))).toBe(
      'Quick chat at the bus stop.',
    );
  });

  it('is null when nothing has been logged', () => {
    expect(interactionSnippet(null)).toBeNull();
    expect(interactionSnippet(interaction({ content: '   ' }))).toBeNull();
    expect(lastTimeLine(null)).toBeNull();
  });

  it('leads the hero line', () => {
    expect(lastTimeLine(interaction())).toBe('Last time: Coffee after class.');
  });
});

describe('storyRowLine', () => {
  it('names the staffer when it was not you', () => {
    expect(storyRowLine(interaction(), 'u-zion', NOW)).toBe('3 days ago · Mei');
  });

  it('drops your own name', () => {
    expect(storyRowLine(interaction(), 'u-mei', NOW)).toBe('3 days ago');
  });

  it('includes a duration when one was logged', () => {
    expect(storyRowLine(interaction({ duration: '45' }), 'u-mei', NOW)).toBe('3 days ago · 45 min');
  });

  it('falls back to createdBy when userId is absent', () => {
    const i = interaction({ userId: undefined, userName: undefined, createdById: 'u-cal', createdByName: 'Caleb Owusu' });
    expect(storyRowLine(i, 'u-mei', NOW)).toBe('3 days ago · Caleb');
  });

  it('says so when the row has no usable date', () => {
    const i = interaction({ dateTime: '', createdAt: '' });
    expect(storyRowLine(i, 'u-mei', NOW)).toBe('not dated');
  });
});

describe('splitContactPrayers', () => {
  it('keeps pending and ongoing open, sets answered and unanswered down', () => {
    const list = [
      prayer({ id: 'p1', status: 'pending' }),
      prayer({ id: 'p2', status: 'answered' }),
      prayer({ id: 'p3', status: 'ongoing' }),
      prayer({ id: 'p4', status: 'unanswered' }),
    ];
    const { open, closed } = splitContactPrayers(list);
    expect(open.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(closed.map((p) => p.id)).toEqual(['p2', 'p4']);
  });

  it('handles an empty list', () => {
    expect(splitContactPrayers([])).toEqual({ open: [], closed: [] });
  });
});

describe('prayerCardKicker', () => {
  it('dates an open prayer by when it was written down', () => {
    expect(prayerCardKicker(prayer({ date: daysBefore(3) }), NOW)).toBe('3 days ago');
  });

  it('never parses answeredAt as a date — it is the web app\'s display text', () => {
    // "Jul 13" parses to the year 2001, which is where "1307 weeks ago" came from.
    const p = prayer({ status: 'answered', date: daysBefore(9), answeredAt: 'Jul 13' });
    expect(prayerCardKicker(p, NOW)).toBe('Answered · Jul 13');
  });

  it('falls back to the burden date when nothing was written in answeredAt', () => {
    const p = prayer({ status: 'answered', date: daysBefore(14), answeredAt: '  ' });
    expect(prayerCardKicker(p, NOW)).toBe('Answered · 2 weeks ago');
  });

  it('says "Set down" for one left unanswered', () => {
    const p = prayer({ status: 'unanswered', date: daysBefore(1), answeredAt: undefined });
    expect(prayerCardKicker(p, NOW)).toBe('Set down · yesterday');
  });

  it('says only the lead when there is no usable date at all', () => {
    expect(prayerCardKicker(prayer({ status: 'answered', date: '', answeredAt: '' }), NOW)).toBe('Answered');
    expect(prayerCardKicker(prayer({ date: '' }), NOW)).toBe('');
  });
});

describe('mergedContactThread', () => {
  it('merges both levels into one list, oldest first', () => {
    const merged = mergedContactThread([
      message('m2', daysBefore(1)),
      message('m1', daysBefore(5), 'i1'),
      message('m3', daysBefore(0)),
    ]);
    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('does not mutate its input', () => {
    const input = [message('m2', daysBefore(1)), message('m1', daysBefore(5))];
    mergedContactThread(input);
    expect(input.map((m) => m.id)).toEqual(['m2', 'm1']);
  });
});

describe('composeKindsFor', () => {
  it('gives the full-timer the kinds they write in', () => {
    expect(composeKindsFor(true)).toEqual(['comment', 'encouragement', 'nudge']);
  });

  it('gives everyone else note and question', () => {
    expect(composeKindsFor(false)).toEqual(['note', 'question']);
  });

  it('has a v2 label for every kind it offers, without disturbing the Material one', () => {
    expect([...composeKindsFor(true), ...composeKindsFor(false)].map((k) => THREAD_KINDS[k].v2Label)).toEqual([
      'Wrote back',
      'Encouragement',
      'Follow-up',
      'Note',
      'A question',
    ]);
    expect(THREAD_KINDS.comment.label).toBe('Comment');
    expect(THREAD_KINDS.question.label).toBe('Question');
  });
});
