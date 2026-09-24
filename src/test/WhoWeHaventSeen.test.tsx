import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WhoWeHaventSeen, { rollingMonths, sinceWords } from '../components/visits/WhoWeHaventSeen';
import type { Contact, Home, Visit } from '../types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
}));
vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', WRITE: 'WRITE' },
  logActivity: vi.fn(),
}));

const home = (overrides: Partial<Home> = {}): Home => ({
  id: 'h1',
  label: 'the Oseis',
  members: ['c1', 'c2'],
  place: 'Whitman Hall',
  active: true,
  ...overrides,
});

const contact = (id: string, name: string): Contact => ({ id, name } as Contact);

const visit = (id: string, date: string, contactIds: string[]): Visit =>
  ({
    id,
    date,
    contactIds,
    contactNames: [],
    went: [],
    wentNames: [],
    where: '',
    purpose: '',
    how: '',
    followUp: '',
    photos: [],
    createdAt: '',
    createdById: '',
    createdByName: '',
  }) as Visit;

const baseProps = {
  homes: [] as Home[],
  contacts: [] as Contact[],
  visits: [] as Visit[],
  onLogVisit: vi.fn(),
  onManageHomes: vi.fn(),
};

describe('rollingMonths / sinceWords', () => {
  it('labels the twelve rolling months, oldest first', () => {
    expect(rollingMonths(new Date('2026-08-13T12:00:00'))).toEqual([
      'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
    ]);
  });

  it('says never, today, a day count, then months, then years', () => {
    expect(sinceWords(null)).toBe('never');
    expect(sinceWords(0)).toBe('today');
    expect(sinceWords(1)).toBe('yesterday');
    expect(sinceWords(12)).toBe('12d');
    expect(sinceWords(45)).toBe('1mo');
    expect(sinceWords(400)).toBe('1y');
  });
});

const todayISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('WhoWeHaventSeen', () => {
  it('invites the first home when the roster is empty', () => {
    render(<WhoWeHaventSeen {...baseProps} />);
    expect(screen.getByText(/No homes yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add a home' }));
    expect(baseProps.onManageHomes).toHaveBeenCalled();
  });

  it('groups homes and members, marking the months someone was seen', () => {
    const homes = [home({ members: ['c1', 'c2'] })];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    const visits = [visit('v1', todayISO(), ['c1'])];
    render(<WhoWeHaventSeen {...baseProps} homes={homes} contacts={contacts} visits={visits} />);

    expect(screen.getByText('the Oseis')).toBeInTheDocument();
    expect(screen.getByText('Whitman Hall')).toBeInTheDocument();
    expect(screen.getByText('Ama Osei')).toBeInTheDocument();
    expect(screen.getByText('Bo Chen')).toBeInTheDocument();
    // Ama was seen 3 days ago; Bo was never visited — reads as a gap.
    expect(screen.getByText('3d')).toBeInTheDocument();
    expect(screen.getByText('never')).toBeInTheDocument();
    // Exactly one seen-month mark: Ama's row. Bo's row is all gaps.
    expect(screen.getAllByText('', { selector: '[data-seen="true"]' })).toHaveLength(1);
  });

  it('flags a home nobody has ever been round to', () => {
    const homes = [home({ members: ['c1'] })];
    const contacts = [contact('c1', 'Ama Osei')];
    render(<WhoWeHaventSeen {...baseProps} homes={homes} contacts={contacts} />);
    expect(screen.getByText('never been round')).toBeInTheDocument();
  });

  it('logs a visit from a person row, passing the home', () => {
    const onLogVisit = vi.fn();
    const homes = [home()];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    render(
      <WhoWeHaventSeen {...baseProps} homes={homes} contacts={contacts} onLogVisit={onLogVisit} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Log a visit: Ama Osei' }));
    expect(onLogVisit).toHaveBeenCalledWith(homes[0]);
  });

  it('hides an inactive home and skips members whose contact is gone', () => {
    const homes = [
      home({ id: 'h1', members: ['c1', 'ghost'] }),
      home({ id: 'h2', label: 'the Chens', members: ['c2'], active: false }),
    ];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    render(<WhoWeHaventSeen {...baseProps} homes={homes} contacts={contacts} />);
    expect(screen.getByText('the Oseis')).toBeInTheDocument();
    expect(screen.queryByText('the Chens')).not.toBeInTheDocument();
    expect(screen.queryByText('ghost')).not.toBeInTheDocument();
  });

  it('says nobody lives there yet for an empty home', () => {
    const homes = [home({ members: [] })];
    render(<WhoWeHaventSeen {...baseProps} homes={homes} />);
    expect(screen.getByText('the Oseis')).toBeInTheDocument();
    expect(screen.getByText(/Nobody lives here yet/)).toBeInTheDocument();
  });
});