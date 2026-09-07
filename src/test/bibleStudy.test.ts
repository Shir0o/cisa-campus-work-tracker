import { describe, it, expect } from 'vitest';
import {
  resolveScan,
  type Meeting,
  type Study,
  type EntryPoint,
} from '../lib/bibleStudy';

const STUDY: Study = { id: 'romans-fall26', title: 'Romans', term: 'Fall 2026' };

const ENTRY_POINT: EntryPoint = {
  id: 'cisa-wednesday',
  slug: 'cisa-wednesday',
  name: 'Wednesday Bible Study',
  activeStudyId: 'romans-fall26',
};

function meeting(overrides: Partial<Meeting> & { date: string }): Meeting {
  return {
    id: `romans-fall26-${overrides.date}`,
    studyId: 'romans-fall26',
    title: 'A week',
    sections: [],
    published: true,
    ...overrides,
  };
}

describe('resolveScan', () => {
  it('returns the newest published Meeting as current when its date is inside the current week', () => {
    const meetings = [
      meeting({ date: '2026-10-14', title: 'Alive to God' }),
      meeting({ date: '2026-10-07', title: 'Peace that holds' }),
    ];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14');

    expect(result).toEqual({
      kind: 'meeting',
      meeting: meetings[0],
      isFallback: false,
    });
  });

  it('falls back to the most recent published Meeting with its date when this week is unpublished', () => {
    const meetings = [
      meeting({ date: '2026-10-07', title: 'Peace that holds' }),
      meeting({ date: '2026-09-30', title: 'The gift that is not wages' }),
    ];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-13');

    expect(result).toEqual({
      kind: 'meeting',
      meeting: meetings[0],
      isFallback: true,
      fallbackDate: '2026-10-07',
    });
  });

  it('never shows a draft Meeting', () => {
    const meetings = [
      meeting({ date: '2026-10-14', published: false, title: 'Draft week' }),
      meeting({ date: '2026-10-07', title: 'Peace that holds' }),
    ];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14');

    // This week's Meeting is a draft, so the newest published one is a
    // fallback whose date must be stated.
    expect(result).toEqual({
      kind: 'meeting',
      meeting: meetings[1],
      isFallback: true,
      fallbackDate: '2026-10-07',
    });
  });

  it('reports never-published when the Study has no published Meeting', () => {
    const meetings = [meeting({ date: '2026-10-14', published: false })];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14');

    expect(result).toEqual({ kind: 'never-published' });
  });

  it('reports no-active-study when the Entry point has no active Study', () => {
    const betweenTerms: EntryPoint = { ...ENTRY_POINT, activeStudyId: null };

    expect(resolveScan(betweenTerms, null, [], '2026-10-14')).toEqual({ kind: 'no-active-study' });
  });

  it('reports no-active-study when the Entry point itself is missing', () => {
    expect(resolveScan(null, STUDY, [], '2026-10-14')).toEqual({ kind: 'no-active-study' });
  });

  it('resolves a dated permalink to that week inside the Study', () => {
    const meetings = [
      meeting({ date: '2026-10-14', title: 'Alive to God' }),
      meeting({ date: '2026-10-07', title: 'Peace that holds' }),
    ];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14', '2026-10-07');

    expect(result).toEqual({
      kind: 'meeting',
      meeting: meetings[1],
      isFallback: true,
      fallbackDate: '2026-10-07',
    });
  });

  it('resolves a dated permalink to the current week without the dated treatment', () => {
    const meetings = [meeting({ date: '2026-10-14', title: 'Alive to God' })];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14', '2026-10-14');

    expect(result).toEqual({ kind: 'meeting', meeting: meetings[0], isFallback: false });
  });

  it('handles a permalink for a week that does not exist by showing the newest week with its date', () => {
    const meetings = [meeting({ date: '2026-10-07', title: 'Peace that holds' })];

    const result = resolveScan(ENTRY_POINT, STUDY, meetings, '2026-10-14', '2026-09-23');

    expect(result).toEqual({
      kind: 'meeting',
      meeting: meetings[0],
      isFallback: true,
      fallbackDate: '2026-10-07',
    });
  });

  it('reports no-active-study for a permalink naming a Study that does not exist', () => {
    expect(resolveScan(null, null, [], '2026-10-14', '2026-10-07')).toEqual({
      kind: 'no-active-study',
    });
  });
});
