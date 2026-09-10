import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BibleStudyPresent from '../views/BibleStudyPresent';
import * as bibleData from '../lib/data/bibleStudy';
import * as auth from '../components/AuthProvider';
import type { EntryPoint, Meeting, Study } from '../lib/bibleStudy';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/data/bibleStudy', () => ({
  subscribeEntryPoint: vi.fn(),
  subscribeEntryPoints: vi.fn(),
  subscribePublishedStudyMeetings: vi.fn(),
  subscribeStudy: vi.fn(),
}));

describe('BibleStudyPresent', () => {
  const today = new Date().toISOString().slice(0, 10);

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
    date: today,
    title: 'Alive to God',
    published: true,
    sections: [],
  };

  function mockChain(
    meetings: Meeting[],
    entryPoint: EntryPoint | null = ENTRY_POINT,
    study: Study | null = STUDY,
  ) {
    vi.mocked(bibleData.subscribeEntryPoint).mockImplementation((_db, _slug, cb) => {
      cb(entryPoint);
      return () => {};
    });
    vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
      cb(entryPoint ? [entryPoint] : []);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, _studyId, cb) => {
      cb(study);
      return () => {};
    });
    vi.mocked(bibleData.subscribePublishedStudyMeetings).mockImplementation((_db, _studyId, cb) => {
      cb(meetings);
      return () => {};
    });
  }

  // Present mode is any signed-in user's, and since #946 the role decides two
  // things on this screen: whether the edit pencil renders, and where Leave
  // falls back to. Default to a Full-timer — the existing cases were written
  // for the person who launched it from the editor.
  const signInAs = (isAdmin: boolean) => {
    vi.mocked(auth.useAuth).mockReturnValue({ isAdmin } as ReturnType<typeof auth.useAuth>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    signInAs(true);
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) }),
      },
      configurable: true,
    });
  });

  it('renders a generated QR encoding the entry point URL on a light ground', async () => {
    mockChain([MEETING]);

    render(
      <MemoryRouter>
        <BibleStudyPresent />
      </MemoryRouter>,
    );

    // The URL the QR encodes is stated on screen, and it is the production
    // entry point URL — never a localhost or preview origin.
    expect(await screen.findByText(/cisa-campus-work-tracker.pages.dev\/s\/cisa-wednesday/)).toBeInTheDocument();
    // A real QR is generated client-side: an svg rendered from local state.
    const qr = document.querySelector('svg[aria-label="QR code"]');
    expect(qr).not.toBeNull();
    // Light ground regardless of the viewer's theme — a dark ground behind a
    // QR hurts scan reliability.
    const ground = document.querySelector('.bg-white');
    expect(ground).not.toBeNull();
  });

  it('names the week and Study quietly beneath the code', async () => {
    mockChain([MEETING]);

    render(
      <MemoryRouter>
        <BibleStudyPresent />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Alive to God')).toBeInTheDocument();
    expect(screen.getByText(/Romans · Fall 2026/)).toBeInTheDocument();
  });

  it('keeps the screen awake while open and releases on unmount', async () => {
    mockChain([MEETING]);

    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const { unmount } = render(
      <MemoryRouter>
        <BibleStudyPresent />
      </MemoryRouter>,
    );
    await screen.findByText(/Alive to God/);
    expect(request).toHaveBeenCalledWith('screen');

    unmount();
    expect(release).toHaveBeenCalled();
  });

  it('still shows the code between terms, with no week named', async () => {
    mockChain([], { ...ENTRY_POINT, activeStudyId: null }, null);

    render(
      <MemoryRouter>
        <BibleStudyPresent />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/cisa-campus-work-tracker.pages.dev\/s\/cisa-wednesday/)).toBeInTheDocument();
    expect(screen.queryByText('Alive to God')).not.toBeInTheDocument();
  });

  it('leaves back to the weeks index, not the home page', async () => {
    mockChain([MEETING]);

    render(
      <MemoryRouter initialEntries={['/bible-study/present']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/bible-study" element={<div>Weeks index</div>} />
          <Route path="/bible-study/present" element={<BibleStudyPresent />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Leave present mode' }));
    expect(screen.getByText('Weeks index')).toBeInTheDocument();
  });

  it('a Trainee leaves back to the week they were reading, never the index (#946)', async () => {
    // The Weeks index is Full-timers only, so falling back to it bounced a
    // non-admin to their dashboard — breaking the very invariant the fallback
    // exists to hold ("leaving never lands on the home page").
    signInAs(false);
    mockChain([MEETING]);

    render(
      <MemoryRouter initialEntries={['/bible-study/present?ep=cisa-wednesday']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/bible-study" element={<div>Weeks index</div>} />
          <Route path="/bible-study/read" element={<div>This week's study</div>} />
          <Route path="/bible-study/present" element={<BibleStudyPresent />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Leave present mode' }));
    expect(screen.getByText("This week's study")).toBeInTheDocument();
  });

  it('offers a Full-timer the week\'s editor from the code, and nobody else (#946)', async () => {
    mockChain([MEETING]);
    const { unmount } = render(
      <MemoryRouter initialEntries={['/bible-study/present']}>
        <BibleStudyPresent />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Edit this week' })).toHaveAttribute(
      'href',
      '/bible-study/m-1',
    );
    unmount();

    signInAs(false);
    mockChain([MEETING]);
    render(
      <MemoryRouter initialEntries={['/bible-study/present']}>
        <BibleStudyPresent />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: 'Edit this week' })).not.toBeInTheDocument();
  });

  it("launched from a week's editor, leaves back to that week, not the index", async () => {
    mockChain([MEETING]);

    render(
      <MemoryRouter initialEntries={['/bible-study/present?meeting=romans-fall-2026-2026-09-16']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/bible-study" element={<div>Weeks index</div>} />
          <Route path="/bible-study/:meetingId" element={<div>That week's editor</div>} />
          <Route path="/bible-study/present" element={<BibleStudyPresent />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Leave present mode' }));
    expect(screen.getByText("That week's editor")).toBeInTheDocument();
    expect(screen.queryByText('Weeks index')).not.toBeInTheDocument();
  });

  it('ignores a meeting target that is not a plain meeting id, falling back to the index', async () => {
    mockChain([MEETING]);

    render(
      <MemoryRouter initialEntries={['/bible-study/present?meeting=https%3A%2F%2Fexample.com']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/bible-study" element={<div>Weeks index</div>} />
          <Route path="/bible-study/present" element={<BibleStudyPresent />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Leave present mode' }));
    expect(screen.getByText('Weeks index')).toBeInTheDocument();
  });

  it('rejects an underscore in the meeting target — the shape is letters, digits and hyphens only', async () => {
    mockChain([MEETING]);

    render(
      <MemoryRouter initialEntries={['/bible-study/present?meeting=a_b']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/bible-study" element={<div>Weeks index</div>} />
          <Route path="/bible-study/present" element={<BibleStudyPresent />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Leave present mode' }));
    expect(screen.getByText('Weeks index')).toBeInTheDocument();
  });
});
