import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PublicStudyReader from '../views/PublicStudyReader';
import * as bibleData from '../lib/data/bibleStudy';

vi.mock('../lib/data/bibleStudy', () => ({
  subscribePublishedStudyMeetings: vi.fn(),
}));

describe('PublicStudyReader (above the seam)', () => {
  const sampleMeeting = {
    id: 'm-romans-wk1',
    studyId: 'romans',
    date: '2026-09-01',
    title: 'Peace that holds',
    published: true,
    sections: [
      {
        id: 'where-peace-starts',
        title: 'Where peace starts',
        ref: 'Romans 5:1–2 · WEB',
        points: [
          { before: 'Peace with God is a ', word: 'standing', after: ', not a mood.' },
          { before: 'Plain point with no blanks' },
        ],
        passage: {
          before: 'Being therefore justified by faith... into this grace in which we ',
          word: 'stand',
          after: '.',
        },
        prompt: {
          kind: 'discuss' as const,
          text: 'Where do you catch yourself treating peace as a feeling?',
        },
      },
      {
        id: 'what-suffering-is-doing',
        title: 'What suffering is doing',
        points: [],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without an authenticated user and displays section content', async () => {
    (bibleData.subscribePublishedStudyMeetings as any).mockImplementation((_db: any, _studyId: string, cb: any) => {
      cb([sampleMeeting]);
      return () => {};
    });

    render(
      <MemoryRouter initialEntries={['/s/romans']}>
        <Routes>
          <Route path="/s/:studyId" element={<PublicStudyReader />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Where peace starts')).toBeInTheDocument();
    expect(screen.getByText(/Peace that holds/i)).toBeInTheDocument();
    expect(screen.getByText(/Plain point with no blanks/i)).toBeInTheDocument();
    expect(screen.getByText('Discuss')).toBeInTheDocument();
  });

  it('shows the date when visiting a stale permalink', async () => {
    const olderMeeting = { ...sampleMeeting, id: 'm-older', date: '2026-08-25', title: 'Older Week' };
    const newestMeeting = { ...sampleMeeting, id: 'm-newest', date: '2026-09-01', title: 'Newest Week' };

    (bibleData.subscribePublishedStudyMeetings as any).mockImplementation((_db: any, _studyId: string, cb: any) => {
      cb([newestMeeting, olderMeeting]);
      return () => {};
    });

    render(
      <MemoryRouter initialEntries={['/s/romans/2026-08-25']}>
        <Routes>
          <Route path="/s/:studyId/:date" element={<PublicStudyReader />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Tuesday, August 25/i)).toBeInTheDocument();
  });

  it('tapping a Blank reveals its hidden word', async () => {
    (bibleData.subscribePublishedStudyMeetings as any).mockImplementation((_db: any, _studyId: string, cb: any) => {
      cb([sampleMeeting]);
      return () => {};
    });

    render(
      <MemoryRouter initialEntries={['/s/romans']}>
        <Routes>
          <Route path="/s/:studyId" element={<PublicStudyReader />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Where peace starts');

    // Blank is initially not revealed in text
    expect(screen.queryByText('standing')).not.toBeInTheDocument();

    const blankButtons = screen.getAllByRole('button', { name: /Blank, tap to reveal/i });
    fireEvent.click(blankButtons[0]);

    // After click, the word appears
    expect(screen.getByText('standing')).toBeInTheDocument();
  });
});
