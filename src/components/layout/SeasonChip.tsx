import { useEffect, useRef, useState } from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import { useSeason, SEASON_ORDER, SEASONS } from '../../lib/seasons';
import { useAuth } from '../AuthProvider';
import { cn } from '../../lib/utils';
import { useLanguage } from '../LanguageProvider';
import { Translate } from '../Translate';
import { Switch } from '../ui/Switch';

// The "Spring · '26" strip under the brand. Shows the active season everywhere;
// for staff (managers+) it opens a small popover to override the season + toggle
// club-rush intake. Hidden when the sidebar is collapsed.
export default function SeasonChip({
  collapsed,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const season = useSeason();
  const { isManager } = useAuth();
  const { t } = useLanguage();
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
      <Translate text={season.label} />
      {season.clubRush && <span className="text-accent font-medium">{t('season.club_rush')}</span>}
    </span>
  );

  // The root is `flex items-center` so the chip stays vertically centered with
  // whatever sits beside it (the role pill in the profile dropdown) — without
  // it the inherited line-height pads the inline button's line box and pushes
  // the label off the pill's baseline.
  if (!isManager) {
    return <div className={cn('flex items-center', className)}>{chip}</div>;
  }

  return (
    <div ref={ref} className={cn('relative flex items-center', className)}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex items-center gap-1 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
        title={t('season.title')}
      >
        {chip}
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-2 z-50 w-56 bg-surface-container rounded-2xl shadow-xl border border-outline-variant p-3 space-y-3"
        >
          <div>
            <div className="text-xs font-medium text-on-surface-variant px-1 mb-1.5">
              {t('season.tagging_signups_for')}
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
                  <Translate text={SEASONS[id].label} />
                  {id === season.autoId ? t('season.now_suffix') : ''}
                </button>
              ))}
            </div>
            {!season.isAuto && (
              <button
                onClick={() => season.resetSeason()}
                className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant hover:text-on-surface mt-2 px-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> {t('season.back_to_current_term')}
              </button>
            )}
          </div>
          <div className="w-full flex items-center justify-between rounded-xl bg-surface-container-high border border-outline/30 px-3 py-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-on-surface">
              <Sparkles className="w-3.5 h-3.5" /> {t('season.club_rush')}
            </span>
            <Switch
              checked={season.clubRush}
              onChange={() => season.toggleClubRush()}
              aria-label={t('season.club_rush')}
            />
          </div>
          <p className="text-[10px] text-on-surface-variant px-1 leading-snug">
            {t('season.club_rush_help')}
          </p>
        </div>
      )}
    </div>
  );
}
