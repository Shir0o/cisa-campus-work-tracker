import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Visits from '../views/Visits';
import { useAuth } from '../components/AuthProvider';
import { deleteVisit, subscribeVisits } from '../lib/visits';
import { logActivity } from '../lib/firebase';
import type { Visit } from '../types';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((ref, cb) => {
    cb({ docs: contactDocs(ref) });
    return vi.fn();
  }),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', WRITE: 'WRITE' },
  logActivity: vi.fn(),
}));

// Only the reads are mocked — the grouping/overdue helpers are the real ones,
// so this exercises the same logic the page ships with.
vi.mock('../lib/visits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/visits')>();
  return { ...actual, subscribeVisits: vi.fn(), deleteVisit: vi.fn(() => Promise.resolve()) };
});

vi.mock('../components/modals/ContactDetailsModal', () => ({
  default: ({ isOpen, contact }: any) => (isOpen ? <div>Contact: {contact?.name}</div> : null),
}));
vi.mock('../components/modals/LogVisitModal', () => ({
  default: ({ isOpen, visit, initialContactId }: any) =>
    isOpen ? <div>Log modal: {visit ? `editing ${visit.id}` : `seed ${initialContactId ?? 'none'}`}</div> : null,
}));

const contactDocs = (ref: { path?: string }) => {
  if (ref?.path === 'contacts') {
    return [
      { id: 'c1', data: () => ({ name: 'Ama Osei', location: 'Whitman Hall' }) },
      { id: 'c2', data: () => ({ name: 'Bo Chen', location: 'Ridgewood House' }) },
    ];
  }
  if (ref?.path === 'users') {
    return [
      { id: 'u1', data: () => ({ displayName: 'Mei Tanaka', role: 'admin', approved: true }) },
      { id: 'u9', data: () => ({ displayName: 'Ana Beltrán', role: 'manager', approved: true }) },
    ];
  }
  return [];
};

// Local 'YYYY-MM-DD' — toISOString() would use UTC and slip the day either side
// of midnight, which is exactly what the page's noon-parsing avoids.
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const today = () => daysAgo(0);

const visit = (overrides: Partial<Visit> = {}): Visit => ({
  id: 'v1',
  date: today(),
  contactIds: ['c1'],
  contactNames: ['Ama Osei'],
  went: ['u1'],
  wentNames: ['Mei Tanaka'],
  where: 'Whitman Hall',
  purpose: '',
  how: 'Sat on the floor and talked about her dad.',
  followUp: '',
  photos: [],
  createdAt: '',
  createdById: 'u1',
  createdByName: 'Mei Tanaka',
  ...overrides,
});

const emitVisits = (list: Visit[]) => {
  (subscribeVisits as unknown as ReturnType<typeof vi.fn>).mockImplementation((cb: (v: Visit[]) => void) => {
    cb(list);
    return vi.fn();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { uid: 'u1', displayName: 'Mei Tanaka' },
    effectiveUserId: 'u1',
    role: 'admin',
    isAdmin: true,
  });
  emitVisits([]);
});

describe('Visits', () => {
  it('invites a first visit when the record is empty', async () => {
    render(<Visits />);
    await waitFor(() => expect(screen.getByText('Visits')).toBeInTheDocument());
    expect(screen.getByText("Where we've been")).toBeInTheDocument();
    expect(screen.getByText(/No visits logged this week yet/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
  });

  it('groups the record and reads back what we did this week', async () => {
    emitVisits([visit(), visit({ id: 'v2', date: daysAgo(30), contactIds: ['c2'], contactNames: ['Bo Chen'] })]);
    render(<Visits />);
    await waitFor(() => expect(screen.getByText('This week')).toBeInTheDocument());
    expect(screen.getByText('1 home')).toBeInTheDocument();
    expect(screen.getByText('Earlier')).toBeInTheDocument();
    expect(screen.getByText('Ama Osei')).toBeInTheDocument();
    // Two people seen, one of us has gone out.
    expect(screen.getByText("people we've sat with")).toBeInTheDocument();
  });

  it('nudges about a home nobody has been round to in three weeks', async () => {
    emitVisits([visit({ date: daysAgo(40) })]);
    render(<Visits />);
    await waitFor(() => expect(screen.getByText("We haven't been round in a while")).toBeInTheDocument());
    expect(screen.getByText(/Last visit 40 days ago/)).toBeInTheDocument();
  });

  it('opens the log with the nudged person already picked', async () => {
    emitVisits([visit({ date: daysAgo(40) })]);
    render(<Visits />);
    await waitFor(() => expect(screen.getByText("We haven't been round in a while")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Log a visit' })[1]);
    expect(screen.getByText('Log modal: seed c1')).toBeInTheDocument();
  });

  it('opens a person from a visit', async () => {
    emitVisits([visit()]);
    render(<Visits />);
    await waitFor(() => expect(screen.getByText('Ama Osei')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    // The avatar's initials are part of the button's accessible name ("AOAma Osei").
    fireEvent.click(screen.getByRole('button', { name: /Ama Osei$/ }));
    expect(screen.getByText('Contact: Ama Osei')).toBeInTheDocument();
  });

  it('removes a visit only after it is confirmed, and says so in the record', async () => {
    emitVisits([visit()]);
    render(<Visits />);
    await waitFor(() => expect(screen.getByText('Ama Osei')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: /Remove$/ }));
    expect(screen.getByText('Remove it from the record?')).toBeInTheDocument();
    expect(deleteVisit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(deleteVisit).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' })));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'removed a visit to' }));
  });

  it("reads back the prayer's own words, not just that there was one", async () => {
    emitVisits([visit({ prayerId: 'p1', prayerBurden: "Her mum's recovery" })]);
    render(<Visits />);
    await waitFor(() => expect(screen.getByText('Ama Osei')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText("Her mum's recovery")).toBeInTheDocument();
    expect(screen.getByText('now on our hearts')).toBeInTheDocument();
  });

  it('still says something for a visit logged before we kept the words', async () => {
    emitVisits([visit({ prayerId: 'p1' })]);
    render(<Visits />);
    await waitFor(() => expect(screen.getByText('Ama Osei')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('A prayer came out of this visit')).toBeInTheDocument();
  });

  it('marks a photo whose file has gone rather than showing a broken one', async () => {
    emitVisits([visit({ photos: [{ path: 'visits/v1/1.jpg', url: '', name: 'room.jpg' }] })]);
    render(<Visits />);
    await waitFor(() => expect(screen.getByText('Ama Osei')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTitle('room.jpg')).toBeInTheDocument();
  });

  it('opens an existing visit for editing', async () => {
    emitVisits([visit()]);
    render(<Visits />);
    await waitFor(() => expect(screen.getByText('Ama Osei')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: /Edit this visit/ }));
    expect(screen.getByText('Log modal: editing v1')).toBeInTheDocument();
  });

  it('surfaces a failed read instead of leaving the page loading', async () => {
    (subscribeVisits as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_cb: unknown, onError: (e: unknown) => void) => {
        onError(new Error('permission-denied'));
        return vi.fn();
      },
    );
    render(<Visits />);
    await waitFor(() => expect(screen.queryByText(/Gathering where we've been/)).not.toBeInTheDocument());
    expect(screen.queryByText(/Nothing here yet/)).not.toBeInTheDocument();
  });
});
