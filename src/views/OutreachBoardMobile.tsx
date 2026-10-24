import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronRight, Settings2, Search, X, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { Contact, Stage } from '../types';
import { Avatar } from '../components/landing/primitives';
import { Translate } from '../components/Translate';
import { useLanguage } from '../components/LanguageProvider';

type Touch = { ms: number; note: string };
type TouchMap = Map<string, Touch>;

interface OutreachBoardMobileProps {
  stages: Stage[];
  contacts: Contact[];
  unmappedContacts: Contact[];
  lastTouchByContact: TouchMap;
  onOpenContact: (contact: Contact) => void;
  onMove: (contactId: string, newStageLabel: string) => Promise<void>;
  onShapeJourney: () => void;
  isAdmin: boolean;
  onAddContact: (stageLabel: string) => void;
}

export type ToneKey = 'slate' | 'clay' | 'ochre' | 'sage' | 'teal' | 'indigo' | 'plum' | 'rose';

const TONE_KEY_MAP: Record<string, ToneKey> = {
  'bg-board-slate': 'slate',
  'slate': 'slate',
  'bg-board-clay': 'clay',
  'clay': 'clay',
  'bg-board-ochre': 'ochre',
  'ochre': 'ochre',
  'bg-board-sage': 'sage',
  'sage': 'sage',
  'bg-board-teal': 'teal',
  'teal': 'teal',
  'bg-board-indigo': 'indigo',
  'indigo': 'indigo',
  'bg-board-plum': 'plum',
  'plum': 'plum',
  'bg-board-rose': 'rose',
  'rose': 'rose',
  // legacy aliases
  'bg-board-amber': 'clay',
  'bg-board-orange': 'ochre',
  'bg-board-emerald': 'sage',
  'bg-board-crimson': 'rose',
  'bg-board-ocean': 'slate',
  'bg-primary': 'indigo',
  'bg-primary-fixed-dim': 'slate',
  'bg-secondary': 'teal',
  'bg-orange-500': 'ochre',
  'bg-orange': 'ochre',
  'orange': 'ochre',
  'accent': 'slate',
  'amber': 'clay',
  'violet': 'plum',
};

const ALL_TONES: ToneKey[] = ['slate', 'clay', 'ochre', 'sage', 'teal', 'indigo', 'plum', 'rose'];

export const toneKeyFor = (color: string | undefined, index: number = 0): ToneKey => {
  if (color && TONE_KEY_MAP[color]) return TONE_KEY_MAP[color];
  return ALL_TONES[index % ALL_TONES.length];
};

export const toneStyle = (color: string | undefined, index: number = 0): React.CSSProperties => {
  const k = toneKeyFor(color, index);
  return {
    '--tone': `var(--t-${k})`,
    '--tone-soft': `var(--t-${k}-soft)`,
  } as React.CSSProperties;
};

const STAGE_CAPTION_KEY: Record<string, string> = {
  'first contact': 'first_contact',
  'second contact': 'second_contact',
  regular: 'regular',
  church: 'church',
};
const captionKeyFor = (label?: string) =>
  (label && STAGE_CAPTION_KEY[label.trim().toLowerCase()]) || undefined;

const parseMs = (s?: string | null): number | null => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
};

const DAY_MS = 86_400_000;
const daysSince = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY_MS));

export default function OutreachBoardMobile({
  stages,
  contacts,
  unmappedContacts,
  lastTouchByContact,
  onOpenContact,
  onMove,
  onShapeJourney,
  isAdmin,
  onAddContact,
}: OutreachBoardMobileProps) {
  const { t } = useLanguage();
  const hasUnassigned = unmappedContacts.length > 0;
  const mobileStages = useMemo(() => {
    const list = [...stages];
    if (hasUnassigned) {
      list.unshift({
        id: 'uncategorized',
        label: t('outreachBoard.unassigned'),
        color: 'bg-surface-variant',
        order: -1,
      });
    }
    return list;
  }, [stages, hasUnassigned, t]);

  // Selection is the stage id, not its index: an incoming unassigned person
  // prepends a tab, and an index would silently jump the reader to it.
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [movingContact, setMovingContact] = useState<Contact | null>(null);
  const switchRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const userNavigated = useRef(false);
  const moveTriggerRef = useRef<HTMLElement | null>(null);
  const moveSheetRef = useRef<HTMLDivElement>(null);

  const activeIndex = mobileStages.findIndex((s) => s.id === activeStageId);
  const idx = activeIndex >= 0 ? activeIndex : 0;
  const stage = mobileStages[idx] || {
    id: 'uncategorized',
    label: t('outreachBoard.unassigned'),
    color: 'bg-surface-variant',
  };

  // #1787: a stage-local find. The global search reads all of People, which is
  // not the same question as "where is this person in the journey?".
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;
  const matchesQuery = (c: Contact) =>
    c.name.toLowerCase().includes(normalizedQuery) ||
    (c.email || '').toLowerCase().includes(normalizedQuery);

  const stageItems = stage.id === 'uncategorized'
    ? unmappedContacts
    : contacts.filter((c) => c.stage === stage.label);
  const items = searching ? stageItems.filter(matchesQuery) : stageItems;
  const countLabel = (n: number) =>
    n === 1 ? t('outreachBoard.one_person') : t('outreachBoard.n_people').replace('{n}', String(n));

  // The part the global search cannot say: this match is on another step.
  const otherStageMatches = searching
    ? mobileStages
        .map((s, index) => ({ stage: s, index }))
        .filter(({ stage: s }) => s.id !== stage.id)
        .map(({ stage: s, index }) => ({
          stage: s,
          index,
          count: (s.id === 'uncategorized'
            ? unmappedContacts
            : contacts.filter((c) => c.stage === s.label)).filter(matchesQuery).length,
        }))
        .filter((m) => m.count > 0)
    : [];
  const otherStepHint = (count: number, label: string) =>
    t('outreachBoard.search_other_step')
      .replace('{n}', String(count))
      .replace('{stage}', label);

  // Clearing returns the caret to the field: the button itself disappears, so
  // leaving focus on it would drop the reader back to the top of the page.
  const clearSearch = () => {
    setQuery('');
    searchRef.current?.focus();
  };

  const selectStage = (next: number) => {
    const bounded = Math.max(0, Math.min(next, mobileStages.length - 1));
    const target = mobileStages[bounded];
    if (!target) return;
    userNavigated.current = true;
    setActiveStageId(target.id);
  };

  useEffect(() => {
    const sw = switchRef.current;
    if (!sw) return;
    const seg = sw.children[idx] as HTMLElement;
    if (!seg) return;
    const target = seg.offsetLeft - (sw.clientWidth - seg.clientWidth) / 2;
    sw.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [idx]);

  // A new step starts at its heading, not wherever the previous step's list
  // happened to be scrolled to.
  useEffect(() => {
    if (!userNavigated.current) return;
    userNavigated.current = false;
    const scroller = panelRef.current?.closest('main') as HTMLElement | null;
    if (scroller) scroller.scrollTop = 0;
  }, [idx]);

  useEffect(() => {
    if (!movingContact) return;
    const dialog = moveSheetRef.current;
    const panel = panelRef.current;
    dialog?.focus();
    const scroller = rootRef.current?.closest('main') as HTMLElement | null;
    const previousOverflow = scroller?.style.overflow;
    if (scroller) scroller.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMovingContact(null);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (scroller) scroller.style.overflow = previousOverflow || '';
      const trigger = moveTriggerRef.current;
      if (trigger && document.contains(trigger)) trigger.focus();
      else panel?.focus();
    };
  }, [movingContact]);

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (mobileStages.length < 2) return;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (idx + 1) % mobileStages.length;
        break;
      case 'ArrowLeft':
        next = (idx - 1 + mobileStages.length) % mobileStages.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = mobileStages.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectStage(next);
    tabRefs.current[next]?.focus();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const point = e.touches[0];
    if (point) touchStart.current = { x: point.clientX, y: point.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const point = e.changedTouches[0];
    if (!start || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    // A vertical scroll with a drifting thumb is not a step change.
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      selectStage(idx + (dx < 0 ? 1 : -1));
    }
  };

  const openMoveSheet = (contact: Contact, event: React.MouseEvent<HTMLButtonElement>) => {
    moveTriggerRef.current = event.currentTarget;
    setMovingContact(contact);
  };

  const captionKey = captionKeyFor(stage.label);

  return (
    <div ref={rootRef} className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 md-page md-mobile page jrn jrnm">
      <header className="px-5 pt-8 pb-4 bg-surface jrnm-hero">
        <div className="text-xs   text-on-surface-variant/80 font-semibold mb-1 jrn-eyebrow">
          {t('outreachBoard.eyebrow')}
        </div>
        <h1 className="font-serif text-[32px] leading-tight text-on-surface jrn-h1">{t('outreach.stages')}</h1>
        <p className="text-[14.5px] text-on-surface-variant/90 leading-relaxed mt-2 jrnm-state">
          {t(
            contacts.length === 1
              ? 'outreachBoard.mobile_summary_one'
              : 'outreachBoard.mobile_summary_many',
          ).replace('{n}', String(contacts.length))}
        </p>
        {isAdmin && (
          <button
            className="mt-3.5 min-h-11 inline-flex items-center gap-2 px-3.5 rounded-full border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-variant transition-all jrnm-shape focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            onClick={onShapeJourney}
          >
            <Settings2 className="w-3.5 h-3.5" /> {t('outreachBoard.shape_the_journey')}
          </button>
        )}
      </header>

      {/* Switcher tabs */}
      <div
        role="tablist"
        aria-label={t('outreach.stages')}
        onKeyDown={onTabKeyDown}
        className="sticky top-0 z-20 flex gap-2 overflow-x-auto px-5 py-4 border-b border-outline-variant/30 no-scrollbar whitespace-nowrap jrnm-switch bg-surface"
        ref={switchRef}
      >
        {mobileStages.map((s, i) => {
          const count = stage.id === s.id
            ? items.length
            : s.id === 'uncategorized'
              ? unmappedContacts.length
              : contacts.filter((c) => c.stage === s.label).length;
          const activeTab = s.id === stage.id;
          const tStyle = toneStyle(s.color, i);
          return (
            <button
              key={s.id}
              role="tab"
              id={`journey-tab-${s.id}`}
              aria-selected={activeTab}
              aria-controls={`journey-panel-${s.id}`}
              tabIndex={activeTab ? 0 : -1}
              ref={(el) => { tabRefs.current[i] = el; }}
              style={tStyle}
              className={cn(
                "min-h-11 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[14px] font-semibold border transition-all jrnm-seg shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                activeTab
                  ? "bg-on-surface border-on-surface text-background is-on"
                  : "bg-surface border-outline-variant/50 text-on-surface-variant hover:bg-surface-variant/55"
              )}
              onClick={() => selectStage(i)}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full jrnm-seg-dot", activeTab ? "bg-background/60" : "bg-[var(--tone)]")} aria-hidden />
              <span className="jrnm-seg-name">{s.label}</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium jrnm-seg-count", activeTab ? "bg-background/15 text-background" : "bg-surface-variant text-on-surface-variant/80")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {`${stage.label}, ${countLabel(items.length)}${otherStageMatches
          .map((m) => `, ${otherStepHint(m.count, m.stage.label)}`)
          .join('')}`}
      </p>

      {/* List content panel */}
      <section
        ref={panelRef}
        role="tabpanel"
        id={`journey-panel-${stage.id}`}
        aria-labelledby={`journey-tab-${stage.id}`}
        tabIndex={-1}
        style={toneStyle(stage.color, idx)}
        className="flex-1 px-5 pt-6 pb-2 jrnm-panel transition-all bg-[var(--tone-soft)] focus:outline-none"
        key={stage.id}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="mb-4 flex flex-col gap-2 jrnm-panel-head">
          <div
            className="relative jrnm-search"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Search
              className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              enterKeyHint="search"
              aria-label={t('outreachBoard.search_in_step')}
              placeholder={t('outreachBoard.search_in_step')}
              className="w-full min-h-11 pl-10 pr-12 py-2 rounded-sm border border-outline-variant bg-surface text-[14.5px] text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tone-soft)] [&::-webkit-search-cancel-button]:hidden"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={t('outreachBoard.clear_search')}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant active:scale-95 transition-all jrnm-search-clear focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {searching ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 jrnm-search-results">
              {items.length > 0 && (
                <span className="text-[13px] font-semibold text-on-surface-variant/80">
                  {countLabel(items.length)}
                </span>
              )}
              {otherStageMatches.map((m) => (
                <button
                  key={m.stage.id}
                  type="button"
                  onClick={() => selectStage(m.index)}
                  className="min-h-11 inline-flex items-center text-[13px] font-semibold text-accent underline underline-offset-2 jrnm-search-other focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tone-soft)]"
                >
                  {otherStepHint(m.count, m.stage.label)}
                </button>
              ))}
            </div>
          ) : (
            captionKey && (
              <p className="text-xs text-on-surface-variant/90 leading-relaxed max-w-sm jrnm-panel-caption">
                {t(`outreachBoard.stage_captions.${captionKey}`)}
              </p>
            )
          )}
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center text-sm italic text-on-surface-variant bg-surface/40 rounded-2xl border border-dashed border-outline-variant/30 jrnm-empty shadow-inner">
            {searching
              ? t('outreachBoard.search_no_match').replace('{q}', query.trim())
              : t('outreachBoard.no_one_here')}
          </div>
        ) : (
          <div className="space-y-2.5 jrnm-list">
            {items.map((c) => {
              const touch = lastTouchByContact.get(c.id);
              const contactLastMs = parseMs(c.lastContactedDate) ?? parseMs(c.lastSeen);
              const touchMs = touch?.ms;
              const bestMs = Math.max(touchMs ?? -Infinity, contactLastMs ?? -Infinity);
              const ms = Number.isFinite(bestMs) && bestMs > 0 ? bestMs : parseMs(c.createdAt);
              const days = ms != null ? daysSince(ms) : null;
              const overdue = days != null && days >= 7;
              const note = (touch?.note || c.notes || '').trim();
              const sub = [c.year, c.major].filter(Boolean).join(' · ');
              return (
                <article
                  role="button"
                  tabIndex={0}
                  aria-label={c.name}
                  className="flex items-start gap-3.5 p-4 bg-surface rounded-3xl border border-outline-variant/40 active:bg-surface-variant/30 transition-all jrnm-person cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tone-soft)]"
                  key={c.id}
                  onClick={() => onOpenContact(c)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenContact(c);
                    }
                  }}
                >
                  <Avatar contact={c} size="md" />
                  <div className="min-w-0 flex-1 jrnm-p-body">
                    <div className="font-serif font-semibold text-[16px] text-on-surface truncate jrnm-p-name">
                      {c.name}
                    </div>
                    {sub && <div className="text-xs text-on-surface-variant mt-0.5 truncate jrnm-p-sub">{sub}</div>}
                    {days != null ? (
                      <div className={cn("text-xs text-on-surface-variant mt-1.5 flex items-center gap-1.5 jrnm-p-since", overdue && "text-stage-amber font-medium is-overdue")}>
                        {overdue && <span className="w-1.5 h-1.5 rounded-full bg-stage-amber shrink-0 jrn-since-dot" aria-hidden />}
                        {!Number.isFinite(days) ? '' : days === 0 ? t('myDay.connected_today') : days === 1 ? t('myDay.last_connected_yesterday') : t('myDay.last_connected_days_ago').replace('{n}', String(days))}
                      </div>
                    ) : (
                      <div className="text-xs text-on-surface-variant mt-1.5 italic jrnm-p-since">{t('outreach.no_contact_logged')}</div>
                    )}
                    {note && (
                      <p className="text-xs text-on-surface-variant mt-2 line-clamp-2 leading-relaxed opacity-95">
                        <span className="font-medium text-on-surface-variant/70">{t('outreachBoard.last')}</span> <Translate text={note} />
                      </p>
                    )}
                  </div>
                  <button
                    className="w-11 h-11 grid place-items-center bg-surface-container border border-outline-variant/65 text-on-surface rounded-xl active:scale-95 transition-all jrnm-p-move shrink-0 self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    aria-label={t('outreachBoard.move_to_another_step').replace('{name}', c.name.split(' ')[0])}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMoveSheet(c, e);
                    }}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <button
          onClick={() => onAddContact(stage.id === 'uncategorized' ? '' : stage.label)}
          className="mt-4 w-full py-3.5 text-center text-sm bg-surface border border-outline-variant/70 text-accent font-semibold rounded-2xl active:brightness-95 transition-all  jrnm-add focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tone-soft)]"
        >
          {stage.id === 'uncategorized' || (stages[0] && stage.label === stages[0].label)
            ? t('outreach.welcome_someone_new')
            : t('outreach.add_to').replace('{stage}', stage.label)}
        </button>
      </section>

      {/* MoveSheet dialog bottom sheet */}
      {movingContact && (
        <div
          className="fixed inset-0 z-[200] bg-black/35 flex items-end justify-center scrim"
          onClick={() => setMovingContact(null)}
        >
          <div
            ref={moveSheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-sheet-title"
            aria-describedby="move-sheet-description"
            tabIndex={-1}
            className="bg-surface rounded-t-2xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden modal ibxs animate-in slide-in-from-bottom duration-300 focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-outline/20 mx-auto my-3 shrink-0 ibxs-grab" />
            <div className="flex items-center justify-between px-5 pt-1 ibxs-head">
              <div className="ibxs-headtext">
                <h3 id="move-sheet-title" className="font-serif text-lg text-on-surface ibxs-title">
                  {t('outreachBoard.move_sheet_title').replace('{name}', movingContact.name.split(' ')[0])}
                </h3>
                <p id="move-sheet-description" className="text-xs text-on-surface-variant mt-0.5 ibxs-meta">
                  {t('outreachBoard.move_sheet_subtitle')}
                </p>
              </div>
              <button
                onClick={() => setMovingContact(null)}
                className="w-11 h-11 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors modal-x focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                aria-label={t('actions.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-8 pt-4 flex flex-col gap-2 mds-body">
              <div className="flex flex-col gap-2 jrnm-move-list">
                {mobileStages.map((s, i) => {
                      const hereNow = s.id === 'uncategorized'
                        ? !movingContact.stage
                        : s.label === movingContact.stage;
                  const tStyle = toneStyle(s.color, i);

                  return (
                    <button
                      key={s.id}
                      style={tStyle}
                      aria-current={hereNow ? 'true' : undefined}
                      onClick={() => {
                        if (!hereNow) onMove(movingContact.id, s.id === 'uncategorized' ? '' : s.label);
                        setMovingContact(null);
                      }}
                      className={cn(
                        "min-h-11 flex items-center gap-3.5 p-4 rounded-xl text-left border transition-all jrnm-move-opt w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                        hereNow ? "bg-[var(--tone-soft)] border-[var(--tone)]/30 text-[var(--tone)] is-here" : "bg-surface border-outline-variant hover:bg-surface-variant"
                      )}
                    >
                      <span className="w-2 h-2 rounded-full jrnm-move-dot bg-[var(--tone)]" />
                      <div className="flex-1 min-w-0 jrnm-move-text">
                        <div className="font-medium text-[15px] jrnm-move-name">{s.label}</div>
                      </div>
                      {hereNow ? (
                        <span className="text-xs font-semibold   text-[var(--tone)] jrnm-move-here">{t('outreach.here_now')}</span>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-on-surface-variant/40" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
