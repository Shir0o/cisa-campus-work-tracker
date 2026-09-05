import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import TopNav from '../components/layout/TopNav';
import MobileNav from '../components/layout/MobileNav';

// SeasonChip (in the sidebar) reads the season lib; stub it so the real Firestore
// layer (firebase.ts → getAuth) is never loaded in these layout tests.
vi.mock('../lib/seasons', () => ({
  SEASON_ORDER: ['spring', 'summer', 'fall', 'winter'],
  SEASONS: {
    spring: { id: 'spring', label: 'Spring' },
    summer: { id: 'summer', label: 'Summer' },
    fall: { id: 'fall', label: 'Fall' },
    winter: { id: 'winter', label: 'Winter' },
  },
  useSeason: () => ({
    autoId: 'summer',
    activeId: 'summer',
    active: { id: 'summer', label: 'Summer', tone: 'amber', blurb: '' },
    isAuto: true,
    clubRush: false,
    label: "Summer '26",
    tags: ["Summer '26"],
    setSeason: () => {},
    resetSeason: () => {},
    toggleClubRush: () => {},
  }),
}));

const mockLogOut = vi.fn();
const mockSetIsMobileMenuOpen = vi.fn();

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: '123', displayName: 'Tester', photoURL: null, email: 't@cisa.test' },
    isAdmin: true,
    role: 'admin',
    isApproved: true,
    loading: false,
    logOut: mockLogOut,
    isOwner: false,
    impersonateTarget: null,
    ownerViewRole: null,
  }),
}));

vi.mock('../App', () => {
  // One stub for both accessors — the trail reads the optional one.
  const layout = () => ({
    isMobileMenuOpen: true,
    setIsMobileMenuOpen: mockSetIsMobileMenuOpen,
    openNewContact: vi.fn(),
    openLogInteraction: vi.fn(),
    setSearchOpen: vi.fn(),
  });
  return { useLayout: layout, useOptionalLayout: layout };
});

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
    nav: ({ children, ...props }: any) => <nav {...props}>{children}</nav>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: BrowserRouter });
};

describe('Responsive Layout Components', () => {
  it('renders TopNav with correct sticky positioning class', () => {
    renderWithRouter(<TopNav />);
    const topNav = screen.getByLabelText('Main Navigation');
    expect(topNav).toBeInTheDocument();
    expect(topNav.className).toContain('sticky');
    expect(topNav.className).toContain('top-0');
  });

  it('renders MobileNav with correct responsive classes', () => {
    renderWithRouter(<MobileNav />);
    const mobileNav = screen.getByLabelText('Mobile Navigation');
    expect(mobileNav).toBeInTheDocument();
    // Bottom nav hides once the tablet rail appears (md), not lg.
    expect(mobileNav.className).toContain('md:hidden');
  });

  it('Accessibility: TopNav has a visible "Log out" button in the avatar menu', () => {
    renderWithRouter(<TopNav />);
    const { fireEvent } = require('@testing-library/react');
    const profileBtn = screen.getByRole('button', { name: /Profile/i });
    fireEvent.click(profileBtn);
    const logOutBtn = screen.getAllByText(/Log out/i)[0];
    expect(logOutBtn).toBeInTheDocument();
    expect(logOutBtn.closest('button')).toBeInTheDocument();
  });

  it('TopNav: clicking Log out triggers logOut', () => {
    renderWithRouter(<TopNav />);
    const { fireEvent } = require('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: /Profile/i }));
    const logOutBtn = screen.getAllByText(/Log out/i)[0];
    fireEvent.click(logOutBtn.closest('button')!);
    expect(mockLogOut).toHaveBeenCalled();
  });

  it('Accessibility: MobileNav shows Home and Contacts links for admin', () => {
    renderWithRouter(<MobileNav />);
    expect(screen.getByText(/Home/i)).toBeInTheDocument();
    expect(screen.getByText(/Contacts/i)).toBeInTheDocument();
  });
});
