import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, Link } from 'react-router-dom';
import {
  Sunrise,
  Kanban,
  Contact,
  CalendarCheck,
  CalendarDays,
  History as HistoryIcon,
  HeartHandshake,
  Sun,
  FileText,
  MessageSquare,
  MessageCircleQuestion,
  BookOpen,
  LayoutDashboard,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import {
  groupedNavFor,
  navExternalFor,
  AppRole,
  type NavItem,
  type ExternalNavItem,
  type NavGroupLabel,
} from '../../lib/permissions';
import { useNavShell } from '../NavShellProvider';
import { Translate } from '../Translate';
import { useWaitingAsksCount } from '../../hooks/useWaitingAsksCount';
import { SIGNUP_TITLE } from './SignupInvite';

const NAV_ICONS: Record<string, LucideIcon> = {
  '/': Sunrise,
  '/board': Kanban,
  '/directory': Contact,
  '/history': HistoryIcon,
  '/attendance': CalendarCheck,
  '/outreach': LayoutDashboard,
  '/visits': CalendarDays,
  '/prayer': HeartHandshake,
  '/answered': Sun,
  '/coordination': FileText,
  '/messages': MessageSquare,
  '/questions': MessageCircleQuestion,
  '/bible-study': BookOpen,
};

function NavGlyph({ href, size = 20, className }: { href: string; size?: number; className?: string }) {
  const Icon = NAV_ICONS[href] ?? LayoutDashboard;
  return <Icon className={cn('shrink-0', className)} style={{ width: size, height: size }} />;
}

const PINNED_LABELS: Record<NavGroupLabel, string> = {
  Today: 'Today',
  People: 'People',
  Gatherings: 'Gatherings',
  Prayer: 'Prayer',
};

// Stable test id for the unread badge on a destination. Used in both the
// expanded-rail number span and the collapsed-rail dot so tests can target
// the same node regardless of which shell variant is rendered. The href
// is sanitised to alphanumeric so it can be used as a DOM id class safely.
const unreadTestId = (href: string) => `rail-unread-${href.replace(/[^a-z0-9]/gi, '')}`;

export interface NavRailProps {
  /** Reserved for future use — kept for symmetry with TopNav. */
  onOpenImpersonateModal?: () => void;
}

export default function NavRail(_props: NavRailProps = {}) {
  const { role, isAdmin, user, effectiveUserId } = useAuth();
  const { pathname } = useLocation();
  const { effective } = useNavShell();
  const collapsed = effective === 'rail-collapsed';

  const groups = groupedNavFor(role);
  const externalLinks = navExternalFor(role);

  // The /questions destination shows a badge: a number when the rail is
  // expanded, a dot when it's collapsed. The same hook powers the badge on
  // the top bar (#646); both shells stay in sync because they read from
  // the same Firestore collection.
  const waitingAsks = useWaitingAsksCount(effectiveUserId || user?.uid, isAdmin);

  const railWidth = collapsed ? 'w-[76px]' : 'w-[232px]';

  // ── Collapsed-rail tooltips (#711) ──────────────────────────────────────
  // The old CSS ::after bubble was clipped by the aside's rounded-corner
  // `overflow-hidden` (and the nav's scroll containment), leaving only a
  // sliver of the label at the rail's edge. One portal bubble, fixed-
  // positioned against the hovered/focused item, escapes both containers.
  const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null);
  const showTip = (el: Element) => {
    const label = el.getAttribute('data-tooltip');
    if (!label) return;
    // Anchor to the rail's right edge, not the item's: collapsed items are
    // inset from the edge, so anchoring to the item would start the bubble
    // slightly inside the rail.
    const x = (el.closest('aside') ?? el).getBoundingClientRect().right + 8;
    const r = el.getBoundingClientRect();
    setTip({ label, x, y: r.top + r.height / 2 });
  };

  return (
    <aside
      aria-label="Main Navigation"
      data-testid="nav-rail"
      onMouseOver={(e) => {
        const el = (e.target as HTMLElement).closest?.('[data-tooltip]');
        if (el) showTip(el);
      }}
      onMouseOut={(e) => {
        const el = (e.target as HTMLElement).closest?.('[data-tooltip]');
        if (el && e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
        setTip(null);
      }}
      onFocusCapture={(e) => {
        const target = e.target as HTMLElement;
        const el = target.closest?.('[data-tooltip]');
        if (!el) return;
        // Mirror the old :focus-visible rule — keyboard focus surfaces the
        // bubble, mouse focus doesn't.
        if (target.matches(':focus-visible')) showTip(el);
      }}
      onBlurCapture={() => setTip(null)}
      onScrollCapture={() => setTip(null)}
      className={cn(
        // A floating slab, not a flush column: the gutter around it is what
        // makes it read as an object (ADR 0003). `rounded-xl` is --radius-xl
        // (32px), the shell-container step. The parent owns the padding.
        'hidden lg:flex shrink-0 bg-rail rounded-xl shadow-shell flex-col h-full overflow-hidden',
        railWidth,
        'transition-[width] duration-200',
      )}
    >
      {/* ── Pinned: mark ─────────────────────────────────────────────── */}
      <div className="flex items-center h-14 lg:h-16 px-3 border-b border-rail-line shrink-0">
        <Link
          to="/"
          data-tooltip={collapsed ? 'Home' : undefined}
          className={cn(
            'flex items-center shrink-0 hover:opacity-80 transition-opacity',
            collapsed ? 'justify-center w-full' : 'gap-2',
          )}
          aria-label="CISA Campus Work Tracker — Home"
        >
          <div className="w-9 h-9 rounded-[14px] bg-rail-selected flex items-center justify-center overflow-hidden shrink-0">
            <img
              src="/logo.svg"
              alt="CISA Campus Work Tracker"
              className="w-full h-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.parentElement) {
                  target.parentElement.classList.add(
                    'font-serif',
                    'text-base',
                    'font-semibold',
                    'text-rail-on-selected',
                  );
                  target.parentElement.textContent = 'C';
                }
              }}
            />
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="font-serif text-sm font-semibold text-rail-on truncate">
                CISA Campus
              </div>
              <div className="text-[10px] text-rail-on-dim -mt-0.5 truncate">
                Work Tracker
              </div>
            </div>
          )}
        </Link>
      </div>

      {/* ── Scrollable: grouped destinations + external links ───────── */}
      <nav
        aria-label="Destinations"
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
      >
        {groups.map((group) => (
          <div key={group.label ?? 'ungrouped'} className={cn(collapsed ? 'py-2' : 'py-3')}>
            {!collapsed && group.label && (
              <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-rail-on-dim">
                {PINNED_LABELS[group.label]}
              </div>
            )}
            {collapsed && (
              <div
                aria-hidden="true"
                className="mx-3 mb-1 border-t border-rail-line"
              />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <RailItem
                    item={item}
                    collapsed={collapsed}
                    currentPath={pathname}
                    role={role as AppRole | null}
                    unread={item.href === '/questions' ? waitingAsks : 0}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {externalLinks.length > 0 && (
          <div className={cn(collapsed ? 'py-2' : 'py-3')}>
            {!collapsed && (
              <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-rail-on-dim">
                Elsewhere
              </div>
            )}
            {collapsed && (
              <div
                aria-hidden="true"
                className="mx-3 mb-1 border-t border-rail-line"
              />
            )}
            <ul className="space-y-0.5">
              {externalLinks.map((link) => (
                <li key={link.id}>
                  <RailExternalItem link={link} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* No top padding: this block has no group label, so any top padding
            reads as an orphaned gap below the Elsewhere group (#747). The
            collapsed-mode divider above the icon provides its own separation. */}
        <div className="pb-3">
          {collapsed && (
            <div
              aria-hidden="true"
              className="mx-3 mb-1 border-t border-outline-variant/60"
            />
          )}
          <ul className="space-y-0.5">
            <li>
              <NavLink
                to="/signup"
                aria-current={pathname === '/signup' ? 'page' : undefined}
                data-tooltip={collapsed ? SIGNUP_TITLE : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-[14px] transition-colors',
                  collapsed ? 'mx-auto h-11 w-11 justify-center' : 'mx-2 h-11 px-3',
                  pathname === '/signup'
                    ? 'bg-primary text-on-primary font-medium'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                )}
              >
                <FileText
                  className={cn('shrink-0', pathname === '/signup' ? 'text-on-primary' : '')}
                  style={{ width: collapsed ? 20 : 18, height: collapsed ? 20 : 18 }}
                />
                {!collapsed && (
                  <Translate as="span" className="text-sm whitespace-nowrap truncate flex-1" text={SIGNUP_TITLE} />
                )}
                {collapsed && <span className="sr-only">{SIGNUP_TITLE}</span>}
              </NavLink>
            </li>
          </ul>
        </div>
      </nav>

      {/* Collapsed-rail label bubble (#711): portal-rendered to document.body
          so neither the aside's overflow clipping nor the nav's scroll
          containment can crop it. Hover and keyboard focus both surface it. */}
      {tip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-lg border border-outline-variant bg-surface-container-highest px-2 py-1 text-xs font-medium text-on-surface shadow-[var(--shadow-pop)]"
            style={{ left: tip.x, top: tip.y }}
          >
            {tip.label}
          </div>,
          document.body,
        )}
    </aside>
  );
}

// ── Internal item components ────────────────────────────────────────────────
interface RailItemProps {
  item: NavItem;
  collapsed: boolean;
  currentPath: string;
  role: AppRole | null;
  /** Unread count for this destination. 0 means no badge. */
  unread?: number;
}

function RailItem({ item, collapsed, currentPath, role, unread = 0 }: RailItemProps) {
  const isActive =
    currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href + '/'));
  const label = item.href === '/' && role === 'admin' ? 'My Day' : item.label;
  // The spec requires the count to be readable on a screen reader even when
  // the badge is reduced to a dot (#665, "unread counts to remain visible when
  // the rail is collapsed"). The dot is `aria-hidden`; the count lives in the
  // link's accessible name.
  const a11yLabel = unread > 0 ? `${label}, ${unread} waiting` : label;

  return (
    <NavLink
      to={item.href}
      end={item.href === '/'}
      aria-current={isActive ? 'page' : undefined}
      aria-label={unread > 0 ? a11yLabel : undefined}
      // The collapsed rail is icon-only, so the destination's label is
      // surfaced as a `data-tooltip` attribute that NavRail's delegated
      // handlers turn into a portal bubble on hover and keyboard focus —
      // the native `title` is hover-only, so we don't set it. A keyboard
      // user tabbing through the rail can identify an icon-only destination
      // without a mouse. #665 acceptance criterion 6.
      data-tooltip={collapsed ? label : undefined}
      className={cn(
        // `rounded-[14px]` is the interactive radius, not `rounded-xl` —
        // Ink re-values --radius-xl to 32px, which a 44px item clamps to a
        // pill and a 44×44 collapsed item to a circle. The nav spec asks for
        // a square at this width. See docs/design/DRIFT.md #4.
        'group relative flex items-center gap-3 rounded-[14px] transition-colors',
        collapsed ? 'mx-auto h-11 w-11 justify-center' : 'mx-2 h-11 px-3',
        isActive
          ? 'bg-rail-selected text-rail-on-selected font-medium'
          : 'text-rail-on-dim hover:bg-rail-hover hover:text-rail-on',
      )}
    >
      <NavGlyph
        href={item.href}
        size={collapsed ? 20 : 18}
        className={cn(isActive ? 'text-rail-on-selected' : '')}
      />
      {!collapsed && (
        <>
          <Translate as="span" className="text-sm whitespace-nowrap truncate flex-1" text={label} />
          {unread > 0 && (
            <span
              data-testid={unreadTestId(item.href)}
              aria-hidden="true"
              className={cn(
                'shrink-0 text-[11px] font-semibold tabular-nums rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center',
                // The badge has to follow the item it sits on. A single
                // pairing that assumed the selected fill left the count at
                // ~1.6:1 on every resting item — i.e. invisible exactly where
                // it matters. See docs/design/DRIFT.md #6.
                isActive
                  ? 'text-rail-on-selected bg-rail-on-selected/15'
                  : 'text-rail-on bg-rail-hover',
              )}
            >
              {unread}
            </span>
          )}
        </>
      )}
      {collapsed && unread > 0 && (
        // A dot — "something here" without the number. The number is in the
        // accessible name above; the dot is purely visual.
        <span
          data-testid={unreadTestId(item.href)}
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rail-selected ring-2 ring-rail"
        />
      )}
      {collapsed && <span className="sr-only">{label}</span>}
    </NavLink>
  );
}

function RailExternalItem({ link, collapsed }: { link: ExternalNavItem; collapsed: boolean }) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      // Same hover+focus tooltip attribute as RailItem — NavRail's delegated
      // handlers render it as a portal bubble. #665 acceptance criterion 6.
      data-tooltip={collapsed ? link.label : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-[14px] transition-colors text-rail-on-dim hover:bg-rail-hover hover:text-rail-on',
        collapsed ? 'mx-auto h-11 w-11 justify-center' : 'mx-2 h-11 px-3',
      )}
    >
      <CalendarDays className="w-[18px] h-[18px] shrink-0" />
      {!collapsed && (
        <>
          <Translate as="span" className="text-sm whitespace-nowrap truncate flex-1" text={link.label} />
          <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />
        </>
      )}
      {collapsed && <span className="sr-only">{link.label}</span>}
    </a>
  );
}

export type { NavGroupLabel };