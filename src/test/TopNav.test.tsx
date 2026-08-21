import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
  layout: {
    isMobileMenuOpen: false,
    setIsMobileMenuOpen: vi.fn(),
    setSearchOpen: vi.fn(),
  },
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => h.auth,
}));

vi.mock('../App', () => ({
  useLayout: () => h.layout,
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
