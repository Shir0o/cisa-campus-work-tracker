import React from 'react';
import { renderHook } from '@testing-library/react';
import { parseISO } from 'date-fns';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useResolvedStudy, type ResolvedStudy } from '../components/bibleStudy/useResolvedStudy';
import { LanguageProvider } from '../components/LanguageProvider';
import * as bibleData from '../lib/data/bibleStudy';
import type { EntryPoint, Meeting, Study } from '../lib/bibleStudy';

vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('../lib/data/bibleStudy', () => ({
  subscribeEntryPoint: vi.fn(),
  subscribePublishedStudyMeetings: vi.fn(),
  subscribeStudy: vi.fn(),
}));

/**
 * The reader's two date strings are composed inside this hook, so its language
 * is the reader's language — the chip and the permalink title both consume
 * them (#1839). These assertions are on the hook rather than a rendered page
 * where the same thing is already true of the view.
 */
describe('useResolvedStudy — the date labels speak the session language (#1839)', () => {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const ENTRY_POINT: EntryPoint = {
    id: 'cisa-wednesday',
    slug: 'cisa-wednesday',
    name: 'Wednesday Bible Study',
    activeStudyId: 'romans-fall26',
  };
  const STUDY: Study = { id: 'romans-fall26', title: 'Romans', term: 'Fall 2026' };
  const MEETING: Meeting = {
    id: 'm-1',
    studyId: 'romans-fall26',
    date: twoWeeksAgo,
    title: 'Peace that holds',
    published: true,
    sections: [],
  };

  function mockChain(meeting: Meeting) {
    vi.mocked(bibleData.subscribeEntryPoint).mockImplementation((_db, _slug, cb) => {
      cb(ENTRY_POINT, false);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, _studyId, cb) => {
      cb(STUDY, false);
      return () => {};
    });
    vi.mocked(bibleData.subscribePublishedStudyMeetings).mockImplementation((_db, _studyId, cb) => {
      cb([meeting], false);
      return () => {};
    });
  }

  const longDay = (iso: string, language: 'en' | 'es') =>
    parseISO(iso).toLocaleDateString(language, { weekday: 'long', month: 'long', day: 'numeric' });

  const render = (language?: 'en' | 'es') => {
    const wrapper = language
      ? ({ children }: { children: React.ReactNode }) => (
          <LanguageProvider defaultLanguage={language}>{children}</LanguageProvider>
        )
      : undefined;
    return renderHook(() => useResolvedStudy('cisa-wednesday'), { wrapper });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('keeps the hook’s shape: the same keys, the same string | null labels', () => {
    mockChain(MEETING);

    const { result } = render();

    // The callers (~40 render calls in StudyReaderView's suites, two routes)
    // were not reshaped to carry a raw date and a translator (#1839).
    const expectedKeys: (keyof ResolvedStudy)[] = [
      'loading',
      'entryPoint',
      'study',
      'resolution',
      'meeting',
      'staleDateLabel',
      'weekDateLabel',
      'loadError',
    ];
    expect(Object.keys(result.current).sort()).toEqual([...expectedKeys].sort());

    const { staleDateLabel, weekDateLabel } = result.current;
    expect(staleDateLabel).toBe(`Most recent · ${longDay(twoWeeksAgo, 'en')}`);
    expect(weekDateLabel).toBe(longDay(twoWeeksAgo, 'en'));
  });

  it('gives a Spanish session a warning and a Spanish date, not a translation of “Most recent”', () => {
    mockChain(MEETING);

    const { result } = render('es');

    // "La más reciente" would read as "the week on screen is current", which
    // is the opposite of what the chip exists to say (ADR 0014 §6).
    expect(result.current.staleDateLabel).toBe(`La semana ya pasó · ${longDay(twoWeeksAgo, 'es')}`);
    expect(result.current.weekDateLabel).toBe(longDay(twoWeeksAgo, 'es'));
  });

  it('shows a date that will not parse as stored, in both languages', () => {
    mockChain({ ...MEETING, date: 'not-a-date' });

    expect(render().result.current.weekDateLabel).toBe('not-a-date');
    expect(render('es').result.current.weekDateLabel).toBe('not-a-date');
  });
});
