import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Shared responsive content wrapper. Encodes the app's fluid page padding plus a
 * per-view max-width strategy so the "mixed" large-screen behavior is consistent
 * instead of decided ad-hoc in every view:
 *
 *  - `wide`    — data / dashboard views. Grows on big monitors but stays capped so
 *                lines of cards don't sprawl edge-to-edge.
 *  - `reading` — editor / forms / settings. Narrow, centered, comfortable measure.
 *  - `full`    — full-bleed (e.g. the kanban board's horizontal scroll). No
 *                max-width and no horizontal padding; the view owns its own gutters.
 */
export type PageWidth = 'wide' | 'reading' | 'full';

const WIDTH: Record<PageWidth, string> = {
  wide: 'mx-auto w-full max-w-7xl 2xl:max-w-[1600px]',
  reading: 'mx-auto w-full max-w-3xl',
  full: 'w-full',
};

interface PageContainerProps {
  variant?: PageWidth;
  className?: string;
  id?: string;
  children: React.ReactNode;
}

export default function PageContainer({
  variant = 'wide',
  className,
  id,
  children,
}: PageContainerProps) {
  const padding = variant === 'full' ? '' : 'px-4 sm:px-6 lg:px-8 py-6 lg:py-8';
  return (
    <div id={id} className={cn(WIDTH[variant], padding, className)}>
      {children}
    </div>
  );
}
