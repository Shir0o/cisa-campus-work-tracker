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

// The reader picks its layout from its OWN box, not the window (#1590), so the
// editor's 390-wide phone preview stays a phone inside a wide desktop window.
// jsdom has no layout; this per-test stub captures every ResizeObserver and
// lets a test report a size for the reader's root — the same seam the shipped
// measurement uses.
function stubReaderBox() {
  const observers: { cb: ResizeObserverCallback; targets: Element[] }[] = [];
  class StubObserver {
    entry: { cb: ResizeObserverCallback; targets: Element[] };
    constructor(cb: ResizeObserverCallback) {
      this.entry = { cb, targets: [] };
      observers.push(this.entry);
    }
    observe(target: Element) {
      this.entry.targets.push(target);
    }
    unobserve() {}
    disconnect() {
      this.entry.targets = [];
    }
  }
  vi.stubGlobal('ResizeObserver', StubObserver);
  return {
    resize: (width: number, height: number) => {
      const root = document.querySelector('.reader-card-surface')!;
      act(() => {
        for (const o of observers) {
          if (!o.targets.includes(root)) continue;
          o.cb(
            [{ target: root, contentRect: { width, height } } as unknown as ResizeObserverEntry],
            {} as ResizeObserver,
          );
        }
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

  it('does not show a stored Section\'s legacy citation in the Section index', () => {
    const m = meeting({});
    m.sections[1] = { ...m.sections[1], ref: 'Romans 5:3–4 · WEB' };
    render(<StudyReaderView meeting={m} staleDateLabel={null} />);

    fireEvent.click(screen.getByLabelText('Open section index'));
    expect(screen.queryByText('Romans 5:3–4 · WEB')).toBeNull();
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

  describe('the paged deck on a wide reader (#1590)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const sectionHeading = () => screen.getByRole('heading', { level: 2 });

    it('shows every Section as a tab and one Section at a time', () => {
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      box.resize(1280, 800);

      const tabs = within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('button');
      expect(tabs.map((t) => t.textContent)).toEqual([
        'Where peace starts',
        'What suffering is doing',
        'The end of the week',
      ]);
      expect(tabs[0]).toHaveAttribute('aria-current', 'step');
      expect(sectionHeading()).toHaveTextContent('Where peace starts');
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
      // The phone's peek and edge index give way to the tabs and Next.
      expect(screen.queryByTestId('peek-0')).toBeNull();
      expect(screen.queryByLabelText('Open section index')).toBeNull();
    });

    it('steps with Previous and Next, naming the next Section and ending the Meeting', () => {
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      box.resize(1280, 800);

      const footer = screen.getByTestId('paged-footer');
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
      expect(footer).toHaveTextContent('01 / 03');

      fireEvent.click(screen.getByRole('button', { name: 'Next: What suffering is doing' }));
      expect(sectionHeading()).toHaveTextContent('What suffering is doing');
      expect(footer).toHaveTextContent('02 / 03');
      expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'Next: The end of the week' }));
      expect(sectionHeading()).toHaveTextContent('The end of the week');
      // The last Section ends the Meeting in place of Next.
      expect(screen.queryByRole('button', { name: /^Next/ })).toBeNull();
      expect(footer).toHaveTextContent('End of Peace that holds');

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      expect(sectionHeading()).toHaveTextContent('What suffering is doing');
    });

    it('jumps to any Section from its tab', () => {
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      box.resize(1280, 800);

      const nav = screen.getByRole('navigation', { name: 'Sections' });
      fireEvent.click(within(nav).getByRole('button', { name: 'The end of the week' }));

      expect(sectionHeading()).toHaveTextContent('The end of the week');
      expect(within(nav).getByRole('button', { name: 'The end of the week' })).toHaveAttribute('aria-current', 'step');
      expect(within(nav).getByRole('button', { name: 'Where peace starts' })).not.toHaveAttribute('aria-current');
      expect(screen.getByTestId('paged-footer')).toHaveTextContent('03 / 03');
    });

    it('pages with the arrow keys and Page Up / Page Down', () => {
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      box.resize(1280, 800);

      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(sectionHeading()).toHaveTextContent('What suffering is doing');
      fireEvent.keyDown(document.body, { key: 'PageDown' });
      expect(sectionHeading()).toHaveTextContent('The end of the week');
      // Past the last Section, a key does nothing rather than wrapping.
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(sectionHeading()).toHaveTextContent('The end of the week');
      fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
      expect(sectionHeading()).toHaveTextContent('What suffering is doing');
      fireEvent.keyDown(document.body, { key: 'PageUp' });
      expect(sectionHeading()).toHaveTextContent('Where peace starts');
    });

    it('leaves the keys alone while typing or with a modifier held', () => {
      const box = stubReaderBox();
      render(
        <>
          <input aria-label="Notes" />
          <StudyReaderView meeting={meeting({})} staleDateLabel={null} />
        </>,
      );
      box.resize(1280, 800);

      fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'ArrowRight' });
      expect(sectionHeading()).toHaveTextContent('Where peace starts');
      fireEvent.keyDown(document.body, { key: 'ArrowRight', altKey: true });
      expect(sectionHeading()).toHaveTextContent('Where peace starts');
    });

    it('keeps a revealed Blank revealed after paging away and back', () => {
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      box.resize(1280, 800);

      fireEvent.click(screen.getByRole('button', { name: /Blank, tap to reveal/i }));
      expect(screen.getByText('standing')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
      expect(screen.queryByText('standing')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      expect(screen.getByText('standing')).toBeInTheDocument();
    });

    it('opens each new Section at its top', () => {
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      box.resize(1280, 800);

      const card = screen.getByTestId('paged-card');
      card.scrollTop = 240;
      fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
      expect(card.scrollTop).toBe(0);
    });

    it('stays scrolling below either floor — narrow, or a phone held sideways', () => {
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      box.resize(390, 844);
      expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
      expect(screen.getByTestId('peek-0')).toBeInTheDocument();

      box.resize(900, 420);
      expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
      expect(screen.getByTestId('reader-deck')).toBeInTheDocument();
    });

    it('keeps the Section and its revealed Blanks when a tablet rotates into the paged deck', () => {
      const io = stubIntersectionObserver();
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      fireEvent.click(screen.getByRole('button', { name: /Blank, tap to reveal/i }));
      io.fire(io.observed[1], true);
      box.resize(1180, 820);

      expect(sectionHeading()).toHaveTextContent('What suffering is doing');
      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      expect(screen.getByText('standing')).toBeInTheDocument();
    });

    it('scrolls to the paged Section when a tablet rotates back to the scrolling deck', () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      box.resize(1180, 820);
      fireEvent.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: 'The end of the week' }));
      scrollIntoView.mockClear();

      box.resize(700, 1000);

      expect(screen.getByTestId('reader-deck')).toBeInTheDocument();
      expect(scrollIntoView).toHaveBeenCalled();
      const panel = scrollIntoView.mock.instances[scrollIntoView.mock.instances.length - 1] as HTMLElement;
      expect(panel.getAttribute('data-section-panel')).toBe('2');
      expect(screen.getByTestId('reader-header')).toHaveTextContent('03 / 03');
    });

    it('announces each page change without moving focus', () => {
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      box.resize(1280, 800);

      const next = screen.getByRole('button', { name: /^Next/ });
      next.focus();
      fireEvent.click(next);

      expect(screen.getByTestId('paged-announcement')).toHaveTextContent('Section 2 of 3: What suffering is doing');
      expect(screen.getByTestId('paged-announcement')).toHaveAttribute('aria-live', 'polite');
      expect(document.activeElement).toBe(next);
    });

    it('keeps the stale-week chip and the caller\'s header actions', () => {
      const box = stubReaderBox();
      render(
        <StudyReaderView
          meeting={meeting({})}
          staleDateLabel="Most recent · September 2"
          headerActions={<button type="button">Show QR</button>}
        />,
      );
      box.resize(1280, 800);

      expect(screen.getByTestId('stale-date-chip')).toHaveTextContent('Most recent · September 2');
      expect(screen.getByRole('button', { name: 'Show QR' })).toBeInTheDocument();
      expect(screen.getByLabelText('Text size')).toBeInTheDocument();
    });

    it('opens on initialSectionIndex and reports every page through onSectionChange', () => {
      const box = stubReaderBox();
      const onSectionChange = vi.fn();
      render(
        <StudyReaderView
          meeting={meeting({})}
          staleDateLabel={null}
          initialSectionIndex={1}
          onSectionChange={onSectionChange}
        />,
      );
      box.resize(1280, 800);

      expect(sectionHeading()).toHaveTextContent('What suffering is doing');
      fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
      expect(onSectionChange).toHaveBeenLastCalledWith(2);
    });

    it('shows the Section named by followSectionIndex', () => {
      const box = stubReaderBox();
      const { rerender } = render(
        <StudyReaderView meeting={meeting({})} staleDateLabel={null} followSectionIndex={0} />,
      );
      box.resize(1280, 800);

      rerender(<StudyReaderView meeting={meeting({})} staleDateLabel={null} followSectionIndex={2} />);
      expect(sectionHeading()).toHaveTextContent('The end of the week');
    });

    it('binds no keys on the scrolling deck', () => {
      const io = stubIntersectionObserver();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      expect(io.observed).toHaveLength(3);

      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(screen.getByTestId('reader-header')).toHaveTextContent('01 / 03');
    });
  });

  describe('the text-size control (#923)', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('offers the agreed range from a control in the reader chrome', () => {
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      const trigger = screen.getByLabelText('Text size');
      // The control lives in the sticky header — the reader's chrome.
      expect(trigger.closest('[data-testid="reader-header"]')).not.toBeNull();

      fireEvent.click(trigger);
      const popover = screen.getByTestId('text-size-popover');
      for (const size of [16, 18, 20, 22]) {
        expect(within(popover).getByRole('button', { name: String(size) })).toBeInTheDocument();
      }
    });

    it('renders body text at the raised default with no stored preference', () => {
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      const root = document.querySelector('.reader-card-surface') as HTMLElement;
      expect(root.style.getPropertyValue('--reader-fs')).toBe('20px');
    });

    it('choosing a size records it in browser storage and applies it immediately', () => {
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      fireEvent.click(screen.getByLabelText('Text size'));
      fireEvent.click(screen.getByRole('button', { name: '22' }));

      expect(localStorage.getItem('cisa.reader.type-size.v1')).toBe('22');
      const root = document.querySelector('.reader-card-surface') as HTMLElement;
      expect(root.style.getPropertyValue('--reader-fs')).toBe('22px');
    });

    it('a reader returning with a stored size applies it on mount', () => {
      localStorage.setItem('cisa.reader.type-size.v1', '18');
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      const root = document.querySelector('.reader-card-surface') as HTMLElement;
      expect(root.style.getPropertyValue('--reader-fs')).toBe('18px');
    });

    it('a stored size that cannot be read falls back to the default without erroring', () => {
      localStorage.setItem('cisa.reader.type-size.v1', 'banana');
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      const root = document.querySelector('.reader-card-surface') as HTMLElement;
      expect(root.style.getPropertyValue('--reader-fs')).toBe('20px');
      expect(screen.getByText('Where peace starts')).toBeInTheDocument();
    });

    it("one student's choice does not change what any other student sees", () => {
      localStorage.setItem('cisa.reader.type-size.v1', '22');
      const first = render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      const firstRoot = document.querySelector('.reader-card-surface') as HTMLElement;
      expect(firstRoot.style.getPropertyValue('--reader-fs')).toBe('22px');
      first.unmount();

      localStorage.setItem('cisa.reader.type-size.v1', '16');
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      const secondRoot = document.querySelector('.reader-card-surface') as HTMLElement;
      expect(secondRoot.style.getPropertyValue('--reader-fs')).toBe('16px');
    });

    it("renders every Section's blocks at every size in the range", () => {
      const m = meeting({
        sections: [
          {
            id: 'sec-all',
            title: 'All blocks',
            content: [
              { kind: 'prose', md: 'Prose block.' },
              { kind: 'bullet-list', points: [{ before: 'A list point' }] },
              { kind: 'passage', passage: { before: 'The passage words' }, ref: 'Romans 5:1' },
              { kind: 'verse', ref: 'Rom. 5:6', verse: { before: 'the verse words' } },
              { kind: 'prompt', prompt: { kind: 'question', text: 'A question prompt' } },
            ],
            points: [],
          },
        ],
      });

      for (const size of [16, 18, 20, 22]) {
        localStorage.setItem('cisa.reader.type-size.v1', String(size));
        const view = render(<StudyReaderView meeting={m} staleDateLabel={null} />);
        expect(screen.getByText('Prose block.')).toBeInTheDocument();
        expect(screen.getByText('A list point')).toBeInTheDocument();
        expect(screen.getByText('The passage words')).toBeInTheDocument();
        expect(screen.getByText('the verse words')).toBeInTheDocument();
        expect(screen.getByText('A question prompt')).toBeInTheDocument();
        view.unmount();
      }
    });

    it('keeps the peek and end-of-Meeting treatments at a non-default size', () => {
      localStorage.setItem('cisa.reader.type-size.v1', '22');
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      expect(screen.getByTestId('peek-0')).toHaveTextContent('What suffering is doing');
      expect(screen.getByTestId('reader-end')).toBeInTheDocument();
    });

    it('dismisses the popover on outside click or Escape', () => {
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      fireEvent.click(screen.getByLabelText('Text size'));
      expect(screen.getByTestId('text-size-popover')).toBeInTheDocument();

      // Outside click closes it.
      fireEvent.mouseDown(document.body);
      expect(screen.queryByTestId('text-size-popover')).toBeNull();

      // Reopen, then Escape closes it.
      fireEvent.click(screen.getByLabelText('Text size'));
      expect(screen.getByTestId('text-size-popover')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('text-size-popover')).toBeNull();
    });
  });
});