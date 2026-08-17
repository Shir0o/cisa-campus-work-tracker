import React, { useState } from 'react';
import { format } from 'date-fns';
import { Filter, X, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { Contact } from '../types';

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
  staff: string[];
  onOpenContact: (contactId?: string) => void;
  humanize: (a: Hist) => Humanized;
  dayInfo: (iso: string) => { label: string; sub: string };
  firstName: (name: string) => string;
}

const BUCKET_NODE: Record<string, string> = {
  steps: "bg-stage-accent-soft text-stage-accent",
  prayer: "bg-stage-violet-soft text-stage-violet",
  talk: "bg-stage-amber-soft text-stage-amber",
  gather: "bg-stage-teal-soft text-stage-teal",
};

const KINDS = [
  { id: "all", label: "Everything" },
  { id: "steps", label: "Steps forward" },
  { id: "prayer", label: "Prayer" },
  { id: "talk", label: "Conversations" },
  { id: "gather", label: "Gatherings" },
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
  staff,
  onOpenContact,
  humanize,
  dayInfo,
  firstName,
}: HistoryMobileProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  const activeCount = (kind !== 'all' ? 1 : 0) + (who !== 'all' ? 1 : 0);
  const kindLabel = KINDS.find((k) => k.id === kind)?.label;
  const whoLabel = who === 'all' ? null : firstName(who);

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 md-page md-mobile page history history--m" data-role="ft">
      {/* ── Header ── */}
      <header className="px-5 pt-8 pb-6 bg-surface border-b border-outline-variant/30 hism-hero">
        <div className="text-xs   text-on-surface-variant/80 font-semibold mb-1">
          {format(new Date(), 'EEEE, MMMM d')}
        </div>
        <h1 className="font-serif text-[32px] leading-tight text-on-surface">Looking back</h1>
        <p className="text-[15px] text-on-surface-variant/90 leading-relaxed mt-2 hism-state">
          The small, faithful work of these days — <b className="font-semibold text-on-surface">{activities.length} moments</b> across the team, touching <b className="font-semibold text-on-surface">{peopleRemembered}</b> of the people in our care.
        </p>
      </header>

      {/* ── Controls & Filters ── */}
      <div className="px-5 mt-5 flex flex-col gap-3 hism-controls">
        <button
          onClick={() => setFilterOpen(true)}
          className={cn(
            "inline-flex items-center justify-center gap-2 h-11 border rounded-xl text-sm font-semibold active:brightness-95 transition-all bg-surface border-outline-variant/65 text-on-surface w-full hism-filterbtn",
            activeCount > 0 && "bg-accent-soft border-accent-line text-accent on"
          )}
        >
          <Filter className="w-4 h-4" />
          <span>Filter history</span>
          {activeCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-on-primary font-semibold  hism-count animate-in zoom-in duration-200">
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <div className="flex flex-wrap gap-2 hism-chips">
            {kind !== 'all' && (
              <button
                onClick={() => setKind('all')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-soft text-accent text-xs font-semibold rounded-full border border-accent-line hism-chip"
              >
                {kindLabel}
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {who !== 'all' && (
              <button
                onClick={() => setWho('all')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-soft text-accent text-xs font-semibold rounded-full border border-accent-line hism-chip"
              >
                {whoLabel}
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Unbroken history stream ── */}
      <section className="px-5 mt-4 flex-1">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm italic text-on-surface-variant bg-surface/40 rounded-2xl border border-dashed border-outline-variant/30 shadow-inner">
            No logged moments match these filters.
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
                <div key={row.key} className="relative group hist-body" onClick={() => a.contactId && onOpenContact(a.contactId)}>
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
                      {h.showTarget && (
                        <span className={cn(
                          "font-semibold text-on-surface",
                          a.contactId && "underline decoration-outline-variant/60 underline-offset-2 cursor-pointer hover:text-accent hover:decoration-primary transition-all"
                        )}>
                          {a.target}
                        </span>
                      )}
                      {h.tail && ` ${h.tail}`}.
                    </div>

                    {h.detail && (
                      <p className="text-[13.5px] leading-relaxed text-on-surface-variant mt-1 italic pl-2.5 border-l border-outline-variant/60 hist-detail">
                        {h.detail}
                      </p>
                    )}

                    <div className="text-[11px] text-on-surface-variant/75 mt-1.5 flex items-center gap-1.5 hist-time">
                      {format(new Date(a.createdAt), 'h:mm a')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Filter bottom sheet ── */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/35 flex items-end justify-center scrim"
          onClick={() => setFilterOpen(false)}
        >
          <div
            className="bg-surface rounded-t-2xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden modal ibxs animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-outline/20 mx-auto my-3 shrink-0 ibxs-grab" />
            <div className="flex items-center justify-between px-5 pt-1 ibxs-head">
              <div className="ibxs-headtext">
                <h3 className="font-serif text-lg text-on-surface ibxs-title">Filter history</h3>
                <p className="text-xs text-on-surface-variant mt-0.5 ibxs-meta">
                  Narrow down logged moments by kind or who.
                </p>
              </div>
              <button
                onClick={() => setFilterOpen(false)}
                className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors modal-x"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-8 pt-4 space-y-6 mds-body">
              {/* Kind category */}
              <div>
                <label className="block text-xs font-semibold   text-on-surface-variant mb-2.5">
                  Kind of moment
                </label>
                <div className="flex flex-wrap gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => setKind(k.id)}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-semibold border transition-all",
                        kind === k.id
                          ? "bg-primary text-on-primary border-primary "
                          : "bg-surface border-outline-variant/60 text-on-surface-variant hover:bg-surface-variant"
                      )}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Staff category */}
              <div>
                <label className="block text-xs font-semibold   text-on-surface-variant mb-2">
                  Team member
                </label>
                <div className="relative border border-outline-variant/80 rounded-xl bg-surface-container-low">
                  <select
                    value={who}
                    onChange={(e) => setWho(e.target.value)}
                    className="w-full h-11 pl-3.5 pr-9 bg-transparent outline-none border-0 text-sm font-semibold appearance-none cursor-pointer text-on-surface-variant"
                  >
                    <option value="all">Whole team</option>
                    {staff.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-on-surface-variant/70">
                    ▾
                  </span>
                </div>
              </div>

              {/* Reset & Apply */}
              <div className="pt-4 border-t border-outline-variant/30 flex gap-3">
                <button
                  onClick={() => {
                    setKind('all');
                    setWho('all');
                    setFilterOpen(false);
                  }}
                  className="flex-1 py-3 text-center text-sm font-semibold border border-outline-variant/80 text-on-surface-variant hover:bg-surface-variant rounded-xl"
                >
                  Reset all
                </button>
                <button
                  onClick={() => setFilterOpen(false)}
                  className="flex-[2] py-3 text-center text-sm font-semibold bg-primary text-on-primary rounded-xl"
                >
                  Apply filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
