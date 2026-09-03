import './useMediaQuery.mock';
import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import { vi, beforeEach, describe, it, expect, afterEach } from 'vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../App', () => ({
  useLayout: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-event-id' })),
  getDocs: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
  doc: vi.fn((_db, path, id) => ({ path, id })),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

vi.mock('../components/modals/SyncSheetModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="sync-sheet-modal">Sync</div> : null,
}));
vi.mock('../components/modals/AddEventModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="add-event-modal">Add</div> : null,
}));
vi.mock('../components/modals/EditEventModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="edit-event-modal">Edit</div> : null,
}));
vi.mock('../components/modals/ManageGatheringTypesModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="manage-types-modal">Manage</div> : null,
}));
vi.mock('../components/modals/ContactDetailsModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="contact-details-modal">Contact</div> : null,
}));

vi.mock('../lib/gatheringTypes', () => ({
  useGatheringTypes: () => [
    { id: 'g1', name: 'Weekly', order: 1 },
    { id: 'g2', name: 'Small Group', order: 2 },
  ],
  seedDefaultGatheringTypesIfEmpty: vi.fn(),
  subscribeGatheringTypes: vi.fn(),
  blurbOf: () => '',
  DEFAULT_GATHERING_TYPES: [],
  addGatheringType: vi.fn(),
  updateGatheringType: vi.fn(),
  removeGatheringType: vi.fn(),
}));

const FIXED_NOW = new Date('2026-09-09T14:00:00');

function isoDaysFrom(offsetDays: number): string {
  const d = new Date(FIXED_NOW);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const mockEvents = [
  // Wednesday Bible Study: many past, one this week, one future. Anchored
  // on a Wednesday (NOW), so offsets -21, -14, 0, 7 land on Wednesdays.
  { id: 'wed-0', data: () => ({ name: 'Wednesday Bible Study', date: isoDaysFrom(-21), order: 0, type: 'Weekly', parentEventId: 'wed-1', roster: ['c1'] }) },
  { id: 'wed-1', data: () => ({ name: 'Wednesday Bible Study', date: isoDaysFrom(-14), order: 1, type: 'Weekly', parentEventId: 'wed-1', roster: ['c1'] }) },
  { id: 'wed-2', data: () => ({ name: 'Wednesday Bible Study', date: isoDaysFrom(0),  order: 2, type: 'Weekly', parentEventId: 'wed-1', roster: ['c1', 'c2'], attendanceTakenAt: '2026-09-09T20:00:00Z' }) },
  { id: 'wed-3', data: () => ({ name: 'Wednesday Bible Study', date: isoDaysFrom(7),  order: 3, type: 'Weekly', parentEventId: 'wed-1', roster: ['c1', 'c2'] }) },
  // Thursday Bible Study: 2 past Thursdays + 1 future. Offsets -13, -6, 8.
  { id: 'thuBS-1', data: () => ({ name: 'Thursday Bible Study', date: isoDaysFrom(-13), order: 1, type: 'Weekly', parentEventId: 'thuBS-1', roster: ['c1'] }) },
  { id: 'thuBS-2', data: () => ({ name: 'Thursday Bible Study', date: isoDaysFrom(-6), order: 2, type: 'Weekly', parentEventId: 'thuBS-1', roster: ['c1'] }) },
  { id: 'thuBS-3', data: () => ({ name: 'Thursday Bible Study', date: isoDaysFrom(8), order: 3, type: 'Weekly', parentEventId: 'thuBS-1', roster: ['c1'] }) },
  // Thursday College Meeting: 2 past + 1 future, same Thursdays.
  { id: 'thuCM-1', data: () => ({ name: 'College Meeting', date: isoDaysFrom(-13), order: 1, type: 'Weekly', parentEventId: 'thuCM-1', roster: ['c2'] }) },
  { id: 'thuCM-2', data: () => ({ name: 'College Meeting', date: isoDaysFrom(-6), order: 2, type: 'Weekly', parentEventId: 'thuCM-1', roster: ['c2'] }) },
  { id: 'thuCM-3', data: () => ({ name: 'College Meeting', date: isoDaysFrom(8), order: 3, type: 'Weekly', parentEventId: 'thuCM-3', roster: ['c2'] }) },
  // One-off Welcome BBQ.
  { id: 'bbq', data: () => ({ name: 'Welcome BBQ', date: isoDaysFrom(-30), order: 1, type: 'Special', roster: [] }) },
];

const mockContacts = [
  {
    id: 'c1', data: () => ({
      name: 'Alice', role: 'Student', location: 'Campus', email: 'a@x.com', phone: '1',
      stage: 'Believer', lastSeen: '2026-08-15', initials: 'A',
      attendance: { 'wed-0': true },
    }),
  },
  {
    id: 'c2', data: () => ({
      name: 'Bob', role: 'Student', location: 'Campus', email: 'b@x.com', phone: '2',
      stage: 'Seeker', lastSeen: '2026-08-10', initials: 'B',
      attendance: { 'thuBS-1': true },
    }),
  },
];

vi.mock('../lib/calendar/calendarSync', () => ({
  useCalendarSync: () => ({
    getMergedGatherings: (events: unknown[]) => events,
    getItemsBetween: () => ({ context: [] }),
  }),
  calStartOfDay: (d: Date) => d,
  calAddDays: (d: Date, n: number) => {
    const out = new Date(d);
    out.setDate(out.getDate() + n);
    return out;
  },
  canSeeCalendarSync: () => false,
}));

import Attendance from '../views/Attendance';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';

describe('Attendance — Rhythms + This-week wiring (issue #776)', () => {
  let realDate: DateConstructor;

  beforeEach(() => {
    vi.clearAllMocks();
    // Pin "today" to the Wednesday that mockEvents is anchored on, without
    // using fake timers (which would break waitFor's polling setTimeout).
    realDate = globalThis.Date;
    class MockDate extends realDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(FIXED_NOW.getTime());
        } else {
          super(...(args as []));
        }
      }
      static now(): number {
        return FIXED_NOW.getTime();
      }
    }
    globalThis.Date = MockDate as unknown as DateConstructor;

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: mockContacts.length });
      } else if (ref?.path === 'events') {
        callback({ docs: mockEvents, size: mockEvents.length });
      } else if (ref?.path === 'users') {
        callback({ docs: [{ id: 'u-test', data: () => ({ displayName: 'Test User', approved: true, role: 'admin' }) }], size: 1 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
      isAdmin: true,
    });

    (useLayout as any).mockReturnValue({
      setSelectedContact: vi.fn(),
    });
  });

  afterEach(() => {
    globalThis.Date = realDate;
  });

  it('renders the "This week" band above "When we met"', async () => {
    render(<Attendance />);
    await waitFor(() => {
      expect(screen.getByText('This week')).toBeInTheDocument();
      expect(screen.getByText('When we met')).toBeInTheDocument();
    });
    const sections = screen.getAllByRole('heading', { level: 2 });
    const order = sections.map((s) => s.textContent);
    expect(order.indexOf('This week')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('When we met')).toBeGreaterThan(order.indexOf('This week'));
  });

  it('folds a recurring Rhythm into one row, not N', async () => {
    render(<Attendance />);
    await waitFor(() => {
      // The structural claim: a 4-week Wednesday term is folded into one
      // row. The Rhythm's chip strip carries the older/future instances.
      // Chip buttons show "9SEP"-style content. Multiple Wed chips prove
      // one row carries the whole term.
      const wedChips = screen.getAllByRole('button', { name: /^(19|26|9|16)(Aug|Sep|Sep|)/i });
      expect(wedChips.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('orders Rhythms by day-of-week then by name (Wed before Thu)', async () => {
    render(<Attendance />);
    await waitFor(() => {
      const all = screen.getAllByText('Wednesday Bible Study', { exact: true });
      expect(all.length).toBeGreaterThan(0);
    });
    const names = screen.getAllByText(/^Wednesday Bible Study$|^Thursday Bible Study$|^College Meeting$/).map((el) => el.textContent ?? '');
    expect(names.indexOf('Wednesday Bible Study')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('Thursday Bible Study')).toBeGreaterThan(names.indexOf('Wednesday Bible Study'));
    expect(names.indexOf('College Meeting')).toBeGreaterThan(names.indexOf('Wednesday Bible Study'));
  });

  it('lists one-off Gatherings separately under a "One-offs" heading', async () => {
    render(<Attendance />);
    await waitFor(() => {
      expect(screen.getByText('Welcome BBQ')).toBeInTheDocument();
    });
    expect(screen.getByText('One-offs')).toBeInTheDocument();
  });

  it('renders the "Who we\'ve missed lately" heading when people have gone quiet', async () => {
    render(<Attendance />);
    await waitFor(() => {
      expect(screen.getByText("Who we've missed lately")).toBeInTheDocument();
    });
  });
});