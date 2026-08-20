import React, { useMemo } from 'react';
import { BarChart3, Compass, Search, Trash2, TimerReset } from 'lucide-react';
import {
  UsageStats,
  useUsageEvents,
  usageReadings,
  usagePathLabel,
} from '../../lib/usageStats';

export default function UsageStatsPanel({ uid }: { uid: string }) {
  const events = useUsageEvents(uid);
  const readings = useMemo(() => usageReadings(events), [events]);

  const clear = () => {
    if (window.confirm('Clear the local usage readings? This only clears this browser.')) {
      UsageStats.clear(uid);
    }
  };

  const empty = events.length === 0;
  const total = events.length;

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-on-surface">What the app is costing</h2>
        <p className="text-sm text-on-surface-variant mt-1 max-w-2xl leading-relaxed">
          A small, honest instrument, visible only to you. It records the shape of activity — screens
          opened, searches run, things created — in this browser only. It does not store names, notes,
          search text, or who did what.
        </p>
      </div>

      <div className="rounded-3xl border border-outline-variant/40 bg-surface-container p-5 sm:p-6">
        {empty ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">
            <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="font-serif text-lg text-on-surface">No readings yet</p>
            <p className="mt-1">As the team uses this browser, the three honest questions start to answer themselves.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-outline-variant/40">
              <p className="text-[13px] text-on-surface-variant">
                {total} local {total === 1 ? 'event' : 'events'} · {readings.screens} screens ·{' '}
                {readings.searches} searches · {readings.creates} creates
              </p>
              <button
                onClick={clear}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant/40 text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear readings
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <ReadingCard
                icon={<Compass className="w-4 h-4" />}
                title="The long walks"
                tone="bg-stage-violet-soft text-stage-violet"
                emptyLabel="No creation paths yet."
              >
                {readings.longWalks.length > 0 ? (
                  <ul className="space-y-2">
                    {readings.longWalks.map((r) => (
                      <li key={`${r.from}-${r.created}`} className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="text-on-surface-variant min-w-0">
                          <span className="text-on-surface font-medium">{usagePathLabel(r.from)}</span>
                          <span className="mx-1.5 text-on-surface-variant/50">→</span>
                          <span className="capitalize">{r.created}</span>
                        </span>
                        <span className="shrink-0 font-semibold text-on-surface">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </ReadingCard>

              <ReadingCard
                icon={<TimerReset className="w-4 h-4" />}
                title="The dead ends"
                tone="bg-stage-amber-soft text-stage-amber"
                emptyLabel="No short-stay screens yet."
              >
                {readings.deadEnds.length > 0 ? (
                  <ul className="space-y-2">
                    {readings.deadEnds.map((r) => (
                      <li key={r.path} className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="text-on-surface font-medium min-w-0">{usagePathLabel(r.path)}</span>
                        <span className="shrink-0 font-semibold text-on-surface">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </ReadingCard>

              <ReadingCard
                icon={<Search className="w-4 h-4" />}
                title="The slow finds"
                tone="bg-stage-teal-soft text-stage-teal"
                emptyLabel="No abandoned searches yet."
              >
                {readings.slowFinds.length > 0 ? (
                  <ul className="space-y-2">
                    {readings.slowFinds.map((r) => (
                      <li key={r.path} className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="text-on-surface font-medium min-w-0">{usagePathLabel(r.path)}</span>
                        <span className="shrink-0 font-semibold text-on-surface">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </ReadingCard>
            </div>

            <p className="mt-5 text-[12px] text-on-surface-variant/70 leading-relaxed">
              Readings stay in this browser and are never uploaded. They exist to answer three questions:
              where does a task take too many steps, which screens get opened and left, and where does search
              fail to find the way in.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function ReadingCard({
  icon,
  title,
  tone,
  emptyLabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: string;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center ${tone}`}>{icon}</span>
        <h3 className="font-serif text-[15px] text-on-surface leading-tight">{title}</h3>
      </div>
      {children || <p className="text-[13px] text-on-surface-variant italic">{emptyLabel}</p>}
    </div>
  );
}
