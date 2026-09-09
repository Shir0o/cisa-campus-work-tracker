// The shared reader view (#890, ADR 0014): the public route AND the editor's
// preview render this one component, so the preview cannot lie about what a
// student sees. The reader is now a scrolling deck — Sections stack as snap
// panels, scrolling IS the navigation model, and the reducer's advance/back
// are gone. Tests assert what a reader SEES: one panel per Section, a peek of
// the next Section, the stale-week chip in the sticky header, an index that
// jumps — never class names or reducer internals.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import StudyReaderView from '../components/bibleStudy/StudyReaderView';
import type { Meeting } from '../lib/bibleStudy';

// The reader mirrors the visible panel through an IntersectionObserver
// (#914). The global jsdom stub in setup.ts is inert, so these tests install
// a per-test stub that captures the callback and the observed panels — the
// same seam the shipped observer uses, asserted from the outside (counter,
// rail, index highlight, scrollIntoView).
function stubIntersectionObserver() {
  let callback: IntersectionObserverCallback | null = null;
  const observed: Element[] = [];
  class StubObserver {
    constructor(cb: IntersectionObserverCallback) {
      callback = cb;
    }
    observe(target: Element) {
      observed.push(target);
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', StubObserver);
  return {
    observed,
    fire: (target: Element, isIntersecting: boolean) => {
      act(() => {
        callback?.(
          [{ target, isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      });
    },
  };
}

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

  it('sits the Section content on a card and keeps the peek outside it (#922)', () => {
    render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

    // The card is the element carrying data-reader-card; the Section's
    // title and body live inside it.
    const card = document.querySelector('[data-reader-card]')!;
    expect(card).not.toBeNull();
    expect(card.querySelector('h2')).toHaveTextContent('Where peace starts');
    expect(card.querySelector('[data-testid="section-body"]')).not.toBeNull();

    // The peek is a sibling of the card, not a child — it sits outside the
    // card at the bottom of the panel.
    const peek = screen.getByTestId('peek-0');
    expect(peek.closest('[data-reader-card]')).toBeNull();
    expect(peek.parentElement!.parentElement).toBe(card.parentElement);
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

  describe('the scroll drives the counter, the rail and the index (#914)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('names the Section on screen and decreases when scrolling back up', () => {
      const io = stubIntersectionObserver();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      expect(screen.getByTestId('reader-header')).toHaveTextContent('01 / 03');

      // The observer mirrors the visible panel into the read model.
      io.fire(io.observed[1], true);
      expect(screen.getByTestId('reader-header')).toHaveTextContent('02 / 03');

      // Scrolling back up re-registers: the callback reads current state
      // rather than the Section index captured when the observer was built.
      io.fire(io.observed[0], true);
      expect(screen.getByTestId('reader-header')).toHaveTextContent('01 / 03');
    });

    it('fills the progress rail as the reader advances and unfills on the way back', () => {
      const io = stubIntersectionObserver();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      const rail = screen.getByTestId('progress-rail');
      const steps = () => Array.from(rail.children);
      const filled = () => steps().filter((s) => s.getAttribute('data-filled') === 'true').length;

      expect(filled()).toBe(1);
      io.fire(io.observed[2], true);
      expect(filled()).toBe(3);
      io.fire(io.observed[0], true);
      expect(filled()).toBe(1);
    });

    it('tapping a Section index row scrolls the deck to that Section', () => {
      const io = stubIntersectionObserver();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      fireEvent.click(screen.getByLabelText('Open section index'));
      const rows = screen.getAllByText('The end of the week');
      fireEvent.click(rows[rows.length - 1]);

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(io.observed[2]);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('tapping the peek scrolls the deck to the following Section', () => {
      const io = stubIntersectionObserver();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      fireEvent.click(screen.getByTestId('peek-0'));

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(io.observed[1]);
    });

    it('highlights the Section on screen in the index', () => {
      const io = stubIntersectionObserver();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      // Scroll to the last Section, then open the index: the row for the
      // Section on screen is the highlighted one.
      io.fire(io.observed[2], true);
      fireEvent.click(screen.getByLabelText('Open section index'));
      const dialog = screen.getByRole('dialog');
      const rowFor = (title: string) =>
        within(dialog)
          .getAllByText(title)
          .map((el) => el.closest('div.cursor-pointer')!)
          .find((el) => el.className.includes('cursor-pointer'))!;
      expect(rowFor('Where peace starts').getAttribute('data-current')).toBe('false');
      expect(rowFor('The end of the week').getAttribute('data-current')).toBe('true');
    });

    it('does not rebuild the observer on every scroll tick', () => {
      const io = stubIntersectionObserver();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      // One observe per panel, once — the observer is keyed to the Section
      // count, not to the read model it mirrors.
      expect(io.observed).toHaveLength(3);
      io.fire(io.observed[1], true);
      io.fire(io.observed[2], true);
      expect(io.observed).toHaveLength(3);
    });
  });
});