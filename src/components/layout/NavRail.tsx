import React from 'react';
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
  LayoutDashboard,
  Settings as SettingsIcon,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
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
  '/settings': SettingsIcon,
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
  const { effective, setPreference } = useNavShell();
  const collapsed = effective === 'rail-collapsed';

  const groups = groupedNavFor(role);
  const externalLinks = navExternalFor(role);

  const railWidth = collapsed ? 'w-[76px]' : 'w-[232px]';

  const toggleCollapsed = () => {
    setPreference(collapsed ? 'rail' : 'rail-collapsed');
  };

  return (
    <aside
      aria-label="Main Navigation"
      data-testid="nav-rail"
      className={cn(
        'hidden md:flex shrink-0 bg-surface border-r border-outline-variant flex-col h-screen sticky top-0',
        railWidth,
        'transition-[width] duration-200',
      )}
    >
      {/* ── Pinned: mark ─────────────────────────────────────────────── */}
      <div className="flex items-center h-14 lg:h-16 px-3 border-b border-outline-variant shrink-0">
        <Link
          to="/"
          className={cn(
            'flex items-center shrink-0 hover:opacity-80 transition-opacity',
            collapsed ? 'justify-center w-full' : 'gap-2',
          )}
          aria-label="CISA Campus Work Tracker — Home"
        >
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center overflow-hidden shrink-0">
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
                    'text-on-primary',
                  );
                  target.parentElement.textContent = 'C';
                }
              }}
            />
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="font-serif text-sm font-semibold text-on-surface truncate">
                CISA Campus
              </div>
              <div className="text-[10px] text-on-surface-variant -mt-0.5 truncate">
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
              <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
                {PINNED_LABELS[group.label]}
              </div>
            )}
            {collapsed && (
              <div
                aria-hidden="true"
                className="mx-3 mb-1 border-t border-outline-variant/60"
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
              <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
                Elsewhere
              </div>
            )}
            {collapsed && (
              <div
                aria-hidden="true"
                className="mx-3 mb-1 border-t border-outline-variant/60"
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
      </nav>

      {/* ── Pinned: Settings link + collapse control ──────────────────── */}
      {/* The avatar, search, notifications and season live in NavChromeStrip
          above the content. The rail's pinned row keeps the rail-resident
          Settings link and the chevron collapse control — both small and
          staying-at-the-bottom is the user-visible promise of the spec. */}
      <div className="shrink-0 border-t border-outline-variant">
        <div className="flex items-center px-2 py-2">
          <Link
            to="/settings"
            className={cn(
              'flex items-center gap-2 rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors',
              collapsed ? 'p-1 justify-center w-full' : 'flex-1 px-3 py-1.5 text-sm',
            )}
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="font-medium">Settings</span>}
          </Link>
        </div>

        <div className="border-t border-outline-variant">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors',
              collapsed ? 'justify-center' : 'justify-between',
            )}
          >
            {!collapsed && <span>Collapse</span>}
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
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
  const isActive =
    currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href + '/'));
  const label = item.href === '/' && role === 'admin' ? 'My Day' : item.label;

  return (
    <NavLink
      to={item.href}
      end={item.href === '/'}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl transition-colors',
        collapsed ? 'mx-2 h-11 w-11 justify-center' : 'mx-2 h-11 px-3',
        isActive
          ? 'bg-primary text-on-primary font-medium'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
      )}
    >
      <NavGlyph
        href={item.href}
        size={collapsed ? 20 : 18}
        className={cn(isActive ? 'text-on-primary' : '')}
      />
      {!collapsed && (
        <Translate as="span" className="text-sm whitespace-nowrap truncate" text={label} />
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
      title={collapsed ? link.label : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl transition-colors text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
        collapsed ? 'mx-2 h-11 w-11 justify-center' : 'mx-2 h-11 px-3',
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