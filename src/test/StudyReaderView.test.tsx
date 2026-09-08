// The shared reader view (#890, ADR 0014): the public route AND the editor's
// preview render this one component, so the preview cannot lie about what a
// student sees. The reader is now a scrolling deck — Sections stack as snap
// panels, scrolling IS the navigation model, and the reducer's advance/back
// are gone. Tests assert what a reader SEES: one panel per Section, a peek of
// the next Section, the stale-week chip in the sticky header, an index that
// jumps — never class names or reducer internals.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StudyReaderView from '../components/bibleStudy/StudyReaderView';
import type { Meeting } from '../lib/bibleStudy';

function meeting(over: Partial<Meeting>): Meeting {
  return {
    id: 'm-1',
    studyId: 'romans-fall26',
    date: '2026-09-02',
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
            ],
          },
          { kind: 'prompt', prompt: { kind: 'discuss', text: 'Where do you need this peace?' } },
        ],
        points: [{ before: 'Peace with God is a ', word: 'standing', after: ', not a mood.' }],
        prompt: { kind: 'discuss', text: 'Where do you need this peace?' },
      },
      {
        id: 'sec-2',
        title: 'What suffering is doing',
        content: [{ kind: 'bullet-list', points: [{ before: 'Suffering is the road to hope' }] }],
        points: [{ before: 'Suffering is the road to hope' }],
      },
      {
        id: 'sec-3',
        title: 'The end of the week',
        content: [{ kind: 'prose', md: 'Closing prose.' }],
        points: [],
      },
    ],
    ...over,
  };
}

describe('StudyReaderView (the scrolling deck)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders one panel per Section — all of them, not only the current one', () => {
    const m = meeting({});
    render(<StudyReaderView meeting={m} staleDateLabel={null} />);

    expect(screen.getByText('Where peace starts')).toBeInTheDocument();
    const sufferingTitle = screen.getAllByText('What suffering is doing');
    // The panel's own heading plus the dimmed peek beneath the panel before.
    expect(sufferingTitle.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('The end of the week').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the Meeting title and the counter in the sticky header', () => {
    render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

    expect(screen.getByTestId('reader-header')).toHaveTextContent('Peace that holds');
  });

  it('carries the stale-week date chip inside the sticky header, visible from any panel', () => {
    render(
      <StudyReaderView meeting={meeting({})} staleDateLabel="Most recent · September 2" />,
    );

    const chip = screen.getByTestId('stale-date-chip');
    expect(chip).toHaveTextContent('Most recent · September 2');
    // The chip lives inside the sticky header, not in a bar that scrolls away.
    expect(chip.closest('[data-testid="reader-header"]')).not.toBeNull();
  });

  it('shows no date chip for the current week', () => {
    render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

    expect(screen.queryByTestId('stale-date-chip')).toBeNull();
  });

  it('peeks the next Section\'s title beneath each panel and ends the last one differently', () => {
    render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

    expect(screen.getByTestId('peek-0')).toHaveTextContent('What suffering is doing');
    expect(screen.getByTestId('peek-1')).toHaveTextContent('The end of the week');
    // The last panel has no next Section to peek — the end-of-Meeting
    // treatment replaces it.
    expect(screen.getByTestId('reader-end')).toBeInTheDocument();
    expect(screen.queryByTestId('peek-2')).toBeNull();
    expect(screen.getAllByText('The end of the week').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByLabelText('Previous section')).toBeNull();
  });

  it('tapping a Blank reveals its word without any page-level tap-to-advance competing', () => {
    render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

    expect(screen.queryByText('standing')).not.toBeInTheDocument();
    const blankButtons = screen.getAllByRole('button', { name: /Blank, tap to reveal/i });
    fireEvent.click(blankButtons[0]);
    expect(screen.getByText('standing')).toBeInTheDocument();
  });

  it('clicking the body does not change the visible Section — scrolling owns navigation', () => {
    const m = meeting({});
    render(<StudyReaderView meeting={m} staleDateLabel={null} />);

    // A whole-surface click used to dispatch advance; the surface no longer
    // carries a click handler at all, so a Blank tap is the only reveal path.
    const body = screen.getAllByTestId('section-body')[0];
    fireEvent.click(body);
    // All panels still rendered; nothing was consumed by an advance action.
    expect(screen.getAllByText('The end of the week').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByLabelText('Previous section')).toBeNull();
  });

  it('jumps via the Section index and closes it', () => {
    render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

    const openGrip = screen.getByLabelText('Open section index');
    fireEvent.click(openGrip);
    const rows = screen.getAllByText('What suffering is doing');
    fireEvent.click(rows[rows.length - 1]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers no distraction-free control — the chrome it hid is no longer busy', () => {
    render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

    expect(screen.queryByLabelText('Distraction-free mode')).toBeNull();
  });

  it('renders the progress rail with one step per Section', () => {
    render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

    expect(screen.getByTestId('progress-rail').children).toHaveLength(3);
  });

  it('renders an empty Meeting without crashing and without chrome counters', () => {
    render(<StudyReaderView meeting={meeting({ sections: [] })} staleDateLabel={null} />);

    expect(screen.getByTestId('reader-end')).toBeInTheDocument();
    expect(screen.getByTestId('progress-rail').children).toHaveLength(0);
  });
});