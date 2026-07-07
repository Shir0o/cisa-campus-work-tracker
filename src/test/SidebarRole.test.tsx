import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Sidebar from '../components/layout/Sidebar';
import { BrowserRouter } from 'react-router-dom';

// Simple mock for useAuth
const mockUseAuth = vi.fn();

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

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockSetIsMobileMenuOpen = vi.fn();
const mockUseLayout = vi.fn().mockReturnValue({
  isMobileMenuOpen: false,
  setIsMobileMenuOpen: mockSetIsMobileMenuOpen,
});

vi.mock('../App', () => ({
  useLayout: () => mockUseLayout(),
}));

vi.mock('motion/react', () => ({
  motion: {
    nav: ({ children, ...props }: any) => <nav {...props}>{children}</nav>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('Sidebar Role Label & Interactions', () => {
  const mockToggleCollapse = vi.fn();
  const mockLogInteraction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLayout.mockReturnValue({
      isMobileMenuOpen: false,
      setIsMobileMenuOpen: mockSetIsMobileMenuOpen,
    });
    // Set default desktop window width
    window.innerWidth = 1024;
  });

  const renderSidebar = (isCollapsed = false) => {
    return render(
      <BrowserRouter>
        <Sidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={mockToggleCollapse}
          onLogInteraction={mockLogInteraction}
        />
      </BrowserRouter>
    );
  };

  const baseAuth = {
    isAdmin: false,
    logOut: vi.fn(),
    user: { displayName: 'John Doe', photoURL: 'https://example.com/avatar.jpg' },
  };

  it('displays "Full-timer" for admin role', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'admin', isAdmin: true });
    renderSidebar();
    expect(screen.getByText('Full-timer')).toBeInTheDocument();
  });

  it('displays "Trainee" for manager role', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'manager' });
    renderSidebar();
    expect(screen.getByText('Trainee')).toBeInTheDocument();
  });

  it('displays "Guest" when role is null', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: null });
    renderSidebar();
    expect(screen.getByText('Guest')).toBeInTheDocument();
  });

  it('displays "Student" for operator role', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'operator' });
    renderSidebar();
    expect(screen.getByText('Student')).toBeInTheDocument();
  });

  it('shows only permitted nav items for viewer role', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'viewer' });
    renderSidebar();
    expect(screen.getByText('Gatherings')).toBeInTheDocument();
    expect(screen.getByText('On our hearts')).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.queryByText('The Journey')).not.toBeInTheDocument();
    expect(screen.queryByText('Looking back')).not.toBeInTheDocument();
  });

  it('shows Home and People but not The Journey or Looking back for operator role', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'operator' });
    renderSidebar();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.queryByText('The Journey')).not.toBeInTheDocument();
    expect(screen.queryByText('Looking back')).not.toBeInTheDocument();
  });

  it('shows all nav items for admin role, home labeled My Day', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'admin', isAdmin: true });
    renderSidebar();
    expect(screen.getByText('My Day')).toBeInTheDocument();
    expect(screen.getByText('The Journey')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Looking back')).toBeInTheDocument();
    expect(screen.getByText('Gatherings')).toBeInTheDocument();
    expect(screen.getByText('On our hearts')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('handles toggling collapse when the collapse button is clicked', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'admin', isAdmin: true });
    renderSidebar(false);
    const collapseBtn = screen.getByText('Collapse Menu');
    fireEvent.click(collapseBtn);
    expect(mockToggleCollapse).toHaveBeenCalled();
  });

  it('handles logout button click', () => {
    const logoutMock = vi.fn();
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'admin', logOut: logoutMock });
    renderSidebar();
    const logoutBtn = screen.getByRole('button', { name: /Log out/i });
    fireEvent.click(logoutBtn);
    expect(logoutMock).toHaveBeenCalled();
  });

  it('handles logo image load error by showing fallback initial', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'admin' });
    renderSidebar();
    const logoImg = screen.getByAltText('CISA Campus Work Tracker');
    fireEvent.error(logoImg);
    // Since we mocked out motion components, we should check parent element changes
    expect(logoImg.style.display).toBe('none');
  });

  it('updates display mode on resize and triggers scroll timing', async () => {
    vi.useFakeTimers();
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'admin' });
    renderSidebar();

    // Trigger scroll on the scrollable container
    const navItems = screen.getByLabelText('Main Navigation');
    const scrollContainer = navItems.querySelector('.overflow-y-auto');
    if (scrollContainer) {
      fireEvent.scroll(scrollContainer);
    }
    vi.advanceTimersByTime(1000);

    // Trigger window resize
    window.innerWidth = 500;
    fireEvent(window, new Event('resize'));
    
    vi.useRealTimers();
  });

  it('renders mobile menu overlay and close button when menu is open on mobile', () => {
    mockUseLayout.mockReturnValue({
      isMobileMenuOpen: true,
      setIsMobileMenuOpen: mockSetIsMobileMenuOpen,
    });
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'admin' });
    renderSidebar();

    // Mobile overlay check
    const mobileOverlay = document.querySelector('.bg-scrim\\/50');
    expect(mobileOverlay).toBeInTheDocument();
    if (mobileOverlay) {
      fireEvent.click(mobileOverlay);
      expect(mockSetIsMobileMenuOpen).toHaveBeenCalledWith(false);
    }

    // Close button (X) check
    const closeBtn = screen.getByRole('button', { name: '' }); // Lucide X is an icon button
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(mockSetIsMobileMenuOpen).toHaveBeenCalledWith(false);
  });
});

