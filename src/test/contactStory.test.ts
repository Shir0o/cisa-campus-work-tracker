import { describe, it, expect } from 'vitest';
import { buildContactStory } from '../lib/contactStory';
import { isReached } from '../lib/reach';
import type { Gathering, Rhythm } from '../types';

const contact = {
  id: 'maya',
  createdAt: '2026-09-03T18:00:00.000Z',
  createdByName: 'Sarah Lee',
};

const empty = { interactions: [], prayers: [], activities: [] };

const conversation = (id: string, dateTime: string, createdAt = dateTime) => ({
  id,
  content: `note ${id}`,
  dateTime,
  createdAt,
  userName: 'Daniel Kim',
});

const activity = (
  id: string,
  createdAt: string,
  description: string,
  action = 'updated',
  user: { id: string; name: string } = { id: 'daniel', name: 'Daniel Kim' },
) => ({
  id,
  userId: user.id,
  userName: user.name,
  action,
  targetId: 'maya',
  targetName: 'Maya Okafor',
  targetType: 'contact' as const,
  type: 'edit' as const,
  description,
  createdAt,
});

const gathering = (id: string, date: string, extra: Partial<Gathering> = {}): Gathering => ({
  id,
  name: 'College Meeting',
  date,
  order: 0,
  createdAt: `${date}T00:00:00.000Z`,
  attendance: { present: ['maya'], absent: [] },
  ...extra,
});

const rhythm = (id: string, name: string, extra: Partial<Rhythm> = {}): Rhythm => ({
  id,
  name,
  cadence: { type: 'weekly', days: [4] },
  roster: [],
  termStart: '2026-01-01',
  termEnd: '2026-12-31',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdById: 'u',
  ...extra,
});

const kindsAndIds = (entries: { kind: string; id: string }[]) =>
  entries.map((e) => `${e.kind}:${e.id}`);

describe('buildContactStory', () => {
  it('begins every story with the person being added', () => {
    expect(buildContactStory({ contact, ...empty })).toEqual([
      { kind: 'added', id: 'added', at: '2026-09-03T18:00:00.000Z', byName: 'Sarah Lee' },
    ]);
  });

  it('orders conversations by when they happened, newest first, not when they were typed in (#399)', () => {
    const story = buildContactStory({
      contact,
      ...empty,
      interactions: [
        conversation('coffee', '2026-09-21T10:00:00.000Z'),
        // Logged on the 22nd, but it happened on the 17th.
        conversation('dinner', '2026-09-17T19:00:00.000Z', '2026-09-22T08:00:00.000Z'),
        conversation('text', '2026-09-07T12:00:00.000Z'),
      ],
    });

    expect(kindsAndIds(story)).toEqual([
      'conversation:coffee',
      'conversation:dinner',
      'conversation:text',
      'added:added',
    ]);
  });

  it('keeps the person being added last even when a conversation is backdated before it', () => {
    const story = buildContactStory({
      contact,
      ...empty,
      interactions: [conversation('before-we-logged-them', '2026-08-30T12:00:00.000Z')],
    });

    expect(kindsAndIds(story)).toEqual(['conversation:before-we-logged-them', 'added:added']);
  });

  it('leaves out a conversation that is waiting out its Undo window after Remove', () => {
    const story = buildContactStory({
      contact,
      ...empty,
      interactions: [
        conversation('coffee', '2026-09-21T10:00:00.000Z'),
        conversation('removed', '2026-09-17T19:00:00.000Z'),
      ],
      pendingRemovalIds: ['removed'],
    });

    expect(kindsAndIds(story)).toEqual(['conversation:coffee', 'added:added']);
  });

  describe('changes', () => {
    it('turns a step move into a one-line change', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        interactions: [
          conversation('coffee', '2026-09-21T10:00:00.000Z'),
          conversation('dinner', '2026-09-17T19:00:00.000Z'),
        ],
        activities: [activity('moved', '2026-09-18T09:00:00.000Z', 'stage: "First Contact" → "Regular"')],
      });

      expect(kindsAndIds(story)).toEqual([
        'conversation:coffee',
        'change:moved',
        'conversation:dinner',
        'added:added',
      ]);
      expect(story[1]).toEqual({
        kind: 'change',
        id: 'moved',
        at: '2026-09-18T09:00:00.000Z',
        byId: 'daniel',
        byName: 'Daniel Kim',
        changes: [{ type: 'step', from: 'First Contact', to: 'Regular' }],
      });
    });

    it('finds the step move inside an edit-form save that changed several fields', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [
          activity(
            'edited',
            '2026-09-24T09:00:00.000Z',
            'name: "Maya O" → "Maya Okafor"\nstage: "Regular" → "Bible Study"\nnotes updated',
          ),
        ],
      });

      expect(story[0]).toMatchObject({
        kind: 'change',
        id: 'edited',
        changes: [
          { type: 'field', field: 'name', from: 'Maya O', to: 'Maya Okafor' },
          { type: 'step', from: 'Regular', to: 'Bible Study' },
          { type: 'notes' },
        ],
      });
    });

    it('reads year and major edits as field changes, a cleared value included (#1348)', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [
          activity(
            'edited',
            '2026-09-24T09:00:00.000Z',
            'year: "Junior" → "Gap year"\nmajor: "" → "Biology"\nyear: "Senior" → ""',
          ),
        ],
      });

      expect(story[0]).toMatchObject({
        kind: 'change',
        changes: [
          { type: 'field', field: 'year', from: 'Junior', to: 'Gap year' },
          { type: 'field', field: 'major', from: '', to: 'Biology' },
          { type: 'field', field: 'year', from: 'Senior', to: '' },
        ],
      });
    });

    it('reads a bulk move made from the Directory', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [activity('bulk', '2026-09-24T09:00:00.000Z', 'Stage: "Unassigned" → "First Contact"')],
      });

      expect(story[0]).toMatchObject({ kind: 'change', id: 'bulk', changes: [{ type: 'step', from: 'Unassigned', to: 'First Contact' }] });
    });

    it('reads a drag on the step board, even when a step name contains " to "', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [
          activity(
            'dragged',
            '2026-09-24T09:00:00.000Z',
            'Changed stage from Open to God to Regular',
            'moved contact to stage "Regular"',
          ),
        ],
      });

      expect(story[0]).toMatchObject({ kind: 'change', id: 'dragged', changes: [{ type: 'step', from: 'Open to God', to: 'Regular' }] });
    });

    it('reads a kind change', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [activity('kind', '2026-09-22T09:00:00.000Z', 'kind: "Contact" → "Local saint"')],
      });

      expect(story[0]).toMatchObject({ changes: [{ type: 'kind', from: 'Contact', to: 'Local saint' }] });
    });

    it('reads a graduation, and the kind change that came with it (#1351)', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [activity('grad', '2026-08-03T09:00:00.000Z', 'graduated or left school\nkind: "Our own" → "Local saint"')],
      });

      expect(story[0]).toMatchObject({
        changes: [{ type: 'graduated' }, { type: 'kind', from: 'Our own', to: 'Local saint' }],
      });
    });

    it('reads a tag edit as tags added and removed', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [activity('tagged', '2026-09-23T09:00:00.000Z', 'Tags: [Sac State] → [Sac State, Pre-med]')],
      });

      expect(story[0]).toMatchObject({ changes: [{ type: 'tags', added: ['Pre-med'], removed: [] }] });
    });

    it('reads a share and an unshare', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [
          activity('shared', '2026-09-22T09:00:00.000Z', 'Granted view access to Priya', 'shared a person'),
          activity('unshared', '2026-09-20T09:00:00.000Z', 'Removed view access for Priya', 'unshared a person', {
            id: 'anna',
            name: 'Anna',
          }),
        ],
      });

      expect(story[0]).toMatchObject({ id: 'shared', changes: [{ type: 'share', person: 'Priya', added: true }] });
      expect(story[1]).toMatchObject({ id: 'unshared', changes: [{ type: 'share', person: 'Priya', added: false }] });
    });

    it('reads a creator reassignment and a carer or delegate edit', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [
          activity('creator', '2026-09-24T09:00:00.000Z', 'Reassigned creator from Sarah Lee to Daniel Kim', 'reassigned creator for'),
          activity('carer', '2026-09-23T09:00:00.000Z', 'carer: "Sarah Lee" → "Daniel Kim"', 'updated', {
            id: 'anna',
            name: 'Anna',
          }),
          activity('delegate', '2026-09-22T09:00:00.000Z', 'delegate: "Sarah Lee" → "Priya Nair"', 'updated', {
            id: 'priya',
            name: 'Priya Nair',
          }),
        ],
      });

      expect(story[0]).toMatchObject({ changes: [{ type: 'creator', from: 'Sarah Lee', to: 'Daniel Kim' }] });
      expect(story[1]).toMatchObject({ changes: [{ type: 'field', field: 'carer', from: 'Sarah Lee', to: 'Daniel Kim' }] });
      expect(story[2]).toMatchObject({ changes: [{ type: 'field', field: 'delegate', from: 'Sarah Lee', to: 'Priya Nair' }] });
    });

    it('folds several changes in a row by the same person into one entry', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [
          activity('later', '2026-09-24T09:05:00.000Z', 'kind: "Contact" → "Local saint"'),
          activity('earlier', '2026-09-24T09:00:00.000Z', 'name: "Maya O" → "Maya Okafor"'),
        ],
      });

      expect(kindsAndIds(story)).toEqual(['change:later', 'added:added']);
      expect(story[0]).toMatchObject({
        at: '2026-09-24T09:05:00.000Z',
        changes: [
          { type: 'kind', from: 'Contact', to: 'Local saint' },
          { type: 'field', field: 'name', from: 'Maya O', to: 'Maya Okafor' },
        ],
      });
    });

    it('does not fold changes by different people, or changes with another story entry between them', () => {
      const differentPeople = buildContactStory({
        contact,
        ...empty,
        activities: [
          activity('by-daniel', '2026-09-24T09:05:00.000Z', 'kind: "Contact" → "Local saint"'),
          activity('by-anna', '2026-09-24T09:00:00.000Z', 'name: "Maya O" → "Maya Okafor"', 'updated', {
            id: 'anna',
            name: 'Anna',
          }),
        ],
      });
      expect(kindsAndIds(differentPeople)).toEqual(['change:by-daniel', 'change:by-anna', 'added:added']);

      const brokenRun = buildContactStory({
        contact,
        ...empty,
        interactions: [conversation('between', '2026-09-24T09:03:00.000Z')],
        activities: [
          activity('later', '2026-09-24T09:05:00.000Z', 'kind: "Contact" → "Local saint"'),
          activity('earlier', '2026-09-24T09:00:00.000Z', 'name: "Maya O" → "Maya Okafor"'),
        ],
      });
      expect(kindsAndIds(brokenRun)).toEqual([
        'change:later',
        'conversation:between',
        'change:earlier',
        'added:added',
      ]);
    });

    it('leaves attendance marks, conversations and deletions out of the change list', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [
          activity('attendance', '2026-09-24T09:00:00.000Z', 'Attendance [College Meeting]: present to absent', 'updated attendance for "College Meeting" to absent for'),
          activity('interaction-edit', '2026-09-23T09:00:00.000Z', 'Coffee at the Union', 'updated an interaction for'),
          activity('deleted', '2026-09-22T09:00:00.000Z', 'note deleted', 'deleted an interaction for'),
          activity('created', '2026-09-21T09:00:00.000Z', 'Group: Student\nStage: Regular', 'created a new contact', { id: 'daniel', name: 'Daniel Kim' }),
        ],
      });

      expect(kindsAndIds(story)).toEqual(['added:added']);
    });
  });

  describe('attendance', () => {
    it('shows a gathering the person came to', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        gatherings: [gathering('bbq', '2026-09-18', { name: 'Welcome BBQ' })],
      });

      expect(story[0]).toEqual({
        kind: 'attendance',
        id: 'bbq',
        at: '2026-09-18',
        name: 'Welcome BBQ',
        count: 1,
      });
    });

    it('folds consecutive weeks at the same Rhythm using the Rhythm name', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        rhythms: [rhythm('college', 'College Meeting')],
        gatherings: [
          gathering('w1', '2026-09-03', { rhythmId: 'college' }),
          gathering('w2', '2026-09-10', { rhythmId: 'college' }),
          gathering('w3', '2026-09-17', { rhythmId: 'college' }),
        ],
      });

      expect(story[0]).toEqual({
        kind: 'attendance',
        id: 'college:2026-09-03',
        at: '2026-09-17',
        name: 'College Meeting',
        count: 3,
      });
    });

    it('counts a week once even when the Rhythm meets twice in it', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        rhythms: [rhythm('college', 'College Meeting')],
        gatherings: [
          gathering('wed', '2026-09-03', { rhythmId: 'college' }),
          gathering('fri', '2026-09-05', { rhythmId: 'college' }),
        ],
      });

      expect(kindsAndIds(story)).toEqual(['attendance:college:2026-09-03', 'added:added']);
      expect(story[0]).toMatchObject({ at: '2026-09-05', count: 1 });
    });

    it('starts a new entry after a gap', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        rhythms: [rhythm('college', 'College Meeting')],
        gatherings: [
          gathering('w1', '2026-09-03', { rhythmId: 'college' }),
          gathering('w2', '2026-09-10', { rhythmId: 'college' }),
          // Missed the 17th.
          gathering('w4', '2026-09-24', { rhythmId: 'college' }),
        ],
      });

      expect(kindsAndIds(story)).toEqual([
        'attendance:college:2026-09-24',
        'attendance:college:2026-09-03',
        'added:added',
      ]);
      expect(story[0]).toMatchObject({ at: '2026-09-24', count: 1 });
      expect(story[1]).toMatchObject({ at: '2026-09-10', count: 2 });
    });

    it('never shows an absence', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        gatherings: [
          gathering('absent', '2026-09-18', { attendance: { present: [], absent: ['maya'] } }),
        ],
      });

      expect(kindsAndIds(story)).toEqual(['added:added']);
    });

    it('leaves out a cancelled week', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        gatherings: [gathering('snow-day', '2026-09-18', { cancelled: true })],
      });

      expect(kindsAndIds(story)).toEqual(['added:added']);
    });

    it('does not fold months of a non-weekly Rhythm', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        rhythms: [rhythm('monthly', 'Monthly Prayer', { cadence: { type: 'monthly', days: [1] } })],
        gatherings: [
          gathering('sep', '2026-09-01', { rhythmId: 'monthly' }),
          gathering('oct', '2026-10-01', { rhythmId: 'monthly' }),
        ],
      });

      expect(kindsAndIds(story)).toEqual([
        'attendance:oct',
        'attendance:sep',
        'added:added',
      ]);
    });

    it('orders changes, attendance, conversations and prayers newest first', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        interactions: [conversation('coffee', '2026-09-21T10:00:00.000Z')],
        activities: [activity('moved', '2026-09-18T09:00:00.000Z', 'stage: "Unassigned" → "Regular"')],
        gatherings: [gathering('college', '2026-09-17', { name: 'College Meeting' })],
        prayers: [
          { id: 'open', contactId: 'maya', date: '2026-09-20T20:00:00.000Z', burden: 'b', status: 'ongoing', updatedAt: '2026-09-20T20:00:00.000Z' },
        ],
      });

      const times = story.slice(0, -1).map((entry) => new Date(entry.at ?? 0).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });
  });

  describe('prayers', () => {
    const prayer = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
      id,
      contactId: 'maya',
      date,
      burden: `burden ${id}`,
      status: 'ongoing' as const,
      updatedAt: date,
      ...extra,
    });

    it('places an open prayer on the day it was started', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        interactions: [conversation('coffee', '2026-09-21T10:00:00.000Z')],
        prayers: [prayer('surgery', '2026-09-20T20:00:00.000Z')],
      });

      expect(kindsAndIds(story)).toEqual(['conversation:coffee', 'prayer:surgery', 'added:added']);
    });

    it('gives an answered prayer a second entry on the day it was answered', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        interactions: [conversation('coffee', '2026-09-21T10:00:00.000Z')],
        prayers: [
          prayer('majors', '2026-09-13T20:00:00.000Z', {
            status: 'answered',
            answer: 'She settled on biology and feels at peace.',
            // `answeredAt` is display text (the contact page writes it with
            // toLocaleDateString), so the milestone orders by the ISO `updatedAt`
            // written in the same save — not by parsing "Sep 24" (year 2001).
            answeredAt: 'Sep 24',
            updatedAt: '2026-09-24T08:00:00.000Z',
          }),
        ],
      });

      expect(kindsAndIds(story)).toEqual([
        'prayer-answered:majors',
        'conversation:coffee',
        'prayer:majors',
        'added:added',
      ]);
      expect(story[0]).toMatchObject({ kind: 'prayer-answered', at: '2026-09-24T08:00:00.000Z' });
    });

    it('orders a mixed story strictly newest-first', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        interactions: [
          conversation('coffee', '2026-09-21T10:00:00.000Z'),
          // Logged on the 25th, but it happened on the 10th.
          conversation('backdated', '2026-09-10T12:00:00.000Z', '2026-09-25T08:00:00.000Z'),
        ],
        activities: [activity('moved', '2026-09-18T09:00:00.000Z', 'stage: "Unassigned" → "Regular"')],
        prayers: [
          prayer('open', '2026-09-20T20:00:00.000Z'),
          prayer('answered', '2026-09-13T20:00:00.000Z', {
            status: 'answered',
            answeredAt: 'Sep 24',
            updatedAt: '2026-09-24T08:00:00.000Z',
          }),
        ],
      });

      expect(kindsAndIds(story)).toEqual([
        'prayer-answered:answered',
        'conversation:coffee',
        'prayer:open',
        'change:moved',
        'prayer:answered',
        'conversation:backdated',
        'added:added',
      ]);

      const times = story.slice(0, -1).map((entry) => new Date(entry.at ?? 0).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('falls back to the prayer date when a status write left updatedAt missing', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        prayers: [
          prayer('legacy', '2026-09-13T20:00:00.000Z', {
            status: 'answered',
            answeredAt: 'Sep 24',
            updatedAt: undefined,
          }),
        ],
      });

      expect(story.find((entry) => entry.kind === 'prayer-answered')).toMatchObject({
        at: '2026-09-13T20:00:00.000Z',
      });
    });

    it('keeps an entry with an unreadable date from sinking below dated ones', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        interactions: [
          conversation('dated', '2026-09-21T10:00:00.000Z'),
          conversation('unreadable', 'not-a-date', 'not-a-date'),
        ],
      });

      expect(kindsAndIds(story)).toEqual(['conversation:unreadable', 'conversation:dated', 'added:added']);
    });
  });

  describe('messages added to the story', () => {
    const storyMessage = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      from: 'josh',
      fromName: 'Josh Park',
      body: `said ${id}`,
      at: '2026-09-19T10:00:00.000Z',
      ...over,
    });

    it('quotes a Conversation message someone added, with who said it and when', () => {
      const story = buildContactStory({
        contact: { ...contact, storyMessageIds: ['m1'] },
        ...empty,
        storyMessages: [storyMessage('m1')],
      });

      expect(story.find((entry) => entry.kind === 'story-message')).toEqual({
        kind: 'story-message',
        id: 'm1',
        at: '2026-09-19T10:00:00.000Z',
        messageId: 'm1',
        fromId: 'josh',
        fromName: 'Josh Park',
        body: 'said m1',
      });
    });

    it('drops a message that was taken back out of the story', () => {
      const story = buildContactStory({
        contact: { ...contact, storyMessageIds: [] },
        ...empty,
        storyMessages: [storyMessage('m1')],
      });

      expect(story.some((entry) => entry.kind === 'story-message')).toBe(false);
    });

    it('orders an added message among the rest, newest first', () => {
      const story = buildContactStory({
        contact: { ...contact, storyMessageIds: ['m1'] },
        ...empty,
        interactions: [conversation('coffee', '2026-09-21T10:00:00.000Z')],
        storyMessages: [storyMessage('m1')],
      });

      expect(kindsAndIds(story).slice(0, 2)).toEqual(['conversation:coffee', 'story-message:m1']);
    });
  });

  it('holds an interaction logged on a teammate\u2019s behalf, and counts it as reach (#1288)', () => {
    const onBehalf = {
      ...conversation('on-behalf', '2026-09-21T10:00:00.000Z'),
      userId: 'anna',
      userName: 'Anna',
      reachedById: 'jae',
      reachedByName: 'Jae',
    };
    const story = buildContactStory({ contact, ...empty, interactions: [onBehalf] });

    expect(story.find((entry) => entry.id === 'on-behalf')).toMatchObject({
      kind: 'conversation',
      interaction: { reachedByName: 'Jae', userName: 'Anna' },
    });

    // A reach-by-someone interaction is still an Interaction logged with them.
    const reached = isReached(contact.id, {
      interactions: [
        {
          contactId: contact.id,
          ms: new Date('2026-09-21T10:00:00.000Z').getTime(),
        },
      ],
      gatherings: [],
    });
    expect(reached).toBe(true);
  });
});
