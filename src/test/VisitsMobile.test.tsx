import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VisitsMobile from '../views/VisitsMobile';
import type { Contact, Visit } from '../types';

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

const baseProps = {
  visits: [] as Visit[],
  groups: { thisWeek: [] as Visit[], lastWeek: [] as Visit[], earlier: [] as Visit[] },
  overdue: [],
  stats: { visits: 0, peopleSeen: 0, wentOut: 0 },
  openId: null,
  setOpenId: vi.fn(),
  onOpenContact: vi.fn(),
  onLog: vi.fn(),
  onEdit: vi.fn(),
  onRemove: vi.fn(),
};

describe('VisitsMobile', () => {
  it('invites a first visit when there is nothing on the record', () => {
    render(<VisitsMobile {...baseProps} />);
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByText(/No visits logged this week yet/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
  });

  it('counts the homes we have been round to this week and last', () => {
    render(
      <VisitsMobile
        {...baseProps}
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
        visits={[visit()]}
        groups={{ thisWeek: [visit()], lastWeek: [], earlier: [] }}
      />
    );
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.queryByText('Last week')).not.toBeInTheDocument();
    expect(screen.queryByText('Earlier')).not.toBeInTheDocument();
  });

  it('nudges about a home we have not been round to, carrying the promise we made', () => {
    const contact = { id: 'c1', name: 'Ama Osei', location: 'Whitman Hall' } as Contact;
    const onLog = vi.fn();
    render(
      <VisitsMobile
        {...baseProps}
        onLog={onLog}
        overdue={[{ contact, visit: visit({ followUp: 'Ask after her mum' }), daysAgo: 43 }]}
      />
    );
    expect(screen.getByText("We haven't been round in a while")).toBeInTheDocument();
    expect(screen.getByText(/Last visit 43 days ago/)).toBeInTheDocument();
    expect(screen.getByText(/you said you'd ask after her mum/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Log a visit' })[1]);
    expect(onLog).toHaveBeenCalledWith('c1');
  });

  it('opens the log with nobody pre-picked from the header action', () => {
    const onLog = vi.fn();
    render(<VisitsMobile {...baseProps} onLog={onLog} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Log a visit' })[0]);
    expect(onLog).toHaveBeenCalledWith();
  });

  it('opens the overdue contact profile from the Open button', () => {
    const contact = { id: 'c1', name: 'Ama Osei', location: 'Whitman Hall' } as Contact;
    const onOpenContact = vi.fn();
    render(
      <VisitsMobile
        {...baseProps}
        onOpenContact={onOpenContact}
        overdue={[{ contact, visit: visit(), daysAgo: 12 }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpenContact).toHaveBeenCalledWith('c1');
  });

  it('logs a visit from the empty-state action', () => {
    const onLog = vi.fn();
    render(<VisitsMobile {...baseProps} onLog={onLog} />);
    // empty state renders two "Log a visit" buttons (header + empty card); use the last
    fireEvent.click(screen.getAllByRole('button', { name: 'Log a visit' }).at(-1)!);
    expect(onLog).toHaveBeenCalledWith();
  });
});
