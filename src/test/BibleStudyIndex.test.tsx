import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  beforeEach(() => {
    vi.clearAllMocks();
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
      cb(MEETINGS);
      return () => {};
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

    await waitFor(() => {
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          studyId: 'romans-fall26',
          date: '2026-10-28',
          published: false,
        }),
        mockUser.uid,
      );
    });

    expect(await screen.findByText('Editor opened')).toBeInTheDocument();
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
});
