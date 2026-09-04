import React, { useEffect, useReducer, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import {
  readerReducer,
  currentMeeting,
  type Meeting,
  type Section,
  type Blank,
  type Text,
} from '../lib/bibleStudy';
import { subscribePublishedStudyMeetings } from '../lib/data/bibleStudy';
import { format, parseISO } from 'date-fns';

export default function PublicStudyReader() {
  const { studyId = '', date: permalinkDate } = useParams<{ studyId: string; date?: string }>();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to published meetings
  useEffect(() => {
    if (!studyId) return;
    const unsub = subscribePublishedStudyMeetings(
      db,
      studyId,
      (fetched) => {
        setMeetings(fetched);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [studyId]);

  const resolution = currentMeeting(meetings, new Date().toISOString().slice(0, 10), permalinkDate);
  const meeting = resolution?.meeting;
  const isStale = resolution?.isStale ?? false;
  const sections = meeting?.sections ?? [];

  const [state, dispatch] = useReducer(readerReducer, {
    sectionIndex: 0,
    totalSections: sections.length || 1,
    openBlanks: {},
    navOpen: false,
    unadorned: false,
  });

  // When sections length changes
  useEffect(() => {
    if (sections.length > 0 && state.totalSections !== sections.length) {
      dispatch({ type: 'setTotalSections', count: sections.length });
    }
  }, [sections.length, state.totalSections]);

  const currentSection: Section | undefined = sections[state.sectionIndex];
  const bodyRef = useRef<HTMLDivElement>(null);

  const total = sections.length || state.totalSections;
  const pad = (n: number) => String(n + 1).padStart(2, '0');
  const counterText = total > 0 ? `${pad(state.sectionIndex)} / ${pad(total)}` : '';
  const isLast = state.sectionIndex >= total - 1;

  const handleAdvance = () => {
    if (state.navOpen) return;
    if (isLast) return;
    dispatch({ type: 'advance' });
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };

  const handleBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state.sectionIndex > 0) {
      dispatch({ type: 'back' });
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
    }
  };

  const handleJump = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: 'jump', index });
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };

  const formattedDate = meeting?.date
    ? (() => {
        try {
          return format(parseISO(meeting.date), 'EEEE, MMMM d');
        } catch {
          return meeting.date;
        }
      })()
    : '';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface-variant font-sans">
        <div className="animate-pulse tracking-wide text-sm font-medium">Loading Bible Study...</div>
      </div>
    );
  }

  if (!meeting || sections.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-on-surface text-center">
        <h1 className="font-serif text-2xl mb-2 font-medium">No Study Available</h1>
        <p className="text-on-surface-variant text-sm max-w-sm">
          There are no published meetings for this study yet. Please check back later.
        </p>
      </div>
    );
  }

  const washA = -(state.sectionIndex * 46);
  const washB = state.sectionIndex * 34;

  const renderPartWithBlank = (part: Blank | Text, key: string) => {
    if (!('word' in part)) {
      return <span>{part.before}</span>;
    }
    const isOpen = !!state.openBlanks[key];
    return (
      <span>
        {part.before}
        <span
          className={`inline-block border-b-2 cursor-pointer transition-all duration-200 mx-1 ${
            isOpen
              ? 'border-transparent bg-[var(--t-sage-soft)] text-on-surface px-1.5 rounded-md font-medium'
              : 'min-w-[64px] border-[var(--accent-line)]'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'revealBlank', key });
          }}
          role="button"
          tabIndex={0}
          aria-label={isOpen ? part.word : 'Blank, tap to reveal'}
        >
          {isOpen ? part.word : ''}
        </span>
        {part.after}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-black/95 sm:bg-background flex items-center justify-center p-0 sm:p-4 selection:bg-[var(--t-sage-soft)]">
      <div
        className={`w-full max-w-[420px] h-screen sm:h-[844px] sm:max-h-[92vh] sm:rounded-3xl bg-background text-on-surface relative overflow-hidden flex flex-col cursor-pointer transition-all duration-300 shadow-2xl ${
          state.unadorned ? 'p-0' : ''
        }`}
        onClick={handleAdvance}
      >
        {/* Parallax washes */}
        <div
          className="absolute -top-44 -right-36 w-[460px] h-[460px] rounded-full pointer-events-none transition-transform duration-700 ease-out opacity-80"
          style={{
            background: 'radial-gradient(circle, var(--t-slate-soft) 0%, transparent 68%)',
            transform: `translateY(${washA}px)`,
          }}
        />
        <div
          className="absolute -bottom-52 -left-44 w-[420px] h-[420px] rounded-full pointer-events-none transition-transform duration-700 ease-out opacity-70"
          style={{
            background: 'radial-gradient(circle, var(--t-sage-soft) 0%, transparent 70%)',
            transform: `translateY(${washB}px)`,
          }}
        />

        {/* Stale scan date header */}
        {isStale && (
          <div className="relative shrink-0 px-6 py-2.5 bg-surface border-b border-outline-variant text-xs text-on-surface-variant flex items-center gap-2 z-10">
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
            <span>{formattedDate}</span>
          </div>
        )}

        {/* Top bar */}
        <div
          className={`relative shrink-0 flex items-center gap-2 px-5 pt-6 pb-2 z-10 transition-opacity duration-300 ${
            state.unadorned ? 'opacity-30 hover:opacity-100' : ''
          }`}
        >
          <button
            className={`w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-opacity ${
              state.sectionIndex === 0 ? 'opacity-25 pointer-events-none' : 'opacity-100'
            }`}
            onClick={handleBack}
            aria-label="Previous section"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div
            className={`text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant/80 truncate min-w-0 transition-opacity ${
              state.unadorned ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {meeting.title}
          </div>
          <div className="ml-auto font-serif font-bold text-xs text-on-surface-variant tracking-wider shrink-0 tabular-nums">
            {counterText}
          </div>
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'toggleUnadorned' });
            }}
            aria-label="Distraction-free mode"
          >
            {state.unadorned ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
              </svg>
            )}
          </button>
        </div>

        {/* Section Body */}
        <div
          ref={bodyRef}
          className={`relative flex-1 min-h-0 overflow-y-auto custom-scrollbar flex px-6 py-4 z-10 transition-all duration-300 ${
            state.unadorned ? 'px-5 py-2' : ''
          }`}
        >
          {currentSection && (
            <div className="my-auto w-full flex flex-col gap-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 duration-300">
              <h2 className="font-serif font-bold text-[32px] sm:text-[36px] leading-[1.08] tracking-tight text-on-surface">
                {currentSection.title}
              </h2>

              {currentSection.points.length > 0 && (
                <div className="flex flex-col gap-3 py-1">
                  {currentSection.points.map((pt, pIdx) => (
                    <div key={pIdx} className="text-[16px] sm:text-[17px] leading-[1.55] text-on-surface-variant">
                      {renderPartWithBlank(pt, `${state.sectionIndex}:p${pIdx}`)}
                    </div>
                  ))}
                </div>
              )}

              {currentSection.passage && (
                <figure className="m-0 pt-4 border-t border-outline-variant">
                  <p className="m-0 text-[18px] sm:text-[19px] leading-[1.62] text-on-surface">
                    {renderPartWithBlank(currentSection.passage, `${state.sectionIndex}:pg`)}
                  </p>
                  {currentSection.ref && (
                    <figcaption className="mt-3 text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant/70">
                      {currentSection.ref}
                    </figcaption>
                  )}
                </figure>
              )}

              {currentSection.prompt && (
                <div
                  className={`bg-surface border border-outline-variant rounded-2xl p-4 sm:p-5 flex flex-col gap-2 ${
                    currentSection.prompt.kind === 'discuss'
                      ? 'border-l-4 border-l-[var(--t-sage)]'
                      : currentSection.prompt.kind === 'activity'
                      ? 'border-l-4 border-l-[var(--t-clay)]'
                      : 'border-l-4 border-l-[var(--t-slate)]'
                  }`}
                >
                  <div
                    className={`text-[11px] font-bold tracking-widest uppercase ${
                      currentSection.prompt.kind === 'discuss'
                        ? 'text-[var(--t-sage)]'
                        : currentSection.prompt.kind === 'activity'
                        ? 'text-[var(--t-clay)]'
                        : 'text-[var(--t-slate)]'
                    }`}
                  >
                    {currentSection.prompt.kind === 'discuss'
                      ? 'Discuss'
                      : currentSection.prompt.kind === 'activity'
                      ? 'Activity'
                      : 'Question'}
                  </div>
                  <p className="m-0 text-[15px] sm:text-[16px] leading-relaxed text-on-surface">
                    {currentSection.prompt.text}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom progress & hints */}
        <div
          className={`relative shrink-0 px-6 pb-6 pt-2 flex flex-col gap-3 z-10 transition-opacity duration-300 ${
            state.unadorned ? 'opacity-30 hover:opacity-100 pb-3' : ''
          }`}
        >
          <div className="flex gap-1.5">
            {sections.map((_, sIdx) => (
              <div
                key={sIdx}
                className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ${
                  sIdx <= state.sectionIndex ? 'bg-on-surface' : 'bg-surface-variant'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 h-8 text-xs text-on-surface-variant font-medium">
            {!isLast && (
              <svg className="w-4 h-4 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            )}
            <span>{isLast ? `End of ${meeting.title}` : 'Tap anywhere to go on'}</span>
          </div>
        </div>

        {/* Auto-hidden edge grip */}
        {!state.navOpen && (
          <div
            className="absolute top-1/2 right-0 -translate-y-1/2 w-8 min-h-[120px] flex flex-col items-end justify-center gap-2 pr-2 z-20 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'openIndex' });
            }}
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

        {/* Scrubber overlay */}
        {state.navOpen && (
          <div
            className="absolute inset-0 z-30 p-6 flex flex-col justify-center bg-background/90 backdrop-blur-md animate-in fade-in duration-200"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'closeIndex' });
            }}
          >
            <div className="text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant px-3 pb-3">
              {meeting.title} · Index
            </div>
            <div className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {sections.map((sec, sIdx) => (
                <div
                  key={sec.id || sIdx}
                  className={`flex items-center gap-3.5 min-h-[52px] px-3.5 py-2 rounded-xl cursor-pointer transition-colors ${
                    sIdx === state.sectionIndex
                      ? 'bg-surface-variant text-on-surface font-medium'
                      : 'hover:bg-surface-variant/50 text-on-surface-variant'
                  }`}
                  onClick={(e) => handleJump(sIdx, e)}
                >
                  <div className="font-serif font-bold text-xs text-on-surface-variant w-5 shrink-0">
                    {pad(sIdx)}
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
    </div>
  );
}
