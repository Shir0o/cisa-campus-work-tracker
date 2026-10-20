import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearedText,
  draftText,
  signalChip,
  toAskInteractionsOf,
  toAskMessagesOf,
  toAskPeopleOf,
  toAskTraineesOf,
} from '../lib/toAskView';
import { applyRoster } from '../lib/walking';
import { applyTeams } from '../lib/teams';
import type { Contact, Interaction } from '../types';
import type { ThreadMessageWithContact } from '../lib/threads';

// A tiny i18n stand-in: returns the fallback with placeholders filled.
const t = (_key: string, fallback?: string) => fallback ?? _key;

describe('toAskView — assembling the derivation input', () => {
  it('reads the fields grouping needs from a contact', () => {
    const people = toAskPeopleOf([
      {
        id: 'c1',
        name: 'Mei Lin',
        kind: 'contact',
        createdAt: '2026-10-01T00:00:00.000Z',
        createdBy: 'jae',
        carers: ['jae', 'ana'],
        unfollowedBy: ['ana'],
      } as unknown as Contact,
    ]);
    expect(people[0]).toMatchObject({
      id: 'c1',
      name: 'Mei Lin',
      createdBy: 'jae',
      carers: ['jae', 'ana'],
      unfollowedBy: ['ana'],
    });
    expect(people[0].createdAtMs).toBe(Date.parse('2026-10-01T00:00:00.000Z'));
  });

  it('names the reacher on an interaction logged on behalf', () => {
    const rows = toAskInteractionsOf([
      {
        id: 'i1',
        contactId: 'c1',
        dateTime: '2026-10-15T00:00:00.000Z',
        createdAt: '2026-10-15T00:00:00.000Z',
        content: 'x',
        reachedById: 'jae',
        reachedByName: 'Jae',
        userId: 'ft',
        userName: 'Full Timer',
        type: 'text',
      } as Interaction,
    ]);
    expect(rows[0]).toMatchObject({ contactId: 'c1', userId: 'jae', userName: 'Jae', type: 'text' });
  });

  it('flattens thread messages with their closed stamp', () => {
    const rows = toAskMessagesOf([
      {
        id: 't1',
        contactId: 'c1',
        interactionId: null,
        from: 'ft',
        fromName: 'Full Timer',
        kind: 'nudge',
        body: 'did Ana follow up?',
        at: '2026-10-10T00:00:00.000Z',
        closedAt: '2026-10-14T00:00:00.000Z',
        closedByName: 'Jae',
      } as ThreadMessageWithContact,
    ]);
    expect(rows[0]).toMatchObject({ id: 't1', closedAt: '2026-10-14T00:00:00.000Z', closedByName: 'Jae' });
  });

  it('carries the parentId a reply points at', () => {
    const rows = toAskMessagesOf([
      { id: 'r1', contactId: 'c1', from: 'jae', kind: 'comment', body: 'b', at: '2026-10-10T00:00:00.000Z', parentId: 'q1' } as ThreadMessageWithContact,
      { id: 'q1', contactId: 'c1', from: 'ft', kind: 'question', body: 'b', at: '2026-10-09T00:00:00.000Z' } as ThreadMessageWithContact,
    ]);
    expect(rows[0].parentId).toBe('q1');
    expect(rows[1].parentId).toBeNull();
  });

  describe('toAskTraineesOf', () => {
    beforeEach(() => {
      applyTeams([
        { uid: 'jae', team: 'campus', displayName: 'Jae Kim' },
        { uid: 'hana', team: 'yp', displayName: 'Hana Sato' },
      ]);
      applyRoster([
        { uid: 'jae', role: 'manager' },
        { uid: 'hana', role: 'manager' },
        { uid: 'ft', role: 'admin' },
      ]);
    });

    it('lists every Trainee with their team and name', () => {
      const trainees = toAskTraineesOf({ jae: 'Jae Kim' });
      expect(trainees.find((x) => x.uid === 'jae')).toEqual({ uid: 'jae', name: 'Jae Kim', team: 'campus' });
      expect(trainees.find((x) => x.uid === 'hana')?.name).toBe('hana');
    });
  });
});

describe('toAskView — the words', () => {
  it('drafts the app default for each signal', () => {
    expect(
      draftText({ kind: 'notReached', contactName: 'Priya', days: 5 }, t),
    ).toBe('Priya — not reached yet');
    expect(
      draftText({ kind: 'ask', contactName: 'Sam', mine: true, days: 5 }, t),
    ).toBe('Sam — your follow-up ask is still open');
    expect(
      draftText({ kind: 'question', contactName: 'Leo', mine: false, askerName: 'Kate', days: 4 }, t),
    ).toBe('Leo — Kate\'s question has no reply');
  });

  it('words each signal chip', () => {
    expect(signalChip({ kind: 'notReached', contactName: 'x', days: 1 }, t)).toBe(
      'Not reached yet · added 1 day ago',
    );
    expect(signalChip({ kind: 'notReached', contactName: 'x', days: 12 }, t)).toBe(
      'Not reached yet · added 12 days ago',
    );
    expect(signalChip({ kind: 'ask', contactName: 'x', mine: true, days: 5 }, t)).toBe(
      'Follow-up ask open 5 days',
    );
    expect(signalChip({ kind: 'question', contactName: 'x', mine: false, askerName: 'Kate', days: 3 }, t)).toBe(
      'Kate\'s question unanswered 3 days',
    );
  });

  it('says what cleared a line', () => {
    expect(clearedText({ reason: 'reached', at: 'now', name: 'Jae' }, t)).toBe('Cleared · Jae reached them');
    expect(clearedText({ reason: 'reached', at: 'now' }, t)).toBe('Cleared · reached');
    expect(clearedText({ reason: 'askClosed', at: 'now' }, t)).toBe('Cleared · the ask closed');
    expect(clearedText({ reason: 'answered', at: 'now' }, t)).toBe('Cleared · answered in the Thread');
  });
});
