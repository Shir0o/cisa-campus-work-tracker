import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Sidebar from '../components/layout/Sidebar';
import { BrowserRouter } from 'react-router-dom';

// Simple mock for useAuth
const mockUseAuth = vi.fn();

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../App', () => ({
  useLayout: () => ({
    isMobileMenuOpen: false,
    setIsMobileMenuOpen: vi.fn(),
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

describe('Sidebar Role Label', () => {
  const mockToggleCollapse = vi.fn();
  const mockLogInteraction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderSidebar = () => {
    return render(
      <BrowserRouter>
        <Sidebar
          isCollapsed={false}
          onToggleCollapse={mockToggleCollapse}
          onLogInteraction={mockLogInteraction}
        />
      </BrowserRouter>
    );
  };

  const baseAuth = { isAdmin: false, logOut: vi.fn() };

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
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.getByText('Prayer List')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Stage')).not.toBeInTheDocument();
    expect(screen.queryByText('History')).not.toBeInTheDocument();
  });

  it('shows Dashboard and Contacts but not Stage or History for operator role', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'operator' });
    renderSidebar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.queryByText('Stage')).not.toBeInTheDocument();
    expect(screen.queryByText('History')).not.toBeInTheDocument();
  });

  it('shows all nav items for admin role', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, role: 'admin', isAdmin: true });
    renderSidebar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Stage')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.getByText('Prayer List')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
