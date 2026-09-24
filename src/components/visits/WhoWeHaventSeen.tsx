// "Who we haven't seen" — the second reading of the Visits page (ADR 0031).
//
// A bucketed grid on a rolling twelve months: homes down the side under their
// own headings, members as rows, a mark where that person was seen that month,
// and time-since-seen at the end of each row. It holds a fixed width forever —
// the literal per-visit grid needed 34 columns and 3,400px for a single modest
// year, which is what settled on this shape.
//
// The reading is deliberately dumb and stable: homes in alphabetical order,
// members by first name, no sorting and no filters. A gap must stand out by
// visual weight alone, so the order never changes under anyone. Clicking a gap
// is the one motion — it opens the log prefilled with that home's people.
import React, { useMemo } from 'react';
import { House, Plus } from 'lucide-react';
import { useLanguage } from '../LanguageProvider';
import { initialsOf } from '../../lib/visits';
import { whoWeHaventSeen, type HomeReading } from '../../lib/homes';
import type { Contact, Home, Visit } from '../../types';

interface WhoWeHaventSeenProps {
  homes: Home[];
  contacts: Contact[];
  visits: Visit[];
  onLogVisit: (home: Home) => void;
  onManageHomes: () => void;
  compact?: boolean;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The twelve rolling month labels, oldest first, for the column headers. */
export function rollingMonths(now: Date = new Date()): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return MONTH_SHORT[d.getMonth()];
  });
}

/** How long it's been, said the way a person would. Null = never visited. */
export function sinceWords(days: number | null): string {
  if (days === null) return 'never';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function HomeBlock({
  block,
  onLogVisit,
}: {
  block: HomeReading;
  onLogVisit: (home: Home) => void;
}) {
  const { t } = useLanguage();
  const months = rollingMonths();

  return (
    <section className="mt-8 first:mt-0">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <h3 className="font-serif text-[21px] text-on-surface">{block.home.label}</h3>
        {block.home.place && (
          <span className="text-sm text-on-surface-variant">{block.home.place}</span>
        )}
        {!block.everVisited && (
          <span className="text-xs font-medium text-accent bg-primary/10 px-2.5 py-0.5 rounded-full">
            {t('visits.never_been_round')}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[minmax(140px,1fr)_repeat(12,minmax(28px,1fr))_minmax(90px,1fr)] items-center gap-1 px-4 pb-2 text-[10px] text-on-surface-variant">
            <span>{t('visits.person')}</span>
            {months.map((m, i) => (
              <span key={i} className="text-center">
                {m}
              </span>
            ))}
            <span className="text-right">{t('visits.since')}</span>
          </div>

          <div className="flex flex-col gap-1">
            {block.members.map((m) => (
              <button
                key={m.contactId}
                onClick={() => onLogVisit(block.home)}
                aria-label={`${t('visits.log_a_visit')}: ${m.name}`}
                className="grid grid-cols-[minmax(140px,1fr)_repeat(12,minmax(28px,1fr))_minmax(90px,1fr)] items-center gap-1 px-4 py-2 rounded-xl bg-surface border border-outline-variant/60 hover:border-primary/40 transition-colors text-left"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-primary/10 text-accent grid place-items-center text-[10px] font-semibold shrink-0">
                    {initialsOf(m.name)}
                  </span>
                  <span className="text-sm font-medium text-on-surface truncate">{m.name}</span>
                </span>
                {m.months.map((seen, i) => (
                  <span key={i} className="grid place-items-center">
                    <span
                      className={
                        seen
                          ? 'w-3.5 h-3.5 rounded-full bg-primary'
                          : 'w-3.5 h-3.5 rounded-full bg-surface-variant/40'
                      }
                      data-seen={seen}
                    />
                  </span>
                ))}
                <span className="text-right text-sm font-semibold text-on-surface">
                  {m.everSeen ? sinceWords(m.daysSinceSeen) : (
                    <span className="text-accent">{sinceWords(null)}</span>
                  )}
                </span>
              </button>
            ))}
            {block.members.length === 0 && (
              <div className="px-4 py-2 rounded-xl bg-surface border border-outline-variant/60 text-sm text-on-surface-variant">
                {t('visits.no_one_at_home')}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function WhoWeHaventSeen({
  homes,
  contacts,
  visits,
  onLogVisit,
  onManageHomes,
  compact = false,
}: WhoWeHaventSeenProps) {
  const { t } = useLanguage();
  const reading = useMemo(() => whoWeHaventSeen(homes, contacts, visits), [homes, contacts, visits]);

  return (
    <div className={compact ? 'px-5 mt-6' : ''}>
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h2 className="font-serif text-[23px] text-on-surface">{t('visits.who_we_havent_seen')}</h2>
        <span className="text-sm text-on-surface-variant">{t('visits.going_to_where')}</span>
      </div>
      <p className="text-sm text-on-surface-variant leading-relaxed mb-2">
        {t('visits.who_reading_blurb')}
      </p>

      <div className="flex items-center gap-3 flex-wrap mb-6">
        <button
          onClick={onManageHomes}
          className="inline-flex items-center gap-2 px-4 h-9 rounded-full border border-outline-variant text-sm text-on-surface hover:border-primary/30 transition-colors"
        >
          <House className="w-4 h-4" /> {t('visits.manage_homes')}
        </button>
      </div>

      {reading.length === 0 ? (
        <div className="p-8 rounded-3xl bg-surface border border-outline-variant text-center">
          <House className="w-7 h-7 text-on-surface-variant mx-auto mb-4" />
          <p className="text-base text-on-surface-variant leading-relaxed max-w-lg mx-auto">
            {t('visits.no_homes_yet')}
          </p>
          <button
            onClick={onManageHomes}
            className="mt-5 inline-flex items-center gap-2 px-5 h-10 rounded-full bg-primary text-on-primary text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> {t('visits.add_a_home')}
          </button>
        </div>
      ) : (
        reading.map((block) => (
          <HomeBlock key={block.home.id} block={block} onLogVisit={onLogVisit} />
        ))
      )}
    </div>
  );
}