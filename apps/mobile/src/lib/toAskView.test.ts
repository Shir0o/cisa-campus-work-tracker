import type { Interaction } from '@cisa/core';
import { translate } from './i18n';
import { draftText, signalChip, toAskInteractionsOf, toAskTraineesOf, updateAgo } from './toAskView';

const t = (key: string, fallback?: string) => translate(key, 'en', fallback);
const NOW = Date.parse('2026-11-04T12:00:00.000Z');

describe('toAskTraineesOf', () => {
  it('lists the Trainees (role manager) with their team and the best name known', () => {
    const trainees = toAskTraineesOf(
      [
        { uid: 'tr1', role: 'manager', team: 'campus' },
        { uid: 'tr2', role: 'manager', team: 'someday' },
        { uid: 'ft1', role: 'admin', team: 'yp' },
      ],
      { tr1: ' Zion Park ' },
    );

    expect(trainees).toEqual([
      { uid: 'tr1', name: 'Zion Park', team: 'campus' },
      { uid: 'tr2', name: 'tr2', team: null },
    ]);
  });
});

describe('toAskInteractionsOf', () => {
  it('credits whoever was actually reached for, and dates it by when it happened', () => {
    const [one] = toAskInteractionsOf([
      {
        id: 'i1',
        contactId: 'c1',
        userId: 'ft1',
        userName: 'Jae',
        reachedById: 'tr1',
        reachedByName: 'Zion',
        dateTime: '2026-11-03T10:00:00.000Z',
        createdAt: '2026-11-04T10:00:00.000Z',
        type: 'chat',
        content: 'hi',
      } as Interaction,
    ]);

    expect(one).toEqual({
      id: 'i1',
      contactId: 'c1',
      ms: Date.parse('2026-11-03T10:00:00.000Z'),
      userId: 'tr1',
      userName: 'Zion',
      type: 'chat',
    });
  });

  it('falls back to the write time when the logged date is missing', () => {
    const [one] = toAskInteractionsOf([
      { id: 'i2', content: 'x', dateTime: '', createdAt: { toMillis: () => 5 } as unknown as string } as Interaction,
    ]);

    expect(one.ms).toBe(5);
  });
});

describe('words', () => {
  it('words a drafted line and its chip from the signal, in the viewer’s voice', () => {
    const signal = { kind: 'ask', contactName: 'Priya', askerName: 'Kate', days: 4, mine: false } as never;

    expect(draftText(signal, t)).toBe("Priya — Kate's follow-up ask is still open");
    expect(signalChip(signal, t)).toBe("Kate's follow-up ask open 4 days");
    expect(signalChip({ kind: 'notReached', contactName: 'P', days: 1 } as never, t)).toBe(
      'Not reached yet · added 1 day ago',
    );
  });

  it('says how long ago an update was posted', () => {
    const ago = (ms: number) => updateAgo(new Date(NOW - ms).toISOString(), NOW, t);

    expect(ago(20_000)).toBe('just now');
    expect(ago(5 * 60_000)).toBe('5m ago');
    expect(ago(3 * 3_600_000)).toBe('3h ago');
    expect(ago(24 * 3_600_000)).toBe('1 day ago');
    expect(ago(50 * 3_600_000)).toBe('2 days ago');
  });
});
