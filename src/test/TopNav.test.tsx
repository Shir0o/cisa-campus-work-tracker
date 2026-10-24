import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TopNav from '../components/layout/TopNav';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';

// Hoisted spies so the router/auth/layout mocks and the tests share instances.
const h = vi.hoisted(() => ({
  mockLogOut: vi.fn(),
  mockSetIsMobileMenuOpen: vi.fn(),
  mockSetSearchOpen: vi.fn(),
  mockNavigate: vi.fn(),
  auth: {
    user: { displayName: 'Tony Wang', photoURL: null, email: 'tony@cisa.test' },
    role: 'admin',
    isAdmin: true,
    isOwner: false,
    impersonateTarget: null,
    ownerViewRole: null,
    logOut: vi.fn(),
  } as any,
  // `as any` like `auth` above: the trail reads `selectedContact` off this
  // stub, and tests set it per case rather than every layout field.
  layout: {
    isMobileMenuOpen: false,
    setIsMobileMenuOpen: vi.fn(),
    setSearchOpen: vi.fn(),
  } as any,
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => h.auth,
}));

vi.mock('../App', () => ({
  useLayout: () => h.layout,
  useOptionalLayout: () => h.layout,
}));

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => h.mockNavigate,
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

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    nav: ({ children, ...props }: any) => <nav {...props}>{children}</nav>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const baseAuth = {
  role: 'admin',
  isAdmin: true,
  isOwner: false,
  impersonateTarget: null,
  ownerViewRole: null,
  user: { displayName: 'Tony Wang', photoURL: null, email: 'tony@cisa.test' },
  logOut: h.mockLogOut,
};

const renderTopNav = (route = '/') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <TopNav />
    </MemoryRouter>,
  );

describe('TopNav (top-anchored navigation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.auth = { ...baseAuth, user: { displayName: 'Tony Wang', photoURL: null, email: 'tony@cisa.test' } };
    h.layout = { isMobileMenuOpen: false, setIsMobileMenuOpen: h.mockSetIsMobileMenuOpen, setSearchOpen: h.mockSetSearchOpen };
  });

  it('renders the brand and primary tabs for admin (Coordination Notes · People · On our hearts)', () => {
    renderTopNav();
    expect(screen.getByAltText('CISA Campus Work Tracker')).toBeInTheDocument();
    expect(screen.getByText('Coordination Notes')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('On our hearts')).toBeInTheDocument();
    expect(screen.queryByText('My Day')).not.toBeInTheDocument();
    expect(screen.queryByText('The Journey')).not.toBeInTheDocument();
  });

  // ── Where am I, on a route that sits under a destination (#803) ──────────
  describe('a contact route', () => {
    it('selects the People tab rather than leaving every tab unselected', () => {
      renderTopNav('/people/NduKn2BpBzrRql5Z9mHk');
      const tab = screen.getAllByRole('link').find((el) => el.getAttribute('href') === '/directory');
      expect(tab).toHaveAttribute('aria-current', 'page');
    });

    it('does not hold "More" open-looking on a route its section already owns', () => {
      // The old test was `!primary.some(p => p.href === pathname)`, which was
      // true for every contact, so More lit up and wore a fallback glyph.
      renderTopNav('/people/NduKn2BpBzrRql5Z9mHk');
      const more = screen.getByRole('button', { name: /more/i });
      // Resting, not held: the held state drops the `hover:` prefix.
      expect(more.className).toContain('text-on-surface-variant');
      expect(more.className).not.toMatch(/(^|\s)bg-surface-container-high/);
    });

    it('renders the trail row with a way back to People', () => {
      h.layout = { ...h.layout, selectedContact: { name: 'David Alvarado' } };
      renderTopNav('/people/NduKn2BpBzrRql5Z9mHk');
      expect(screen.getByRole('link', { name: /back to people/i })).toHaveAttribute(
        'href',
        '/directory',
      );
      expect(screen.getByText('David Alvarado')).toBeInTheDocument();
    });
  });

  it('does not render a trail row on a top-level route', () => {
    renderTopNav('/directory');
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument();
  });

  it('renders More menu and opens it to reveal alphabetically sorted destinations and external links', () => {
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText('Gatherings')).toBeInTheDocument();
    expect(screen.getByText('The Journey')).toBeInTheDocument();
    expect(screen.getByText('My Day')).toBeInTheDocument();
    expect(screen.getByText('Looking back')).toBeInTheDocument();
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByText('Shared Calendar')).toBeInTheDocument();
    expect(screen.getByText('Sign-up form')).toBeInTheDocument();
  });

  it('opening More navigates to a destination', () => {
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByText('Gatherings'));
    expect(h.mockNavigate).toHaveBeenCalledWith('/attendance');
  });

  it('shows "Home" label (not My Day) for non-admin roles', () => {
    h.auth = { ...baseAuth, role: 'operator', isAdmin: false };
    renderTopNav();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('My Day')).not.toBeInTheDocument();
  });

  it('opens the mobile drawer when the mobile trigger is clicked', () => {
    renderTopNav();
    fireEvent.click(screen.getByLabelText('Open navigation'));
    expect(h.mockSetIsMobileMenuOpen).toHaveBeenCalledWith(true);
  });

  it('does not offer a destination the phone cannot open in the drawer (#1787)', () => {
    h.layout = { ...h.layout, isMobileMenuOpen: true };
    renderTopNav();

    const nav = screen.getByRole('navigation', { name: /mobile menu/i });
    // `/board` is a desktop surface: at phone width it redirects to People.
    expect(within(nav).queryByRole('link', { name: /the journey/i })).not.toBeInTheDocument();
    // People is the one door to those people on a phone.
    expect(within(nav).getByRole('link', { name: /^people$/i })).toHaveAttribute(
      'href',
      '/directory',
    );
  });

  // ── No orphaned vertical gap above the Sign-up entry (#1635) ────────────
  // Every destination row in the drawer is a flush h-11 flex item. The
  // Sign-up entry has no group label, so the one-off `mt-2` wrapper it carried
  // read as a dead gap below the rows above it. The entry now sits directly in
  // the drawer column and follows the same row rhythm (#747 fixed the desktop
  // rail; this covers the mobile drawer).
  it('draws the Sign-up entry without an orphaned top margin in the mobile drawer (#1635)', () => {
    h.layout = { ...h.layout, isMobileMenuOpen: true };
    renderTopNav();

    const nav = screen.getByRole('navigation', { name: /mobile menu/i });
    const signup = within(nav).getByRole('link', { name: /sign-up form/i });
    expect(signup).toHaveAttribute('href', '/signup');

    // Nothing between the link and the drawer may carry a top-margin utility —
    // that is the gap the fix removed.
    for (let el: HTMLElement | null = signup; el && el !== nav; el = el.parentElement) {
      expect(el.className, `${el.tagName} should not carry a top-margin utility`).not.toMatch(
        /(^|\s)m?t-[0-9]/,
      );
    }
  });

  // The EN/ES toggles measured 37×24 and 35×24 in the drawer footer at 375px,
  // half the repo's 44px phone minimum (#1779). The visual pill stays 24px; the
  // button around it is 44px and pulls the extra height back with a negative
  // margin so the tray does not grow.
  it('gives the drawer footer language toggles a 44px hit area (#1779)', () => {
    h.layout = { ...h.layout, isMobileMenuOpen: true };
    renderTopNav();

    const nav = screen.getByRole('navigation', { name: /mobile menu/i });
    for (const label of ['EN', 'ES']) {
      const toggle = within(nav).getByRole('button', { name: label });
      expect(toggle.className, label).toContain('min-h-11');
      expect(toggle.className, label).toContain('-my-2.5');
    }
  });

  it('renders profile dropdown with persona, season chip, Settings and Log out', () => {
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: /Profile/i }));
    expect(screen.getByText('tony@cisa.test')).toBeInTheDocument();
    expect(screen.getByText('Full-timer')).toBeInTheDocument();
    expect(screen.getByTestId('season-chip')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Log out')).toBeInTheDocument();
  });

  it('calls logOut when clicking Log out in the profile menu', () => {
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: /Profile/i }));
    fireEvent.click(screen.getByText('Log out'));
    expect(h.mockLogOut).toHaveBeenCalled();
  });

  it('closes profile dropdown when clicking Settings link', () => {
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: /Profile/i }));
    const settingsLink = screen.getAllByText('Settings').find((el) => el.closest('a'));
    fireEvent.click(settingsLink!);
    expect(screen.queryByText('Log out')).not.toBeInTheDocument();
  });

  it('renders Eye button for owner and fires onOpenImpersonateModal', () => {
    h.auth = { ...baseAuth, isOwner: true };
    const onOpenImpersonateModal = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <TopNav onOpenImpersonateModal={onOpenImpersonateModal} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText('See as their view'));
    expect(onOpenImpersonateModal).toHaveBeenCalledTimes(1);
  });

  it('shows role label in the persona menu', () => {
    h.auth = { ...baseAuth, role: 'manager', isAdmin: false };
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: /Profile/i }));
    expect(screen.getByText('Trainee')).toBeInTheDocument();
  });

  it('falls back to email prefix and "User" when displayName is missing', () => {
    h.auth = { ...baseAuth, user: { displayName: null, photoURL: null, email: 'reviewer@test.com' } };
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: /Profile/i }));
    expect(screen.getByText('reviewer')).toBeInTheDocument();
  });

  it('renders logo fallback initial on image error', () => {
    renderTopNav();
    const logoImg = screen.getByAltText('CISA Campus Work Tracker');
    fireEvent.error(logoImg);
    expect(logoImg.style.display).toBe('none');
  });

  it('renders language selector in the profile menu', () => {
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: /Profile/i }));
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('ES')).toBeInTheDocument();
  });

  it('renders translated tabs in Spanish mode when cached', async () => {
    const { setCachedTranslation } = await import('../lib/translator');
    const { LanguageProvider } = await import('../components/LanguageProvider');

    setCachedTranslation('Coordination Notes', 'Notas de coordinación', 'es');
    setCachedTranslation('People', 'Personas', 'es');
    setCachedTranslation('On our hearts', 'En nuestros corazones', 'es');
    setCachedTranslation('More', 'Más', 'es');

    render(
      <MemoryRouter initialEntries={['/']}>
        <LanguageProvider defaultLanguage="es">
          <TopNav />
        </LanguageProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Notas de coordinación')).toBeInTheDocument();
    expect(screen.getByText('Personas')).toBeInTheDocument();
    expect(screen.getByText('En nuestros corazones')).toBeInTheDocument();
    expect(screen.getByText('Más')).toBeInTheDocument();
  });
});
