// The shared reader view (#890, ADR 0014 — the one rendering path): the public
// reader route and the editor's live preview both render this component, so
// what the Full-timer approves is exactly what the room reads. The reader is a
// scrolling deck: Sections stack as scroll-snap panels, scrolling IS the
// navigation model (forward, back and overshoot-recovery come free from the
// browser), and tap-to-advance is gone — a Blank's tap is the only tap left.
//
// The scroll container owns "which Section am I on"; the reducer's sectionIndex
// is a READ MODEL mirrored from an IntersectionObserver and consumed only by
// the progress rail, the counter and the index highlight. jump remains as the
// action the Section index dispatches, and its effect is a scrollIntoView.
import React, { useEffect, useEffectEvent, useLayoutEffect, useReducer, useRef, useState } from 'react';
import {
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
   * The Section the reader should be showing, when something outside the
   * reader owns the position — the editor's preview follows the author's
   * caret this way (#920). When it changes, the reader scrolls to that
   * panel through the same jump the Section index uses; the reader is never
   * remounted, so its state (scroll position, revealed Blanks) survives.
   * The public route omits it and the reader owns its own position.
   */
  followSectionIndex?: number;
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
const READER_TYPE_STORAGE_KEY = 'cisa.reader.type-size.v1';

/**
 * Reads the stored type size, falling back to the default when the stored
 * value cannot be read — the Blank-state / dismissed-card precedent: a
 * corrupt or foreign value must never error the reader, it just renders at
 * the default.
 */
function readStoredTypeSize(): ReaderTypeSize {
  try {
    const raw = window.localStorage.getItem(READER_TYPE_STORAGE_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if ((READER_TYPE_SIZES as readonly number[]).includes(n)) {
        return n as ReaderTypeSize;
      }
    }
  } catch {
    // Storage unavailable or unreadable — render at the default.
  }
  return READER_TYPE_DEFAULT;
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
      className="min-h-full snap-start snap-always flex flex-col px-6 pt-[18px] pb-0"
    >
      <div
        ref={cardRef}
        data-reader-card
        className={`flex flex-col gap-5 rounded-[24px] px-[22px] py-6 bg-[var(--reader-card)] border border-[var(--reader-card-edge)] shadow-[var(--reader-elev)] ${
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
            <span>End of {meetingTitle}</span>
          </div>
        ) : (
          <button
            type="button"
            data-testid={`peek-${index}`}
            className="text-sm text-on-surface-variant/60 py-4 truncate max-w-full"
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

const StudyReaderView: React.FC<StudyReaderViewProps> = ({
  meeting,
  staleDateLabel = null,
  followSectionIndex,
}) => {
  const { t } = useLanguage();
  const sections: Section[] = meeting.sections;
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);

  const [state, dispatch] = useReducer(readerReducer, {
    sectionIndex: 0,
    totalSections: Math.max(1, sections.length),
    openBlanks: {},
    navOpen: false,
  });

  // The student's type size (#923): read once on mount so a returning
  // reader applies the stored size on first paint, and written on every
  // choice so the next visit starts where this one left off. The value
  // drives the `--reader-fs` custom property the reader's type scale is
  // built on; the card's inset never changes with it.
  const [typeSize, setTypeSize] = useState<ReaderTypeSize>(readStoredTypeSize);
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
    setTypeSize(size);
    try {
      window.localStorage.setItem(READER_TYPE_STORAGE_KEY, String(size));
    } catch {
      // Storage unavailable — the choice applies for this visit only.
    }
  };

  // When the Meeting's Section count changes, the read model follows.
  useEffect(() => {
    if (sections.length > 0 && state.totalSections !== sections.length) {
      dispatch({ type: 'setTotalSections', count: sections.length });
    }
  }, [sections.length, state.totalSections]);

  // The IntersectionObserver mirrors the visible panel into the read model.
  // jsdom has no IntersectionObserver and no layout; both are stubbed in the
  // test setup (the matchMedia precedent), and the real browser supplies the
  // truth.
  //
  // The callback is an Effect Event (#914): it must compare against the
  // CURRENT sectionIndex, not the one captured when the observer was built —
  // the observer is keyed to the Section count, so a closed-over index would
  // stay at its initial value for the life of the Meeting and scrolling back
  // to the first Section could never re-register. The subscription lifecycle
  // stays keyed to the Section count so the observer is not torn down and
  // rebuilt on every scroll tick.
  const onPanelVisible = useEffectEvent((idx: number) => {
    if (idx !== state.sectionIndex) {
      dispatch({ type: 'jump', index: idx });
    }
  });

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const panels = panelRefs.current.slice(0, sections.length);
    if (panels.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.sectionPanel);
          if (Number.isInteger(idx)) {
            onPanelVisible(idx);
          }
        }
      },
      { root, threshold: 0.55 },
    );
    for (const panel of panels) if (panel) observer.observe(panel);
    return () => observer.disconnect();
  }, [sections.length]);

  const total = sections.length;
  const counterText =
    total > 0 ? `${padOneBased(state.sectionIndex)} / ${String(total).padStart(2, '0')}` : '';

  const handleJump = (index: number) => {
    dispatch({ type: 'jump', index });
    // jump's effect is a scroll, not a state-owned position: the read model
    // will be re-mirrored by the observer when the panel arrives.
    panelRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // The editor's preview follows the author's caret (#920): when the Section
  // the preview should show changes, scroll to that panel through the same
  // jump the Section index uses. The reader is never remounted, so its state
  // — scroll position, revealed Blanks — survives the caret's moves. The
  // public route omits the prop and the reader owns its own position.
  useEffect(() => {
    if (followSectionIndex === undefined) return;
    handleJump(followSectionIndex);
  }, [followSectionIndex]);

  return (
    <div
      className="reader-card-surface w-full h-full min-h-0 bg-[var(--reader-ground)] text-on-surface relative overflow-hidden flex flex-col"
      style={{ '--reader-fs': `${typeSize}px` } as React.CSSProperties}
    >
      {/* Sticky chrome — slim: title, counter, the text-size control, and
          the stale-week date chip. */}
      <div
        data-testid="reader-header"
        className="shrink-0 sticky top-0 z-20 flex items-center gap-2 px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 bg-[var(--reader-ground)]/95 backdrop-blur-sm border-b border-outline-variant"
      >
        {staleDateLabel && (
          <span
            data-testid="stale-date-chip"
            className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-surface border border-outline-variant text-[10px] text-on-surface-variant"
          >
            <ChevronIcon />
            {staleDateLabel}
          </span>
        )}
        {/* The Meeting title. It wraps rather than truncates: capping the
            text at the header's width hides the week's name exactly where
            the preview exists to show the whole thing. `min-w-0` keeps the
            flex row able to shrink it so the size control and counter never
            get pushed out. */}
        <div className="text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant/80 min-w-0 leading-snug">
          {meeting.title}
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {/* The text-size control (#923): the student sets the type size,
              remembered in that browser's storage. The trigger is a small
              "A" button; the popover offers the agreed range. */}
          <div className="relative" ref={typeMenuRef}>
            <button
              type="button"
              aria-label={t('reader.text_size')}
              aria-expanded={typeMenuOpen}
              className="w-7 h-7 flex items-center justify-center rounded-full text-sm font-serif font-bold text-on-surface-variant hover:bg-surface-variant/60 transition-colors"
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
                    className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
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
          <div className="font-serif font-bold text-xs text-on-surface-variant tracking-wider tabular-nums">
            {counterText}
          </div>
        </div>
      </div>

      {/* The deck: the scroll container owns which Section is being read. */}
      <div
        ref={scrollRef}
        data-testid="reader-deck"
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar snap-y snap-proximity"
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
            This week has no sections yet.
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
          navigation action; the chevron-and-tap deck is gone. */}
      {!state.navOpen && (
        <div
          className="absolute top-1/2 right-0 -translate-y-1/2 w-8 min-h-[120px] flex flex-col items-end justify-center gap-2 pr-2 z-20 cursor-pointer"
          onClick={() => dispatch({ type: 'openIndex' })}
          role="button"
          aria-label="Open section index"
        >
          {sections.map((_, sIdx) => (
            <i
              key={sIdx}
              className={`block h-0.5 rounded-full transition-all duration-200 ${
                sIdx === state.sectionIndex ? 'w-5 bg-on-surface' : 'w-2.5 bg-outline-variant'
              }`}
            />
          ))}
        </div>
      )}

      {state.navOpen && (
        <div
          className="absolute inset-0 z-30 p-6 flex flex-col justify-center bg-background/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => dispatch({ type: 'closeIndex' })}
          role="dialog"
          aria-label="Section index"
        >
          <div className="text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant px-3 pb-3">
            {meeting.title} · Index
          </div>
          <div className="flex flex-col gap-1 max-h-[70%] overflow-y-auto custom-scrollbar">
            {sections.map((sec, sIdx) => (
              <div
                key={sec.id || sIdx}
                data-current={sIdx === state.sectionIndex}
                className={`flex items-center gap-3.5 min-h-[52px] px-3.5 py-2 rounded-xl cursor-pointer transition-colors ${
                  sIdx === state.sectionIndex
                    ? 'bg-surface-variant text-on-surface font-medium'
                    : 'hover:bg-surface-variant/50 text-on-surface-variant'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleJump(sIdx);
                }}
              >
                <div className="font-serif font-bold text-xs text-on-surface-variant w-5 shrink-0">
                  {padOneBased(sIdx)}
                </div>
                <div className="min-w-0 flex flex-col">
                  <div className="text-[15px] font-medium text-on-surface truncate">{sec.title}</div>
                  {sec.ref && <div className="text-xs text-on-surface-variant/70">{sec.ref}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 px-3 text-xs text-on-surface-variant/60">Tap anywhere to close</div>
        </div>
      )}
    </div>
  );
};

export default StudyReaderView;