import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TopBar from '../components/layout/TopBar';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';

// Mock dependencies
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../App', () => ({
  useLayout: vi.fn(),
}));

vi.mock('../components/layout/GlobalSearch', () => ({
  default: () => <div data-testid="global-search">Global Search</div>,
}));

vi.mock('../components/layout/NotificationCenter', () => ({
  default: () => <div data-testid="notification-center">Notification Center</div>,
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockLogOut = vi.fn();
const mockSetIsMobileMenuOpen = vi.fn();

describe('TopBar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { displayName: 'Tony Wang', photoURL: null },
      logOut: mockLogOut,
    });
    (useLayout as any).mockReturnValue({
      setIsMobileMenuOpen: mockSetIsMobileMenuOpen,
    });
  });

  const renderTopBar = (initialRoute: string) => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <TopBar />
      </MemoryRouter>
    );
  };

  it('renders correct page title crumbs based on current location', () => {
    renderTopBar('/');
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
  });

  it('renders correct page title crumbs for settings', () => {
    renderTopBar('/settings');
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
  });

  it('calls setIsMobileMenuOpen when clicking the mobile menu trigger', () => {
    renderTopBar('/');
    const menuBtn = screen.getByLabelText('Open navigation');
    fireEvent.click(menuBtn);
    expect(mockSetIsMobileMenuOpen).toHaveBeenCalledWith(true);
  });

  it('toggles profile dropdown menu on click', () => {
    renderTopBar('/');
    const profileBtn = screen.getByRole('img', { name: /Profile/i }).parentElement!;
    
    // Closed initially
    expect(screen.queryByText('Log out')).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(profileBtn);
    expect(screen.getByText('Log out')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();

    // Click again to close
    fireEvent.click(profileBtn);
    expect(screen.queryByText('Log out')).not.toBeInTheDocument();
  });

  it('closes profile dropdown when clicking outside', () => {
    renderTopBar('/');
    const profileBtn = screen.getByRole('img', { name: /Profile/i }).parentElement!;
    
    // Open the dropdown
    fireEvent.click(profileBtn);
    expect(screen.getByText('Log out')).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Log out')).not.toBeInTheDocument();
  });

  it('calls logOut when clicking sign out in profile dropdown', () => {
    renderTopBar('/');
    const profileBtn = screen.getByRole('img', { name: /Profile/i }).parentElement!;
    
    fireEvent.click(profileBtn);
    const signOutBtn = screen.getByText('Log out');
    fireEvent.click(signOutBtn);
    
    expect(mockLogOut).toHaveBeenCalled();
  });
});
