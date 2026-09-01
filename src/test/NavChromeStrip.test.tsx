import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NavChromeStrip from '../components/layout/NavChromeStrip';

const h = vi.hoisted(() => ({
  mockLogOut: vi.fn(),
  auth: {
    user: { displayName: 'Tony Wang', photoURL: null, email: 'tony@cisa.test' },
    role: 'admin',
    isAdmin: true,
    isOwner: false,
    impersonateTarget: null,
    ownerViewRole: null,
    logOut: vi.fn(),
  } as any,
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => h.auth,
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
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('NavChromeStrip (#675)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.auth = {
      user: { displayName: 'Tony Wang', photoURL: null, email: 'tony@cisa.test' },
      role: 'admin',
      isAdmin: true,
      isOwner: false,
      impersonateTarget: null,
      ownerViewRole: null,
      logOut: h.mockLogOut,
    };
  });

  it('renders search, notifications, and profile trigger without standalone season chip in header strip', () => {
    render(
      <MemoryRouter>
        <NavChromeStrip />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('global-search')).toBeInTheDocument();
    expect(screen.getByTestId('notification-center')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Profile/i })).toBeInTheDocument();

    // SeasonChip should NOT be rendered directly on the nav bar before opening the profile menu
    expect(screen.queryByTestId('season-chip')).not.toBeInTheDocument();
  });

  it('renders SeasonChip inside profile dropdown when opened', () => {
    render(
      <MemoryRouter>
        <NavChromeStrip />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Profile/i }));
    expect(screen.getByTestId('season-chip')).toBeInTheDocument();
    expect(screen.getByText('tony@cisa.test')).toBeInTheDocument();
  });
});
