import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BibleStudyRead from '../views/BibleStudyRead';
import * as bibleData from '../lib/data/bibleStudy';
import * as auth from '../components/AuthProvider';
import type { EntryPoint, Meeting, Study } from '../lib/bibleStudy';

vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('../lib/data/bibleStudy', () => ({
  subscribeEntryPoint: vi.fn(),
  subscribeEntryPoints: vi.fn(),
  subscribePublishedStudyMeetings: vi.fn(),
  subscribeStudy: vi.fn(),
}));

describe("This week's study (#946)", () => {
  const today = new Date().toISOString().slice(0, 10);

  const WEDNESDAY: EntryPoint = {
    id: 'cisa-wednesday',
    slug: 'cisa-wednesday',
    name: 'Wednesday Bible Study',
    activeStudyId: 'romans-fall26',
  };
  const THURSDAY: EntryPoint = {
    id: 'cisa-thursday',
    slug: 'cisa-thursday',
    name: 'Thursday 7pm',
    activeStudyId: 'romans-fall26',
  };
  const STUDY: Study = { id: 'romans-fall26', title: 'Romans', term: 'Fall 2026' };
  const MEETING: Meeting = {
    id: 'm-1',
    studyId: 'romans-fall26',
    date: today,
    title: 'Alive to God',
    published: true,
    sections: [{ id: 's-1', title: 'Opening', content: [], points: [] }],
  };

  function mockChain(opts: {
    entryPoints: EntryPoint[];
    meetings?: Meeting[];
    study?: Study | null;
  }) {
    const { entryPoints, meetings = [MEETING], study = STUDY } = opts;
    vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
      cb(entryPoints);
      return () => {};
    });
    vi.mocked(bibleData.subscribeEntryPoint).mockImplementation((_db, slug, cb) => {
      cb(entryPoints.find((ep) => ep.slug === slug) ?? null);
      return () => {};
    });
    vi.mocked(bibleData.subscribeStudy).mockImplementation((_db, _id, cb) => {
      cb(study);
      return () => {};
    });
    vi.mocked(bibleData.subscribePublishedStudyMeetings).mockImplementation((_db, _id, cb) => {
      cb(meetings);
      return () => {};
    });
  }

  const renderAt = (path = '/bible-study/read') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/bible-study/read" element={<BibleStudyRead />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(auth.useAuth).mockReturnValue({ isAdmin: false } as ReturnType<typeof auth.useAuth>);
  });

  it('opens the only entry point silently — a chooser over a list of one is a wasted tap', async () => {
    mockChain({ entryPoints: [WEDNESDAY] });
    renderAt();
    expect(await screen.findByText('Alive to God')).toBeInTheDocument();
    expect(screen.queryByText("There's more than one")).not.toBeInTheDocument();
  });

  it('asks which room when a week is taught in two, then remembers the answer per device', async () => {
    // A split week is two Entry points (ADR 0011 §4) and only the person knows
    // which one they walked into.
    mockChain({ entryPoints: [WEDNESDAY, THURSDAY] });
    const { unmount } = renderAt();

    expect(await screen.findByText("There's more than one")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thursday 7pm' }));
    expect(await screen.findByText('Alive to God')).toBeInTheDocument();
    unmount();

    // Second visit, no `?ep=`: the remembered pick stands in for the chooser.
    mockChain({ entryPoints: [WEDNESDAY, THURSDAY] });
    renderAt();
    expect(await screen.findByText('Alive to God')).toBeInTheDocument();
    expect(screen.queryByText("There's more than one")).not.toBeInTheDocument();
  });

  it('honours an addressed entry point over the remembered one', async () => {
    window.localStorage.setItem('cisa.bibleStudy.entryPoint', 'cisa-thursday');
    mockChain({ entryPoints: [WEDNESDAY, THURSDAY] });
    renderAt('/bible-study/read?ep=cisa-wednesday');

    await screen.findByText('Alive to God');
    expect(vi.mocked(bibleData.subscribeEntryPoint).mock.calls.at(-1)?.[1]).toBe('cisa-wednesday');
  });

  it('offers Show QR and Copy link to everyone, and the editor to Full-timers only', async () => {
    mockChain({ entryPoints: [WEDNESDAY] });
    const { unmount } = renderAt();

    await screen.findByText('Alive to God');
    expect(screen.getByRole('link', { name: 'Show QR' })).toHaveAttribute(
      'href',
      '/bible-study/present?ep=cisa-wednesday',
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit this week' })).not.toBeInTheDocument();
    unmount();

    vi.mocked(auth.useAuth).mockReturnValue({ isAdmin: true } as ReturnType<typeof auth.useAuth>);
    mockChain({ entryPoints: [WEDNESDAY] });
    renderAt();
    await screen.findByText('Alive to God');
    expect(await screen.findByRole('link', { name: 'Edit this week' })).toHaveAttribute(
      'href',
      '/bible-study/m-1',
    );
  });

  it('copies the durable entry point URL, not the app route', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mockChain({ entryPoints: [WEDNESDAY] });
    renderAt();

    await screen.findByText('Alive to God');
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toMatch(/\/s\/cisa-wednesday$/);
  });

  it('shows the between-terms state rather than an empty page', async () => {
    mockChain({ entryPoints: [{ ...WEDNESDAY, activeStudyId: null }], study: null });
    renderAt();
    expect(await screen.findByText('Nothing running right now')).toBeInTheDocument();
  });

  it('distinguishes a study that has never published a week', async () => {
    mockChain({ entryPoints: [WEDNESDAY], meetings: [] });
    renderAt();
    expect(await screen.findByText('The study has never published a week')).toBeInTheDocument();
  });

  it('says so when nothing has been set up at all', async () => {
    mockChain({ entryPoints: [] });
    renderAt();
    expect(await screen.findByText('No study set up yet')).toBeInTheDocument();
  });
});
