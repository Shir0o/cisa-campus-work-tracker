import { describe, it, expect } from 'vitest';
import { buildContactStory } from '../lib/contactStory';

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

const activity = (id: string, createdAt: string, description: string, action = 'updated') => ({
  id,
  userId: 'daniel',
  userName: 'Daniel Kim',
  action,
  targetId: 'maya',
  targetName: 'Maya Okafor',
  targetType: 'contact' as const,
  type: 'edit' as const,
  description,
  createdAt,
});

const kindsAndIds =(entries: { kind: string; id: string }[]) =>
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

  describe('step moves', () => {
    it('turns a move from the step menu into a milestone, in date order', () => {
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
        'step:moved',
        'conversation:dinner',
        'added:added',
      ]);
      expect(story[1]).toEqual({
        kind: 'step',
        id: 'moved',
        at: '2026-09-18T09:00:00.000Z',
        from: 'First Contact',
        to: 'Regular',
        byName: 'Daniel Kim',
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

      expect(story[0]).toMatchObject({ kind: 'step', id: 'edited', from: 'Regular', to: 'Bible Study' });
    });

    it('reads a bulk move made from the Directory', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [activity('bulk', '2026-09-24T09:00:00.000Z', 'Stage: "Unassigned" → "First Contact"')],
      });

      expect(story[0]).toMatchObject({ kind: 'step', id: 'bulk', from: 'Unassigned', to: 'First Contact' });
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

      expect(story[0]).toMatchObject({ kind: 'step', id: 'dragged', from: 'Open to God', to: 'Regular' });
    });

    it('leaves every other kind of History entry out of the story', () => {
      const story = buildContactStory({
        contact,
        ...empty,
        activities: [
          activity('renamed', '2026-09-24T09:00:00.000Z', 'name: "Maya O" → "Maya Okafor"\nnotes updated'),
          activity('tagged', '2026-09-23T09:00:00.000Z', 'Tags: [Sac State] → [Sac State, Pre-med]', 'added tag #Pre-med to'),
          activity('kind', '2026-09-22T09:00:00.000Z', 'kind: "Contact" → "Local saint"'),
        ],
      });

      expect(kindsAndIds(story)).toEqual(['added:added']);
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
            answeredAt: '2026-09-24T08:00:00.000Z',
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
  });
});
