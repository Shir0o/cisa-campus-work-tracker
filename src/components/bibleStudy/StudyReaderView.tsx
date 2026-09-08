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
import React, { useEffect, useEffectEvent, useReducer, useRef } from 'react';
import {
  readerReducer,
  type Meeting,
  type Section,
} from '../../lib/bibleStudy';
import SectionBody from './SectionBody';

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

/**
 * One scroll-snap panel: content top-aligns (one landing spot on every panel;
 * the old `my-auto` centring is gone) and the trailing space carries the peek —
 * the next Section's title, dimmed, doubling as the "more below" affordance.
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
}> = ({ section, index, isLast, meetingTitle, nextTitle, onPeekNext, openBlanks, onRevealBlank, ref }) => (
  <section
    ref={ref}
    data-section-panel={index}
    className="min-h-full snap-start snap-always flex flex-col px-6 pt-4 pb-0"
  >
    <div className="flex flex-col gap-5">
      <h2 className="font-serif font-bold text-[32px] leading-[1.08] tracking-tight text-on-surface">
        {section.title}
      </h2>
      <SectionBody
        section={section}
        sectionIndex={index}
        openBlanks={openBlanks}
        onRevealBlank={onRevealBlank}
      />
    </div>
    {/* The trailing space that used to be dead vertical centring is the
        peek: the next Section's title, dimmed — the "more below" affordance
        and a preview of what is coming. The last panel ends the Meeting. */}
    <div className="flex-1 min-h-[96px] flex items-end justify-center pb-6">
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

const StudyReaderView: React.FC<StudyReaderViewProps> = ({
  meeting,
  staleDateLabel = null,
  followSectionIndex,
}) => {
  const sections: Section[] = meeting.sections;
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);

  const [state, dispatch] = useReducer(readerReducer, {
    sectionIndex: 0,
    totalSections: Math.max(1, sections.length),
    openBlanks: {},
    navOpen: false,
  });

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
    <div className="w-full h-full min-h-0 bg-background text-on-surface relative overflow-hidden flex flex-col">
      {/* Sticky chrome — slim: title, counter, and the stale-week date chip. */}
      <div
        data-testid="reader-header"
        className="shrink-0 sticky top-0 z-20 flex items-center gap-2 px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 bg-background/95 backdrop-blur-sm border-b border-outline-variant"
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
        <div className="text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant/80 truncate min-w-0">
          {meeting.title}
        </div>
        <div className="ml-auto font-serif font-bold text-xs text-on-surface-variant tracking-wider shrink-0 tabular-nums">
          {counterText}
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
        className="shrink-0 sticky bottom-0 z-20 flex gap-1.5 px-6 pt-2 pb-[calc(env(safe-area-inset-bottom)+10px)] bg-background/95"
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