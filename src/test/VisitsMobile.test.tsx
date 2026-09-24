import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VisitsMobile from '../views/VisitsMobile';
import type { Contact, Home, Visit } from '../types';

// The page's lib chain imports src/lib/firebase, which calls initializeApp at
// module scope using firebase-applet-config.json's (empty) apiKey — the real
// key comes from .env, which CI doesn't have. Mock the firebase modules like
// Visits.test.tsx does so the suite runs keyless.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', WRITE: 'WRITE' },
  logActivity: vi.fn(),
}));

const visit = (overrides: Partial<Visit> = {}): Visit => ({
  id: 'v1',
  date: '2026-08-13',
  contactIds: ['c1'],
  contactNames: ['Ama Osei'],
  went: ['u1'],
  wentNames: ['Mei Tanaka'],
  where: 'Whitman Hall',
  purpose: '',
  how: 'Sat on the floor and talked about her dad.',
  followUp: '',
  photos: [],
  createdAt: '2026-08-13T12:00:00.000Z',
  createdById: 'u1',
  createdByName: 'Mei Tanaka',
  ...overrides,
});

const home = (overrides: Partial<Home> = {}): Home => ({
  id: 'h1',
  label: 'the Oseis',
  members: ['c1'],
  active: true,
  ...overrides,
});

const contact = (id: string, name: string): Contact => ({ id, name } as Contact);

const baseProps = {
  visits: [] as Visit[],
  groups: { thisWeek: [] as Visit[], lastWeek: [] as Visit[], earlier: [] as Visit[] },
  stats: { visits: 0, peopleSeen: 0, wentOut: 0 },
  homes: [] as Home[],
  contacts: [] as Contact[],
  tab: 'reading' as const,
  setTab: vi.fn(),
  toggle: (
    <div>
      <button type="button">Who we haven't seen</button>
      <button type="button">The log</button>
    </div>
  ),
  openId: null,
  setOpenId: vi.fn(),
  onOpenContact: vi.fn(),
  onLog: vi.fn(),
  onLogForHome: vi.fn(),
  onEdit: vi.fn(),
  onRemove: vi.fn(),
  onManageHomes: vi.fn(),
};

describe('VisitsMobile', () => {
  it('opens on the reading and invites the first home', () => {
    render(<VisitsMobile {...baseProps} />);
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Who we haven't seen" })).toBeInTheDocument();
    expect(screen.getByText(/No homes yet/)).toBeInTheDocument();
    expect(screen.getByText('Manage homes')).toBeInTheDocument();
  });

  it('renders the reading/log toggle the parent provides', () => {
    render(<VisitsMobile {...baseProps} />);
    expect(screen.getByRole('button', { name: 'The log' })).toBeInTheDocument();
  });

  it('counts the homes we have been round to this week and last', () => {
    render(
      <VisitsMobile
        {...baseProps}
        tab="log"
        visits={[visit()]}
        groups={{ thisWeek: [visit()], lastWeek: [visit({ id: 'v2' }), visit({ id: 'v3' })], earlier: [] }}
        stats={{ visits: 3, peopleSeen: 2, wentOut: 2 }}
      />
    );
    expect(screen.getByText('1 home')).toBeInTheDocument();
    expect(screen.getByText(/2 last week/)).toBeInTheDocument();
    expect(screen.getByText("people we've sat with")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing here yet/)).not.toBeInTheDocument();
  });

  it('only shows the groups that have visits in them', () => {
    render(
      <VisitsMobile
        {...baseProps}
        tab="log"
        visits={[visit()]}
        groups={{ thisWeek: [visit()], lastWeek: [], earlier: [] }}
      />
    );
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.queryByText('Last week')).not.toBeInTheDocument();
    expect(screen.queryByText('Earlier')).not.toBeInTheDocument();
  });

  it('opens the log with nobody pre-picked from the header action', () => {
    const onLog = vi.fn();
    render(<VisitsMobile {...baseProps} onLog={onLog} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Log a visit' })[0]);
    expect(onLog).toHaveBeenCalledWith();
  });

  it('logs a visit for a home straight from the reading row', () => {
    const onLogForHome = vi.fn();
    const h = home();
    render(
      <VisitsMobile
        {...baseProps}
        homes={[h]}
        contacts={[contact('c1', 'Ama Osei')]}
        onLogForHome={onLogForHome}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Log a visit: Ama Osei' }));
    expect(onLogForHome).toHaveBeenCalledWith(h);
  });

  it('opens home management from the reading', () => {
    const onManageHomes = vi.fn();
    render(<VisitsMobile {...baseProps} onManageHomes={onManageHomes} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage homes' }));
    expect(onManageHomes).toHaveBeenCalled();
  });

  it('does not overlay the ⋯ menu on top of the who-went avatar (#687)', () => {
    render(
      <VisitsMobile
        {...baseProps}
        tab="log"
        visits={[visit()]}
        groups={{ thisWeek: [visit()], lastWeek: [], earlier: [] }}
      />,
    );

    // The avatar (initials "MT") and the ⋯ trigger ("More for Ama Osei") must
    // share the right-hand meta column of the toggle button — the dots sit
    // next to the avatar, not on top of it.
    const actions = screen.getByTestId('visit-card-actions');
    expect(within(actions).getByText('MT')).toBeInTheDocument();
    const dots = within(actions).getByRole('button', { name: 'More for Ama Osei' });

    // No ancestor of the actions column should be an absolute overlay that
    // would cover the avatar.
    const card = actions.closest('article');
    let walker: HTMLElement | null = actions;
    while (walker && walker !== card) {
      expect(walker.className).not.toMatch(/\babsolute\b/);
      walker = walker.parentElement;
    }

    // Clicking the dots should not toggle the card.
    fireEvent.click(dots);
    expect(dots).toHaveAttribute('aria-expanded', 'true');
    const toggle = card!.querySelector('button[aria-expanded]');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});