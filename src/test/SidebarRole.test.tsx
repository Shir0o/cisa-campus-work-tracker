import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Sidebar from '../components/layout/Sidebar';
import { BrowserRouter } from 'react-router-dom';

// Simple mock for useAuth
const mockUseAuth = vi.fn();

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('Sidebar Role Label', () => {
  const mockToggleCollapse = vi.fn();
  const mockNewContact = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderSidebar = () => {
    return render(
      <BrowserRouter>
        <Sidebar 
          isCollapsed={false} 
          onToggleCollapse={mockToggleCollapse} 
          onNewContact={mockNewContact} 
        />
      </BrowserRouter>
    );
  };

  it('displays "Administrator" for admin role', () => {
    mockUseAuth.mockReturnValue({
      role: 'admin',
      isAdmin: true,
      logOut: vi.fn(),
    });

    renderSidebar();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it('displays "Manager" for manager role', () => {
    mockUseAuth.mockReturnValue({
      role: 'manager',
      isAdmin: false,
      logOut: vi.fn(),
    });

    renderSidebar();
    expect(screen.getByText('Manager')).toBeInTheDocument();
  });

  it('displays "Guest" when role is null', () => {
    mockUseAuth.mockReturnValue({
      role: null,
      isAdmin: false,
      logOut: vi.fn(),
    });

    renderSidebar();
    expect(screen.getByText('Guest')).toBeInTheDocument();
  });

  it('displays capitalized role for unknown roles', () => {
    mockUseAuth.mockReturnValue({
      role: 'operator',
      isAdmin: false,
      logOut: vi.fn(),
    });

    renderSidebar();
    expect(screen.getByText('Operator')).toBeInTheDocument();
  });
});
