// Visits on a phone. Same record, stacked: the header, the nudge about homes we
// haven't been round to, then the visits themselves. The "Log a visit" action
// sits at the top rather than in a floating bar — a visit is written down at a
// desk or on the walk home, not mid-conversation.
import React from 'react';
import { useLanguage } from '../components/LanguageProvider';
import { House, Plus } from 'lucide-react';
import { VisitGroup } from '../components/visits/VisitCard';
import { initialsOf, type GroupedVisits, type OverdueVisit } from '../lib/visits';
import type { Visit } from '../types';

interface VisitsMobileProps {
  visits: Visit[];
  groups: GroupedVisits;
  overdue: OverdueVisit[];
  stats: { visits: number; peopleSeen: number; wentOut: number };
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onOpenContact: (contactId: string) => void;
  onLog: (contactId?: string) => void;
  onEdit: (visit: Visit) => void;
  onRemove: (visit: Visit) => void;
}

export default function VisitsMobile({
  visits,
  groups,
  overdue,
  stats,
  openId,
  setOpenId,
  onOpenContact,
  onLog,
  onEdit,
  onRemove,
}: VisitsMobileProps) {
  const { t } = useLanguage();
  const groupProps = { openId, setOpenId, onOpenContact, onEdit, onRemove, compact: true };

  return (
    <div
      className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 md-page md-mobile page visits visits--m"
      data-role="ft"
    >
      <header className="px-5 pt-8 pb-6 bg-surface border-b border-outline-variant/30">
        <div className="text-xs   text-on-surface-variant/80 font-semibold mb-1">
          {t('visits.where_weve_been')}
        </div>
        <h1 className="font-serif text-[32px] leading-tight text-on-surface">{t('visits.title')}</h1>
        <p className="text-[15px] text-on-surface-variant/90 leading-relaxed mt-2">
          {groups.thisWeek.length > 0 ? (
            <>
              {t('visits.weve_been_round_to')}{' '}
              <b className="font-semibold text-on-surface">
                {groups.thisWeek.length} {groups.thisWeek.length === 1 ? t('visits.home') : t('visits.homes')}
              </b>{' '}
              {t('visits.this_week')}
              {groups.lastWeek.length > 0 && <>, {groups.lastWeek.length} {t('visits.last_week')}</>}. {t('visits.going_to_where')}
            </>
          ) : (
            <>
              {t('visits.no_visits_this_week')}
            </>
          )}
        </p>
        <button
          onClick={() => onLog()}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-on-primary text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> {t('visits.log_a_visit')}
        </button>
      </header>

      {overdue.length > 0 && (
        <section className="px-5 mt-7">
          <h2 className="font-serif text-xl text-on-surface">{t('visits.havent_been_round')}</h2>
          <p className="text-[13px] text-on-surface-variant mt-0.5">
            {t('visits.youve_been_to_theirs')}
          </p>
          <div className="flex flex-col gap-3 mt-3">
            {overdue.map(({ contact, visit, daysAgo }) => (
              <div key={contact.id} className="p-4 rounded-3xl bg-surface border border-outline-variant">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-full bg-primary/10 text-accent grid place-items-center text-xs font-semibold shrink-0">
                    {initialsOf(contact.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-on-surface">{contact.name}</div>
                    <p className="text-[13px] text-on-surface-variant leading-relaxed mt-0.5">
                      {/* TODO(#730 follow-up): the previous fallback was `contact.location`; see Visits.tsx for the note. */}
                      {t('visits.last_visit_days_ago').replace('{n}', String(daysAgo))} · {visit.where || t('visits.no_location_noted')}
                      {visit.followUp && (
                        <>
                          {' · '}
                          {t('visits.you_said_youd').replace(
                            '{followUp}',
                            visit.followUp.charAt(0).toLowerCase() + visit.followUp.slice(1),
                          )}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onOpenContact(contact.id)}
                    className="flex-1 h-10 rounded-xl border border-outline-variant text-sm text-on-surface"
                  >
                    {t('visits.open')}
                  </button>
                  <button
                    onClick={() => onLog(contact.id)}
                    className="flex-1 h-10 rounded-xl bg-primary text-on-primary text-sm font-semibold"
                  >
                    {t('visits.log_a_visit')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <VisitGroup title={t('visits.this_week_group')} sub={t('visits.tap_a_visit')} list={groups.thisWeek} {...groupProps} />
      <VisitGroup title={t('visits.last_week_group')} list={groups.lastWeek} {...groupProps} />
      <VisitGroup title={t('visits.earlier')} list={groups.earlier} {...groupProps} />

      {visits.length === 0 && (
        <div className="mx-5 mt-8 p-6 rounded-3xl bg-surface border border-outline-variant text-center">
          <House className="w-6 h-6 text-on-surface-variant mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant leading-relaxed">
            {t('visits.nothing_here_yet')}
          </p>
          <button
            onClick={() => onLog()}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-on-primary text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> {t('visits.log_a_visit')}
          </button>
        </div>
      )}

      <footer className="mx-5 mt-10 bg-surface rounded-3xl border border-outline-variant/60 px-5 py-4 flex flex-wrap gap-x-8 gap-y-4">
        {[
          { n: stats.visits, l: t('visits.visits_count') },
          { n: stats.peopleSeen, l: t('visits.people_weve_sat_with') },
          { n: stats.wentOut, l: t('visits.of_us_have_gone_out') },
        ].map((f) => (
          <div key={f.l} className="flex flex-col gap-0.5">
            <span className="text-2xl leading-none text-on-surface">{f.n}</span>
            <span className="text-xs text-on-surface-variant">{f.l}</span>
          </div>
        ))}
        <p className="basis-full text-[13px] italic text-on-surface-variant">
          {t('visits.counted_notice')}
        </p>
      </footer>
    </div>
  );
}
