import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BibleStudyIndex from '../views/BibleStudyIndex';
import * as bibleData from '../lib/data/bibleStudy';
import * as auth from '../components/AuthProvider';
import type { EntryPoint, Meeting, Study } from '../lib/bibleStudy';

vi.mock('../lib/data/bibleStudy', () => ({
  subscribeEntryPoints: vi.fn(),
  subscribeStudy: vi.fn(),
  subscribeStudyMeetings: vi.fn(),
  saveMeeting: vi.fn().mockResolvedValue('romans-fall26-2026-10-28'),
  setMeetingPublished: vi.fn().mockResolvedValue(undefined),
  deleteMeeting: vi.fn().mockResolvedValue(undefined),
  createStudy: vi.fn().mockResolvedValue('romans-fall-2026'),
  createEntryPoint: vi.fn().mockResolvedValue('cisa-wednesday'),
  setActiveStudy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

describe('BibleStudyIndex view', () => {
  const mockUser = { uid: 'u-admin-1' };

  const ENTRY_POINT: EntryPoint = {
    id: 'cisa-wednesday',
    slug: 'cisa-wednesday',
    name: 'Wednesday Bible Study',
    activeStudyId: 'romans-fall26',
  };
  const STUDY: Study = { id: 'romans-fall26', title: 'Romans', term: 'Fall 2026' };

  // Newest first, as the data seam returns them. The newest week is a draft;
  // the newest published week is what a scan opens.
  const MEETINGS: Meeting[] = [
    {
      id: 'm-6',
      studyId: 'romans-fall26',
      title: 'Nothing between us',
      date: '2026-10-21',
      published: false,
      sections: [
        { id: 's1', title: 'A', points: [] },
        { id: 's2', title: 'B', points: [] },
        { id: 's3', title: 'C', points: [] },
        { id: 's4', title: 'D', points: [] },
      ],
    },
    {
      id: 'm-5',
      studyId: 'romans-fall26',
      title: 'Alive to God',
      date: '2026-10-14',
      published: true,
      sections: [
        { id: 's1', title: 'A', points: [] },
        { id: 's2', title: 'B', points: [] },
        { id: 's3', title: 'C', points: [] },
        { id: 's4', title: 'D', points: [] },
      ],
    },
    {
      id: 'm-4',
      studyId: 'romans-fall26',
      title: 'Peace that holds',
      date: '2026-10-07',
      published: true,
      sections: [{ id: 's1', title: 'A', points: [] }],
    },
  ];

  function renderIndex() {
    return render(
      <MemoryRouter initialEntries={['/bible-study']}>
        <Routes>
          <Route path="/bible-study" element={<BibleStudyIndex />} />
          <Route path="/bible-study/present" element={<div>Present mode</div>} />
          <Route path="/bible-study/:meetingId" element={<div>Editor opened</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  // A week's title can appear twice — in its row and in the scan panel — so
  // row lookups go through the row element.
  function rowFor(title: string): HTMLButtonElement | undefined {
    return screen
      .getAllByText(title)
      .map((el) => el.closest('button'))
      .find((el): el is HTMLButtonElement => el !== null);
  }
  let meetingsCb: ((meetings: Meeting[]) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    meetingsCb = null;
    vi.mocked(auth.useAuth).mockReturnValue({
      user: mockUser,
      isAdmin: true,
    } as ReturnType<typeof auth.useAuth>);
    vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
      cb([ENTRY_POINT]);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, _studyId, cb) => {
      cb(STUDY);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudyMeetings).mockImplementation((_db, _studyId, cb) => {
      meetingsCb = cb;
      cb(MEETINGS);
      return () => {};
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('lists the weeks newest first with date, section count and publish state', async () => {
    renderIndex();

    expect(await screen.findByText('Nothing between us')).toBeInTheDocument();
    expect(rowFor('Alive to God')).toBeInTheDocument();
    expect(rowFor('Peace that holds')).toBeInTheDocument();

    const draftRow = rowFor('Nothing between us');
    expect(draftRow?.textContent).toContain('4 sections');
    expect(draftRow?.textContent).toContain('not published');
    expect(draftRow?.textContent).toContain('Draft');

    const liveRow = rowFor('Alive to God');
    expect(liveRow?.textContent).toContain('published');
  });

  it('marks the newest published week as live, not the newest week', async () => {
    renderIndex();

    await screen.findByText('Nothing between us');

    const liveRow = rowFor('Alive to God');
    expect(liveRow?.textContent).toContain('Live now');

    const draftRow = rowFor('Nothing between us');
    expect(draftRow?.textContent).not.toContain('Live now');

    const olderRow = rowFor('Peace that holds');
    expect(olderRow?.textContent).not.toContain('Live now');
  });

  it('states what a scan opens and why a newer draft is not showing', async () => {
    renderIndex();

    expect(await screen.findByText('What a scan opens right now')).toBeInTheDocument();
    const panel = screen.getByText('What a scan opens right now').parentElement;
    expect(panel?.textContent).toContain('Alive to God');
    expect(panel?.textContent).toMatch(/Nothing between us is still a draft/);
  });

  it('shows the entry point with its name, slug and active study, linking to present mode', async () => {
    renderIndex();

    expect(await screen.findByText('Wednesday Bible Study')).toBeInTheDocument();
    expect(screen.getByText('/s/cisa-wednesday')).toBeInTheDocument();
    expect(screen.getByText('Romans · Fall 2026')).toBeInTheDocument();

    const showQr = screen.getByRole('link', { name: /Show QR/i });
    expect(showQr.getAttribute('href')).toBe('/bible-study/present?ep=cisa-wednesday');
  });

  it('starts a new week from the list and opens its editor', async () => {
    vi.mocked(bibleData.saveMeeting).mockResolvedValue('romans-fall26-2026-10-28');
    renderIndex();

    await screen.findByText('Nothing between us');

    fireEvent.click(screen.getByRole('button', { name: /New week/i }));

    await waitFor(
      () => {
        expect(bibleData.saveMeeting).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            studyId: 'romans-fall26',
            date: '2026-10-28',
            published: false,
            // A new week starts from the skeleton, never a copy of the
            // previous week's text.
            md: expect.stringContaining('## '),
          }),
          mockUser.uid,
        );
      },
      { timeout: 5000 },
    );
    const savedMd = vi.mocked(bibleData.saveMeeting).mock.calls[0][1].md as string;
    expect(savedMd).toMatch(/^(Question|Discuss|Activity): /m);
    expect(savedMd).not.toContain('Nothing between us');

    // Coverage-instrumented runs are slow; give the async navigation room.
    expect(await screen.findByText('Editor opened', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('renders the between-terms panel when no study is active', async () => {
    vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
      cb([{ ...ENTRY_POINT, activeStudyId: null }]);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudyMeetings).mockImplementation((_db, _studyId, cb) => {
      cb([]);
      return () => {};
    });

    renderIndex();

    expect(
      await screen.findByText(/Nothing running right now — no study is active on this code/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New week/i })).toBeDisabled();
  });

  it("opens the editor from a week's row", async () => {
    renderIndex();

    await screen.findByText('Nothing between us');
    fireEvent.click(screen.getByText('Peace that holds'));

    expect(await screen.findByText('Editor opened')).toBeInTheDocument();
  });

  describe('row actions', () => {
    it('offers duplicate, copy staff link, unpublish and delete for a published week', async () => {
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Alive to God' }));

      const menu = screen.getByRole('menu', { name: 'Actions for Alive to God' });
      expect(menu).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Duplicate into a new week' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Copy staff link' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Unpublish' })).toBeInTheDocument();
      // Refused for a published week, with the reason written where it can
      // be read — not an unexplained disabled control.
      const del = screen.getByRole('menuitem', { name: 'Delete' });
      expect(del).toBeDisabled();
      expect(screen.getByText(/Unpublish first — a published week may already be on someone's screen/)).toBeInTheDocument();
    });

    it('offers delete without unpublish for a draft week, and deleting removes it from the list', async () => {
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Nothing between us' }));

      expect(screen.queryByRole('menuitem', { name: 'Unpublish' })).not.toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeEnabled();

      // Two deliberate steps: menu click, then confirm.
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
      fireEvent.click(await screen.findByRole('button', { name: /Delete week/i }));

      await waitFor(() => expect(bibleData.deleteMeeting).toHaveBeenCalledWith(expect.anything(), 'm-6'));

      // The subscription delivers the list without the deleted week; the
      // live mark moves to what a scan now opens.
      act(() => {
        meetingsCb?.(MEETINGS.filter((m) => m.id !== 'm-6'));
      });
      await waitFor(() => expect(screen.queryByText('Nothing between us')).not.toBeInTheDocument());
      expect(rowFor('Alive to God')?.textContent).toContain('Live now');
    });

    it('duplicates a week with its structure, leaving the source untouched', async () => {
      vi.mocked(bibleData.saveMeeting).mockResolvedValue('romans-fall26-2026-10-28');
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Peace that holds' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate into a new week' }));

      await waitFor(() => {
        expect(bibleData.saveMeeting).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            studyId: 'romans-fall26',
            date: '2026-10-28',
            title: 'Peace that holds',
            sections: MEETINGS[2].sections,
            published: false,
          }),
          mockUser.uid,
        );
      });
      // The source was not written to — no unpublish, no delete, one save.
      expect(bibleData.saveMeeting).toHaveBeenCalledTimes(1);
      expect(bibleData.setMeetingPublished).not.toHaveBeenCalled();
      expect(bibleData.deleteMeeting).not.toHaveBeenCalled();
      expect(rowFor('Peace that holds')).toBeInTheDocument();
    });

    it('copies the unlisted staff permalink for one week', async () => {
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Alive to God' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy staff link' }));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          'https://cisa-campus-work-tracker.pages.dev/study/romans-fall26/2026-10-14',
        );
      });
    });

    it('unpublishing is reflected immediately in what a scan opens', async () => {
      renderIndex();

      await screen.findByText('Nothing between us');
      fireEvent.click(screen.getByRole('button', { name: 'Week actions for Alive to God' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unpublish' }));

      await waitFor(() =>
        expect(bibleData.setMeetingPublished).toHaveBeenCalledWith(expect.anything(), 'm-5', false),
      );

      // The subscription delivers the change; the scan panel falls back to
      // the previous published week and the live mark moves with it.
      act(() => {
        meetingsCb?.(MEETINGS.map((m) => (m.id === 'm-5' ? { ...m, published: false } : m)));
      });
      await waitFor(() => {
        const panel = screen.getByText('What a scan opens right now').parentElement;
        expect(panel?.textContent).toContain('Peace that holds');
        expect(panel?.textContent).not.toContain('Alive to God');
      });
    });
  });

  // ── Starting a study (issue #822) ───────────────────────────────────────
  // The reported state: a fresh database, a disabled "New week" button, and
  // an instruction to run a seed script that needs a service-account key.

  describe('a database with nothing in it', () => {
    beforeEach(() => {
      vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
        cb([]);
        return () => {};
      });
    });

    it('offers a way to start a study instead of a terminal command', async () => {
      renderIndex();

      expect(await screen.findByRole('button', { name: 'Start a study' })).toBeInTheDocument();
      expect(screen.queryByText(/seed:bible-study/)).not.toBeInTheDocument();
    });

    it('creates the Study first, then the Entry point pointing at it', async () => {
      renderIndex();

      fireEvent.click(await screen.findByRole('button', { name: 'Start a study' }));
      fireEvent.change(screen.getByLabelText('Study title'), { target: { value: 'Romans' } });
      fireEvent.change(screen.getByLabelText('Term'), { target: { value: 'Fall 2026' } });
      fireEvent.change(screen.getByLabelText('Entry point name'), {
        target: { value: 'Wednesday Bible Study' },
      });
      // The slug followed the name — the two can never disagree by default.
      expect(screen.getByLabelText('Code')).toHaveValue('wednesday-bible-study');
      fireEvent.click(screen.getByRole('button', { name: 'Start the study' }));

      await waitFor(() =>
        expect(bibleData.createStudy).toHaveBeenCalledWith(
          expect.anything(),
          { id: 'romans-fall-2026', title: 'Romans', term: 'Fall 2026' },
          'u-admin-1',
        ),
      );
      expect(bibleData.createEntryPoint).toHaveBeenCalledWith(
        expect.anything(),
        {
          slug: 'wednesday-bible-study',
          name: 'Wednesday Bible Study',
          activeStudyId: 'romans-fall-2026',
        },
        'u-admin-1',
      );
      // A code pointing at a Study that does not exist yet reads as "no study
      // active" to anyone scanning in between.
      expect(vi.mocked(bibleData.createStudy).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(bibleData.createEntryPoint).mock.invocationCallOrder[0],
      );
    });

    it('says what is wrong instead of writing an unwritable record', async () => {
      renderIndex();

      fireEvent.click(await screen.findByRole('button', { name: 'Start a study' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start the study' }));

      expect(await screen.findByText('Give the study a title.')).toBeInTheDocument();
      expect(bibleData.createStudy).not.toHaveBeenCalled();
    });

    it('keeps the writing when the save is refused', async () => {
      vi.mocked(bibleData.createStudy).mockRejectedValueOnce(new Error('permission-denied'));
      renderIndex();

      fireEvent.click(await screen.findByRole('button', { name: 'Start a study' }));
      fireEvent.change(screen.getByLabelText('Study title'), { target: { value: 'Romans' } });
      fireEvent.change(screen.getByLabelText('Term'), { target: { value: 'Fall 2026' } });
      fireEvent.change(screen.getByLabelText('Entry point name'), {
        target: { value: 'Wednesday Bible Study' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Start the study' }));

      expect(await screen.findByText(/only a Full-timer can start a study/)).toBeInTheDocument();
      expect(screen.getByLabelText('Study title')).toHaveValue('Romans');
    });
  });

  it('a failed read is not reported as a database that was never set up', async () => {
    vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, _cb, onError) => {
      onError?.(new Error('permission-denied'));
      return () => {};
    });
    renderIndex();

    expect(await screen.findByText(/Couldn't load the entry point/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start a study' })).not.toBeInTheDocument();
  });

  it('a new term repoints the code that is already printed, never replacing it', async () => {
    renderIndex();

    await screen.findByText('Nothing between us');
    fireEvent.click(screen.getByRole('button', { name: 'Start a new term' }));
    fireEvent.change(screen.getByLabelText('Study title'), { target: { value: 'Acts' } });
    fireEvent.change(screen.getByLabelText('Term'), { target: { value: 'Spring 2027' } });
    // The slug is not up for editing — it is on the poster.
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start the term' }));

    await waitFor(() =>
      expect(bibleData.setActiveStudy).toHaveBeenCalledWith(
        expect.anything(),
        'cisa-wednesday',
        'acts-spring-2027',
      ),
    );
    expect(bibleData.createEntryPoint).not.toHaveBeenCalled();
  });
});
