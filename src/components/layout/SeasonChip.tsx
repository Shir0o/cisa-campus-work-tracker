import { useEffect, useRef, useState } from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import { useSeason, SEASON_ORDER, SEASONS } from '../../lib/seasons';
import { useAuth } from '../AuthProvider';
import { cn } from '../../lib/utils';

// The "Spring · '26" strip under the brand. Shows the active season everywhere;
// for staff (managers+) it opens a small popover to override the season + toggle
// club-rush intake. Hidden when the sidebar is collapsed.
export default function SeasonChip({ collapsed }: { collapsed?: boolean }) {
  const season = useSeason();
  const { isManager } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (collapsed) return null;

  const chip = (
    <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
      {season.label}
      {season.clubRush && <span className="text-accent font-medium">· Club rush</span>}
    </span>
  );

  if (!isManager) {
    return <div className="px-3 mt-0.5">{chip}</div>;
  }

  return (
    <div ref={ref} className="relative px-3 mt-0.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
        title="Season & club rush"
      >
        {chip}
      </button>

      {open && (
        <div className="absolute left-3 top-full mt-2 z-50 w-56 bg-surface-container rounded-2xl shadow-xl border border-outline-variant p-3 space-y-3">
          <div>
            <div className="text-xs font-medium text-on-surface-variant px-1 mb-1.5">
              Tagging sign-ups for
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SEASON_ORDER.map((id) => (
                <button
                  key={id}
                  onClick={() => season.setSeason(id)}
                  className={cn(
                    'px-2.5 h-7 rounded-full border text-[11px] font-medium transition-colors cursor-pointer',
                    season.activeId === id
                      ? 'bg-primary text-on-primary border-primary'
                      : 'border-outline-variant text-on-surface hover:bg-surface-variant',
                  )}
                >
                  {SEASONS[id].label}
                  {id === season.autoId ? ' · now' : ''}
                </button>
              ))}
            </div>
            {!season.isAuto && (
              <button
                onClick={() => season.resetSeason()}
                className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant hover:text-on-surface mt-2 px-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Back to the current term
              </button>
            )}
          </div>

          <button
            onClick={() => season.toggleClubRush()}
            className="w-full flex items-center justify-between rounded-xl bg-surface-container-high border border-outline/30 px-3 py-2 cursor-pointer"
          >
            <span className="inline-flex items-center gap-2 text-xs font-medium text-on-surface">
              <Sparkles className="w-3.5 h-3.5" /> Club rush
            </span>
            <span
              className={cn(
                'w-9 h-5 rounded-full relative transition-colors shrink-0',
                season.clubRush ? 'bg-primary' : 'bg-outline',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                  season.clubRush && 'translate-x-4',
                )}
              />
            </span>
          </button>
          <p className="text-[10px] text-on-surface-variant px-1 leading-snug">
            Turn on during the busy intake weeks — new sign-ups get a "Club rush" tag.
          </p>
        </div>
      )}
    </div>
  );
}
