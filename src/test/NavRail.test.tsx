/**
 * NavRail component (#664) and collapse/expand control (#665).
 *
 * The rail renders every destination a role can reach, grouped, with the
 * mark pinned at the top and the account block + collapse control pinned at
 * the bottom. The destination list scrolls inside the rail.
 *
 * Test focus: the user-observable contract. A Full-timer sees all thirteen
 * destinations grouped, the current one is unmistakable, the mark and the
 * account block stay pinned, the collapse control announces its expanded
 * state, the destination names survive as accessible labels in compact
 * mode, the unread count renders as a number when expanded and a dot when
 * collapsed, and destination labels appear as tooltips on hover and on
 * keyboard focus.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import NavRail from '../components/layout/NavRail';
import { NavShellProvider } from '../components/NavShellProvider';
import { groupedNavFor, navExternalFor } from '../lib/permissions';
import type { AppRole } from '../lib/permissions';
import * as asks from '../lib/asks';
// ── asks subscription mock ──────────────────────────────────────────────────
// The rail renders an unread badge for /questions, the same way the top bar
// does (#646). The badge reads the same subscribed list the page consumes.
const asksMock = vi.hoisted(() => ({
  // Tests that care about a specific count reassign this with
//   vi.mocked(asks.subscribeAsks).mockImplementation(...)
  subscribeAsks: vi.fn<
    (
      cb: (m: unknown[]) => void,
      _err?: unknown,
      opts?: { uid?: string; isStaff?: boolean },
    ) => () => void
  >((cb) => {
    cb([]);
    return () => {};
  }),
  subscribeStaffAsks: vi.fn((_uid: string, cb: (m: unknown[]) => void) => {
    cb([]);
    return () => {};
  }),
  askQuestions: vi.fn((m: unknown[]) => m as never[]),
  askAnswered: vi.fn(() => false),
}));
vi.mock('../lib/asks', () => asksMock);
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
    // Settings is removed from the rail entirely (#711) — it lives in the
    // avatar/profile dropdown of both nav chrome variants.
    expect(within(rail).queryByRole('link', { name: /^Settings$/ })).not.toBeInTheDocument();
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

  it('keeps People selected on a contact route (#803)', () => {
    // `/people/:contactId` is neither `/directory` nor a child of it, so
    // matching the pathname left the rail with nothing lit at all.
    renderRail({ route: '/people/NduKn2BpBzrRql5Z9mHk', role: 'admin' });
    const link = screen.getByRole('link', { name: /People/ });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('still selects exactly one destination on a contact route', () => {
    renderRail({ route: '/people/NduKn2BpBzrRql5Z9mHk', role: 'admin' });
    const currents = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('aria-current') === 'page');
    expect(currents).toHaveLength(1);
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

  it('reduces the wordmark to just the mark when the rail is collapsed (#665)', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail();
    // The logo image is still pinned at the top.
    expect(screen.getByAltText('CISA Campus Work Tracker')).toBeInTheDocument();
    // The two-line "CISA Campus / Work Tracker" wordmark is hidden in the
    // collapsed rail; the spec's promise is that only the mark survives.
    expect(screen.queryByText('CISA Campus')).not.toBeInTheDocument();
    expect(screen.queryByText('Work Tracker')).not.toBeInTheDocument();
  });

  it('replaces group labels with hairline dividers when the rail is collapsed (#665 AC3)', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail({ role: 'admin' });
    // The four group headers (Today, People, Gatherings, Prayer) become
    // hairline dividers when collapsed. The destination names still appear
    // inside `<span class="sr-only">` for screen readers; we assert that
    // the visible group labels are gone by searching for them in any
    // element that is *not* sr-only.
    const rail = screen.getByTestId('nav-rail');
    const groupLabels = ['Today', 'People', 'Gatherings', 'Prayer'];
    for (const label of groupLabels) {
      const visible = rail.querySelectorAll(`*:not(.sr-only)`);
      const matches = Array.from(visible).filter((el) =>
        el.children.length === 0 && el.textContent === label,
      );
      expect(matches).toEqual([]);
    }
  });

  // ── Pinned controls at the bottom ──────────────────────────────
  // The rail's own Settings link is gone (#711): Settings already lives in
  // the avatar/profile dropdown of both nav chrome variants.
  it('renders no Settings link at the bottom of the rail (#711)', () => {
    renderRail();
    expect(
      within(screen.getByTestId('nav-rail')).queryByRole('link', { name: /^Settings$/ }),
    ).not.toBeInTheDocument();
  });

  it('renders no Settings link when the rail is collapsed (#711)', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail();
    expect(
      within(screen.getByTestId('nav-rail')).queryByRole('link', { name: /^Settings$/ }),
    ).not.toBeInTheDocument();
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

  // ── Pinned footer: Settings link is present and collapse control is removed (#681) ──
  it('does not render a collapse or expand toggle button in expanded mode', () => {
    renderRail();
    expect(screen.queryByRole('button', { name: /Collapse navigation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Expand navigation/i })).not.toBeInTheDocument();
  });

  it('does not render a collapse or expand toggle button in compact mode', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail();
    expect(screen.queryByRole('button', { name: /Collapse navigation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Expand navigation/i })).not.toBeInTheDocument();
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

  // ── Unread badge (acceptance criterion 5: count → dot on collapse) ──
  it('shows the waiting-asks count as a number next to the Questions label in the expanded rail', () => {
    // Three open questions on other people's accounts — counted by askQuestions
    // and gated by askAnswered returning false. The current user (u-1) is
    // excluded by the `from !== uid` filter, mirroring TopNav's logic.
    const messages = [
      { id: 'q1', parentId: null, owner: 't1', from: 't1', kind: 'question' },
      { id: 'q2', parentId: null, owner: 't2', from: 't2', kind: 'question' },
      { id: 'q3', parentId: null, owner: 't3', from: 't3', kind: 'question' },
    ];
    vi.mocked(asks.subscribeAsks).mockImplementation(((cb: (m: typeof messages) => void) => {
      cb(messages);
      return () => {};
    }) as never);
    vi.mocked(asks.askQuestions).mockImplementation(((m: typeof messages) => m) as never);
    vi.mocked(asks.askAnswered).mockReturnValue(false as never);

    renderRail({ role: 'admin' });
    // The number "3" must be visible next to the Questions label.
    const questions = screen.getByRole('link', { name: /Questions/i });
    expect(within(questions).getByText('3')).toBeInTheDocument();
  });

  it('shows the waiting-asks count as a dot (no number) when the rail is collapsed', () => {
    const messages = [
      { id: 'q1', parentId: null, owner: 't1', from: 't1', kind: 'question' },
      { id: 'q2', parentId: null, owner: 't2', from: 't2', kind: 'question' },
    ];
    vi.mocked(asks.subscribeAsks).mockImplementation(((cb: (m: typeof messages) => void) => {
      cb(messages);
      return () => {};
    }) as never);
    vi.mocked(asks.askQuestions).mockImplementation(((m: typeof messages) => m) as never);
    vi.mocked(asks.askAnswered).mockReturnValue(false as never);

    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail({ role: 'admin' });

    const questions = screen.getByRole('link', { name: /Questions/i });
    // No number — a dot is an aria-hidden indicator, the count is in the
    // accessible name so screen readers still hear "Questions, 2 waiting".
    expect(within(questions).queryByText('2')).not.toBeInTheDocument();
    expect(questions).toHaveAccessibleName(/2\s+waiting/);
  });

  it('does not show a badge at all when there are no waiting asks', () => {
    vi.mocked(asks.subscribeAsks).mockImplementation(((cb: (m: unknown[]) => void) => {
      cb([]);
      return () => {};
    }) as never);

    renderRail({ role: 'admin' });
    const questions = screen.getByRole('link', { name: /^Questions$/ });
    // The accessible name is the label alone — no "waiting" suffix when
    // there's nothing to wait on.
    expect(questions).toHaveAccessibleName('Questions');
  });

  // ── Focusable tooltip (acceptance criterion 6: label on hover AND focus)
  it('exposes the destination label as a tooltip on focus, not just on hover', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail({ role: 'admin' });
    // The native `title` attribute is hover-only and not announced reliably
    // on focus; the contract here is a focusable tooltip — the label must be
    // surfaced via a non-title channel. The collapsed rail sets `data-tooltip`,
    // which NavRail's delegated focus handler turns into the portal bubble
    // for keyboard focus.
    const questions = screen.getByRole('link', { name: /Questions/i });
    expect(questions).toHaveAttribute('data-tooltip', 'Questions');
  });

  // ── Unclipped hover tooltip (#711) ────────────────────────────────────────
  it('shows the full label in a portal tooltip on hover, outside the rail (#711)', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail({ role: 'admin' });
    const questions = screen.getByRole('link', { name: /Questions/i });
    fireEvent.mouseOver(questions);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Questions');
    // The bubble must NOT live inside the rail: both the aside and the
    // destinations nav clip overflow, which cropped the old CSS pseudo into
    // an unreadable sliver at the rail's edge (#711).
    expect(screen.getByTestId('nav-rail')).not.toContainElement(tooltip);
    fireEvent.mouseOut(questions);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the portal tooltip on keyboard focus (#665 AC6, #711)', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail({ role: 'admin' });
    const questions = screen.getByRole('link', { name: /Questions/i });
    // jsdom has no :focus-visible heuristic (it always answers false), so
    // simulate the engine: only this link answers true, as keyboard focus
    // would in a real browser.
    const nativeMatches = HTMLElement.prototype.matches;
    const spy = vi
      .spyOn(HTMLElement.prototype, 'matches')
      .mockImplementation(function (this: HTMLElement, selector: string) {
        if (selector === ':focus-visible') return this === questions;
        return nativeMatches.call(this, selector);
      });
    try {
      fireEvent.focus(questions);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('Questions');
      expect(screen.getByTestId('nav-rail')).not.toContainElement(tooltip);
    } finally {
      spy.mockRestore();
    }
  });

  // ── Sign-up form destination (Issue #676) ──────────────────────────────────
  it('renders the Sign-up form link when the rail is expanded', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail');
    renderRail({ role: 'admin' });

    const signupLink = screen.getByRole('link', { name: /Sign-up form/i });
    expect(signupLink).toBeInTheDocument();
    expect(signupLink).toHaveAttribute('href', '/signup');
  });

  it('renders the Sign-up form link with tooltip and accessible label when collapsed', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail({ role: 'admin' });

    const signupLink = screen.getByRole('link', { name: /Sign-up form/i });
    expect(signupLink).toBeInTheDocument();
    expect(signupLink).toHaveAttribute('href', '/signup');
    expect(signupLink).toHaveAttribute('data-tooltip', 'Sign-up form');
    expect(within(signupLink).getByText('Sign-up form')).toHaveClass('sr-only');
  });

  // ── Icon alignment when collapsed (Issue #728) ───────────────────────────
  it('centers destination items, external links, and the sign-up link when collapsed', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail({ role: 'admin' });

    // Destination item link
    const myDayLink = screen.getByRole('link', { name: /^My Day/i });
    expect(myDayLink).toHaveClass('mx-auto');
    expect(myDayLink).not.toHaveClass('mx-2');

    // External link
    const extLink = screen.getByRole('link', { name: /Shared Calendar/i });
    expect(extLink).toHaveClass('mx-auto');
    expect(extLink).not.toHaveClass('mx-2');

    // Sign-up form link
    const signupLink = screen.getByRole('link', { name: /Sign-up form/i });
    expect(signupLink).toHaveClass('mx-auto');
    expect(signupLink).not.toHaveClass('mx-2');
  });

  // ── No orphaned vertical gap above the Sign-up entry (#747) ─────────────
  // Every other group in the rail (Today, People, Gatherings, Prayer,
  // Elsewhere) carries a visible uppercase label that anchors its top
  // padding. The Sign-up entry has no label, so the wrapper's top padding
  // reads as dead space. The fix collapses that top padding so the entry
  // sits visually flush with the Elsewhere group's bottom edge.

  it('does not leave a redundant top-padding gap above the Sign-up entry when the rail is expanded (#747)', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail');
    renderRail({ role: 'admin' });

    const signupLink = screen.getByRole('link', { name: /Sign-up form/i });
    // Inspect the wrapper's class list. The fix replaces the prior
    // `py-3` (expanded) with `pb-3` only — no top padding at all.
    const wrapper = signupLink.closest('ul')!.parentElement!;
    const classes = wrapper.className.split(/\s+/);
    expect(classes, `Sign-up block should not carry any top-padding utility`).not.toContain('py-3');
    expect(classes, `Sign-up block should not carry any top-padding utility`).not.toContain('pt-3');
    expect(classes, `Sign-up block should not carry any top-padding utility`).not.toContain('py-2');
    expect(classes, `Sign-up block should not carry any top-padding utility`).not.toContain('pt-2');
    expect(classes).toContain('pb-6');
  });

  it('draws the hairline divider above the Sign-up icon when the rail is collapsed (#747)', () => {
    // Collapsed mode keeps the divider that separates the Sign-up block from
    // the Elsewhere group above it. The divider stands in for the uppercase
    // group label the other groups have — visual separation without top
    // padding, so the orphaned-gap bug doesn't recur in collapsed mode.
    localStorage.setItem('campus-hub-nav-shell', 'rail-collapsed');
    renderRail({ role: 'admin' });

    const signupLink = screen.getByRole('link', { name: /Sign-up form/i });
    const block = signupLink.closest('ul')!.parentElement!;
    const divider = block.querySelector('div.border-t');
    expect(divider, `Collapsed Sign-up block should carry a divider above the icon`).not.toBeNull();
  });

  it('does not render raw source code comments in the navigation rail (#747)', () => {
    localStorage.setItem('campus-hub-nav-shell', 'rail');
    renderRail({ role: 'admin' });

    expect(screen.queryByText(/No top padding/i)).toBeNull();
    expect(screen.queryByText(/orphaned gap below the Elsewhere group/i)).toBeNull();
  });

  // The impersonation eye moved to NavChromeStrip; the rail's chrome lives
  // in the spec's "strip above the content" and is tested separately.
 });