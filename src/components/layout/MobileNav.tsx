import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Contact,
  HeartHandshake,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { useLayout } from '../../App';
import { hasMinRole, AppRole } from '../../lib/permissions';
import { sectionHrefFor } from '../../lib/navTrail';
import { useI18n } from '../LanguageProvider';

/**
 * Re-tapping the lit destination returns the list under it to the top, the way
 * a native tab bar does (#1779). The phone shell's only scroller is the routed
 * `main` pane — the document itself no longer scrolls (#1795) — so that is the
 * single element to move.
 */
function scrollCurrentListToTop() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.querySelector('main')?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

/**
 * One bottom-bar destination.
 *
 * Selection is the Ink inversion — a solid ink disc with the glyph turned
 * white — not a tint. The old `bg-secondary-container` pill was a 6% wash on a
 * bar of nearly the same tone (1.09:1), so the selected destination was
 * invisible outdoors and to low-vision users (#1775). `Link`, not `NavLink`:
 * the shell selects on `sectionHrefFor`, which also lights a destination for
 * the routes underneath it (/people/:id still belongs to People).
 */
function Destination({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      onClick={active ? scrollCurrentListToTop : undefined}
      className={cn(
        'group flex min-h-11 min-w-[64px] flex-col items-center justify-center gap-1 rounded-[14px] px-1 py-1.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
      )}
    >
      <span
        data-testid="mobile-nav-indicator"
        aria-hidden="true"
        className={cn(
          'grid h-8 w-12 place-items-center rounded-full transition-colors',
          active
            ? 'bg-primary text-on-primary'
            : 'text-on-surface-variant group-hover:bg-surface-container-high',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span
        className={cn(
          'text-[11px] leading-none',
          active ? 'font-semibold text-on-surface' : 'font-medium text-on-surface-variant',
        )}
      >
        {label}
      </span>
    </Link>
  );
}

export default function MobileNav() {
  const { role } = useAuth();
  const { setSearchOpen } = useLayout();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const section = sectionHrefFor(pathname);
  const isOperator = hasMinRole(role as AppRole, 'operator');

  // Same names the drawer, rail and top bar use — the bar used to say
  // "Contacts" and "Prayer" for destinations called "People" and "On our
  // hearts" everywhere else (#1775).
  const homeLabel = role === 'admin' ? t('nav.my_day', 'My Day') : t('nav.home', 'Home');

  return (
    <nav
      aria-label={t('nav.mobile_navigation', 'Mobile Navigation')}
      className="app-mobile-nav md:hidden fixed bottom-0 left-0 right-0 min-h-16 pb-[env(safe-area-inset-bottom)] bg-surface-container-low border-t border-outline-variant flex items-center justify-around z-50 animate-in slide-in-from-bottom duration-300 px-4"
    >
      <Destination to="/" label={homeLabel} icon={LayoutDashboard} active={section === '/'} />

      {/* Center button — Global Search (#19), staff only. Replaces the old
          Quick-Actions FAB; quick-add now lives in the search overlay's empty
          state. */}
      {isOperator && (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="relative -top-5 w-14 h-14 bg-primary text-on-primary rounded-2xl flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
          aria-label={t('nav.search', 'Search')}
        >
          <Search className="w-6 h-6" />
        </button>
      )}

      {isOperator ? (
        <Destination
          to="/directory"
          label={t('nav.directory', 'People')}
          icon={Contact}
          active={section === '/directory'}
        />
      ) : (
        <Destination
          to="/prayer"
          label={t('nav.prayers', 'On our hearts')}
          icon={HeartHandshake}
          active={section === '/prayer'}
        />
      )}
    </nav>
  );
}
