import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearedText,
  destHint,
  destLabel,
  draftText,
  signalChip,
  updateAgo,
  updateWhere,
  toAskInteractionsOf,
  toAskMessagesOf,
  toAskPeopleOf,
  toAskTraineesOf,
} from '../lib/toAskView';
import { applyRoster } from '../lib/walking';
import { applyTeams } from '../lib/teams';
import type { Contact, Interaction } from '../types';
import type { ThreadMessageWithContact } from '../lib/threads';
import en from '../locales/en.json';
import es from '../locales/es.json';

// A tiny i18n stand-in: returns the fallback with placeholders filled.
const t = (_key: string, fallback?: string) => fallback ?? _key;

// The same lookup the app uses, so a shipped string is asserted as shipped —
// a fallback would hide a placeholder the code never fills.
const dictionaryT = (dict: unknown) => (key: string, fallback?: string) => {
  const found = key
    .split('.')
    .reduce<any>((node, seg) => (node && typeof node === 'object' ? node[seg] : undefined), dict);
  return typeof found === 'string' ? found : (fallback ?? key);
};

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
    expect(rows[0].id).toBe('i1');
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

  it('carries the stream a message is in, so a reply lands beside it', () => {
    const rows = toAskMessagesOf([
      { id: 'q1', contactId: 'c1', from: 'ft', kind: 'question', body: 'b', at: '2026-10-09T00:00:00.000Z', scope: 'team' } as ThreadMessageWithContact,
      { id: 'q2', contactId: 'c1', from: 'ft', kind: 'question', body: 'b', at: '2026-10-09T00:00:00.000Z' } as ThreadMessageWithContact,
    ]);
    expect(rows.map((r) => r.scope)).toEqual(['team', null]);
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
    expect(
      draftText({ kind: 'noReply', contactName: 'Mei', mine: true, days: 8 }, t),
    ).toBe('Mei — you texted them and heard nothing back');
    expect(
      draftText({ kind: 'noReply', contactName: 'Mei', mine: false, reacherName: 'Jae', days: 8 }, t),
    ).toBe('Mei — Jae texted them and heard nothing back');
    expect(
      draftText({ kind: 'noReply', contactName: 'Mei', mine: false, days: 8 }, t),
    ).toBe('Mei — Someone texted them and heard nothing back');
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
    expect(signalChip({ kind: 'noReply', contactName: 'x', mine: true, days: 8 }, t)).toBe(
      'You texted 8 days ago · no reply',
    );
    expect(signalChip({ kind: 'noReply', contactName: 'x', mine: true, days: 1 }, t)).toBe(
      'You texted 1 day ago · no reply',
    );
    expect(signalChip({ kind: 'noReply', contactName: 'x', mine: false, reacherName: 'Jae', days: 8 }, t)).toBe(
      'Jae texted 8 days ago · no reply',
    );
    expect(signalChip({ kind: 'noReply', contactName: 'x', mine: false, reacherName: 'Jae', days: 1 }, t)).toBe(
      'Jae texted 1 day ago · no reply',
    );
    expect(signalChip({ kind: 'noReply', contactName: 'x', mine: false, days: 8 }, t)).toBe(
      'Someone texted 8 days ago · no reply',
    );
  });

  it('says what cleared a line', () => {
    expect(clearedText({ reason: 'reached', at: 'now', name: 'Jae' }, t)).toBe('Cleared · Jae reached them');
    expect(clearedText({ reason: 'reached', at: 'now' }, t)).toBe('Cleared · reached');
    expect(clearedText({ reason: 'askClosed', at: 'now' }, t)).toBe('Cleared · the ask closed');
    expect(clearedText({ reason: 'answered', at: 'now' }, t)).toBe('Cleared · answered in the Thread');
  });

  it('fills every placeholder the shipped dictionaries carry', () => {
    // #1962: `cleared_named` shipped with a {verb} the renderer never fills.
    const cleared = { reason: 'reached' as const, at: 'now', name: 'Jae' };
    const english = clearedText(cleared, dictionaryT(en));
    const spanish = clearedText(cleared, dictionaryT(es));
    expect(english).toBe('Cleared · Jae reached them');
    expect(spanish).toBe('Resuelta · Jae se puso en contacto');
    expect([english, spanish].join(' ')).not.toContain('{');
  });
});

describe('toAskView — Post an update words', () => {
  const NOW = Date.parse('2026-10-16T18:00:00.000Z');
  const minus = (ms: number) => new Date(NOW - ms).toISOString();

  it('says where an update went', () => {
    expect(updateWhere('line', t)).toBe('only on this line');
    expect(updateWhere('contact', t)).toBe('logged on their page');
    expect(updateWhere('thread', t)).toBe('replied in the Thread');
  });

  it('says how long ago an update was posted', () => {
    expect(updateAgo(minus(10_000), NOW, t)).toBe('just now');
    expect(updateAgo(minus(5 * 60_000), NOW, t)).toBe('5m ago');
    expect(updateAgo(minus(3 * 3_600_000), NOW, t)).toBe('3h ago');
    expect(updateAgo(minus(30 * 3_600_000), NOW, t)).toBe('1 day ago');
    expect(updateAgo(minus(4 * 86_400_000), NOW, t)).toBe('4 days ago');
    expect(updateAgo('not a date', NOW, t)).toBe('');
  });

  it('labels each destination pill', () => {
    const names = { contact: 'Priya', trainee: 'Jae' };
    expect(destLabel('line', names, t)).toBe('Only this line');
    expect(destLabel('contact', names, t)).toBe("Priya's page · log for Jae");
    expect(destLabel('contact', { contact: 'Priya' }, t)).toBe("Priya's page");
    expect(destLabel('thread', names, t)).toBe('Reply in the Thread');
  });

  it('explains what each destination does', () => {
    const names = { contact: 'Priya', trainee: 'Jae' };
    expect(destHint('line', names, t)).toBe('Kept on this line. Only you see it.');
    expect(destHint('contact', names, t)).toBe(
      "Logs it on Priya's page as Jae reaching them, so it counts as reached.",
    );
    expect(destHint('contact', { contact: 'Priya' }, t)).toBe("Logs it on Priya's page, so it counts as reached.");
    expect(destHint('thread', names, t)).toBe("Posts it as your reply in Priya's Thread, where the team sees it.");
  });

  it('fills every placeholder in the shipped dictionaries', () => {
    const names = { contact: 'Priya', trainee: 'Jae' };
    for (const dict of [en, es]) {
      const tt = dictionaryT(dict);
      const words = [
        ...(['line', 'contact', 'thread'] as const).flatMap((d) => [
          destLabel(d, names, tt),
          destLabel(d, { contact: 'Priya' }, tt),
          destHint(d, names, tt),
          destHint(d, { contact: 'Priya' }, tt),
          updateWhere(d, tt),
        ]),
        updateAgo(minus(5 * 60_000), NOW, tt),
        updateAgo(minus(3 * 3_600_000), NOW, tt),
        updateAgo(minus(4 * 86_400_000), NOW, tt),
      ];
      expect(words.join(' ')).not.toContain('{');
    }
  });
});
