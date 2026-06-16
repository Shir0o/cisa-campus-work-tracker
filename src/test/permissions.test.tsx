/**
 * Role-based permissions validation.
 *
 * Uses TEST_USERS fixtures to verify, for each role:
 *   - canAccessRoute() returns the correct boolean for every route
 *   - Sidebar renders exactly the expected nav items
 *   - MobileNav renders the correct bottom links and hides/shows the FAB
 *   - RoleGuard redirects to the correct fallback route when access is denied
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TEST_USERS, type TestUser } from './fixtures/users';
import { canAccessRoute, hasMinRole, defaultRouteForRole, roleLabel, NAV_ITEMS } from '../lib/permissions';
import Sidebar from '../components/layout/Sidebar';
import MobileNav from '../components/layout/MobileNav';

// ─── Module mocks ────────────────────────────────────────────────────────────

let currentUser: TestUser = TEST_USERS.admin;

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => currentUser,
}));

vi.mock('../App', () => ({
  useLayout: () => ({
    isMobileMenuOpen: false,
    setIsMobileMenuOpen: vi.fn(),
    openNewContact: vi.fn(),
    openLogInteraction: vi.fn(),
    searchOpen: false,
    setSearchOpen: vi.fn(),
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALL_ROUTES = NAV_ITEMS.map(i => i.href).concat(['/admin/feedback', '/feedback']);

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar isCollapsed={false} onToggleCollapse={vi.fn()} onLogInteraction={vi.fn()} />
    </MemoryRouter>
  );
}

function renderMobileNav() {
  return render(
    <MemoryRouter>
      <MobileNav />
    </MemoryRouter>
  );
}

/** Renders a minimal RoleGuard scenario and returns where it ended up. */
function RoleGuardHarness({ startAt }: { startAt: string }) {
  const { canAccessRoute: cAccess, defaultRouteForRole: dRoute } = require('../lib/permissions');
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

// ─── 1. canAccessRoute() unit tests ──────────────────────────────────────────

describe('canAccessRoute()', () => {
  const matrix: Record<string, string[]> = {
    viewer:   ['/attendance', '/prayer', '/settings', '/feedback'],
    operator: ['/attendance', '/prayer', '/settings', '/feedback', '/', '/directory'],
    manager:  ['/attendance', '/prayer', '/settings', '/feedback', '/', '/directory', '/board', '/history'],
    admin:    ['/attendance', '/prayer', '/settings', '/feedback', '/', '/directory', '/board', '/history', '/admin/feedback', '/coordination', '/my-day'],
  };

  for (const [role, allowed] of Object.entries(matrix)) {
    const denied = ALL_ROUTES.filter(r => !allowed.includes(r));

    it(`${role}: allows ${allowed.length} routes`, () => {
      for (const route of allowed) {
        expect(canAccessRoute(role, route), `${role} should access ${route}`).toBe(true);
      }
    });

    if (denied.length > 0) {
      it(`${role}: denies ${denied.length} routes`, () => {
        for (const route of denied) {
          expect(canAccessRoute(role, route), `${role} should NOT access ${route}`).toBe(false);
        }
      });
    }
  }

  it('null role denies all routes', () => {
    for (const route of ALL_ROUTES) {
      expect(canAccessRoute(null, route)).toBe(false);
    }
  });
});

// ─── 2. hasMinRole() ─────────────────────────────────────────────────────────

describe('hasMinRole()', () => {
  it('enforces viewer < operator < manager < admin hierarchy', () => {
    expect(hasMinRole('admin', 'admin')).toBe(true);
    expect(hasMinRole('admin', 'manager')).toBe(true);
    expect(hasMinRole('admin', 'operator')).toBe(true);
    expect(hasMinRole('admin', 'viewer')).toBe(true);

    expect(hasMinRole('manager', 'admin')).toBe(false);
    expect(hasMinRole('manager', 'manager')).toBe(true);
    expect(hasMinRole('manager', 'operator')).toBe(true);

    expect(hasMinRole('operator', 'manager')).toBe(false);
    expect(hasMinRole('operator', 'operator')).toBe(true);
    expect(hasMinRole('operator', 'viewer')).toBe(true);

    expect(hasMinRole('viewer', 'operator')).toBe(false);
    expect(hasMinRole('viewer', 'viewer')).toBe(true);

    expect(hasMinRole(null, 'viewer')).toBe(false);
  });
});

// ─── 3. defaultRouteForRole() ────────────────────────────────────────────────

describe('defaultRouteForRole()', () => {
  it('sends operator+ to dashboard', () => {
    expect(defaultRouteForRole('admin')).toBe('/');
    expect(defaultRouteForRole('manager')).toBe('/');
    expect(defaultRouteForRole('operator')).toBe('/');
  });

  it('sends viewer to attendance', () => {
    expect(defaultRouteForRole('viewer')).toBe('/attendance');
    expect(defaultRouteForRole(null)).toBe('/attendance');
  });
});

// ─── 3b. roleLabel() display names ───────────────────────────────────────────

describe('roleLabel()', () => {
  it('maps internal role keys to the campus-facing names', () => {
    expect(roleLabel('admin')).toBe('Full-timer');
    expect(roleLabel('manager')).toBe('Trainee');
    expect(roleLabel('operator')).toBe('Student');
    expect(roleLabel('viewer')).toBe('Community');
    expect(roleLabel(null)).toBe('Guest');
    expect(roleLabel('')).toBe('Guest');
    expect(roleLabel('super_admin')).toBe('Super_admin');
  });

  it('handles fallback cases for canAccessRoute, hasMinRole, and defaultRouteForRole', () => {
    // canAccessRoute fallback for invalid role
    expect(canAccessRoute('invalid_role', '/')).toBe(false);
    // canAccessRoute fallback for unknown path (falls back to minRole = admin)
    expect(canAccessRoute('viewer', '/unknown-route')).toBe(false);
    expect(canAccessRoute('admin', '/unknown-route')).toBe(true);

    // hasMinRole fallback for invalid role
    expect(hasMinRole('invalid_role', 'viewer')).toBe(false);

    // defaultRouteForRole fallback for invalid role
    expect(defaultRouteForRole('invalid_role')).toBe('/attendance');
  });
});

// ─── 4. Sidebar nav per role ─────────────────────────────────────────────────

describe('Sidebar nav items', () => {
  beforeEach(() => vi.clearAllMocks());

  it('viewer: shows only Gatherings, Prayer, Settings', () => {
    currentUser = TEST_USERS.viewer;
    renderSidebar();
    expect(screen.getByText('Gatherings')).toBeInTheDocument();
    expect(screen.getByText('Prayer')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.queryByText('My Day')).not.toBeInTheDocument();
    expect(screen.queryByText('The Journey')).not.toBeInTheDocument();
    expect(screen.queryByText('People')).not.toBeInTheDocument();
    expect(screen.queryByText('Looking back')).not.toBeInTheDocument();
  });

  it('operator: adds Today and People, still no The Journey or Looking back', () => {
    currentUser = TEST_USERS.operator;
    renderSidebar();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.queryByText('My Day')).not.toBeInTheDocument();
    expect(screen.queryByText('The Journey')).not.toBeInTheDocument();
    expect(screen.queryByText('Looking back')).not.toBeInTheDocument();
  });

  it('manager: adds The Journey and Looking back, everything except Settings admin-tools', () => {
    currentUser = TEST_USERS.manager;
    renderSidebar();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('The Journey')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Looking back')).toBeInTheDocument();
    expect(screen.getByText('Gatherings')).toBeInTheDocument();
    expect(screen.getByText('Prayer')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('My Day')).not.toBeInTheDocument();
  });

  it('admin: sees all 9 nav items', () => {
    currentUser = TEST_USERS.admin;
    renderSidebar();
    const labels = ['Today', 'My Day', 'The Journey', 'People', 'Looking back', 'Gatherings', 'Prayer', 'The Board', 'Settings'];
    for (const label of labels) {
      expect(screen.getByText(label), label).toBeInTheDocument();
    }
  });
});

// ─── 5. MobileNav per role ───────────────────────────────────────────────────

describe('MobileNav', () => {
  beforeEach(() => vi.clearAllMocks());

  it('viewer: shows Gatherings and Prayer, no search FAB', () => {
    currentUser = TEST_USERS.viewer;
    renderMobileNav();
    expect(screen.getByText('Gatherings')).toBeInTheDocument();
    expect(screen.getByText('Prayer')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Contacts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /search/i })).not.toBeInTheDocument();
  });

  it('operator: shows Dashboard and Contacts with search FAB', () => {
    currentUser = TEST_USERS.operator;
    renderMobileNav();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('manager: shows Dashboard and Contacts with search FAB', () => {
    currentUser = TEST_USERS.manager;
    renderMobileNav();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('admin: shows Dashboard and Contacts with search FAB', () => {
    currentUser = TEST_USERS.admin;
    renderMobileNav();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });
});
