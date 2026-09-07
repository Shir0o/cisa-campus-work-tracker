import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PublicStudyReader from '../views/PublicStudyReader';
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
        points: [
          { before: 'Peace with God is a ', word: 'standing', after: ', not a mood.' },
          { before: 'A plain point with no blanks' },
        ],
        prompt: { kind: 'discuss', text: 'Where do you need this peace?' },
      },
      {
        id: 'sec-2',
        title: 'What suffering is doing',
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
      cb(entryPoint);
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

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/s/:slug" element={<PublicStudyReader />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the resolved Meeting for an anonymous scan of /s/:slug', async () => {
    mockChain([sampleMeeting]);

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByText('Where peace starts')).toBeInTheDocument();
    expect(screen.getByText(/Peace that holds/i)).toBeInTheDocument();
    expect(screen.getByText(/Plain point with no blanks/i)).toBeInTheDocument();
    expect(screen.getByText('Discuss')).toBeInTheDocument();
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

  it('renders the never-published state when the study has no published Meeting', async () => {
    mockChain([{ ...sampleMeeting, published: false }]);

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByText('No Study Available')).toBeInTheDocument();
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

  it('advances sections on tap, goes back with back button, and jumps via section drawer', async () => {
    mockChain([sampleMeeting]);

    renderAt('/s/cisa-wednesday');

    expect(await screen.findByText('Where peace starts')).toBeInTheDocument();

    // Tap anywhere to advance to section 2
    fireEvent.click(screen.getByText('Where peace starts'));
    expect(await screen.findByText('What suffering is doing')).toBeInTheDocument();

    // Tap previous section button
    const backBtn = screen.getByLabelText('Previous section');
    fireEvent.click(backBtn);
    expect(await screen.findByText('Where peace starts')).toBeInTheDocument();

    // Toggle distraction-free unadorned mode
    const distractionBtn = screen.getByLabelText('Distraction-free mode');
    fireEvent.click(distractionBtn);
    fireEvent.click(distractionBtn);

    // Open section index scrubber
    const openGrip = screen.getByLabelText('Open section index');
    fireEvent.click(openGrip);

    // Click jump in scrubber
    const indexRows = screen.getAllByText('What suffering is doing');
    fireEvent.click(indexRows[0]);
    expect(await screen.findByText('What suffering is doing')).toBeInTheDocument();
  });
});
