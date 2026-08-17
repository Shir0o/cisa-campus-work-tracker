// Visits on a phone. Same record, stacked: the header, the nudge about homes we
// haven't been round to, then the visits themselves. The "Log a visit" action
// sits at the top rather than in a floating bar — a visit is written down at a
// desk or on the walk home, not mid-conversation.
import React from 'react';
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
  const groupProps = { openId, setOpenId, onOpenContact, onEdit, onRemove, compact: true };

  return (
    <div
      className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 md-page md-mobile page visits visits--m"
      data-role="ft"
    >
      <header className="px-5 pt-8 pb-6 bg-surface border-b border-outline-variant/30">
        <div className="text-xs   text-on-surface-variant/80 font-semibold mb-1">
          Where we've been
        </div>
        <h1 className="font-serif text-[32px] leading-tight text-on-surface">Visits</h1>
        <p className="text-[15px] text-on-surface-variant/90 leading-relaxed mt-2">
          {groups.thisWeek.length > 0 ? (
            <>
              We've been round to{' '}
              <b className="font-semibold text-on-surface">
                {groups.thisWeek.length} {groups.thisWeek.length === 1 ? 'home' : 'homes'}
              </b>{' '}
              this week
              {groups.lastWeek.length > 0 && <>, {groups.lastWeek.length} last week</>}. Going to where someone lives
              says something a coffee can't.
            </>
          ) : (
            <>
              No visits logged this week yet. Going to where someone lives says something a coffee can't — write one
              down while you still remember the room.
            </>
          )}
        </p>
        <button
          onClick={() => onLog()}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-on-primary text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Log a visit
        </button>
      </header>

      {overdue.length > 0 && (
        <section className="px-5 mt-7">
          <h2 className="font-serif text-xl text-on-surface">We haven't been round in a while</h2>
          <p className="text-[13px] text-on-surface-variant mt-0.5">
            You've been to theirs before — it's been a few weeks.
          </p>
          <div className="flex flex-col gap-3 mt-3">
            {overdue.map(({ contact, visit, daysAgo }) => (
              <div key={contact.id} className="p-4 rounded-2xl bg-surface border border-outline-variant">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-full bg-primary/10 text-accent grid place-items-center text-xs font-semibold shrink-0">
                    {initialsOf(contact.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-on-surface">{contact.name}</div>
                    <p className="text-[13px] text-on-surface-variant leading-relaxed mt-0.5">
                      Last visit {daysAgo} days ago · {visit.where || contact.location}
                      {visit.followUp && (
                        <> · you said you'd {visit.followUp.charAt(0).toLowerCase() + visit.followUp.slice(1)}</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onOpenContact(contact.id)}
                    className="flex-1 h-10 rounded-xl border border-outline-variant text-sm text-on-surface"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => onLog(contact.id)}
                    className="flex-1 h-10 rounded-xl bg-primary text-on-primary text-sm font-semibold"
                  >
                    Log a visit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <VisitGroup title="This week" sub="Tap a visit to read it back." list={groups.thisWeek} {...groupProps} />
      <VisitGroup title="Last week" list={groups.lastWeek} {...groupProps} />
      <VisitGroup title="Earlier" list={groups.earlier} {...groupProps} />

      {visits.length === 0 && (
        <div className="mx-5 mt-8 p-6 rounded-2xl bg-surface border border-outline-variant text-center">
          <House className="w-6 h-6 text-on-surface-variant mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Nothing here yet. A visit gets written down after you've been — who you saw, where, and what you'd want to
            remember in a month.
          </p>
          <button
            onClick={() => onLog()}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-on-primary text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Log a visit
          </button>
        </div>
      )}

      <footer className="mx-5 mt-10 bg-surface rounded-3xl border border-outline-variant/60 px-5 py-4 flex flex-wrap gap-x-8 gap-y-4">
        {[
          { n: stats.visits, l: 'visits' },
          { n: stats.peopleSeen, l: "people we've sat with" },
          { n: stats.wentOut, l: 'of us have gone out' },
        ].map((f) => (
          <div key={f.l} className="flex flex-col gap-0.5">
            <span className="text-2xl leading-none text-on-surface">{f.n}</span>
            <span className="text-xs text-on-surface-variant">{f.l}</span>
          </div>
        ))}
        <p className="basis-full text-[13px] italic text-on-surface-variant">
          Counted only so we notice whose door we haven't knocked on.
        </p>
      </footer>
    </div>
  );
}
