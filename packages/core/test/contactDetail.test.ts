import { describe, it, expect } from 'vitest';
import { diffContactFields, interactionActivityType, contactDeleteFieldsLog } from '../src/contactDetail';
import type { Contact, ContactEditFields } from '../src';

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

  it('labels a location change "first met" by default', () => {
    const changes = diffContactFields(contact(), fields({ location: 'Library' }));
    expect(changes).toEqual(['first met: "Campus Coffee" → "Library"']);
  });

  it('labels a location change "residence hall" when tagged New Sign Up', () => {
    const before = contact({ tags: ['New Sign Up'], location: 'Hall A' });
    const changes = diffContactFields(before, fields({ tags: ['New Sign Up'], location: 'Hall B' }));
    expect(changes).toEqual(['residence hall: "Hall A" → "Hall B"']);
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
});

describe('contactDeleteFieldsLog', () => {
  it('joins the captured fields and subcollection counts with real newlines', () => {
    const log = contactDeleteFieldsLog(contact(), 3, 5);
    expect(log).toBe(
      [
        'Group: Student',
        'Stage: Contact',
        'Location: Campus Coffee',
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
