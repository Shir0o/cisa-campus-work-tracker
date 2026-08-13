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
    const profileBtn = screen.getByRole('button', { name: /Profile/i });
    
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
    const profileBtn = screen.getByRole('button', { name: /Profile/i });
    
    // Open the dropdown
    fireEvent.click(profileBtn);
    expect(screen.getByText('Log out')).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Log out')).not.toBeInTheDocument();
  });

  it('calls logOut when clicking sign out in profile dropdown', () => {
    renderTopBar('/');
    const profileBtn = screen.getByRole('button', { name: /Profile/i });
    
    fireEvent.click(profileBtn);
    const signOutBtn = screen.getByText('Log out');
    fireEvent.click(signOutBtn);
    
    expect(mockLogOut).toHaveBeenCalled();
  });

  // ── pageTitleFor route mapping tests ───────────────────────────────

  it.each([
    ['/board', 'The Journey'],
    ['/directory', 'People'],
    ['/attendance', 'Gatherings'],
    ['/prayer', 'On our hearts'],
    ['/history', 'Looking back'],
    ['/coordination', 'Coordination Notes'],
    ['/feedback', 'Feedback'],
    ['/admin/feedback', 'Feedback'],
  ])('renders %s as "%s"', (route, expectedTitle) => {
    renderTopBar(route);
    expect(screen.getAllByText(expectedTitle).length).toBeGreaterThan(0);
  });

  it('renders "Workspace" fallback for unknown path', () => {
    renderTopBar('/some/unknown/path');
    // Both the breadcrumb link "Workspace" and the page title "Workspace" should be present
    const workspaceElements = screen.getAllByText('Workspace');
    // Desktop breadcrumb always shows "Workspace" link, so at least 2 if the title also says Workspace
    expect(workspaceElements.length).toBeGreaterThanOrEqual(2);
  });

  it('renders correct title for nested path via prefix match', () => {
    renderTopBar('/board/details/123');
    expect(screen.getAllByText('The Journey').length).toBeGreaterThan(0);
  });

  it('shows "User" fallback when displayName is null', () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: null, photoURL: null, email: 'test@test.com' },
      logOut: mockLogOut,
    });
    renderTopBar('/');
    const profileBtn = screen.getByRole('button', { name: /Profile/i });
    fireEvent.click(profileBtn);
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('closes profile dropdown when Settings link is clicked', () => {
    renderTopBar('/');
    const profileBtn = screen.getByRole('button', { name: /Profile/i });
    fireEvent.click(profileBtn);
    expect(screen.getByText('Log out')).toBeInTheDocument();

    // Click Settings link
    const settingsLink = screen.getAllByText('Settings').find(el => el.tagName === 'A' || el.closest('a'));
    fireEvent.click(settingsLink!);

    // Dropdown should close
    expect(screen.queryByText('Log out')).not.toBeInTheDocument();
  });

  it('renders Eye icon button next to notification bell for isOwner and fires onOpenImpersonateModal', () => {
    const onOpenImpersonateModal = vi.fn();
    (useAuth as any).mockReturnValue({
      user: { displayName: 'Tony Wang', photoURL: null },
      isOwner: true,
      logOut: mockLogOut,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <TopBar onOpenImpersonateModal={onOpenImpersonateModal} />
      </MemoryRouter>,
    );

    const eyeBtn = screen.getByLabelText('See as their view');
    expect(eyeBtn).toBeInTheDocument();

    fireEvent.click(eyeBtn);
    expect(onOpenImpersonateModal).toHaveBeenCalledTimes(1);
  });
});

