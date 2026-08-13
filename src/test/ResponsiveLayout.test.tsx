import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
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
    user: { uid: '123' },
    isAdmin: true,
    role: 'admin',
    isApproved: true,
    loading: false,
    logOut: mockLogOut,
  }),
}));

vi.mock('../App', () => ({
  useLayout: () => ({
    isMobileMenuOpen: true,
    setIsMobileMenuOpen: mockSetIsMobileMenuOpen,
    openNewContact: vi.fn(),
    openLogInteraction: vi.fn(),
  }),
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
  it('renders Sidebar with correct sticky positioning class', () => {
    renderWithRouter(<Sidebar />);
    const sidebar = screen.getByLabelText('Main Navigation');
    expect(sidebar).toBeInTheDocument();
    // Persistent nav now appears from the md breakpoint (tablet icon rail);
    // below md it's a fixed overlay drawer.
    expect(sidebar.className).toContain('md:sticky');
    expect(sidebar.className).toContain('fixed');
  });

  it('renders MobileNav with correct responsive classes', () => {
    renderWithRouter(<MobileNav />);
    const mobileNav = screen.getByLabelText('Mobile Navigation');
    expect(mobileNav).toBeInTheDocument();
    // Bottom nav hides once the tablet rail appears (md), not lg.
    expect(mobileNav.className).toContain('md:hidden');
  });

  it('Accessibility: Sidebar has a visible "Log out" button', () => {
    renderWithRouter(<Sidebar />);
    const logOutBtn = screen.getByText(/Log out/i);
    expect(logOutBtn).toBeInTheDocument();
    expect(logOutBtn.closest('button')).toBeInTheDocument();
  });

  it('Sidebar: clicking Log out triggers logOut and closes mobile menu drawer', () => {
    renderWithRouter(<Sidebar />);
    const logOutBtn = screen.getByText(/Log out/i);
    const { fireEvent } = require('@testing-library/react');
    fireEvent.click(logOutBtn.closest('button')!);
    expect(mockLogOut).toHaveBeenCalled();
    expect(mockSetIsMobileMenuOpen).toHaveBeenCalledWith(false);
  });

  it('Accessibility: MobileNav shows Home and Contacts links for admin', () => {
    renderWithRouter(<MobileNav />);
    expect(screen.getByText(/Home/i)).toBeInTheDocument();
    expect(screen.getByText(/Contacts/i)).toBeInTheDocument();
  });
});
