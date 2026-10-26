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
import { LanguageProvider } from '../components/LanguageProvider';
import type { Meeting } from '../lib/bibleStudy';

// The reader's scroll deck owns "which Section am I on": it reads the deck's
// box and each panel's top, and picks the last panel whose top has crossed a
// line 45% down the deck (#1622, the design of record). jsdom has no layout —
// every getBoundingClientRect is zero — so tests report the geometry through
// this seam and fire the deck's scroll event, the exact path the shipped
// listener uses. Panel height is whatever the test says: a panel taller than
// the deck is just a larger reported height, which is the escape the old
// 0.55 IntersectionObserver missed.
function stubDeckScroll(deckHeight = 600) {
  const deck = () => screen.getByTestId('reader-deck');
  const panels = () =>
    Array.from(deck().querySelectorAll('[data-section-panel]')) as HTMLElement[];
  const rect = (top: number, height: number) =>
    ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 0,
      width: 390,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  return {
    scroll: (panelTops: number[]) => {
      deck().getBoundingClientRect = () => rect(0, deckHeight);
      panels().forEach((panel, i) => {
        panel.getBoundingClientRect = () => rect(panelTops[i] ?? 0, 1000);
      });
      act(() => {
        fireEvent.scroll(deck());
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

  it('sets the Meeting title as the page h1 and keeps the Section titles h2 (#1814)', () => {
    render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Peace that holds');
    expect(screen.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('Where peace starts');
  });

  it('dates the current week plainly and names the study under the title (#1814)', () => {
    render(
      <StudyReaderView
        meeting={meeting({})}
        staleDateLabel={null}
        weekDateLabel="Wednesday, September 2"
        studyLabel="Romans · Fall 2026"
      />,
    );

    expect(screen.getByTestId('week-date-chip')).toHaveTextContent('Wednesday, September 2');
    expect(screen.getByTestId('study-identity')).toHaveTextContent('Romans · Fall 2026');
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

  it('shows no stale chip when the newest week is current', () => {
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

  it('opens and closes the Section index from the keyboard (#1777)', () => {
    render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

    // The grip is a real button, so it is in the tab order; the rows are
    // buttons, so the index can be used without a pointer; Escape closes it
    // (the only other way out was a "tap anywhere" hint).
    const grip = screen.getByRole('button', { name: 'Open section index' });
    fireEvent.click(grip);

    const dialog = screen.getByRole('dialog', { name: 'Section index' });
    const rows = within(dialog).getAllByRole('button');
    expect(rows).toHaveLength(meeting({}).sections.length);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('speaks the reader\'s own chrome in Spanish, not English (#1777)', () => {
    render(
      <LanguageProvider defaultLanguage="es">
        <StudyReaderView meeting={meeting({})} staleDateLabel={null} />
      </LanguageProvider>,
    );

    // The end-of-meeting line, the index and the Blank label are the strings a
    // Spanish reader navigates with; they used to be hard-coded English while
    // the text-size control was already translated.
    expect(screen.getByTestId('reader-end')).toHaveTextContent('Fin de Peace that holds');
    expect(screen.getByRole('button', { name: 'Abrir el índice de secciones' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Espacio en blanco, toca para revelar/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir el índice de secciones' }));
    const dialog = screen.getByRole('dialog', { name: 'Índice de secciones' });
    expect(dialog).toHaveTextContent('Toca en cualquier sitio para cerrar');
    expect(dialog).not.toHaveTextContent('End of');
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
      const deck = stubDeckScroll();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      expect(screen.getByTestId('reader-header')).toHaveTextContent('01 / 03');

      // The deck scrolls into the second Section (its top reaches the line).
      deck.scroll([-600, 0, 600]);
      expect(screen.getByTestId('reader-header')).toHaveTextContent('02 / 03');

      // Scrolling back up re-registers: the listener reads current state
      // rather than a Section index captured when it was attached.
      deck.scroll([0, 600, 1200]);
      expect(screen.getByTestId('reader-header')).toHaveTextContent('01 / 03');
    });

    it('follows a Section taller than the reader (#1622)', () => {
      const deck = stubDeckScroll();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      const rail = screen.getByTestId('progress-rail');
      const filled = () =>
        Array.from(rail.children).filter((s) => s.getAttribute('data-filled') === 'true').length;

      expect(screen.getByTestId('reader-header')).toHaveTextContent('01 / 03');
      expect(filled()).toBe(1);

      // Section 2 is 4000px tall in a 600px reader: its best possible
      // intersection ratio is 600 / 4000 = 0.15, so the old 0.55 threshold
      // never reported it and the rail/counter stalled. Position does.
      deck.scroll([-4000, 0, 4000]);
      expect(screen.getByTestId('reader-header')).toHaveTextContent('02 / 03');
      expect(filled()).toBe(2);

      // Reading on into Section 3 — also taller than the reader — moves the
      // rail and counter to it, and scrolling back reverses both.
      deck.scroll([-7000, -4000, 0]);
      expect(screen.getByTestId('reader-header')).toHaveTextContent('03 / 03');
      expect(filled()).toBe(3);
      deck.scroll([-4000, 0, 4000]);
      expect(screen.getByTestId('reader-header')).toHaveTextContent('02 / 03');
      expect(filled()).toBe(2);
    });

    it('fills the progress rail as the reader advances and unfills on the way back', () => {
      const deck = stubDeckScroll();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      const rail = screen.getByTestId('progress-rail');
      const steps = () => Array.from(rail.children);
      const filled = () => steps().filter((s) => s.getAttribute('data-filled') === 'true').length;

      expect(filled()).toBe(1);
      deck.scroll([-1200, -600, 0]);
      expect(filled()).toBe(3);
      deck.scroll([0, 600, 1200]);
      expect(filled()).toBe(1);
    });

    it('tapping a Section index row scrolls the deck to that Section', () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      fireEvent.click(screen.getByLabelText('Open section index'));
      const rows = screen.getAllByText('The end of the week');
      fireEvent.click(rows[rows.length - 1]);

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      const panel = scrollIntoView.mock.instances[0] as HTMLElement;
      expect(panel.getAttribute('data-section-panel')).toBe('2');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('tapping the peek scrolls the deck to the following Section', () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      fireEvent.click(screen.getByTestId('peek-0'));

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      const panel = scrollIntoView.mock.instances[0] as HTMLElement;
      expect(panel.getAttribute('data-section-panel')).toBe('1');
    });

    it('highlights the Section on screen in the index', () => {
      const deck = stubDeckScroll();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      // Scroll to the last Section, then open the index: the row for the
      // Section on screen is the highlighted one.
      deck.scroll([-1200, -600, 0]);
      fireEvent.click(screen.getByLabelText('Open section index'));
      const dialog = screen.getByRole('dialog');
      const rowFor = (title: string) =>
        within(dialog)
          .getAllByText(title)
          .map((el) => el.closest('[data-current]')!)
          .find((el) => el !== null)!;
      expect(rowFor('Where peace starts').getAttribute('data-current')).toBe('false');
      expect(rowFor('The end of the week').getAttribute('data-current')).toBe('true');
    });

    it('attaches one scroll listener, not one per tick', () => {
      const addSpy = vi.spyOn(Element.prototype, 'addEventListener');
      const deck = stubDeckScroll();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      const scrollAdds = () =>
        addSpy.mock.calls.filter(([type]) => type === 'scroll').length;
      // The listener is attached at mount — once, keyed to the Section count.
      expect(scrollAdds()).toBeGreaterThanOrEqual(1);
      addSpy.mockClear();

      // Scrolling changes the read model but never re-attaches the listener.
      deck.scroll([-600, 0, 600]);
      deck.scroll([-1200, -600, 0]);
      expect(scrollAdds()).toBe(0);
      addSpy.mockRestore();
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
      const deck = stubDeckScroll();
      const box = stubReaderBox();
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);

      fireEvent.click(screen.getByRole('button', { name: /Blank, tap to reveal/i }));
      deck.scroll([-600, 0, 600]);
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
      render(<StudyReaderView meeting={meeting({})} staleDateLabel={null} />);
      expect(document.querySelectorAll('[data-section-panel]')).toHaveLength(3);

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