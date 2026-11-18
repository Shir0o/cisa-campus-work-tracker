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
  BookOpen,
  LayoutDashboard,
  Users,
  StickyNote,
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
import { sectionHrefFor } from '../../lib/navTrail';
import { SIGNUP_TITLE } from './SignupInvite';

const NAV_ICONS: Record<string, LucideIcon> = {
  '/': Sunrise,
  '/board': Kanban,
  '/directory': Contact,
  '/history': HistoryIcon,
  '/attendance': CalendarCheck,
  '/prayer': HeartHandshake,
  '/answered': Sun,
  '/coordination': FileText,
  '/bible-study': BookOpen,
  '/around': Users,
  '/feedback': StickyNote,
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

export interface NavRailProps {
  /** Reserved for future use — kept for symmetry with TopNav. */
  onOpenImpersonateModal?: () => void;
}

export default function NavRail(_props: NavRailProps = {}) {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const { effective } = useNavShell();
  const collapsed = effective === 'rail-collapsed';

  const groups = groupedNavFor(role);
  const externalLinks = navExternalFor(role);

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
        // makes it read as an object (ADR 0003). `rounded-2xl` is --radius-2xl
        // (32px), the shell-container step (ADR 0009). The parent owns the padding.
        'hidden lg:flex shrink-0 bg-rail rounded-2xl shadow-shell flex-col h-full overflow-hidden',
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

        {/* Spacing above Sign-up: this block has no group label.
            In expanded mode, -mt-2.5 cancels the preceding group's pb-3 (12px)
            leaving 2px (matching intra-group space-y-0.5 item spacing).
            In collapsed mode, the hairline divider above the icon provides separation.
            pb-6 ensures comfortable breathing room at the bottom of the slab (#794). */}
        <div className={cn('pb-6', !collapsed && '-mt-2.5')}>
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
                  <span className="text-sm whitespace-nowrap truncate flex-1">{SIGNUP_TITLE}</span>
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
}

function RailItem({ item, collapsed, currentPath, role }: RailItemProps) {
  // `sectionHrefFor` resolves a path to the destination it belongs to, so a
  // route that sits *under* one still lights its item. Matching the pathname
  // directly left `/people/:contactId` selecting nothing at all (#803).
  const isActive = sectionHrefFor(currentPath) === item.href;
  const label = item.href === '/' && role === 'admin' ? 'My Day' : item.label;

  return (
    // `Link`, not `NavLink`: NavLink derives `aria-current` from its own
    // pathname match, which is the match that missed routes under a
    // destination. Active state is computed above and set here.
    <Link
      to={item.href}
      aria-current={isActive ? 'page' : undefined}
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
      {!collapsed && <span className="text-sm whitespace-nowrap truncate flex-1">{label}</span>}
      {collapsed && <span className="sr-only">{label}</span>}
    </Link>
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
          <span className="text-sm whitespace-nowrap truncate flex-1">{link.label}</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />
        </>
      )}
      {collapsed && <span className="sr-only">{link.label}</span>}
    </a>
  );
}

export type { NavGroupLabel };