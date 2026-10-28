// The shared reader view (#890, ADR 0014 — the one rendering path): the public
// reader route and the editor's live preview both render this component, so
// what the Full-timer approves is exactly what the room reads. The reader is a
// scrolling deck: Sections stack as scroll-snap panels, scrolling IS the
// navigation model (forward, back and overshoot-recovery come free from the
// browser), and tap-to-advance is gone — a Blank's tap is the only tap left.
//
// The scroll container owns "which Section am I on"; the reducer's sectionIndex
// is a READ MODEL mirrored from the deck's scroll position — the last panel
// whose top has crossed a line 45% down the deck (#1622) — and consumed only
// by the progress rail, the counter and the index highlight. jump remains as
// the action the Section index dispatches, and its effect is a scrollIntoView.
import React, { useEffect, useEffectEvent, useLayoutEffect, useReducer, useRef, useState } from 'react';
import {
  currentSectionIndex,
  readerReducer,
  type Meeting,
  type Section,
} from '../../lib/bibleStudy';
import SectionBody from './SectionBody';
import { useLanguage } from '../LanguageProvider';

export type StudyReaderViewProps = {
  meeting: Meeting;
  /**
   * The stale-week date chip's text, or null for the current week. The chip
   * lives inside the sticky header so a reader who lands on panel 4 of an
   * older week can still see the week is old (ADR 0011 §3 — falling back is
   * correct; falling back silently is not).
   */
  staleDateLabel?: string | null;
  /**
   * The current week's date, plainly ("Wednesday, October 21") — the same
   * chip the stale week wears, without the "Most recent · " prefix (#1814).
   * Omitted by the app shell, where the week above says where the reader is.
   */
  weekDateLabel?: string | null;
  /**
   * The study this week belongs to ("Romans · Fall 2026"), printed quietly
   * under the title. A student who scanned a code has no app shell naming the
   * study, so this page has to (#1814). Omitted where the surrounding page
   * already names it.
   */
  studyLabel?: string | null;
  /**
   * Render this surface as a page: the sticky chrome becomes a `header`
   * (a banner) and the reading region a `main` named by the meeting title.
   * The public scan route owns its own document, so it passes this; the
   * signed-in reader and the editor preview are already inside the app
   * shell's `main` and must not nest another (#1814).
   */
  asPage?: boolean;
  /**
   * The Section the reader should be showing, when something outside the
   * reader owns the position — the editor's preview follows the author's
   * caret this way (#920). When it changes, the reader scrolls to that
   * panel through the same jump the Section index uses; the reader is never
   * remounted, so its state (scroll position, revealed Blanks) survives.
   * The public route omits it and the reader owns its own position.
   */
  followSectionIndex?: number;
  /**
   * The Section to open on. Unlike `followSectionIndex` this is read once, at
   * mount, and never pins the reader afterwards — it exists so a Full-timer
   * who leaves "This week's study" to fix a typo comes back to the Section
   * they were reading rather than the top of the week (#946). The public
   * route omits it and always opens at the first Section.
   */
  initialSectionIndex?: number;
  /**
   * Called with the Section the reader has scrolled to, whenever it changes.
   * The signed-in reader persists it so the trip out to the editor and back
   * lands where it left off; the public route omits it.
   */
  onSectionChange?: (index: number) => void;
  /**
   * Controls for the sticky header's trailing cluster, rendered before the
   * text-size control. "This week's study" puts Show QR, Copy link and (for
   * Full-timers) Edit here; the public route and the editor preview pass
   * nothing, so a student who scanned sees the header exactly as before.
   */
  headerActions?: React.ReactNode;
};

// Pads a 1-based Section index for the counter and the index rows: the +1 is
// the index→ordinal step, so the denominator (a count, not an index) must not
// go through this helper.
const padOneBased = (n: number) => String(n + 1).padStart(2, '0');

const ChevronIcon: React.FC = () => (
  <svg
    className="w-3.5 h-3.5 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

// The panel's top padding, in px — the air above the card while a Section
// settles. The settle measurement subtracts it so the card's resting offset
// is the slack between the card's top and the panel's top edge.
const PANEL_TOP_PAD = 18;

// The paged deck's floor (#1590): a reader box at least this wide AND this
// tall pages one Section at a time; anything smaller keeps the scrolling deck.
// The height floor keeps a phone held sideways on the scrolling deck. The box
// measured is the reader's own, never the window's, so the editor's 390-wide
// phone preview stays a phone inside a wide desktop window.
const PAGED_MIN_WIDTH = 768;
const PAGED_MIN_HEIGHT = 600;

// The reader's type scale (#923): body text sizes in px, the raised default
// first. The student's choice is remembered in that browser's storage — the
// person who cannot read the text is the person who can fix it, with no
// author involvement and nothing stored on the Meeting (ADR 0012, ADR 0013
// §5). Prompt and title sizes derive from the body size so the page stays
// in proportion at any setting; the card's internal inset stays constant
// across sizes (deliberately deferred, #912).
const READER_TYPE_SIZES = [16, 18, 20, 22] as const;
export type ReaderTypeSize = (typeof READER_TYPE_SIZES)[number];
const READER_TYPE_DEFAULT: ReaderTypeSize = 20;
// The default under the measure floor (#1840, ADR 0048): a reader box this
// narrow leaves a text column under ~340px, where 20px type fits ~32
// characters and a paragraph turns into a column of phrases. One step down
// buys ~4 characters; the four-step control is unchanged and a stored choice
// always wins.
const READER_TYPE_NARROW: ReaderTypeSize = 18;
const NARROW_READER_BOX = 400;
const READER_TYPE_STORAGE_KEY = 'cisa.reader.type-size.v1';

/**
 * Reads the stored type size, or `null` when nothing readable is stored —
 * the Blank-state / dismissed-card precedent: a corrupt or foreign value must
 * never error the reader, it just falls through to the default. A `null` also
 * means "the reader has made no choice", which is what lets the box decide
 * the default (#1840).
 */
function readStoredTypeSize(): ReaderTypeSize | null {
  try {
    const raw = window.localStorage.getItem(READER_TYPE_STORAGE_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if ((READER_TYPE_SIZES as readonly number[]).includes(n)) {
        return n as ReaderTypeSize;
      }
    }
  } catch {
    // Storage unavailable or unreadable — fall through to the default.
  }
  return null;
}

/**
 * One scroll-snap panel: the Section's content sits on a raised card and the
 * panel around it becomes ground (#922). While the card and the peek fit the
 * deck, the panel settles — the card's top margin takes the slack, so the
 * content sits optically in the panel, framed above by air and below by the
 * peek, which stays OUTSIDE the card at the bottom of the panel. The settle
 * margin is `mt-auto`: as content grows the offset shrinks continuously to
 * zero, so nothing jumps at the threshold. A Section that overflows keeps
 * its card, which grows and closes below its last block.
 */
const Panel: React.FC<{
  section: Section;
  index: number;
  isLast: boolean;
  meetingTitle: string;
  nextTitle: string | null;
  onPeekNext: () => void;
  openBlanks: Record<string, boolean>;
  onRevealBlank: (key: string) => void;
  ref?: React.Ref<HTMLElement>;
}> = ({ section, index, isLast, meetingTitle, nextTitle, onPeekNext, openBlanks, onRevealBlank, ref }) => {
  const { t } = useLanguage();
  const [settles, setSettles] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);

  // Measure whether the card and the peek fit the deck. jsdom has no layout
  // (offsetHeight/clientHeight are 0), so the panel never settles in tests —
  // the real browser supplies the truth. The effect re-runs on every render
  // so a revealed Blank or a theme change re-measures; the measurement is
  // idempotent and cheap. A ResizeObserver on the deck re-measures when the
  // deck's height changes without a render — phone rotation, window resize,
  // browser chrome show/hide — so a Section that now fits settles instead of
  // clinging to the top.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const peek = peekRef.current;
    const panel = card?.parentElement;
    if (!card || !peek || !panel) return;
    const deck = panel.parentElement;
    if (!deck) return;
    const measure = () => {
      const needed = card.offsetHeight + peek.offsetHeight + PANEL_TOP_PAD;
      setSettles(needed <= deck.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(deck);
    return () => observer.disconnect();
  });

  return (
    <section
      ref={ref}
      data-section-panel={index}
      // 12px of ground, not 24 (#1770): at 375×812 the old 24px panel + 22px
      // card inset spent 92px of the screen on margins and left a 270px
      // column — 26 characters on the rendered first line, which turns a
      // paragraph into a column of phrases. 12 + 16 leaves a 306px column and
      // 34 characters, and the card still reads as an object on ground.
      className="min-h-full flex flex-col px-3 pt-[18px] pb-0"
    >
      <div
        ref={cardRef}
        data-reader-card
        className={`flex flex-col gap-5 rounded-[24px] px-4 py-6 bg-[var(--reader-card)] border border-[var(--reader-card-edge)] shadow-[var(--reader-elev)] ${
          settles ? 'mt-auto' : ''
        }`}
      >
        <h2 className="font-serif font-bold text-[length:calc(var(--reader-fs)*1.85)] leading-[1.08] tracking-tight text-on-surface">
          {section.title}
        </h2>
        <SectionBody
          section={section}
          sectionIndex={index}
          openBlanks={openBlanks}
          onRevealBlank={onRevealBlank}
        />
      </div>
      {/* The peek stays OUTSIDE the card, at the bottom of the panel: the
          next Section's title, dimmed — the "more below" affordance and a
          preview of what is coming. The last panel ends the Meeting. */}
      <div
        ref={peekRef}
        className={`flex items-end justify-center pb-6 ${settles ? 'mt-auto' : 'mt-6'}`}
      >
        {isLast ? (
          <div
            data-testid="reader-end"
            className="flex flex-col items-center gap-2 text-xs text-on-surface-variant font-medium py-4"
          >
            <span className="h-px w-12 bg-outline-variant" />
            <span>{t('reader.end_of').replace('{title}', meetingTitle)}</span>
          </div>
        ) : (
          <button
            type="button"
            data-testid={`peek-${index}`}
            className="text-sm text-on-surface-variant py-4 truncate max-w-full"
            onClick={(e) => {
              e.stopPropagation();
              onPeekNext();
            }}
          >
            {nextTitle}
          </button>
        )}
      </div>
    </section>
  );
};

/**
 * One Section on the paged deck's card (#1590): the heading across the top,
 * then the Passage set large on the left and everything else on the right, in
 * the author's order.
 * A Section with no Passage, or only a Passage, takes the card's full width
 * rather than leaving half of it empty. The two columns wrap to a stack,
 * Passage first, when the card is too narrow to hold both.
 */
const PagedSection: React.FC<{
  section: Section;
  index: number;
  typeSize: ReaderTypeSize;
  openBlanks: Record<string, boolean>;
  onRevealBlank: (key: string) => void;
}> = ({ section, index, typeSize, openBlanks, onRevealBlank }) => {
  const hasPassage = section.content.some((b) => b.kind === 'passage');
  const hasNotes = section.content.some((b) => b.kind !== 'passage');
  const heading = (
    <h2 className="font-serif font-bold text-[length:calc(var(--reader-fs)*1.7)] leading-[1.08] tracking-tight text-on-surface">
      {section.title}
    </h2>
  );
  const body = (only: 'passage' | 'notes') => (
    <SectionBody
      section={section}
      sectionIndex={index}
      openBlanks={openBlanks}
      onRevealBlank={onRevealBlank}
      only={only}
    />
  );
  // The Passage column raises the type scale so the scripture is set larger
  // than the notes beside it, and still follows the student's text size.
  const passage = hasPassage && (
    <div
      data-testid="paged-passage"
      className="flex-1 basis-[380px] min-w-0"
      style={{ '--reader-fs': `${typeSize + 7}px` } as React.CSSProperties}
    >
      {body('passage')}
    </div>
  );

  // The heading spans both columns, so the Section visibly opens at the
  // top-left: a heading at the top of the right column made the headless
  // Passage on the left read as the previous Section running on.
  if (hasPassage && hasNotes) {
    return (
      <div className="flex flex-col gap-6 px-14 py-12">
        {heading}
        <div className="flex flex-wrap items-start gap-12">
          {passage}
          <div className="flex-1 basis-[380px] min-w-0 flex flex-col gap-6">
            {body('notes')}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6 px-14 py-12 max-w-[820px] mx-auto">
      {heading}
      {hasPassage ? passage : body('notes')}
    </div>
  );
};

const StudyReaderView: React.FC<StudyReaderViewProps> = ({
  meeting,
  staleDateLabel = null,
  weekDateLabel = null,
  studyLabel = null,
  asPage = false,
  followSectionIndex,
  initialSectionIndex,
  onSectionChange,
  headerActions,
}) => {
  const { t } = useLanguage();
  const sections: Section[] = meeting.sections;
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);

  // The student's type size (#923): read once on mount so a returning
  // reader applies the stored size on first paint, and written on every
  // choice so the next visit starts where this one left off. The value
  // drives the `--reader-fs` custom property the reader's type scale is
  // built on; the card's inset never changes with it. A reader who has a
  // stored size — or picks one this visit — outranks the box-derived
  // default (#1840).
  const readerChoseType = useRef(false);
  const [typeSize, setTypeSize] = useState<ReaderTypeSize>(
    () => readStoredTypeSize() ?? READER_TYPE_DEFAULT,
  );

  // Which layout (#1590): the paged deck when the reader's own box clears
  // both floors, the scrolling deck otherwise. jsdom has no layout, so the
  // reader measures 0×0 in tests and stays scrolling unless a test reports a
  // size through the ResizeObserver. The same measurement settles the default
  // type size (#1840) — one observer, one box, and it runs before paint so a
  // phone never flashes the wide default.
  const [paged, setPaged] = useState(false);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // A size stored before this visit outranks the box. Read once, on mount:
    // the effect never re-runs, and a reader's pick this visit is the ref.
    const hasStoredChoice = readStoredTypeSize() !== null;
    const apply = (width: number, height: number) => {
      setPaged(width >= PAGED_MIN_WIDTH && height >= PAGED_MIN_HEIGHT);
      // A box that measures nothing has no measure to judge.
      if (width <= 0 || hasStoredChoice || readerChoseType.current) return;
      setTypeSize(width < NARROW_READER_BOX ? READER_TYPE_NARROW : READER_TYPE_DEFAULT);
    };
    const rect = root.getBoundingClientRect();
    apply(rect.width, rect.height);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) apply(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const [state, dispatch] = useReducer(readerReducer, {
    sectionIndex: 0,
    totalSections: Math.max(1, sections.length),
    openBlanks: {},
    navOpen: false,
  });

  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  // The popover dismisses on outside click or Escape, the codebase's
  // transient-surface pattern (StagePicker, DatePicker, the reader's own
  // index dialog) — a student who opens it and taps elsewhere gets it out
  // of the way.
  useEffect(() => {
    if (!typeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setTypeMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTypeMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [typeMenuOpen]);

  const chooseTypeSize = (size: ReaderTypeSize) => {
    readerChoseType.current = true;
    setTypeSize(size);
    try {
      window.localStorage.setItem(READER_TYPE_STORAGE_KEY, String(size));
    } catch {
      // Storage unavailable — the choice applies for this visit only.
    }
  };

  // The index is a full-screen overlay; Escape closes it, so a keyboard user
  // who opened it is never stuck behind a "tap anywhere" hint (#1777).
  useEffect(() => {
    if (!state.navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'closeIndex' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.navOpen]);

  // When the Meeting's Section count changes, the read model follows.
  useEffect(() => {
    if (sections.length > 0 && state.totalSections !== sections.length) {
      dispatch({ type: 'setTotalSections', count: sections.length });
    }
  }, [sections.length, state.totalSections]);

  // The deck's scroll mirrors the Section being read into the read model. The
  // current Section is the last panel whose top has crossed a line 45% down
  // the deck (the design of record) — reading position, not a visibility
  // fraction, so a Section taller than the reader, whose best possible
  // intersection ratio is readerHeight / panelHeight and therefore below the
  // old 0.55 threshold, still becomes current once reading reaches it (#1622).
  //
  // jsdom has no layout (every rect is zero); the real browser supplies the
  // truth, and a zero-height deck means there is nothing to read yet.
  //
  // The handler is an Effect Event (#914): it must compare against the CURRENT
  // sectionIndex, not the one captured when the listener was attached — the
  // listener is keyed to the Section count, so a closed-over index would stay
  // at its initial value for the life of the Meeting and scrolling back to the
  // first Section could never re-register. The subscription lifecycle stays
  // keyed to the Section count so the listener is not torn down and re-attached
  // on every scroll tick.
  const onDeckScroll = useEffectEvent(() => {
    const deck = scrollRef.current;
    if (!deck) return;
    const deckRect = deck.getBoundingClientRect();
    if (deckRect.height === 0) return;
    const panelTops = panelRefs.current
      .slice(0, sections.length)
      .map((panel) => (panel ? panel.getBoundingClientRect().top : Number.POSITIVE_INFINITY));
    const idx = currentSectionIndex(deckRect, panelTops);
    if (idx !== state.sectionIndex) {
      dispatch({ type: 'jump', index: idx });
    }
  });

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || paged) return;
    onDeckScroll();
    root.addEventListener('scroll', onDeckScroll, { passive: true });
    return () => root.removeEventListener('scroll', onDeckScroll);
    // `paged` too: the paged deck unmounts the panels, so returning to the
    // scrolling deck must re-read the freshly mounted ones (#1590).
  }, [sections.length, paged]);

  const total = sections.length;
  const showPaged = paged && total > 0;
  const counterText =
    total > 0 ? `${padOneBased(state.sectionIndex)} / ${String(total).padStart(2, '0')}` : '';

  const handleJump = (index: number) => {
    dispatch({ type: 'jump', index });
    // On the paged deck the reducer owns the position, so jump IS the move.
    if (showPaged) return;
    // On the scrolling deck jump's effect is a scroll, not a state-owned
    // position: the read model will be re-mirrored by the observer when the
    // panel arrives.
    panelRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Each new Section on the paged deck opens at its top, not partway down
  // the card where the last long Section left the scroll.
  const pagedCardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (pagedCardRef.current) pagedCardRef.current.scrollTop = 0;
  }, [state.sectionIndex]);

  // Crossing the floor keeps the reader's place (#1590). Into the paged deck
  // needs nothing — the read model already holds the Section on screen. Back
  // to the scrolling deck, the panels mount at the top, so scroll the paged
  // Section into view before paint, ahead of the observer re-attaching.
  const wasPaged = useRef(false);
  useLayoutEffect(() => {
    if (wasPaged.current && !showPaged && state.sectionIndex > 0) {
      panelRefs.current[state.sectionIndex]?.scrollIntoView({ block: 'start' });
    }
    wasPaged.current = showPaged;
    // The layout change is the signal; the Section is read at that moment,
    // not watched — re-running on every page would scroll the hidden deck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPaged]);

  // Keyboard paging (#1590), on the paged deck only: Left/Right and Page
  // Up/Down step a Section. A key aimed at a field, or held with a modifier,
  // is left alone so paging never hijacks typing or a browser shortcut. The
  // handler is an Effect Event so it steps from the CURRENT Section without
  // re-subscribing on every page.
  const onPagingKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const step = e.key === 'ArrowRight' || e.key === 'PageDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'PageUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = state.sectionIndex + step;
    if (next < 0 || next >= total) return;
    handleJump(next);
  });

  useEffect(() => {
    if (!showPaged) return;
    document.addEventListener('keydown', onPagingKey);
    return () => document.removeEventListener('keydown', onPagingKey);
  }, [showPaged]);

  // The editor's preview follows the author's caret (#920): when the Section
  // the preview should show changes, scroll to that panel through the same
  // jump the Section index uses. The reader is never remounted, so its state
  // — scroll position, revealed Blanks — survives the caret's moves. The
  // public route omits the prop and the reader owns its own position.
  useEffect(() => {
    if (followSectionIndex === undefined) return;
    handleJump(followSectionIndex);
  }, [followSectionIndex]);

  // Restore-on-return (#946), deliberately mount-only: the stored Section is
  // an opening position, not an owner of the reader's position. Reacting to
  // later changes would fight the student's own scrolling, since the value
  // being stored is derived from that scrolling. It waits for the panels to
  // exist — the Meeting arrives from a snapshot, so the first render has no
  // Sections to scroll to.
  const restoredTo = useRef(false);
  useEffect(() => {
    if (restoredTo.current) return;
    if (initialSectionIndex === undefined || initialSectionIndex <= 0) return;
    if (sections.length === 0) return;
    restoredTo.current = true;
    handleJump(Math.min(initialSectionIndex, sections.length - 1));
  }, [initialSectionIndex, sections.length]);

  // Report the Section out so a caller can persist it. Reading the mirrored
  // read model rather than the scroll means this reports settled positions,
  // not every frame of a smooth scroll.
  useEffect(() => {
    onSectionChange?.(state.sectionIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the Section is
    // the signal; re-running because the caller passed a new closure would
    // re-report a position that has not moved.
  }, [state.sectionIndex]);

  // The surface below the chrome — the paged deck or the scrolling deck, the
  // rail and the index — is one region, so a route that owns its own page can
  // make it `main` while the chrome above stays outside it (where a `header`
  // is a banner rather than a header inside main).
  const BodyTag: React.ElementType = asPage ? 'main' : 'div';

  return (
    <div
      ref={rootRef}
      className="reader-card-surface w-full h-full min-h-0 bg-[var(--reader-ground)] text-on-surface relative overflow-hidden flex flex-col"
      style={{ '--reader-fs': `${typeSize}px` } as React.CSSProperties}
    >
      {/* Sticky chrome — slim: the week's date, the title, the counter and the
          text-size control. */}
      <header
        data-testid="reader-header"
        className={`shrink-0 sticky top-0 z-20 flex flex-wrap md:flex-nowrap items-center gap-2 pt-[calc(env(safe-area-inset-top)+2px)] pb-1 bg-[var(--reader-ground)]/95 backdrop-blur-sm ${
          showPaged ? 'px-8' : 'px-5 border-b border-outline-variant'
        }`}
      >
        {(staleDateLabel || weekDateLabel) && (
          // Its own row on a phone (#1777): side by side with the title it took
          // 206 of 335 px and squeezed the week's name into a 38px column —
          // three stacked words. On the paged deck it can sit inline again.
          // The current week wears the same chip, plainly (#1814): a date
          // only appeared once the week was already out of date.
          <div className="w-full md:w-auto min-w-0 flex">
            <span
              data-testid={staleDateLabel ? 'stale-date-chip' : 'week-date-chip'}
              className="flex items-center gap-1.5 min-w-0 px-2 py-0.5 rounded-full bg-surface border border-outline-variant text-[11px] text-on-surface-variant"
            >
              <ChevronIcon />
              <span className="truncate">{staleDateLabel ?? weekDateLabel}</span>
            </span>
          </div>
        )}
        {/* The Meeting title, and the page's only h1 (#1814). It wraps rather
            than truncates: capping the text at the header's width hides the
            week's name exactly where the preview exists to show the whole
            thing. `min-w-0` keeps the flex row able to shrink it so the size
            control and counter never get pushed out. The study sits under it,
            quietly: a student who scanned has no app shell naming the study. */}
        <div className="min-w-0 flex flex-col leading-snug">
          <h1
            className={
              showPaged
                ? 'font-serif font-bold text-[22px] tracking-tight text-on-surface'
                : 'text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant'
            }
          >
            {meeting.title}
          </h1>
          {studyLabel && (
            <span
              data-testid="study-identity"
              className="text-[11px] font-normal tracking-normal text-on-surface-variant"
            >
              {studyLabel}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {headerActions}
          {/* The text-size control (#923): the student sets the type size,
              remembered in that browser's storage. The trigger is a small
              "A" button; the popover offers the agreed range. */}
          <div className="relative" ref={typeMenuRef}>
            <button
              type="button"
              aria-label={t('reader.text_size')}
              aria-expanded={typeMenuOpen}
              className="w-11 h-11 flex items-center justify-center rounded-full text-sm font-serif font-bold text-on-surface-variant hover:bg-surface-variant/60 transition-colors"
              onClick={() => setTypeMenuOpen((open) => !open)}
            >
              A
            </button>
            {typeMenuOpen && (
              <div
                data-testid="text-size-popover"
                role="group"
                aria-label={t('reader.text_size')}
                className="absolute right-0 top-full mt-1 z-30 flex items-center gap-0.5 p-1 rounded-full bg-surface border border-outline-variant shadow-lg"
              >
                {READER_TYPE_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={typeSize === size}
                    className={`w-11 h-11 rounded-full text-xs font-medium transition-colors ${
                      typeSize === size
                        ? 'bg-on-surface text-background'
                        : 'text-on-surface-variant hover:bg-surface-variant/60'
                    }`}
                    onClick={() => {
                      chooseTypeSize(size);
                      setTypeMenuOpen(false);
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* On the paged deck the counter lives in the footer, beside the
              progress dots. */}
          {!showPaged && (
            <div className="font-serif font-bold text-xs text-on-surface-variant tracking-wider tabular-nums">
              {counterText}
            </div>
          )}
        </div>
      </header>

      <BodyTag
        aria-label={asPage ? meeting.title : undefined}
        className="flex-1 min-h-0 flex flex-col"
      >
      {showPaged && (
        <>
          {/* Section tabs (#1590), labelled from the headings. The row
              scrolls sideways rather than wrapping when a Meeting has many
              Sections; a long heading truncates with the full title kept. */}
          <nav aria-label={t('reader.sections')} className="shrink-0 px-8 pt-3">
            <div className="inline-flex max-w-full gap-1 p-1 rounded-full bg-surface-variant/40 overflow-x-auto custom-scrollbar">
              {sections.map((sec, sIdx) => (
                <button
                  key={sec.id || sIdx}
                  type="button"
                  title={sec.title}
                  aria-current={sIdx === state.sectionIndex ? 'step' : undefined}
                  className={`shrink-0 h-11 max-w-[260px] truncate px-4 rounded-full text-sm transition-colors ${
                    sIdx === state.sectionIndex
                      ? 'bg-[var(--reader-card)] text-on-surface font-medium shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-variant/60'
                  }`}
                  onClick={() => handleJump(sIdx)}
                >
                  {sec.title}
                </button>
              ))}
            </div>
          </nav>

          <div className="flex-1 min-h-0 flex px-8 py-[18px]">
            <div
              ref={pagedCardRef}
              data-testid="paged-card"
              className="flex-1 min-w-0 overflow-y-auto custom-scrollbar rounded-[24px] bg-[var(--reader-card)] border border-[var(--reader-card-edge)] shadow-[var(--reader-elev)]"
            >
              <PagedSection
                section={sections[state.sectionIndex] ?? sections[0]}
                index={state.sectionIndex}
                typeSize={typeSize}
                openBlanks={state.openBlanks}
                onRevealBlank={(key) => dispatch({ type: 'revealBlank', key })}
              />
            </div>
          </div>

          {/* A page change is announced, not focused: focus stays on the
              control the student used, so pressing Next again keeps paging. */}
          <div data-testid="paged-announcement" aria-live="polite" className="sr-only">
            {t('reader.section_announce')
              .replace('{n}', String(state.sectionIndex + 1))
              .replace('{total}', String(total))
              .replace('{title}', sections[state.sectionIndex]?.title ?? '')}
          </div>

          {/* Previous · progress · Next (#1590). Next names the Section it
              leads to; the last Section ends the Meeting in its place. */}
          <div
            data-testid="paged-footer"
            className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-8 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
          >
            <button
              type="button"
              disabled={state.sectionIndex === 0}
              className="h-12 px-5 inline-flex items-center gap-2 rounded-full border border-outline-variant text-[15px] font-medium text-on-surface transition-colors hover:bg-surface-variant/60 disabled:opacity-35 disabled:pointer-events-none"
              onClick={() => handleJump(state.sectionIndex - 1)}
            >
              <svg aria-hidden="true" className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              {t('reader.previous')}
            </button>
            <div className="flex items-center gap-3.5">
              <div aria-hidden="true" className="flex gap-1.5">
                {sections.map((_, sIdx) => (
                  <span
                    key={sIdx}
                    className={`block h-1.5 rounded-full transition-all duration-200 ${
                      sIdx === state.sectionIndex ? 'w-7 bg-on-surface' : 'w-1.5 bg-outline-variant'
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm text-on-surface-variant tabular-nums">{counterText}</span>
            </div>
            {state.sectionIndex < total - 1 ? (
              <button
                type="button"
                aria-label={`${t('reader.next')}: ${sections[state.sectionIndex + 1].title}`}
                className="h-12 max-w-[min(360px,45%)] px-5 inline-flex items-center gap-2 rounded-full bg-on-surface text-background text-[15px] font-medium transition-opacity hover:opacity-90"
                onClick={() => handleJump(state.sectionIndex + 1)}
              >
                <span className="truncate">{sections[state.sectionIndex + 1].title}</span>
                <svg aria-hidden="true" className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            ) : (
              <span className="h-12 inline-flex items-center gap-2.5 text-sm text-on-surface-variant">
                <span aria-hidden="true" className="h-px w-6 bg-outline-variant" />
                {t('reader.end_of').replace('{title}', meeting.title)}
              </span>
            )}
          </div>
        </>
      )}

      {/* The deck: the scroll container owns which Section is being read. */}
      {!showPaged && (
      <>
      <div
        ref={scrollRef}
        data-testid="reader-deck"
        // Deliberately unsnapped (#1777). `snap-y snap-proximity` is meant to
        // let a Section taller than the deck scroll freely, but Chromium rests
        // only at the deepest position where the panel still fills the deck
        // (measured: eight 120px wheel gestures all returned to 180, and every
        // position from 680 to 900 snapped to the next panel at 924), so the
        // end of a long Section could never be read. The peek, the counter and
        // the rail carry position instead.
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
      >
        {sections.map((section, idx) => (
          <Panel
            key={section.id || idx}
            ref={(el) => {
              panelRefs.current[idx] = el;
            }}
            section={section}
            index={idx}
            isLast={idx === total - 1}
            meetingTitle={meeting.title}
            nextTitle={idx + 1 < total ? sections[idx + 1].title : null}
            onPeekNext={() => handleJump(idx + 1)}
            openBlanks={state.openBlanks}
            onRevealBlank={(key) => dispatch({ type: 'revealBlank', key })}
          />
        ))}
        {sections.length === 0 && (
          <div data-testid="reader-end" className="min-h-full flex items-center justify-center text-sm text-on-surface-variant px-6">
            {t('reader.no_sections')}
          </div>
        )}
      </div>

      {/* Sticky progress rail. */}
      <div
        data-testid="progress-rail"
        className="shrink-0 sticky bottom-0 z-20 flex gap-1.5 px-6 pt-2 pb-[calc(env(safe-area-inset-bottom)+10px)] bg-[var(--reader-ground)]/95"
      >
        {sections.map((_, sIdx) => (
          <div
            key={sIdx}
            data-filled={sIdx <= state.sectionIndex}
            className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ${
              sIdx <= state.sectionIndex ? 'bg-on-surface' : 'bg-surface-variant'
            }`}
          />
        ))}
      </div>

      {/* Auto-hidden edge grip → the Section index overlay. jump is its one
          navigation action. A real button, not a div: at 32×120 it is the only
          way into the index and it has to be focusable (issue 1777). */}
      {!state.navOpen && (
        <button
          type="button"
          className="absolute top-1/2 right-0 -translate-y-1/2 w-8 min-h-[120px] flex flex-col items-end justify-center gap-2 pr-2 z-20 cursor-pointer"
          onClick={() => dispatch({ type: 'openIndex' })}
          aria-label={t('reader.open_index')}
        >
          {sections.map((_, sIdx) => (
            <i
              key={sIdx}
              className={`block h-0.5 rounded-full transition-all duration-200 ${
                sIdx === state.sectionIndex ? 'w-5 bg-on-surface' : 'w-2.5 bg-on-surface-variant/60'
              }`}
            />
          ))}
        </button>
      )}

      {state.navOpen && (
        <div
          className="absolute inset-0 z-30 p-6 flex flex-col justify-center bg-background/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => dispatch({ type: 'closeIndex' })}
          role="dialog"
          aria-label={t('reader.index')}
        >
          <div className="text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant px-3 pb-3">
            {meeting.title} · {t('reader.index')}
          </div>
          <div className="flex flex-col gap-1 max-h-[70%] overflow-y-auto custom-scrollbar">
            {sections.map((sec, sIdx) => (
              <button
                key={sec.id || sIdx}
                type="button"
                data-current={sIdx === state.sectionIndex}
                className={`flex w-full items-center gap-3.5 min-h-[52px] px-3.5 py-2 rounded-xl text-left cursor-pointer transition-colors ${
                  sIdx === state.sectionIndex
                    ? 'bg-surface-variant text-on-surface font-medium'
                    : 'hover:bg-surface-variant/50 text-on-surface-variant'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleJump(sIdx);
                }}
              >
                <span className="font-serif font-bold text-xs text-on-surface-variant w-5 shrink-0">
                  {padOneBased(sIdx)}
                </span>
                <span className="min-w-0 text-[15px] font-medium text-on-surface truncate">{sec.title}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 px-3 text-xs text-on-surface-variant">{t('reader.close_hint')}</div>
        </div>
      )}
      </>
      )}
      </BodyTag>
    </div>
  );
};

export default StudyReaderView;