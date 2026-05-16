import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import MobileNav from '../components/layout/MobileNav';

// Mock dependencies
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: '123' },
    isAdmin: true,
    role: 'admin',
    isApproved: true,
    loading: false,
  }),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('motion/react', () => ({
  motion: {
    nav: ({ children, ...props }: any) => <nav {...props}>{children}</nav>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
}));

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: BrowserRouter });
};

describe('Responsive Layout Components', () => {
  it('renders Sidebar with correct responsive classes', () => {
    renderWithRouter(<Sidebar />);
    const sidebar = screen.getByLabelText('Main Navigation');
    expect(sidebar).toBeInTheDocument();
    
    // Sidebar should be hidden on small screens and visible on large
    expect(sidebar.className).toContain('hidden');
    expect(sidebar.className).toContain('lg:flex');
  });

  it('renders MobileNav with correct responsive classes', () => {
    renderWithRouter(<MobileNav />);
    const mobileNav = screen.getByLabelText('Mobile Navigation');
    expect(mobileNav).toBeInTheDocument();
    
    // Mobile nav should be hidden on large screens
    expect(mobileNav.className).toContain('lg:hidden');
  });

  it('Accessibility: Sidebar has a visible "Log Interaction" button', () => {
    renderWithRouter(<Sidebar />);
    const logInteractionBtn = screen.getByText(/Log Interaction/i);
    expect(logInteractionBtn).toBeInTheDocument();
    expect(logInteractionBtn.closest('button')).toBeInTheDocument();
  });

  it('Accessibility: MobileNav has navigation links with labels', () => {
    renderWithRouter(<MobileNav />);
    const dashboardLink = screen.getByText(/Dashboard/i);
    const statusLink = screen.getByText(/Stage/i);
    expect(dashboardLink).toBeInTheDocument();
    expect(statusLink).toBeInTheDocument();
  });
});
