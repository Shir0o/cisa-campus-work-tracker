// Visits on a phone. Same record, stacked: the header, the reading toggle
// (opening on "Who we haven't seen"), then the visits themselves. The "Log a
// visit" action sits at the top rather than in a floating bar — a visit is
// written down at a desk or on the walk home, not mid-conversation.
import React from 'react';
import { useLanguage } from '../components/LanguageProvider';
import { House, Plus } from 'lucide-react';
import { VisitGroup } from '../components/visits/VisitCard';
import WhoWeHaventSeen from '../components/visits/WhoWeHaventSeen';
import type { GroupedVisits } from '../lib/visits';
import type { Contact, Home, Visit } from '../types';

interface VisitsMobileProps {
  visits: Visit[];
  groups: GroupedVisits;
  stats: { visits: number; peopleSeen: number; wentOut: number };
  homes: Home[];
  contacts: Contact[];
  tab: 'reading' | 'log';
  toggle: React.ReactNode;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onOpenContact: (contactId: string) => void;
  onLog: (contactId?: string) => void;
  onLogForHome: (home: Home) => void;
  onEdit: (visit: Visit) => void;
  onRemove: (visit: Visit) => void;
  onManageHomes: () => void;
}

export default function VisitsMobile({
  visits,
  groups,
  stats,
  homes,
  contacts,
  tab,
  toggle,
  openId,
  setOpenId,
  onOpenContact,
  onLog,
  onLogForHome,
  onEdit,
  onRemove,
  onManageHomes,
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
          {tab === 'log' && groups.thisWeek.length > 0 ? (
            <>
              {t('visits.weve_been_round_to')}{' '}
              <b className="font-semibold text-on-surface">
                {groups.thisWeek.length} {groups.thisWeek.length === 1 ? t('visits.home') : t('visits.homes')}
              </b>{' '}
              {t('visits.this_week')}
              {groups.lastWeek.length > 0 && <>, {groups.lastWeek.length} {t('visits.last_week')}</>}.
            </>
          ) : (
            <>
              {t('visits.going_to_where')}
            </>
          )}
        </p>
        <div className="mt-4">{toggle}</div>
        <button
          onClick={() => onLog()}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-on-primary text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> {t('visits.log_a_visit')}
        </button>
      </header>

      {tab === 'reading' ? (
        <WhoWeHaventSeen
          homes={homes}
          contacts={contacts}
          visits={visits}
          onLogVisit={onLogForHome}
          onManageHomes={onManageHomes}
          compact
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}