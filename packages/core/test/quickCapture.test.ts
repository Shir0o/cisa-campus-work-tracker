import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import {
  FIRST_MET_PRESETS,
  QUICK_CAPTURE_KINDS,
  interactionKindLabel,
  contactAddedLine,
  firstMetDate,
  followUpDefaultText,
  logSavedBeat,
  logSavedLine,
  logSheetFootLine,
  newContactFromLog,
  prayerAddedLine,
  quickCaptureRecents,
  quickCaptureSearchMatches,
  reminderDueDate,
  reminderNotificationTrigger,
  reminderNotificationContent,
  reminderSetLine,
} from '../src/quickCapture';
import type { Touch } from '../src/myday';
import type { Contact } from '../src/types';

const NOW = new Date('2026-07-20T12:00:00Z').getTime();
const DAY_MS = 86_400_000;

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Alex',
  role: '',
  location: '',
  email: '',
  phone: '',
  stage: '',
  lastSeen: '',
  initials: 'A',
  ...overrides,
});

const touch = (overrides: Partial<Touch> = {}): Touch => ({
  contactId: 'c1',
  ms: NOW,
  note: '',
  ...overrides,
});

describe('quickCaptureRecents', () => {
  it('sorts most-recently-touched first (opposite of Directory)', () => {
    const contacts = [contact({ id: 'stale' }), contact({ id: 'recent' })];
    const touches: Touch[] = [
      touch({ contactId: 'stale', ms: NOW - DAY_MS * 10 }),
      touch({ contactId: 'recent', ms: NOW - DAY_MS }),
    ];
    const result = quickCaptureRecents(contacts, touches, null, 6, NOW);
    expect(result.map((r) => r.contact.id)).toEqual(['recent', 'stale']);
    expect(result[0].days).toBe(1);
    expect(result[1].days).toBe(10);
  });

  it('puts contacts the caller created first, ahead of more-recent touches', () => {
    const contacts = [
      contact({ id: 'mine', createdBy: 'me' }),
      contact({ id: 'others', createdBy: 'someone-else' }),
    ];
    const touches: Touch[] = [
      touch({ contactId: 'mine', ms: NOW - DAY_MS * 5 }),
      touch({ contactId: 'others', ms: NOW - DAY_MS }),
    ];
    const result = quickCaptureRecents(contacts, touches, 'me', 6, NOW);
    expect(result.map((r) => r.contact.id)).toEqual(['mine', 'others']);
  });

  it('falls back to createdAt, then Infinity, for contacts with no touch', () => {
    const contacts = [
      contact({ id: 'never-touched-no-createdAt' }),
      contact({ id: 'created-only', createdAt: new Date(NOW - DAY_MS * 2).toISOString() }),
    ];
    const result = quickCaptureRecents(contacts, [], null, 6, NOW);
    expect(result.find((r) => r.contact.id === 'created-only')?.days).toBe(2);
    expect(result.find((r) => r.contact.id === 'never-touched-no-createdAt')?.days).toBe(Infinity);
  });

  it('caps at the limit', () => {
    const contacts = Array.from({ length: 10 }, (_, i) => contact({ id: `c${i}` }));
    expect(quickCaptureRecents(contacts, [], null, 6, NOW)).toHaveLength(6);
  });
});

describe('quickCaptureSearchMatches', () => {
  const contacts = [contact({ id: 'a', name: 'Mei Lin' }), contact({ id: 'b', name: 'Sam Cho' })];

  it('matches case-insensitively against name', () => {
    expect(quickCaptureSearchMatches(contacts, 'mei').map((c) => c.id)).toEqual(['a']);
  });

  it('returns nothing for an empty query', () => {
    expect(quickCaptureSearchMatches(contacts, '')).toEqual([]);
    expect(quickCaptureSearchMatches(contacts, '   ')).toEqual([]);
  });

  it('caps at the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => contact({ id: `c${i}`, name: `Match ${i}` }));
    expect(quickCaptureSearchMatches(many, 'match', 8)).toHaveLength(8);
  });
});

describe('reminderDueDate', () => {
  it('returns a bare yyyy-MM-dd date, not a full ISO datetime', () => {
    // A full ISO datetime (~24 chars) silently fails the deployed `tasks`
    // rule's 20-char cap on dueDate — reproduced live as a "Missing or
    // insufficient permissions" error the first time a reminder was set.
    expect(reminderDueDate('tom', NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(reminderDueDate('week', NOW).length).toBeLessThanOrEqual(20);
  });

  it('resolves the three fixed presets +1/+3/+7 days apart from each other', () => {
    // Date-only ISO strings parse as UTC midnight regardless of local
    // timezone, so this stays reliable wherever the tests run.
    const tom = new Date(reminderDueDate('tom', NOW)).getTime();
    const few = new Date(reminderDueDate('few', NOW)).getTime();
    const week = new Date(reminderDueDate('week', NOW)).getTime();
    expect(Math.round((few - tom) / DAY_MS)).toBe(2);
    expect(Math.round((week - tom) / DAY_MS)).toBe(6);
  });
});

describe('reminderNotificationTrigger', () => {
  it('lands on the same day reminderDueDate resolves to, at 9 AM local', () => {
    const trigger = reminderNotificationTrigger('tom', NOW);
    const dueDate = reminderDueDate('tom', NOW);
    expect(format(trigger, 'yyyy-MM-dd')).toBe(dueDate);
    expect(trigger.getHours()).toBe(9);
    expect(trigger.getMinutes()).toBe(0);
  });

  it('resolves the three fixed presets +1/+3/+7 days apart, same as reminderDueDate', () => {
    const tom = reminderNotificationTrigger('tom', NOW).getTime();
    const few = reminderNotificationTrigger('few', NOW).getTime();
    const week = reminderNotificationTrigger('week', NOW).getTime();
    expect(Math.round((few - tom) / DAY_MS)).toBe(2);
    expect(Math.round((week - tom) / DAY_MS)).toBe(6);
  });
});

describe('reminderNotificationContent', () => {
  it('uses the reminder title as the notification title and contact name as body', () => {
    expect(reminderNotificationContent('Follow up with Alex', 'Alex')).toEqual({
      title: 'Follow up with Alex',
      body: 'Alex',
    });
  });
});

describe('logSheetFootLine', () => {
  it('names the real window rather than the design\'s hardcoded Tue & Wed, 12–3', () => {
    expect(logSheetFootLine({ days: [2, 3], from: 12, to: 15 })).toBe(
      'This nudge shows up Tue & Wed, 12pm–3pm. Change it in Settings.',
    );
  });

  it('follows a window the trainee has moved', () => {
    expect(logSheetFootLine({ days: [1, 4, 5], from: 9, to: 11 })).toBe(
      'This nudge shows up Mon, Thu & Fri, 9am–11am. Change it in Settings.',
    );
  });

  // The strip and the sheet both read onCampusSummary, so a window with no days
  // left on it says the same thing in both places instead of inventing copy.
  it('says nothing is set when every day has been switched off', () => {
    expect(logSheetFootLine({ days: [], from: 12, to: 15 })).toBe(
      'This nudge shows up No days set. Change it in Settings.',
    );
  });
});

describe('logSavedLine / contactAddedLine', () => {
  it('greets by first name only', () => {
    expect(logSavedLine('Alex Johnson')).toBe('Logged — Alex.');
    expect(contactAddedLine('Alex Johnson')).toBe('Alex is in. You can add the rest tonight.');
  });

  it('falls back to "Someone" rather than an empty gap', () => {
    expect(logSavedLine('')).toBe('Logged — Someone.');
    expect(contactAddedLine('')).toBe('Someone is in. You can add the rest tonight.');
  });
});

describe('newContactFromLog', () => {
  it('puts "where you met" on location — the field this app labels FIRST MET', () => {
    // The design tags a new person with where you met; a Contact here has a
    // `location` field whose own form calls it "FIRST MET / RESIDENCE", so that
    // is its home. `tags` stays the active-season tag the other addContact
    // callers already set.
    expect(
      newContactFromLog({
        name: '  Alex Johnson ',
        where: '  Org fair ',
        note: '  Plays bass. ',
        stageLabel: 'First conversation',
        tags: ['fall-2026'],
      }),
    ).toEqual({
      name: 'Alex Johnson',
      role: '',
      location: 'Org fair',
      email: '',
      phone: '',
      stage: 'First conversation',
      tags: ['fall-2026'],
      notes: 'Plays bass.',
      spiritualBackground: '',
      initials: 'AJ',
    });
  });

  it('leaves the two optional fields empty when they were skipped', () => {
    const input = newContactFromLog({
      name: 'Alex',
      where: '',
      note: '',
      stageLabel: 'Unassigned',
      tags: [],
    });
    expect(input.location).toBe('');
    expect(input.notes).toBe('');
    expect(input.tags).toEqual([]);
    expect(input.createdAt).toBeUndefined();
  });

  it('carries "Fill in the rest" through, trimmed, when the disclosure was opened', () => {
    const input = newContactFromLog({
      name: 'Alex Johnson',
      where: 'Org fair',
      note: 'Plays bass.',
      stageLabel: 'First conversation',
      tags: ['fall-2026'],
      phone: ' (555) 000-0000 ',
      email: ' alex@campus.edu ',
      year: 'Sophomore',
      major: ' Music ',
      metISO: '2026-07-01',
    });
    expect(input.phone).toBe('(555) 000-0000');
    expect(input.email).toBe('alex@campus.edu');
    expect(input.year).toBe('Sophomore');
    expect(input.major).toBe('Music');
    expect(input.createdAt).toBe('2026-07-01');
  });

  it('never sets "Part of" or "Faith, so far" — the log sheet stopped asking', () => {
    // Both came out of the 20-second capture: the design picks "Part of" from a
    // fellowships list this app doesn't have, and neither question belongs in a
    // sheet meant to be done while walking. The public sign-up form still fills
    // them, and the person screen still shows them when it has them.
    const input = newContactFromLog({
      name: 'Alex Johnson',
      where: 'Org fair',
      note: 'Plays bass.',
      stageLabel: 'First conversation',
      tags: ['fall-2026'],
      year: 'Sophomore',
    });
    expect(input.role).toBe('');
    expect(input.spiritualBackground).toBe('');
  });

  it('still lands "where you met" on location even with the disclosure open', () => {
    // The design offers a separate "Lives" field; this app has one dual-purpose
    // `location` ("FIRST MET / RESIDENCE"), so "where you met" keeps it and the
    // design's "Lives" is dropped rather than fighting over the same field.
    const input = newContactFromLog({
      name: 'Alex',
      where: 'The Quad',
      note: '',
      stageLabel: 'Unassigned',
      tags: [],
      major: 'Music',
    });
    expect(input.location).toBe('The Quad');
  });
});

describe('firstMetDate', () => {
  it('resolves each preset to a bare yyyy-MM-dd in the past', () => {
    expect(firstMetDate('today', NOW)).toBe(format(new Date(NOW), 'yyyy-MM-dd'));
    expect(firstMetDate('week', NOW)).toBe(format(new Date(NOW - 7 * DAY_MS), 'yyyy-MM-dd'));
    expect(firstMetDate('earlier', NOW)).toBe(format(new Date(NOW - 30 * DAY_MS), 'yyyy-MM-dd'));
  });

  it('offers the three presets in order, nearest first', () => {
    expect(FIRST_MET_PRESETS.map((p) => p.label)).toEqual(['Today', 'This week', 'Earlier']);
  });
});

describe('logSavedBeat', () => {
  it('names what was written down, for a conversation', () => {
    expect(logSavedBeat({ kind: 'convo', name: 'Rio Alvarez', what: 'Gospel conversation' })).toEqual({
      head: "It's written down.",
      sub: 'Gospel conversation with Rio · just now',
      toast: 'Logged — Rio.',
    });
  });

  it('names where you met them, for someone new', () => {
    expect(logSavedBeat({ kind: 'contact', name: 'Alex Johnson', where: 'the Quad' })).toEqual({
      head: 'Alex is in.',
      sub: 'Met at the Quad · just now',
      toast: 'Alex is in. You can add the rest tonight.',
    });
  });

  it('falls back to a plain line when where-you-met was skipped', () => {
    expect(logSavedBeat({ kind: 'contact', name: 'Alex', where: '  ' }).sub).toBe('Added just now');
  });
});

describe('the saved step’s own lines', () => {
  it('defaults the follow-up to the person it is about', () => {
    expect(followUpDefaultText('Rio Alvarez')).toBe('Follow up with Rio');
    expect(followUpDefaultText('')).toBe('Follow up with Someone');
  });

  it('says when the reminder will land, in the preset’s own words', () => {
    expect(reminderSetLine('tom')).toBe("You'll be reminded — tomorrow");
    expect(reminderSetLine('few')).toBe("You'll be reminded — in a few days");
    expect(reminderSetLine('week')).toBe("You'll be reminded — next week");
  });

  it('says where the prayer went, and the two places differ', () => {
    expect(prayerAddedLine('Rio Alvarez', false)).toEqual({
      head: 'Added to what we’re praying',
      sub: "It sits with Rio's prayers.",
    });
    expect(prayerAddedLine('Rio Alvarez', true)).toEqual({
      head: 'Added to what we’re praying',
      sub: 'The team will pray it together too.',
    });
  });
});

// `M2_TYPE_TITLE` in the design's views/mobile/m2.jsx. The design stores this
// string ON the interaction and re-reads it in "Look back at your week"; our
// Interaction has no `title`, only `type`, so the lookup happens at render.
describe('interactionKindLabel', () => {
  it('names each of the six kinds we offer', () => {
    expect(interactionKindLabel('gospel')).toBe('Gospel conversation');
    expect(interactionKindLabel('appointment')).toBe('Appointment');
    expect(interactionKindLabel('gathering')).toBe('Gathering');
    expect(interactionKindLabel('phone')).toBe('Phone call');
    expect(interactionKindLabel('text')).toBe('Texted');
    expect(interactionKindLabel('meet')).toBe('Ran into each other');
  });

  it('still names the legacy kinds sitting in older logs', () => {
    expect(interactionKindLabel('coffee')).toBe('Coffee');
    expect(interactionKindLabel('meal')).toBe('Shared a meal');
    expect(interactionKindLabel('small-group')).toBe('Small group');
    expect(interactionKindLabel('meeting')).toBe('Meeting');
    expect(interactionKindLabel('rehearsal')).toBe('Rehearsal');
  });

  it('never leaks a raw key for something it does not know', () => {
    expect(interactionKindLabel('some-new-key')).toBe('Conversation');
    expect(interactionKindLabel('')).toBe('Conversation');
    expect(interactionKindLabel(undefined)).toBe('Conversation');
  });

  it('covers every kind the log sheet can write', () => {
    for (const kind of QUICK_CAPTURE_KINDS) {
      expect(interactionKindLabel(kind.id)).not.toBe('Conversation');
    }
  });
});
