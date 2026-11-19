/**
 * Role-based permissions validation.
 *
 * Uses TEST_USERS fixtures to verify, for each role:
 *   - canAccessRoute() returns the correct boolean for every route
 *   - Sidebar renders exactly the expected nav items
 *   - MobileNav renders the correct bottom destinations per role (#1806)
 *   - RoleGuard redirects to the correct fallback route when access is denied
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TEST_USERS, type TestUser } from './fixtures/users';
import { canAccessRoute, hasMinRole, defaultRouteForRole, roleLabel, effectiveRole, NAV_ITEMS, canSeeContact, canManageCollaborators, canRemoveContactMember, canReleaseContact, visibleToOf, visibleContacts, canSeeHistory, canSeeSettings, navItemsForRole, canSeePrefs, canSeeBoardNotes, isAppOwner, canSimulateRole, getEffectiveRole, OWNER_VIEW_ROLES, navExternalFor, primaryNavFor, moreNavFor, isRealPerson, pickableStaff, pickableContacts, groupedNavFor, TRAINEE_ROUTES } from '../lib/permissions';
import * as permissionsModule from '../lib/permissions';
import { applyPartners } from '../lib/partners';
import TopNav from '../components/layout/TopNav';
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
  seasonForDate: (d: Date = new Date()) => {
    const month = d.getMonth();
    return month <= 1 ? 'winter' : month <= 4 ? 'spring' : month <= 6 ? 'summer' : 'fall';
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

vi.mock('../components/layout/SeasonChip', () => ({
  default: () => <div data-testid="season-chip" />,
}));

vi.mock('../components/layout/GlobalSearch', () => ({
  default: () => <div data-testid="global-search" />,
}));

vi.mock('../components/layout/NotificationCenter', () => ({
  default: () => <div data-testid="notification-center" />,
}));

vi.mock('../App', () => {
  // One stub for both accessors — the trail reads the optional one.
  const layout = () => ({
    isMobileMenuOpen: false,
    setIsMobileMenuOpen: vi.fn(),
    openNewContact: vi.fn(),
    openLogInteraction: vi.fn(),
    searchOpen: false,
    setSearchOpen: vi.fn(),
  });
  return { useLayout: layout, useOptionalLayout: layout };
});

vi.mock('motion/react', () => ({
  motion: {
    nav: ({ children, ...props }: any) => <nav {...props}>{children}</nav>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALL_ROUTES = NAV_ITEMS.map(i => i.href).concat(['/feedback', '/bible-study/present', 'https://shared-calendar-6u6.pages.dev/']);

function renderTopNav() {
  return render(
    <MemoryRouter>
      <TopNav />
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
    // '/bible-study/present' is any signed-in user's: the code anyone in the
    // room may hold up. Only '/bible-study' — the archive — stays admin.
    manager:  ['/', '/directory', '/feedback', '/settings', '/bible-study/present'],
    admin:    ['/attendance', '/prayer', '/settings', '/feedback', '/', '/directory', '/history', '/coordination', '/answered', '/bible-study', '/bible-study/present', '/around', '/ask', 'https://shared-calendar-6u6.pages.dev/'],
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

  // Student and Community are gone. A stored legacy role is not a rung on the
  // ladder any more: it reaches nothing, the person page included.
  it.each(['operator', 'viewer', 'student', 'community'])('a legacy %s role reaches no route', (legacy) => {
    for (const route of [...ALL_ROUTES, '/people/c1', '/contact', '/bible-study/read']) {
      expect(canAccessRoute(legacy, route), `${legacy} should NOT access ${route}`).toBe(false);
    }
  });

  // The signed-in reader, "This week's study", is cut: the public QR reader
  // is the week. A Trainee's old bookmark goes home, not to a sibling.
  it('a Trainee no longer reaches the signed-in study reader', () => {
    expect(canAccessRoute('manager', '/bible-study/read')).toBe(false);
    expect(NAV_ITEMS.some((i) => i.href === '/bible-study/read')).toBe(false);
  });

  it('allows approved roles to open the person detail URL route', () => {
    expect(canAccessRoute('manager', '/people/c1')).toBe(true);
    expect(canAccessRoute('admin', '/people/c1')).toBe(true);
    expect(canAccessRoute(null, '/people/c1')).toBe(false);

    expect(canAccessRoute('manager', '/contact')).toBe(true);
    expect(canAccessRoute('admin', '/contact')).toBe(true);
    expect(canAccessRoute('manager', '/contact/c1')).toBe(true);
  });
});

// ─── 2. hasMinRole() ─────────────────────────────────────────────────────────

describe('hasMinRole()', () => {
  it('enforces manager < admin, the only two roles', () => {
    expect(hasMinRole('admin', 'admin')).toBe(true);
    expect(hasMinRole('admin', 'manager')).toBe(true);

    expect(hasMinRole('manager', 'admin')).toBe(false);
    expect(hasMinRole('manager', 'manager')).toBe(true);

    expect(hasMinRole(null, 'manager')).toBe(false);
  });

  it('gives a legacy Student or Community role no rung at all', () => {
    for (const legacy of ['operator', 'viewer', 'student', 'community']) {
      expect(hasMinRole(legacy, 'manager'), legacy).toBe(false);
      expect(hasMinRole(legacy, 'admin'), legacy).toBe(false);
    }
  });
});

// ─── 2b. effectiveRole() — reading a stored role ────────────────────────────

describe('effectiveRole()', () => {
  it('passes the two roles through', () => {
    expect(effectiveRole('admin')).toBe('admin');
    expect(effectiveRole('manager')).toBe('manager');
  });

  it('maps a legacy Student or Community role to no role, without throwing', () => {
    for (const legacy of ['operator', 'viewer', 'student', 'community']) {
      expect(effectiveRole(legacy), legacy).toBeNull();
    }
  });

  it('maps a missing or unknown role to no role', () => {
    expect(effectiveRole(null)).toBeNull();
    expect(effectiveRole('')).toBeNull();
    expect(effectiveRole('owner')).toBeNull();
  });
});

// ─── 3. defaultRouteForRole() ────────────────────────────────────────────────

describe('defaultRouteForRole()', () => {
  it('sends every approved role to the role-based home', () => {
    expect(defaultRouteForRole('admin')).toBe('/');
    expect(defaultRouteForRole('manager')).toBe('/');
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
    expect(roleLabel(null)).toBe('Guest');
    expect(roleLabel('')).toBe('Guest');
    expect(roleLabel('unregistered_role')).toBe('Unregistered_role');
  });

  it('handles fallback cases for canAccessRoute, hasMinRole, and defaultRouteForRole', () => {
    // canAccessRoute fallback for invalid role
    expect(canAccessRoute('invalid_role', '/')).toBe(false);
    // canAccessRoute fallback for unknown path (falls back to minRole = admin)
    expect(canAccessRoute('manager', '/unknown-route')).toBe(false);
    expect(canAccessRoute('admin', '/unknown-route')).toBe(true);

    // hasMinRole fallback for invalid role
    expect(hasMinRole('invalid_role', 'manager')).toBe(false);

    // defaultRouteForRole fallback for invalid role
    expect(defaultRouteForRole('invalid_role')).toBe('/attendance');
  });
});

// ─── 4. TopNav primary tabs + More menu per role ───────────────────────────

describe('TopNav primary tabs per role', () => {
  beforeEach(() => vi.clearAllMocks());

  it('manager: Home and People; hides gatherings/prayer/calendar', () => {
    currentUser = TEST_USERS.manager;
    renderTopNav();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('The Journey')).not.toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.queryByText('Shared Calendar')).not.toBeInTheDocument();
    expect(screen.queryByText('Looking back')).not.toBeInTheDocument();
    expect(screen.queryByText('Gatherings')).not.toBeInTheDocument();
    expect(screen.queryByText('On our hearts')).not.toBeInTheDocument();
    expect(screen.queryByText('My Day')).not.toBeInTheDocument();
  });

  it('admin: Coordination Notes, People, On our hearts as primary tabs, home labeled "My Day" in More', () => {
    currentUser = TEST_USERS.admin;
    renderTopNav();
    expect(screen.getByText('Coordination Notes')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('On our hearts')).toBeInTheDocument();
    expect(primaryNavFor('admin').map((i) => i.href)).toEqual(['/coordination', '/directory', '/prayer']);
    // Everything else lands in the More menu, alphabetically sorted.
    const moreHrefs = moreNavFor('admin').map((i) => i.href);
    for (const href of ['/', '/history', '/attendance', '/answered', '/around']) {
      expect(moreHrefs).toContain(href);
    }
    const adminMoreLabels = moreNavFor('admin').map((i) => (i.href === '/' ? 'My Day' : i.label));
    expect(adminMoreLabels).toEqual([
      'Answered',
      'Around the team',
      'Bible study',
      'Gatherings',
      'Looking back',
      'My Day',
      'To ask',
      'Your reports',
    ]);
  });

  it('navExternalFor returns external items according to role', () => {
    expect(navExternalFor('admin').map((i) => i.id)).toContain('calendar');
    expect(navExternalFor('manager')).toEqual([]);
    expect(navExternalFor(null)).toEqual([]);
  });

  it('primaryNavFor / moreNavFor never overlap and exclude Settings', () => {
    for (const role of ['admin', 'manager'] as const) {
      const primary = new Set(primaryNavFor(role).map((i) => i.href));
      const more = moreNavFor(role).map((i) => i.href);
      for (const href of more) {
        expect(primary.has(href), `${role} more ${href} not in primary`).toBe(false);
      }
      expect(more.includes('/settings')).toBe(false);
    }
  });
});

// ─── 5. MobileNav per role ───────────────────────────────────────────────────
//
// #1806 / ADR 0049: the bar reads two destinations for a trainee and for a
// Full-timer (Messages and Questions both left it, cut-or-keep §5, §20). The
// centred search FAB gave up its slot — the phone header already carries a
// search button, so nothing left the shell's reach.

describe('MobileNav', () => {
  beforeEach(() => vi.clearAllMocks());

  it('manager (trainee): shows both destinations', () => {
    currentUser = TEST_USERS.manager;
    renderMobileNav();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('Messages')).not.toBeInTheDocument();
    expect(screen.queryByText('Questions')).not.toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
  });

  it('admin: shows My Day and the other destination', () => {
    currentUser = TEST_USERS.admin;
    renderMobileNav();
    expect(screen.getByText('My Day')).toBeInTheDocument();
    expect(screen.queryByText('Messages')).not.toBeInTheDocument();
    expect(screen.queryByText('Questions')).not.toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
  });

  it('spends no slot on search under any role', () => {
    for (const user of Object.values(TEST_USERS)) {
      currentUser = user;
      const { unmount } = renderMobileNav();
      expect(screen.queryByRole('button', { name: /search/i })).not.toBeInTheDocument();
      unmount();
    }
    currentUser = TEST_USERS.admin;
  });
});

// ─── 6. Trainee permission helpers ─────────────────────────────────────────

describe('Trainee permission helpers (canSeeContact, visibleContacts, canSeeHistory, canSeeSettings)', () => {

  it('canSeeContact allows a full-timer any contact', () => {
    const contact = { id: 'c1', createdBy: 'other-user', coCreators: [] };
    expect(canSeeContact('admin', 'u1', contact)).toBe(true);
  });

  // The roster used to open to Students and Community too. Only a Full-timer
  // reads everyone now, the same as the rules' seesAllContacts().
  it('canSeeContact gives a legacy or missing role no one they are not tied to', () => {
    const contact = { id: 'c1', createdBy: 'other-user', coCreators: [] };
    expect(canSeeContact('operator', 'u1', contact)).toBe(false);
    expect(canSeeContact('viewer', 'u1', contact)).toBe(false);
    expect(canSeeContact(null, 'u1', contact)).toBe(false);
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

  it('canSeeContact lets a founder see the person even when they are neither creator nor collaborator (#1049)', () => {
    const founded = { id: 'c1', createdBy: 'u2', founders: ['u2', 'u1'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', founded)).toBe(true);
    const notFounder = { id: 'c2', createdBy: 'u2', founders: ['u2', 'u3'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', notFounder)).toBe(false);
  });

  it('canSeeContact lets a carer see the person they hold in their sheep (#1051)', () => {
    const cared = { id: 'c1', createdBy: 'u2', carers: ['u1', 'u3'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', cared)).toBe(true);
    expect(canSeeContact('manager', 'u3', cared)).toBe(true);
    const notCarer = { id: 'c2', createdBy: 'u2', carers: ['u3'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', notCarer)).toBe(false);
  });

  it('no longer widens a trainee to a current-term partner who is not a founder (#1054)', () => {
    // u1 and u2 are paired in the active term ("Fall 2026")
    applyPartners({ 'Fall 2026': [['u1', 'u2']] }, new Date(2026, 8, 1));

    // Contact created by partner u2 in the current term, but u1 is not a founder.
    const partnerContactCurrent = { id: 'c4', createdBy: 'u2', season: 'Fall 2026', coCreators: [] };
    expect(canSeeContact('manager', 'u1', partnerContactCurrent)).toBe(false);

    // The dynamic widening is gone: no term or tag makes u2's contact reach u1.
    const noSeason = { id: 'c5', createdBy: 'u2', coCreators: [] };
    expect(canSeeContact('manager', 'u1', noSeason)).toBe(false);
    const tagOnly = { id: 'c6', createdBy: 'u2', tags: ['Fall 2026'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', tagOnly)).toBe(false);

    // u1 sees the person only when they founded it — whatever the term.
    const founded = { id: 'c7', createdBy: 'u2', season: 'Fall 2026', founders: ['u2', 'u1'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', founded)).toBe(true);

    // Clean up
    applyPartners({});
  });

  it('visibleContacts filters contacts for trainees', () => {
    const contacts = [
      { id: 'c1', createdBy: 'u2', coCreators: ['u3'] },
      { id: 'c2', createdBy: 'u1', coCreators: [] },
      { id: 'c3', createdBy: 'u2', coCreators: ['u1'] },
    ];

    expect(visibleContacts('admin', 'u1', contacts)).toHaveLength(3);
    expect(visibleContacts('manager', 'u1', contacts)).toEqual([contacts[1], contacts[2]]);

    // #1054: the dynamic widening is retired. A current-term partner who is not
    // a founder adds nothing to u1's visibility.
    applyPartners({ 'Fall 2026': [['u1', 'u2']] }, new Date(2026, 8, 1));
    const partnerContacts = [
      { id: 'c1', createdBy: 'u2', season: 'Fall 2026', founders: ['u2', 'u1'], coCreators: [] },
      { id: 'c2', createdBy: 'u1', season: 'Fall 2026', coCreators: [] },
      { id: 'c3', createdBy: 'u4', season: 'Fall 2026', coCreators: [] },
    ];
    expect(visibleContacts('manager', 'u1', partnerContacts)).toEqual([partnerContacts[0], partnerContacts[1]]);
    applyPartners({});
  });

  it('canSeeHistory and canSeeSettings hide tabs/pages for trainees', () => {
    expect(canSeeHistory('admin')).toBe(true);
    expect(canSeeHistory('manager')).toBe(false);

    expect(canSeeSettings('admin')).toBe(true);
    expect(canSeeSettings('manager')).toBe(false);
  });

  // The decision in #1825: Looking back is the whole team's record, pastoral
  // detail and all, so a Trainee may not read it. Their route access is an
  // allowlist, so this is a guard against /history being added to it rather
  // than a consequence of ROUTE_MIN_ROLE.
  it('a Trainee cannot reach Looking back, and its floor says so', () => {
    expect(canAccessRoute('manager', '/history')).toBe(false);
    expect(navItemsForRole('manager').some((i) => i.href === '/history')).toBe(false);
    expect(canAccessRoute('admin', '/history')).toBe(true);
  });

  // The decision in #1922: coordination pages are the team's record and a
  // Trainee does not read them. The floor reads "manager and above", which
  // would suggest otherwise, so this is a guard against /coordination being
  // added to the allowlist rather than a consequence of ROUTE_MIN_ROLE.
  it('a Trainee cannot reach Coordination Notes, and its floor does not say so', () => {
    expect(canAccessRoute('manager', '/coordination')).toBe(false);
    expect(navItemsForRole('manager').some((i) => i.href === '/coordination')).toBe(false);
    expect(canAccessRoute('admin', '/coordination')).toBe(true);
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
    expect(OWNER_VIEW_ROLES).toHaveLength(2);
    expect(OWNER_VIEW_ROLES.map((r) => r.key)).toEqual(['admin', 'manager']);
  });

  describe('isRealPerson, pickableStaff, pickableContacts (#366, #367)', () => {
    it('identifies real persons correctly', () => {
      expect(isRealPerson({ displayName: 'Tony Wang' })).toBe(true);
      expect(isRealPerson({ name: 'Ama Osei' })).toBe(true);
      expect(isRealPerson({ displayName: 'Jordan Park', role: 'admin' })).toBe(true);
    });

    it('filters out system accounts and service accounts', () => {
      expect(isRealPerson(null)).toBe(false);
      expect(isRealPerson(undefined)).toBe(false);
      expect(isRealPerson({ displayName: '' })).toBe(false);
      expect(isRealPerson({ displayName: 'System Admin', system: true })).toBe(false);
      expect(isRealPerson({ displayName: 'Service Account', serviceAccount: true })).toBe(false);
      expect(isRealPerson({ displayName: 'Sync Job', kind: 'system' })).toBe(false);
      expect(isRealPerson({ displayName: 'Core', role: 'system' })).toBe(false);
    });

    it('filters out test/reviewer/cisa-* account names (#366, #367)', () => {
      expect(isRealPerson({ displayName: 'reviewer' })).toBe(false);
      expect(isRealPerson({ displayName: 'App Store Reviewer' })).toBe(false);
      expect(isRealPerson({ displayName: 'cisa-admin' })).toBe(false);
      expect(isRealPerson({ displayName: 'cisa_sync' })).toBe(false);
      expect(isRealPerson({ displayName: 'cisa.bot' })).toBe(false);
      expect(isRealPerson({ displayName: 'test user' })).toBe(false);
      expect(isRealPerson({ displayName: 'demo-account' })).toBe(false);
      expect(isRealPerson({ displayName: 'bot-notifier' })).toBe(false);
      expect(isRealPerson({ displayName: 'qa-tester' })).toBe(false);
    });

    it('pickableStaff filters out non-real persons', () => {
      const staffList = [
        { uid: 'u1', displayName: 'Mei Tanaka' },
        { uid: 'u2', displayName: 'cisa-service' },
        { uid: 'u3', displayName: 'App Store Reviewer' },
        { uid: 'u4', displayName: 'Jordan Park' },
      ];
      expect(pickableStaff(staffList)).toEqual([
        { uid: 'u1', displayName: 'Mei Tanaka' },
        { uid: 'u4', displayName: 'Jordan Park' },
      ]);
    });

    it('pickableContacts filters out non-real contacts', () => {
      const contactsList = [
        { id: 'c1', name: 'Ama Osei' },
        { id: 'c2', name: 'test contact' },
        { id: 'c3', name: 'Bo Chen' },
      ];
      expect(pickableContacts(contactsList)).toEqual([
        { id: 'c1', name: 'Ama Osei' },
        { id: 'c3', name: 'Bo Chen' },
      ]);
    });
  });
});

// ─── To ask is a Full-timer destination (cut-or-keep §10) ────────────────────
// The notepad keeps its page and gains a nav item where Questions used to sit,
// so it is no longer reachable only from My Day and a contact's page.

describe('To ask is a Full-timer destination', () => {
  it('is reachable by a Full-timer and refused to a Trainee', () => {
    expect(canAccessRoute('admin', '/ask')).toBe(true);
    expect(canAccessRoute('manager', '/ask')).toBe(false);
    expect(canAccessRoute(null, '/ask')).toBe(false);
  });

  it('is a nav item for Full-timers only, in the Today group where Questions sat', () => {
    const item = NAV_ITEMS.find((i) => i.href === '/ask');
    expect(item).toBeDefined();
    expect(item!.label).toBe('To ask');
    expect(item!.minRole).toBe('admin');

    const today = groupedNavFor('admin').find((g) => g.label === 'Today')!;
    const hrefs = today.items.map((i) => i.href);
    expect(hrefs).toContain('/ask');
    // Questions sat between Coordination Notes and Around the team.
    expect(hrefs.indexOf('/ask')).toBe(hrefs.indexOf('/coordination') + 1);
  });

  it('is absent from a Trainee\'s navigation entirely', () => {
    const trainee = [...primaryNavFor('manager'), ...moreNavFor('manager')].map((i) => i.href);
    expect(trainee).not.toContain('/ask');
    expect(groupedNavFor('manager').flatMap((g) => g.items.map((i) => i.href))).not.toContain('/ask');
  });
});

// ─── Questions for the team is cut (cut-or-keep §5) ──────────────────────────

describe('Questions for the team is gone', () => {
  it('is no longer a route for a Trainee or anyone below (an admin passes any unlisted path; App sends it home)', () => {
    for (const role of ['manager', 'operator', 'viewer', null]) {
      expect(canAccessRoute(role, '/questions'), String(role)).toBe(false);
    }
  });

  it('is not a nav destination, nor on a Trainee\'s allowlist', () => {
    expect(NAV_ITEMS.some((i) => i.href === '/questions')).toBe(false);
    expect(TRAINEE_ROUTES).not.toContain('/questions');
    const trainee = [...primaryNavFor('manager'), ...moreNavFor('manager')].map((i) => i.href);
    expect(trainee).not.toContain('/questions');
    expect(moreNavFor('admin').map((i) => i.href)).not.toContain('/questions');
  });
});

// ── Around the team, moved out of the feed (#943) ──────────────────────────
// The destination is Full-timer-only: the team's activity is pastoral detail,
// and a Trainee's My Day shows their own work and nothing else.

describe('Around the team as its own destination (#943)', () => {
  it('is reachable by a Full-timer and refused to a Trainee', () => {
    expect(canAccessRoute('admin', '/around')).toBe(true);
    expect(canAccessRoute('manager', '/around')).toBe(false);
    expect(canAccessRoute('operator', '/around')).toBe(false);
    expect(canAccessRoute('viewer', '/around')).toBe(false);
    expect(canAccessRoute(null, '/around')).toBe(false);
  });

  it('is labelled "Around the team" — the phrase the team already says', () => {
    const item = NAV_ITEMS.find((i) => i.href === '/around');
    expect(item).toBeDefined();
    expect(item!.label).toBe('Around the team');
    expect(item!.minRole).toBe('admin');
  });

  it('lands in the More menu for a Full-timer, never in the primary tabs', () => {
    expect(primaryNavFor('admin').map((i) => i.href)).not.toContain('/around');
    expect(moreNavFor('admin').map((i) => i.href)).toContain('/around');
  });

  it('is absent from a Trainee\'s navigation entirely', () => {
    const trainee = [...primaryNavFor('manager'), ...moreNavFor('manager')].map((i) => i.href);
    expect(trainee).not.toContain('/around');
  });
});

// ── Outreach is cut ─────────────────────────────────────────────────────────
// The monthly park outing log is gone (cut-or-keep §2): no nav entry and no
// seeing/logging predicates.

describe('Outreach is cut', () => {
  it('has no nav entry and no predicates', () => {
    expect(NAV_ITEMS.some((i) => i.href === '/outreach')).toBe(false);
    expect('canSeeOutreach' in permissionsModule).toBe(false);
    expect('canLogOutreach' in permissionsModule).toBe(false);
  });
});

// Your notes, the submitter's own side of the feedback loop (ADR 0019)
// `/feedback` used to be reachable only by link (the note button outcome and
// the outcome notification). It is a destination now, so it belongs in the rail.

describe('Your notes as its own destination', () => {
  it('is reachable by every role that can leave a note', () => {
    for (const role of ['admin', 'manager'] as const) {
      expect(canAccessRoute(role, '/feedback')).toBe(true);
    }
    expect(canAccessRoute(null, '/feedback')).toBe(false);
  });

  it('is labelled "Your reports" and sits in the rail Today group', () => {
    const item = NAV_ITEMS.find((i) => i.href === '/feedback');
    expect(item).toBeDefined();
    expect(item?.label).toBe('Your reports');
    expect(item?.minRole).toBe('manager');

    const today = groupedNavFor('manager').find((g) => g.label === 'Today');
    expect(today?.items.map((i) => i.href)).toContain('/feedback');
  });

  it('lands in the More menu, never in the primary tabs, for a Full-timer', () => {
    expect(primaryNavFor('admin').map((i) => i.href)).not.toContain('/feedback');
    expect(moreNavFor('admin').map((i) => i.href)).toContain('/feedback');
  });
});

// ── Destination grouping for the rail (issue #662) ───────────────────────────
// The rail (issue #664) consumes this data: ordered groups of destinations a
// given role can reach. The groups and within-group order are fixed by the
// design at docs/design/ink/NavPref.dc.html. Settings is excluded from the
// groups entirely (#711) — it lives in the avatar/profile dropdown.

describe('groupedNavFor() — rail destination groups (#662)', () => {
  // Per-role expectations. Each entry lists the groups (in stable order) and
  // the hrefs inside each. Empty groups are omitted from the output.
  const expectedByRole: Record<string, Array<{ label: string; hrefs: string[] }>> = {
    admin: [
      { label: 'Today', hrefs: ['/', '/coordination', '/ask', '/around', '/feedback'] },
      { label: 'People', hrefs: ['/directory', '/history'] },
      { label: 'Gatherings', hrefs: ['/attendance', '/bible-study'] },
      { label: 'Prayer', hrefs: ['/prayer', '/answered'] },
    ],
    manager: [
      { label: 'Today', hrefs: ['/', '/feedback'] },
      { label: 'People', hrefs: ['/directory'] },
    ],
  };

  it('returns the expected groups for each role, in stable order', () => {
    for (const role of Object.keys(expectedByRole) as Array<keyof typeof expectedByRole>) {
      const groups = groupedNavFor(role);
      expect(groups.map((g) => g.label)).toEqual(expectedByRole[role].map((e) => e.label));
      for (let i = 0; i < groups.length; i++) {
        expect(groups[i].items.map((it) => it.href)).toEqual(expectedByRole[role][i].hrefs);
      }
    }
  });

  it('contains exactly the destinations the role can reach — nothing more, nothing less', () => {
    for (const role of ['admin', 'manager'] as const) {
      const groups = groupedNavFor(role);
      const groupedHrefs = groups.flatMap((g) => g.items.map((it) => it.href));
      const reachable = navItemsForRole(role).map((it) => it.href);
      // The grouping excludes /settings (pinned separately by the shell), so
      // compare against reachable destinations minus settings.
      const reachableNoSettings = reachable.filter((h) => h !== '/settings');
      expect(new Set(groupedHrefs)).toEqual(new Set(reachableNoSettings));
      // Every grouped item must be one the role can actually reach.
      for (const href of groupedHrefs) {
        expect(canAccessRoute(role, href), `${role} can access ${href}`).toBe(true);
      }
    }
  });

  it('Settings is never in the returned groups', () => {
    for (const role of ['admin', 'manager'] as const) {
      const hrefs = groupedNavFor(role).flatMap((g) => g.items.map((it) => it.href));
      expect(hrefs).not.toContain('/settings');
    }
  });

  it('exposes every group label exactly once and never repeats a destination', () => {
    for (const role of ['admin', 'manager'] as const) {
      const groups = groupedNavFor(role);
      const labels = groups.map((g) => g.label);
      expect(new Set(labels).size).toBe(labels.length);
      const allHrefs = groups.flatMap((g) => g.items.map((it) => it.href));
      expect(new Set(allHrefs).size).toBe(allHrefs.length);
    }
  });

  it('returns an empty list for a null/unknown role', () => {
    expect(groupedNavFor(null)).toEqual([]);
    // Unknown string role: nothing reachable, so nothing grouped.
    expect(groupedNavFor('not-a-role')).toEqual([]);
  });

  it('preserves stable ordering across calls (same input → same output shape)', () => {
    for (const role of ['admin', 'manager'] as const) {
      const a = groupedNavFor(role);
      const b = groupedNavFor(role);
      expect(b).toEqual(a);
    }
  });

  it('grouping covers every NAV_ITEMS destination except /settings, exactly once', () => {
    // For a Full-timer every non-settings destination is in some group; this
    // guards against a new NAV_ITEMS entry being added without being placed
    // in a group.
    const adminHrefs = groupedNavFor('admin').flatMap((g) => g.items.map((it) => it.href));
    const navHrefs = NAV_ITEMS.map((it) => it.href).filter((h) => h !== '/settings');
    expect(new Set(adminHrefs)).toEqual(new Set(navHrefs));
  });
});

describe('visibleToOf (web mirror)', () => {
  it('collects every persisted tie, de-duplicated', () => {
    expect(
      visibleToOf({ createdBy: 'u1', addedBy: 'u2', coCreators: ['u3'], founders: ['u1', 'u4'], carers: ['u1', 'u5'] }),
    ).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
  });

  it('returns an empty list when there are no ties', () => {
    expect(visibleToOf({})).toEqual([]);
    expect(visibleToOf(null)).toEqual([]);
  });
});

describe('collaborator management rights (#1054) — web mirror', () => {
  const contact = {
    createdBy: 'u-creator',
    founders: ['u-creator', 'u-founder'],
    coCreators: ['u-founder', 'u-collab'],
  };

  it('canManageCollaborators lets admin, founders and coCreators — never the creator alone', () => {
    expect(canManageCollaborators('admin', 'u-any', contact)).toBe(true);
    expect(canManageCollaborators('manager', 'u-founder', contact)).toBe(true);
    expect(canManageCollaborators('manager', 'u-creator', contact)).toBe(true);
    expect(canManageCollaborators('manager', 'u-collab', contact)).toBe(true);
    // Who typed the name in is not consulted for permission.
    expect(canManageCollaborators('manager', 'u-creator', { coCreators: [] })).toBe(false);
    expect(canManageCollaborators('manager', 'u-random', contact)).toBe(false);
    expect(canManageCollaborators('manager', null, contact)).toBe(false);
  });

  it('canRemoveContactMember: only a Full-timer can remove a founder', () => {
    expect(canRemoveContactMember('admin', 'u-ft', contact, 'u-founder')).toBe(true);
    expect(canRemoveContactMember('manager', 'u-creator', contact, 'u-founder')).toBe(false);
    expect(canRemoveContactMember('manager', 'u-collab', contact, 'u-founder')).toBe(false);
  });

  it('canRemoveContactMember: a deliberately added collaborator is removable by anyone with sharing rights', () => {
    expect(canRemoveContactMember('manager', 'u-founder', contact, 'u-collab')).toBe(true);
    expect(canRemoveContactMember('manager', 'u-collab', contact, 'u-collab')).toBe(true);
    expect(canRemoveContactMember('admin', 'u-ft', contact, 'u-collab')).toBe(true);
    expect(canRemoveContactMember('manager', 'u-other', contact, 'u-collab')).toBe(false);
  });

  it('canReleaseContact: a user tied to a contact who has not yet unfollowed can release themselves (#1498)', () => {
    // Tied via createdBy
    expect(canReleaseContact('t1', { createdBy: 't1' })).toBe(true);
    // Already unfollowed
    expect(canReleaseContact('t1', { createdBy: 't1', unfollowedBy: ['t1'] })).toBe(false);
    // Tied via carers
    expect(canReleaseContact('t2', { carers: ['t2'] })).toBe(true);
    // Untied user cannot release
    expect(canReleaseContact('t9', { createdBy: 't1' })).toBe(false);
    // Missing uid or contact
    expect(canReleaseContact(null, { createdBy: 't1' })).toBe(false);
    expect(canReleaseContact('t1', null)).toBe(false);
  });
});
