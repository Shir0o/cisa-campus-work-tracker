import React, { useEffect, useState } from 'react';
import { Translate } from '../components/Translate';
import { useLanguage } from '../components/LanguageProvider';
import { Filter, Search, X, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { Contact } from '../types';
import { clockLabel, historyMs } from './historyTime';

interface Hist {
  id: string;
  user: string;
  userPhoto?: string;
  action: string;
  target: string;
  contactId?: string;
  type: string;
  description?: string;
  createdAt: string;
}

interface Humanized {
  bucket: 'steps' | 'prayer' | 'talk' | 'gather';
  icon: any;
  lead: string;
  tail?: string;
  showTarget: boolean;
  detail?: string;
}

interface HistoryMobileProps {
  activities: Hist[];
  contacts: Contact[];
  filteredActivities: Hist[];
  rows: ({ type: "date"; at: string; key: string } | { type: "item"; a: Hist; key: string })[];
  peopleRemembered: number;
  kind: string;
  setKind: (kind: any) => void;
  who: string;
  setWho: (who: string) => void;
  q: string;
  setQ: (q: string) => void;
  staff: string[];
  onOpenContact: (contactId?: string) => void;
  onClearFilters: () => void;
  loading?: boolean;
  humanize: (a: Hist) => Humanized;
  dayInfo: (iso: string) => { label: string; sub: string };
  firstName: (name: string) => string;
  hasMore: boolean;
  onShowOlder: () => void;
  /** The record's own size, or null when it could not be read (#1828). */
  totalMoments?: number | null;
}

const BUCKET_NODE: Record<string, string> = {
  steps: "bg-stage-accent-soft text-stage-accent",
  prayer: "bg-stage-violet-soft text-stage-violet",
  talk: "bg-stage-amber-soft text-stage-amber",
  gather: "bg-stage-teal-soft text-stage-teal",
};

const KINDS = [
  { id: "all", label: "Everything", i18nKey: "history.everything" },
  { id: "steps", label: "Steps forward", i18nKey: "history.steps_forward" },
  { id: "prayer", label: "Prayer", i18nKey: "history.prayer" },
  { id: "talk", label: "Interactions", i18nKey: "history.conversations" },
  { id: "gather", label: "Gatherings", i18nKey: "history.gatherings" },
];

export default function HistoryMobile({
  activities,
  contacts,
  filteredActivities,
  rows,
  peopleRemembered,
  kind,
  setKind,
  who,
  setWho,
  q,
  setQ,
  staff,
  onOpenContact,
  onClearFilters,
  loading = false,
  humanize,
  dayInfo,
  firstName,
  hasMore,
  onShowOlder,
  totalMoments = null,
}: HistoryMobileProps) {
  const { t, language } = useLanguage();
  const [filterOpen, setFilterOpen] = useState(false);

  // Escape closes the sheet: it is a dialog, and a phone with a keyboard (or a
  // screen reader's escape) should not be trapped in it.
  useEffect(() => {
    if (!filterOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filterOpen]);

  const hasFilters = kind !== 'all' || who !== 'all' || q.trim() !== '';
  const activeCount = (kind !== 'all' ? 1 : 0) + (who !== 'all' ? 1 : 0) + (q.trim() ? 1 : 0);
  const activeKindEntry = KINDS.find((k) => k.id === kind);
  const kindLabel = activeKindEntry ? t(activeKindEntry.i18nKey, activeKindEntry.label) : undefined;
  const whoLabel = who === 'all' ? null : firstName(who);
  const wordFor = (n: number) => (n === 1 ? t('history.moment', 'moment') : t('history.moments', 'moments'));
  const momentWord = wordFor(totalMoments ?? activities.length);
  const shownMomentWord = wordFor(activities.length);
  const recordComplete = totalMoments !== null && activities.length >= totalMoments;
  const deck = t(
    'history.deck',
    'The small, faithful work of these days — {moments} across the team, touching {people} of the people in our care.',
  )
    .replace('{moments}', `${activities.length} ${shownMomentWord}`)
    .replace('{people}', String(peopleRemembered));

  // How far back the record goes, read off the oldest loaded moment — the last
  // entry of the newest-first list. Rows the app cannot date are skipped
  // rather than handed to `toLocaleDateString` as Invalid Date (#1768).
  const oldestMonth = (() => {
    for (let i = activities.length - 1; i >= 0; i--) {
      const ms = historyMs(activities[i].createdAt);
      if (ms != null) {
        return new Date(ms).toLocaleDateString(language, { month: 'long', year: 'numeric' });
      }
    }
    return null;
  })();

  // The terminator is gated on the paging truth from 1828: the whole record is
  // total is known, there are rows, and nothing is still being fetched. While
  // any of that is false we say nothing — refusing to claim an end is the
  // honest answer, not a bug to paper over.
  const recordEnds = !loading && !hasMore && recordComplete && activities.length > 0;
  const endStatement = hasFilters
    ? t('history.end_of_filtered', "That's every moment matching this filter.")
    : oldestMonth
      ? t('history.end_of_record', "That's everything — this record goes back to {month}.").replace(
          '{month}',
          oldestMonth,
        )
      : null;

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 md-page md-mobile page history history--m" data-role="ft">
      {/* ── Header ──
          The band is the phone's budget: the heading, then the one sentence
          that says how much record there is. The today line that repeated the
          first date marker is gone (issue 1827), and the prose clause with it. */}
      <header className="px-5 pt-6 pb-5 bg-surface border-b border-outline-variant/30 hism-hero">
        <h1 className="font-serif text-[32px] leading-tight text-on-surface">{t('history.looking_back')}</h1>
        <p className="text-[15px] text-on-surface-variant/90 leading-relaxed mt-1.5 hism-state">
          {totalMoments !== null ? (
            <>
              <span className="text-on-surface font-medium">{totalMoments}</span> {momentWord} across the team
              {recordComplete ? (
                <>
                  , touching{' '}
                  <span className="text-on-surface font-medium">{peopleRemembered}</span> of the people in our care.
                </>
              ) : (
                '.'
              )}
            </>
          ) : (
            deck
          )}
        </p>
      </header>

      {/* ── Controls & Filters ── */}
      <div className="px-5 mt-5 flex flex-col gap-3 hism-controls">
        <button
          onClick={() => setFilterOpen(true)}
          className={cn(
            "inline-flex items-center justify-center gap-2 h-11 border rounded-xl text-sm font-semibold active:brightness-95 transition-all bg-surface border-outline-variant/65 text-on-surface w-full hism-filterbtn",
            activeCount > 0 && "bg-primary border-primary text-on-primary on"
          )}
        >
          <Filter className="w-4 h-4" />
          <span>{t('history.filter_history')}</span>
          {activeCount > 0 && (
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold hism-count animate-in zoom-in duration-200', activeCount > 0 && 'bg-on-primary text-primary')}>
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <div className="flex flex-wrap gap-2 hism-chips">
            {kind !== 'all' && (
              <button
                onClick={() => setKind('all')}
                aria-label={t('history.remove_filter', 'Remove filter: {name}').replace('{name}', kindLabel ?? '')}
                className="inline-flex items-center gap-1.5 px-3 min-h-10 bg-primary text-on-primary text-xs font-semibold rounded-full border border-primary hism-chip"
              >
                {kindLabel}
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {who !== 'all' && (
              <button
                onClick={() => setWho('all')}
                aria-label={t('history.remove_filter', 'Remove filter: {name}').replace('{name}', whoLabel ?? '')}
                className="inline-flex items-center gap-1.5 px-3 min-h-10 bg-primary text-on-primary text-xs font-semibold rounded-full border border-primary hism-chip"
              >
                {whoLabel}
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {q.trim() !== '' && (
              <button
                onClick={() => setQ('')}
                aria-label={t('history.remove_filter', 'Remove filter: {name}').replace('{name}', q)}
                className="inline-flex items-center gap-1.5 px-3 min-h-10 bg-primary text-on-primary text-xs font-semibold rounded-full border border-primary hism-chip"
              >
                “{q}”
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Unbroken history stream ── */}
      <section className="px-5 mt-4 flex-1">
        {loading ? (
          <div className="py-12 text-center text-sm italic text-on-surface-variant bg-surface/40 rounded-xl border border-outline-variant/40">
            {t('history.gathering_last_few_days')}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-on-surface-variant bg-surface/40 rounded-xl border border-dashed border-outline-variant/40">
            <p className="italic">
              {hasFilters
                ? t('history.nothing_yet_filter')
                : t('history.nothing_logged', 'No moments yet — the first thing you write down will land here.')}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="mt-3 inline-flex items-center min-h-10 px-3 text-sm font-semibold text-accent underline underline-offset-2"
              >
                {t('history.show_everything', 'Show everything')}
              </button>
            )}
          </div>
        ) : (
          <div className="relative border-l border-outline-variant/40 ml-3 pl-5 space-y-6">
            {rows.map((row) => {
              if (row.type === 'date') {
                const info = dayInfo(row.at);
                return (
                  <div key={row.key} className="-ml-[27px] flex items-baseline gap-2.5 pt-4 pb-1.5 hist-datemark">
                    <span className="font-serif text-[18px] text-on-surface font-semibold bg-surface-container-lowest px-2 z-10">
                      {info.label}
                    </span>
                    <span className="text-xs text-on-surface-variant/80 font-medium">
                      {info.sub}
                    </span>
                  </div>
                );
              }

              const a = row.a;
              const h = humanize(a);
              const Icon = h.icon;
              const uFirst = firstName(a.user);

              return (
                <div
                  key={row.key}
                  className={cn("relative group hist-body", a.contactId && "cursor-pointer")}
                  onClick={() => a.contactId && onOpenContact(a.contactId)}
                >
                  {/* Timeline dot */}
                  <span
                    className={cn(
                      "absolute -left-[30px] top-1 w-[20px] h-[20px] rounded-[7px] border border-surface-container-lowest grid place-items-center z-10 shrink-0",
                      BUCKET_NODE[h.bucket]
                    )}
                    aria-hidden
                  >
                    <Icon className="w-3 h-3" />
                  </span>

                  {/* Log line content */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug text-on-surface-variant/95 hist-line">
                      <b className="font-semibold text-on-surface">{uFirst}</b> {h.lead}{' '}
                      {h.showTarget && a.target && (
                        a.contactId ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenContact(a.contactId);
                            }}
                            className="font-semibold text-on-surface underline decoration-outline-variant/60 underline-offset-2 hover:text-accent hover:decoration-primary transition-all"
                          >
                            {a.target}
                          </button>
                        ) : (
                          <span className="font-semibold text-on-surface">{a.target}</span>
                        )
                      )}
                      {h.tail && ` ${h.tail}`}.
                    </div>

                    {h.detail && (
                      <p className="text-[13.5px] leading-relaxed text-on-surface-variant mt-1 italic pl-2.5 border-l border-outline-variant/60 hist-detail">
                        <Translate text={h.detail} />
                      </p>
                    )}

                    <div className="text-[11px] text-on-surface-variant mt-1.5 flex items-center gap-1.5 hist-time">
                      {clockLabel(a.createdAt, language)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {totalMoments !== null && !recordComplete && (
        <div className="px-5 mt-6 text-center">
          <p className="text-[13px] text-on-surface-variant/80 italic">{deck}</p>
        </div>
      )}

      {hasMore && (
        <div className="px-5 mt-5 text-center">
          <button
            type="button"
            onClick={onShowOlder}
            className="text-sm font-semibold text-accent hover:underline"
          >
            {t('history.show_older')}
          </button>
        </div>
      )}

      {/* End of the record — the shape the reader already uses to end a reading
          surface: a hairline rule over a small centred line. It says where the
          record stops, and the closing sentence the phone never showed. Not the
          totals: the header carries those, and repeating them here would be the
          old deck's defect one screen lower. */}
      {recordEnds && endStatement && (
        <div
          data-testid="history-end"
          className="px-5 mt-8 flex flex-col items-center gap-2 text-center hism-end"
        >
          <span className="h-px w-12 bg-outline-variant" aria-hidden />
          <p className="text-[13px] text-on-surface-variant font-medium">{endStatement}</p>
          <p className="text-[13px] text-on-surface-variant/70 italic">{t('history.we_write_it_down')}</p>
        </div>
      )}

      {/* ── Filter bottom sheet ── */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/35 flex items-end justify-center scrim"
          onClick={() => setFilterOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-filter-title"
            className="bg-surface rounded-t-2xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden modal ibxs animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-outline/20 mx-auto my-3 shrink-0 ibxs-grab" />
            <div className="flex items-center justify-between px-5 pt-1 ibxs-head">
              <div className="ibxs-headtext">
                <h3 id="history-filter-title" className="font-serif text-lg text-on-surface ibxs-title">{t('history.filter_history')}</h3>
                <p className="text-xs text-on-surface-variant mt-0.5 ibxs-meta">
                  {t('history.filter_help', 'Narrow down logged moments by kind or who.')}
                </p>
              </div>
              <button
                onClick={() => setFilterOpen(false)}
                className="grid place-items-center min-w-11 min-h-11 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors modal-x"
                aria-label={t('actions.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-8 pt-4 space-y-6 mds-body">
              {/* Free-text search: the desktop has one, and a long record needs
                  it more on a phone than on a keyboard. */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('history.find_moment')}
                  aria-label={t('history.find_moment')}
                  className="pl-10 pr-4 h-11 w-full rounded-sm bg-surface border border-outline-variant/80 focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant"
                />
              </div>

              {/* Kind category */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-2.5">
                  {t('history.kind_of_moment', 'Kind of moment')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => setKind(k.id)}
                      aria-pressed={kind === k.id}
                      className={cn(
                        "px-4 min-h-10 rounded-full text-xs font-semibold border transition-all",
                        kind === k.id
                          ? "bg-primary text-on-primary border-primary "
                          : "bg-surface border-outline-variant/60 text-on-surface-variant hover:bg-surface-variant"
                      )}
                    >
                      {t(k.i18nKey, k.label)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Staff category */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-2">
                  {t('history.team_member', 'Team member')}
                </label>
                <div className="relative border border-outline-variant/80 rounded-xl bg-surface-container-low">
                  <select
                    value={who}
                    onChange={(e) => setWho(e.target.value)}
                    className="w-full h-11 pl-3.5 pr-9 bg-transparent outline-none border-0 text-sm font-semibold appearance-none cursor-pointer text-on-surface-variant"
                  >
                    <option value="all">{t('history.whole_team')}</option>
                    {staff.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-on-surface-variant"
                    aria-hidden
                  />
                </div>
              </div>

              {/* Reset & Done — the filters apply as you choose them, so the
                  primary control only closes the sheet. */}
              <div className="pt-4 border-t border-outline-variant/30 flex gap-3">
                <button
                  onClick={() => {
                    setKind('all');
                    setWho('all');
                    setQ('');
                    setFilterOpen(false);
                  }}
                  className="flex-1 min-h-11 py-3 text-center text-sm font-semibold border border-outline-variant/80 text-on-surface-variant hover:bg-surface-variant rounded-xl"
                >
                  {t('history.reset_all', 'Reset all')}
                </button>
                <button
                  onClick={() => setFilterOpen(false)}
                  className="flex-[2] min-h-11 py-3 text-center text-sm font-semibold bg-primary text-on-primary rounded-xl"
                >
                  {t('actions.done')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
