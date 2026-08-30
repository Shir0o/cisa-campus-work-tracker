/**
 * NavRail component (#664).
 *
 * The rail renders every destination a role can reach, grouped, with the
 * mark pinned at the top and the account block + collapse control pinned at
 * the bottom. The destination list scrolls inside the rail.
 *
 * Test focus: the user-observable contract. A Full-timer sees all thirteen
 * destinations grouped, the current one is unmistakable, the mark and the
 * account block stay pinned, the collapse control announces its expanded
 * state, and the destination names survive as accessible labels in compact
 * mode.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NavRail from '../components/layout/NavRail';
import { NavShellProvider } from '../components/NavShellProvider';
import { groupedNavFor, navExternalFor } from '../lib/permissions';
import type { AppRole } from '../lib/permissions';
// ── auth + layout mocks ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  user: null as null | { uid: string; email: string; displayName: string; photoURL: string | null },
  role: 'admin' as AppRole,
  isAdmin: true,
  isOwner: false,
  isStaff: true,
  logOut: vi.fn(),
  effectiveIdentityKey: 'admin',
  impersonateTarget: null as null | { key: string; name: string; sub: string },
  ownerViewRole: null as null | AppRole,
  setImpersonateTarget: vi.fn(),
  setSearchOpen: vi.fn(),
  openNewContact: vi.fn(),
  openLogInteraction: vi.fn(),
  openSmartImport: vi.fn(),
  setSelectedContact: vi.fn(),
  selectedContact: null as null | { id: string; name: string },
  isMobileMenuOpen: false,
  setIsMobileMenuOpen: vi.fn(),
}));
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: h.user,
    role: h.role,
    isAdmin: h.isAdmin,
    isOwner: h.isOwner,
    isStaff: h.isStaff,
    logOut: h.logOut,
    effectiveIdentityKey: h.effectiveIdentityKey,
    impersonateTarget: h.impersonateTarget,
    ownerViewRole: h.ownerViewRole,
    setImpersonateTarget: h.setImpersonateTarget,
  }),
}));

vi.mock('../App', () => ({
  useLayout: () => ({
    isMobileMenuOpen: h.isMobileMenuOpen,
    setIsMobileMenuOpen: h.setIsMobileMenuOpen,
    openNewContact: h.openNewContact,
    openLogInteraction: h.openLogInteraction,
    openSmartImport: h.openSmartImport,
    selectedContact: h.selectedContact,
    setSelectedContact: h.setSelectedContact,
    searchOpen: false,
    setSearchOpen: h.setSearchOpen,
  }),
}));

vi.mock('../components/layout/SeasonChip', () => ({
  default: () => <div data-testid="season-chip" />,
}));

vi.mock('../components/layout/GlobalSearch', () => ({
  default: () => <div data-testid="global-search" />,
}));

vi.mock('../components/layout/NotificationCenter', () => ({
  default: () => <div data-testid="notification-center" />,
}));

vi.mock('../lib/seasons', () => ({
  SEASON_ORDER: ['spring', 'summer', 'fall', 'winter'],
  SEASONS: {
    spring: { id: 'spring', label: 'Spring' },
    summer: { id: 'summer', label: 'Summer' },
    fall: { id: 'fall', label: 'Fall' },
    winter: { id: 'winter', label: 'Winter' },
  },
  useSeason: () => ({
    activeId: 'fall',
    autoId: 'fall',
    setSeason: vi.fn(),
    resetSeason: vi.fn(),
    toggleClubRush: vi.fn(),
    isAuto: true,
    label: "Fall '26",
    clubRush: false,
  }),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: React.ReactNode }) => (
      <div {...rest}>{children}</div>
    ),
    button: ({ children, ...rest }: { children?: React.ReactNode }) => (
      <button {...rest}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/ui/UserAvatar', () => ({
  UserAvatar: ({ name }: { name: string }) => <div data-testid="user-avatar">{name}</div>,
}));

interface RailRenderOptions {
  route?: string;
  role?: AppRole;
  onOpenImpersonateModal?: () => void;
}

function renderRail(opts: RailRenderOptions = {}) {
  const { route = '/', role = 'admin', onOpenImpersonateModal } = opts;
  h.role = role;
  h.isAdmin = role === 'admin';
  h.user = { uid: 'u-1', email: 'tony@cisa.test', displayName: 'Tony', photoURL: null };
  h.isStaff = role === 'admin' || role === 'manager';
  // Force a wide viewport so the rail-fits media query resolves true in
  // jsdom (default matchMedia returns false for everything, which would
  // collapse every rail render regardless of stored preference).
  window.matchMedia = vi.fn().mockImplementation(
    (q: string) =>
      ({
        matches: true,
        media: q,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
        onchange: null,
      }) as unknown as MediaQueryList,
  );
  return render(
    <MemoryRouter initialEntries={[route]}>
      <NavShellProvider>
        <NavRail onOpenImpersonateModal={onOpenImpersonateModal} />
      </NavShellProvider>
    </MemoryRouter>,
  );
}

describe('NavRail (#664)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.role = 'admin';
    h.isAdmin = true;
    h.isOwner = false;
    h.user = { uid: 'u-1', email: 'tony@cisa.test', displayName: 'Tony', photoURL: null };
    h.isStaff = true;
  });

  // ── Grouped destinations render ─────────────────────────────────────
  it('renders every Full-timer destination, grouped, in stable order', () => {
    renderRail({ role: 'admin' });
    const expected = groupedNavFor('admin');
    const rail = screen.getByTestId('nav-rail');
    for (const group of expected) {
      if (group.label) {
        expect(within(rail).getAllByText(group.label).length).toBeGreaterThanOrEqual(1);
      }
      for (const item of group.items) {
        expect(
          within(rail).getByRole('link', { name: new RegExp(item.label) }),
        ).toBeInTheDocument();
      }
    }
    // Settings is excluded from the grouped data — pinned below a divider
    // by the rail itself. It must NOT appear inside the destinations <nav>
    // alongside the groups.
    const destNav = within(rail).getByRole('navigation', { name: /Destinations/i });
    expect(within(destNav).queryByRole('link', { name: /^Settings$/ })).not.toBeInTheDocument();
    // The rail mounts its own Settings link (a separate surface).
    expect(within(rail).getByRole('link', { name: /^Settings$/ })).toBeInTheDocument();
  });

  it('renders only the destinations a Trainee can reach (no Visits, no Looking back)', () => {
    renderRail({ role: 'manager' });
    expect(screen.queryByText('Visits')).not.toBeInTheDocument();
    expect(screen.queryByText('Looking back')).not.toBeInTheDocument();
    // Trainee does see /board ("The Journey").
    expect(screen.getByText('The Journey')).toBeInTheDocument();
  });

  // ── Current destination is unmistakable ─────────────────────────────
  it('marks the current destination as active with aria-current="page"', () => {
    renderRail({ route: '/directory', role: 'admin' });
    const link = screen.getByRole('link', { name: /People/ });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('only one destination is marked current at a time', () => {
    renderRail({ route: '/prayer', role: 'admin' });
    const currents = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('aria-current') === 'page');
    expect(currents).toHaveLength(1);
  });

  // ── Mark pinned at the top ─────────────────────────────────────────
  it('renders the brand mark pinned at the top of the rail', () => {
    renderRail();
    const brand = screen.getByAltText('CISA Campus Work Tracker');
    expect(brand).toBeInTheDocument();
  });

  // ── Pinned controls at the bottom ──────────────────────────────
  it('renders the Settings link at the bottom of the rail (pinned control)', () => {
    renderRail();
    const rail = screen.getByTestId('nav-rail');
    expect(within(rail).getByRole('link', { name: /^Settings$/ })).toBeInTheDocument();
  });

  // ── External links rendered too ────────────────────────────────────
  it('renders external links in the rail when the role can see them', () => {
    renderRail({ role: 'admin' });
    const ext = navExternalFor('admin');
    expect(ext.length).toBeGreaterThan(0);
    for (const link of ext) {
      expect(screen.getByText(link.label)).toBeInTheDocument();
    }
  });

  // ── Accessibility: collapse control announces expanded state ────────
  it('collapse control has aria-expanded=true in expanded mode', () => {
    renderRail();
    const btn = screen.getByRole('button', { name: /Collapse navigation/i });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapse control has aria-expanded=false in compact mode', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail();
    const btn = screen.getByRole('button', { name: /Expand navigation/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  // ── Accessibility: destinations keep accessible name in compact mode
  it('compact rail keeps an accessible name on each destination (icon-only)', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail({ role: 'admin' });
    for (const group of groupedNavFor('admin')) {
      for (const item of group.items) {
        expect(
          screen.getByRole('link', { name: new RegExp(item.label) }),
        ).toBeInTheDocument();
      }
    }
  });

  // ── Chevron calls setPreference ─────────────────────────────────────
  it('clicking the collapse control calls setPreference with rail-collapsed', () => {
    renderRail();
    fireEvent.click(screen.getByRole('button', { name: /Collapse navigation/i }));
    expect(localStorage.getItem('campus-hub-nav-shell')).toBe('rail-collapsed');
  });

  it('clicking the expand control calls setPreference with rail', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail();
    fireEvent.click(screen.getByRole('button', { name: /Expand navigation/i }));
    expect(localStorage.getItem('campus-hub-nav-shell')).toBe('rail');
  });

  // The impersonation eye moved to NavChromeStrip; the rail's chrome lives
  // in the spec's "strip above the content" and is tested separately.
});