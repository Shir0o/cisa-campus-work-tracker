import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PublicStudyReader from '../views/PublicStudyReader';
import { LanguageProvider } from '../components/LanguageProvider';
import * as bibleData from '../lib/data/bibleStudy';
import type { EntryPoint, Meeting, Study } from '../lib/bibleStudy';

vi.mock('../lib/data/bibleStudy', () => ({
  subscribePublishedStudyMeetings: vi.fn(),
  subscribeEntryPoint: vi.fn(),
  subscribeStudy: vi.fn(),
}));

describe('PublicStudyReader (above the seam)', () => {
  // Dated relative to "now" so the current-week resolution in resolveScan
  // behaves the same on every run.
  const today = new Date().toISOString().slice(0, 10);

  const sampleMeeting: Meeting = {
    id: 'm-romans-wk1',
    studyId: 'romans-fall26',
    date: today,
    title: 'Peace that holds',
    published: true,
    sections: [
      {
        id: 'sec-1',
        title: 'Where peace starts',
        content: [
          {
            kind: 'bullet-list',
            points: [
              { before: 'Peace with God is a ', word: 'standing', after: ', not a mood.' },
              { before: 'A plain point with no blanks' },
            ],
          },
          { kind: 'prompt', prompt: { kind: 'discuss', text: 'Where do you need this peace?' } },
        ],
        points: [
          { before: 'Peace with God is a ', word: 'standing', after: ', not a mood.' },
          { before: 'A plain point with no blanks' },
        ],
        prompt: { kind: 'discuss', text: 'Where do you need this peace?' },
      },
      {
        id: 'sec-2',
        title: 'What suffering is doing',
        content: [{ kind: 'bullet-list', points: [{ before: 'Suffering is the road to hope' }] }],
        points: [{ before: 'Suffering is the road to hope' }],
      },
    ],
  };

  const ENTRY_POINT: EntryPoint = {
    id: 'cisa-wednesday',
    slug: 'cisa-wednesday',
    name: 'Wednesday Bible Study',
    activeStudyId: 'romans-fall26',
  };
  const STUDY: Study = { id: 'romans-fall26', title: 'Romans', term: 'Fall 2026' };

  function mockChain(
    meetings: Meeting[],
    entryPoint: EntryPoint | null = ENTRY_POINT,
    study: Study | null = STUDY,
  ) {
    vi.mocked(bibleData.subscribeEntryPoint).mockImplementation((_db, _slug, cb) => {
      cb(entryPoint, false);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, _studyId, cb) => {
      cb(study, false);
      return () => {};
    });
    vi.mocked(bibleData.subscribePublishedStudyMeetings).mockImplementation((_db, _studyId, cb) => {
      cb(meetings, false);
      return () => {};
    });
  }

  function renderAt(path: string, language?: 'en' | 'es') {
    const tree = (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/s/:slug" element={<PublicStudyReader />} />
        </Routes>
      </MemoryRouter>
    );
    // The app mounts the reader inside LanguageProvider; the tests that do
    // not need it render bare, where the hook falls back to English.
    return render(
      language ? <LanguageProvider defaultLanguage={language}>{tree}</LanguageProvider> : tree,
    );
  }

  function renderPermalink(path: string, language?: 'en' | 'es') {
    const tree = (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/study/:studyId/:date" element={<PublicStudyReader />} />
        </Routes>
      </MemoryRouter>
    );
    return render(
      language ? <LanguageProvider defaultLanguage={language}>{tree}</LanguageProvider> : tree,
    );
  }

  /** The reader's date format, so the assertion does not re-implement it. */
  const formatDay = (iso: string) => format(parseISO(iso), 'EEEE, MMMM d');

  /** The same date as a Spanish Intl writes it — weekday, order and comma. */
  const esDay = (iso: string) =>
    parseISO(iso).toLocaleDateString('es', { weekday: 'long', month: 'long', day: 'numeric' });

  beforeEach(() => {
    vi.clearAllMocks();
    // `LanguageProvider` remembers the language on the device, so a previous
    // test must not hand this one its language.
    window.localStorage.clear();
  });

  it('renders the resolved Meeting for an anonymous scan of /s/:slug', async () => {
    mockChain([sampleMeeting]);

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByText('Where peace starts')).toBeInTheDocument();
    expect(screen.getAllByText(/Peace that holds/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Plain point with no blanks/i)).toBeInTheDocument();
    expect(screen.getByText('Discuss')).toBeInTheDocument();
  });

  it('says the week could not be loaded — and offers a way out — instead of claiming the term is over (#1777)', async () => {
    // A permissions slip or a rejected query reaches the hook's error
    // callback; without a failure state the resolution looks exactly like an
    // empty term and the page tells a student who scanned a code on Wednesday
    // night that nothing is running.
    vi.mocked(bibleData.subscribeEntryPoint).mockImplementation((_db, _slug, _cb, onError) => {
      onError?.(new Error('permission-denied'));
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudy).mockImplementation(() => () => {});
    vi.mocked(bibleData.subscribePublishedStudyMeetings).mockImplementation(() => () => {});

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't load this week/i);
    expect(screen.queryByText('Nothing running right now')).not.toBeInTheDocument();
    // The action reloads (a re-subscribe keeps answering from the failed
    // cache while Firestore holds its reconnect backoff), so the assertion is
    // that a way out exists rather than that this client recovers.
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('treats an empty snapshot that never reached the server as a failed load (#1777)', async () => {
    // Measured with every Firestore request blocked: the SDK resolves the
    // listen with `exists(): false, fromCache: true`, so "no entry point" is
    // indistinguishable from "no study" unless the cache flag is read. The
    // page then told a student the term was over.
    vi.mocked(bibleData.subscribeEntryPoint).mockImplementation((_db, _slug, cb) => {
      cb(null, true);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudy).mockImplementation(() => () => {});
    vi.mocked(bibleData.subscribePublishedStudyMeetings).mockImplementation(() => () => {});

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't load this week/i);
    expect(screen.queryByText('Nothing running right now')).not.toBeInTheDocument();
  });

  it('still says between-terms for a snapshot the server answered (#1777)', async () => {
    // The same empty answer, but authoritative: a genuinely quiet term.
    mockChain([], null, null);

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByText('Nothing running right now')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the between-terms state when the entry point has no active Study', async () => {
    mockChain([], { ...ENTRY_POINT, activeStudyId: null }, null);

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByText('Nothing running right now')).toBeInTheDocument();
    expect(screen.getByText(/Keep this code/)).toBeInTheDocument();
  });

  it('renders the between-terms state for a slug that resolves to nothing', async () => {
    mockChain([], null, null);

    renderAt('/s/unknown-slug');

    expect(await screen.findByText('Nothing running right now')).toBeInTheDocument();
  });

  it('tapping a Blank reveals its hidden word', async () => {
    mockChain([sampleMeeting]);

    renderAt('/s/cisa-wednesday');

    await screen.findByText('Where peace starts');

    // Blank is initially not revealed in text
    expect(screen.queryByText('standing')).not.toBeInTheDocument();

    const blankButtons = screen.getAllByRole('button', { name: /Blank, tap to reveal/i });
    fireEvent.click(blankButtons[0]);

    // After click, the word appears
    expect(screen.getByText('standing')).toBeInTheDocument();
  });

  it('renders every Section at once and navigates only through the Section index (#890)', async () => {
    mockChain([sampleMeeting]);

    renderAt('/s/cisa-wednesday');

    // The structural change from the single-panel deck: one panel per
    // Section, all in the document at once. Scrolling owns navigation, so
    // there is no tap-to-advance and no back button to find.
    expect(await screen.findByText('Where peace starts')).toBeInTheDocument();
    expect(screen.getAllByText('What suffering is doing').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByLabelText('Previous section')).toBeNull();

    // Open the section index and jump.
    fireEvent.click(screen.getByLabelText('Open section index'));
    const indexRows = screen.getAllByText('What suffering is doing');
    fireEvent.click(indexRows[indexRows.length - 1]);
    // The index closes after a jump.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('states the date plainly at the top when the newest published week is an older week', async () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    mockChain([{ ...sampleMeeting, date: twoWeeksAgo }]);

    renderAt('/s/cisa-wednesday');

    expect(screen.getAllByText(/Peace that holds/).length).toBeGreaterThanOrEqual(1);
    // Byte-for-byte what it always said: the localized hook must not reword
    // or re-space the English sentence (#1839).
    expect(screen.getByTestId('stale-date-chip')).toHaveTextContent(
      `Most recent · ${formatDay(twoWeeksAgo)}`,
    );
  });

  // ── The shared resolution hook speaks the reader's language (#1839) ────
  // Both routes resolve through `useResolvedStudy`, so the sentence the stale
  // week wears moves with the hook rather than with either page.

  it('says the week is old in Spanish, on the public reader too (#1839)', async () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    mockChain([{ ...sampleMeeting, date: twoWeeksAgo }]);

    renderAt('/s/cisa-wednesday', 'es');

    const chip = await screen.findByTestId('stale-date-chip');
    expect(chip).not.toHaveTextContent('Most recent');
    expect(chip).toHaveTextContent('La semana ya pasó ·');
    expect(chip).toHaveTextContent(esDay(twoWeeksAgo));
  });

  it('dates the current week and a permalink title in Spanish too (#1839)', async () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    mockChain([sampleMeeting]);

    const current = renderAt('/s/cisa-wednesday', 'es');
    expect(await screen.findByTestId('week-date-chip')).toHaveTextContent(esDay(today));
    current.unmount();

    // A permalink hides the chip, so its date rides in the title — the same
    // helper, or the tab stays English while the page turns Spanish.
    mockChain([{ ...sampleMeeting, date: twoWeeksAgo, title: 'Older Week' }]);
    document.title = 'CISA Campus Work Tracker';
    renderPermalink('/study/romans-fall26/' + twoWeeksAgo, 'es');

    await screen.findByText('Where peace starts');
    expect(document.title).toContain(esDay(twoWeeksAgo));
  });

  it('renders never-published as its own state with no action offered', async () => {
    mockChain([]);

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByText('The study has never published a week')).toBeInTheDocument();
    expect(screen.queryByText('Nothing running right now')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('resolves a staff permalink to one week by Study and date', async () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    mockChain([{ ...sampleMeeting, id: 'm-newest' }, { ...sampleMeeting, id: 'm-older', date: twoWeeksAgo, title: 'Older Week' }]);

    render(
      <MemoryRouter initialEntries={['/study/romans-fall26/' + twoWeeksAgo]}>
        <Routes>
          <Route path="/study/:studyId/:date" element={<PublicStudyReader />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText(/Older Week/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('stale-date-chip')).toBeNull();
  });

  it('shows the newest week with its date when a permalink names a week that does not exist', async () => {
    mockChain([sampleMeeting]);

    render(
      <MemoryRouter initialEntries={['/study/romans-fall26/2001-01-01']}>
        <Routes>
          <Route path="/study/:studyId/:date" element={<PublicStudyReader />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText(/Peace that holds/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('stale-date-chip')).toBeNull();
  });

  it('handles a permalink for a Study that does not exist instead of rendering an empty page', async () => {
    mockChain([], null, null);

    render(
      <MemoryRouter initialEntries={['/study/missing-study/2001-01-01']}>
        <Routes>
          <Route path="/study/:studyId/:date" element={<PublicStudyReader />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Week not found')).toBeInTheDocument();
  });

  it('carries noindex on the permalink route and not on the scan route', async () => {
    mockChain([sampleMeeting]);

    const scan = renderAt('/s/cisa-wednesday');
    await scan.findByText('Where peace starts');
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
    scan.unmount();

    const permalink = render(
      <MemoryRouter initialEntries={['/study/romans-fall26/' + today]}>
        <Routes>
          <Route path="/study/:studyId/:date" element={<PublicStudyReader />} />
        </Routes>
      </MemoryRouter>,
    );
    await permalink.findByText('Where peace starts');
    const robots = document.querySelector('meta[name="robots"]');
    expect(robots).not.toBeNull();
    expect(robots?.getAttribute('content')).toBe('noindex');
    permalink.unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  // ── Identity and page structure (#1814) ────────────────────────────────
  // The scan page is one page and no app shell: a student who scanned a code
  // got a deck with no study name, no date on the current week, no heading,
  // no main region, and the internal app name in the browser tab.

  it('names the study and term and dates the current week (#1814)', async () => {
    mockChain([sampleMeeting]);

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByTestId('study-identity')).toHaveTextContent('Romans · Fall 2026');
    expect(screen.getByTestId('week-date-chip')).toHaveTextContent(formatDay(today));
    // The stale week keeps its "Most recent · " prefix; a current week does
    // not wear it.
    expect(screen.queryByTestId('stale-date-chip')).toBeNull();
    // Identity is the study and the code that opens it — both already public.
    // No personal contact line: a named ministry + contact person is a
    // separate product decision.
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(screen.queryByText(/contact/i)).toBeNull();
  });

  it('has exactly one h1 — the meeting title — with Section titles as h2 (#1814)', async () => {
    mockChain([sampleMeeting]);

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByText('Where peace starts')).toBeInTheDocument();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Peace that holds');
    // No skipped levels: the Sections sit directly under the page title.
    expect(screen.getByRole('heading', { level: 2, name: 'Where peace starts' })).toBeInTheDocument();
  });

  it('wraps the scan in one main landmark and keeps the sticky chrome a banner (#1814)', async () => {
    mockChain([sampleMeeting]);

    renderAt('/s/cisa-wednesday');

    await screen.findByText('Where peace starts');
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    // Outside main, a header is the page's banner; inside it, it is not.
    const banner = screen.getByRole('banner');
    expect(banner).toBe(screen.getByTestId('reader-header'));
    expect(banner.tagName).toBe('HEADER');
    expect(within(mains[0]).queryByTestId('reader-header')).toBeNull();
    expect(within(mains[0]).getByTestId('reader-deck')).toBeInTheDocument();
  });

  it('names the week and the study in document.title and restores the prior title on unmount (#1814)', async () => {
    mockChain([sampleMeeting]);
    document.title = 'CISA Campus Work Tracker';

    const scan = renderAt('/s/cisa-wednesday');

    await screen.findByText('Where peace starts');
    expect(document.title).toBe('Peace that holds · Romans · Fall 2026');

    scan.unmount();
    // LanguageProvider will not re-run, so the route has to put the app's own
    // name back when it leaves.
    expect(document.title).toBe('CISA Campus Work Tracker');
  });

  it('gives the empty and failed states their own title, one h1 and one main (#1814)', async () => {
    document.title = 'CISA Campus Work Tracker';

    mockChain([], null, null);
    const between = renderAt('/s/cisa-wednesday');
    await screen.findByText('Nothing running right now');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(document.title).toContain('Nothing running right now');
    expect(document.title).not.toBe('CISA Campus Work Tracker');
    between.unmount();

    vi.mocked(bibleData.subscribeEntryPoint).mockImplementation((_db, _slug, _cb, onError) => {
      onError?.(new Error('permission-denied'));
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudy).mockImplementation(() => () => {});
    vi.mocked(bibleData.subscribePublishedStudyMeetings).mockImplementation(() => () => {});

    const failed = renderAt('/s/cisa-wednesday');
    await screen.findByRole('alert');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(document.title).toContain("Couldn't load this week");
    failed.unmount();
  });

  it("carries the week's date in a permalink's title, where the chip is suppressed (#1814)", async () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    mockChain([{ ...sampleMeeting, date: twoWeeksAgo, title: 'Older Week' }]);
    document.title = 'CISA Campus Work Tracker';

    const permalink = renderPermalink('/study/romans-fall26/' + twoWeeksAgo);

    await screen.findByText('Where peace starts');
    // ADR 0011 keeps the permalink chip-free, so the date rides in the title.
    expect(screen.queryByTestId('week-date-chip')).toBeNull();
    expect(screen.queryByTestId('stale-date-chip')).toBeNull();
    expect(screen.getByTestId('study-identity')).toHaveTextContent('Romans · Fall 2026');
    expect(document.title).toContain('Older Week');
    expect(document.title).toContain(formatDay(twoWeeksAgo));
    permalink.unmount();
  });

  // #1838 — the deadline lives in the shared resolution hook, so the scan
  // route inherits it with no change to its own rendering: a page that cannot
  // reach the server admits it instead of pulsing indefinitely, and a week
  // that lands after the deadline still opens.
  describe('the 12s deadline (#1838)', () => {
    afterEach(() => vi.useRealTimers());

    it('gives up at 12s but still renders a late answer', () => {
      vi.useFakeTimers();
      let arrive: (() => void) | undefined;
      vi.mocked(bibleData.subscribeEntryPoint).mockImplementation((_db, _slug, cb) => {
        cb(ENTRY_POINT, false);
        return () => {};
      });
      vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, _id, cb) => {
        cb(STUDY, false);
        return () => {};
      });
      vi.mocked(bibleData.subscribePublishedStudyMeetings).mockImplementation((_db, _id, cb) => {
        arrive = () => cb([sampleMeeting], false);
        return () => {};
      });
      renderAt('/s/cisa-wednesday');

      act(() => {
        vi.advanceTimersByTime(12_000);
      });
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this week");
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

      act(() => arrive?.());

      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Peace that holds');
    });
  });
});
