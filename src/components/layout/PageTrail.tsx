import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { useOptionalLayout } from '../../App';
import { useI18n } from '../LanguageProvider';
import { Translate } from '../Translate';
import { navTrailFor } from '../../lib/navTrail';
import { cn } from '../../lib/utils';

export interface PageTrailProps {
  /** The mount point's own padding — the two shells align to different gutters. */
  className?: string;
  /**
   * Render only when the route sits under a destination. The top bar passes
   * this: its active primary tab already names a top-level place, and a 40px
   * band to repeat it is not worth 5% of the viewport. The rail shell doesn't —
   * its band is there whether or not anything fills it.
   */
  leafOnly?: boolean;
}

/**
 * The route trail: `‹ People / David Alvarado`.
 *
 * One component, two mount points (#803). In the rail shell it fills the left
 * of `NavChromeStrip`'s otherwise empty 56px band; in the top-bar shell it gets
 * a 40px row of its own inside the sticky header, because `TopNav`'s row is
 * already full. Below `lg` neither renders — every preference falls through to
 * the top bar there, and the pages that name a record carry their own back
 * control at that width.
 *
 * The leaf is 13px against the page's own 17px+ title, so it reads as a trail
 * and not as a second heading. Design: docs/design/chrome-strip/.
 */
export default function PageTrail({ className, leafOnly = false }: PageTrailProps) {
  const { pathname } = useLocation();
  const { role } = useAuth();
  const layout = useOptionalLayout();
  const { t } = useI18n();

  // The only record name the shell already holds. A room title on
  // `/messages/:roomId` isn't in layout state, so that route shows `‹ Messages`
  // — still a way back, and better than a placeholder.
  const leafName = pathname.startsWith('/people/') ? layout?.selectedContact?.name ?? null : null;
  const { section, current, currentIsLabel } = navTrailFor(pathname, role, leafName);

  if (leafOnly && !section) return null;
  if (!section && !current) return null;

  return (
    <nav
      aria-label={t('nav.trail', 'Breadcrumb')}
      className={cn('hidden lg:flex items-center gap-1.5 min-w-0', className)}
    >
      {section && (
        <Link
          to={section.href}
          aria-label={t('nav.back_to', 'Back to {place}').replace('{place}', section.label)}
          className="flex items-center gap-1.5 shrink-0 text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
        >
          <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
          <Translate
            as="span"
            className="text-[13px] font-medium underline decoration-outline-variant underline-offset-[3px] whitespace-nowrap"
            text={section.label}
          />
        </Link>
      )}

      {section && current && (
        <span className="text-[13px] text-on-surface-variant/50 mx-0.5 shrink-0" aria-hidden="true">
          /
        </span>
      )}

      {current && (
        <span className="text-[13px] font-medium text-on-surface truncate" aria-current="page">
          {currentIsLabel ? <Translate as="span" text={current} /> : current}
        </span>
      )}
    </nav>
  );
}
