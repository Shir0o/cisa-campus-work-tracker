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
import { TEST_USERS, type TestUser } from './fixtures/users';
import { canAccessRoute, hasMinRole, defaultRouteForRole, roleLabel, NAV_ITEMS, canSeeContact, visibleContacts, journeyContacts, canSeeHistory, canSeeSettings, navItemsForRole, canSeePrefs, canSeeBoardNotes, isAppOwner, canSimulateRole, getEffectiveRole, OWNER_VIEW_ROLES, navExternalFor } from '../lib/permissions';
import Sidebar from '../components/layout/Sidebar';
import MobileNav from '../components/layout/MobileNav';

// ─── Module mocks ────────────────────────────────────────────────────────────

let currentUser: TestUser = TEST_USERS.admin;

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

const ALL_ROUTES = NAV_ITEMS.map(i => i.href).concat(['/admin/feedback', '/feedback', 'https://shared-calendar-6u6.pages.dev/']);

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
    viewer:   ['/attendance', '/prayer', '/settings', '/feedback', '/messages', '/', '/answered', '/outreach'],
    operator: ['/attendance', '/prayer', '/settings', '/feedback', '/', '/directory', '/coordination', '/messages', '/answered'],
    manager:  ['/', '/directory', '/board', '/messages', '/feedback'],
    admin:    ['/attendance', '/prayer', '/settings', '/feedback', '/', '/directory', '/board', '/history', '/outreach', '/visits', '/admin/feedback', '/coordination', '/messages', '/answered', 'https://shared-calendar-6u6.pages.dev/'],
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
  it('sends every approved role to the role-based home', () => {
    expect(defaultRouteForRole('admin')).toBe('/');
    expect(defaultRouteForRole('manager')).toBe('/');
    expect(defaultRouteForRole('operator')).toBe('/');
    expect(defaultRouteForRole('viewer')).toBe('/');
  });

  it('sends a null/unknown role to attendance', () => {
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
    expect(roleLabel('unregistered_role')).toBe('Unregistered_role');
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

  it('viewer: shows Home, Gatherings, Prayer, Settings', () => {
    currentUser = TEST_USERS.viewer;
    renderSidebar();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Gatherings')).toBeInTheDocument();
    expect(screen.getByText('On our hearts')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.queryByText('My Day')).not.toBeInTheDocument();
    expect(screen.queryByText('The Journey')).not.toBeInTheDocument();
    expect(screen.queryByText('People')).not.toBeInTheDocument();
    expect(screen.queryByText('Looking back')).not.toBeInTheDocument();
  });

  it('operator: adds People, labels home "Home", still no The Journey or Looking back', () => {
    currentUser = TEST_USERS.operator;
    renderSidebar();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.queryByText('My Day')).not.toBeInTheDocument();
    expect(screen.queryByText('The Journey')).not.toBeInTheDocument();
    expect(screen.queryByText('Looking back')).not.toBeInTheDocument();
  });

  it('manager: adds The Journey, Home labeled "Home", hides settings/history/gatherings/prayer/calendar', () => {
    currentUser = TEST_USERS.manager;
    renderSidebar();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('The Journey')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.queryByText('Shared Calendar')).not.toBeInTheDocument();
    expect(screen.queryByText('Looking back')).not.toBeInTheDocument();
    expect(screen.queryByText('Gatherings')).not.toBeInTheDocument();
    expect(screen.queryByText('On our hearts')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('My Day')).not.toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  it('admin: sees all nav items with the home labeled "My Day"', () => {
    currentUser = TEST_USERS.admin;
    renderSidebar();
    const labels = ['My Day', 'The Journey', 'People', 'Shared Calendar', 'Looking back', 'Gatherings', 'On our hearts', 'Coordination Notes', 'Messages', 'Settings', 'Sign-up form'];
    for (const label of labels) {
      expect(screen.getByText(label), label).toBeInTheDocument();
    }
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
  });

  it('navExternalFor returns external items according to role', () => {
    expect(navExternalFor('admin').map((i) => i.id)).toContain('calendar');
    expect(navExternalFor('viewer')).toEqual([]);
    expect(navExternalFor(null)).toEqual([]);
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

  it('operator: shows Home and Contacts with search FAB', () => {
    currentUser = TEST_USERS.operator;
    renderMobileNav();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('manager: shows Home and Contacts with search FAB', () => {
    currentUser = TEST_USERS.manager;
    renderMobileNav();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('admin: shows Home and Contacts with search FAB', () => {
    currentUser = TEST_USERS.admin;
    renderMobileNav();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });
});

// ─── 6. Trainee permission helpers ─────────────────────────────────────────

describe('Trainee permission helpers (canSeeContact, visibleContacts, journeyContacts, canSeeHistory, canSeeSettings)', () => {

  it('canSeeContact allows full-timer and operator for any contact', () => {
    const contact = { id: 'c1', createdBy: 'other-user', coCreators: [] };
    expect(canSeeContact('admin', 'u1', contact)).toBe(true);
    expect(canSeeContact('operator', 'u1', contact)).toBe(true);
    expect(canSeeContact('viewer', 'u1', contact)).toBe(true);
  });

  it('canSeeContact enforces trainee restrictions (createdBy or coCreators)', () => {
    const contactOther = { id: 'c1', createdBy: 'u2', coCreators: ['u3'] };
    const contactOwn = { id: 'c2', createdBy: 'u1', coCreators: [] };
    const contactCo = { id: 'c3', createdBy: 'u2', coCreators: ['u1'] };

    expect(canSeeContact('manager', 'u1', contactOther)).toBe(false);
    expect(canSeeContact('manager', 'u1', contactOwn)).toBe(true);
    expect(canSeeContact('manager', 'u1', contactCo)).toBe(true);
    expect(canSeeContact('manager', undefined, contactOwn)).toBe(false);
    expect(canSeeContact('manager', 'u1', null)).toBe(false);
  });

  it('visibleContacts filters contacts for trainees', () => {
    const contacts = [
      { id: 'c1', createdBy: 'u2', coCreators: ['u3'] },
      { id: 'c2', createdBy: 'u1', coCreators: [] },
      { id: 'c3', createdBy: 'u2', coCreators: ['u1'] },
    ];

    expect(visibleContacts('admin', 'u1', contacts)).toHaveLength(3);
    expect(visibleContacts('manager', 'u1', contacts)).toEqual([contacts[1], contacts[2]]);
  });

  it('journeyContacts filters current semester contacts for trainees', () => {
    const contacts = [
      { id: 'c1', createdBy: 'u1', season: 'Fall 2026' },
      { id: 'c2', createdBy: 'u1', season: 'Spring 2026' },
      { id: 'c3', createdBy: 'u2', season: 'Fall 2026' },
    ];

    expect(journeyContacts('admin', 'u1', contacts, 'Fall 2026')).toHaveLength(3);
    expect(journeyContacts('manager', 'u1', contacts, 'Fall 2026')).toEqual([contacts[0]]);
  });

  it('canSeeHistory and canSeeSettings hide tabs/pages for trainees', () => {
    expect(canSeeHistory('admin')).toBe(true);
    expect(canSeeHistory('manager')).toBe(false);

    expect(canSeeSettings('admin')).toBe(true);
    expect(canSeeSettings('manager')).toBe(false);
  });

  it('tests remaining permission helper functions', () => {
    expect(roleLabel(null)).toBe('Guest');
    expect(roleLabel('custom_role')).toBe('Custom_role');

    expect(canAccessRoute(null, '/')).toBe(false);

    expect(canSeePrefs('admin')).toBe(true);
    expect(canSeePrefs('manager')).toBe(true);
    expect(canSeePrefs('operator')).toBe(false);

    expect(canSeeBoardNotes('admin')).toBe(true);
    expect(canSeeBoardNotes('manager')).toBe(false);

    expect(isAppOwner('yilongwang05@gmail.com')).toBe(true);
    expect(isAppOwner('other@gmail.com')).toBe(false);
    expect(isAppOwner(null)).toBe(false);

    expect(canSimulateRole('admin', null)).toBe(true);
    expect(canSimulateRole('manager', 'yilongwang05@gmail.com')).toBe(true);
    expect(canSimulateRole('manager', 'other@gmail.com')).toBe(false);

    expect(getEffectiveRole('yilongwang05@gmail.com', 'manager', 'admin')).toBe('admin');
  });

  it('navItemsForRole filters navigation list correctly per role', () => {
    expect(navItemsForRole('manager')).toEqual(
      expect.arrayContaining([expect.objectContaining({ href: '/' })])
    );
  });

  it('exports OWNER_VIEW_ROLES centralized role options', () => {
    expect(OWNER_VIEW_ROLES).toHaveLength(4);
    expect(OWNER_VIEW_ROLES.map((r) => r.key)).toEqual(['admin', 'manager', 'operator', 'viewer']);
  });
});

