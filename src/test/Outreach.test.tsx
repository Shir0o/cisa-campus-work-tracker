import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Outreach from '../views/Outreach';
import { useAuth } from '../components/AuthProvider';
import { canAccessRoute } from '../lib/permissions';

// ── seeded data ────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
const MS_AGO = (n: number) => Date.now() - n * DAY_MS;

const SEED_NAMES = [
  { id: 'ON-1', name: 'Duy Pham', contact: '+1 (614) 555-0101', spokeWith: 'u1', note: 'Wants a Bible in Vietnamese.', contactId: 'C-1', takenBy: null },
  { id: 'ON-2', name: 'Chloe Baptiste', contact: '+1 (614) 555-0102', spokeWith: 'u3', note: '', contactId: 'C-2', takenBy: null },
];
const SEED_OUTREACH = {
  date: isoDaysAgo(5),
  where: 'Cedar Park — the north lawn',
  went: ['u1', 'u3'],
  others: 8,
  handed: { bibles: 34, tracts: 120, booklets: 26 },
  how: 'Warm afternoon.',
  photoCount: 0,
  names: SEED_NAMES,
};
const SEED_CONTACTS = [
  { id: 'C-1', name: 'Duy Pham', initials: 'DP', stage: 'Lead' },
  { id: 'C-2', name: 'Chloe Baptiste', initials: 'CB', stage: 'Lead' },
];
const SEED_USERS = [
  { id: 'u1', displayName: 'Tony Wang', role: 'admin', approved: true, email: 'tony@example.com' },
  { id: 'u3', displayName: 'Ana Reyes', role: 'manager', approved: true, email: 'ana@example.com' },
];
// A touch on C-1 the day after the outing — Duy has been reached, Chloe hasn't.
const SEED_TOUCHES = [
  { id: 'i1', content: 'Rang him', createdAt: new Date(MS_AGO(4)).toISOString(), refPath: 'contacts/C-1/interactions/i1' },
];

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('firebase/firestore', () => {
  const docOf = (d: { id: string; refPath?: string }) => ({ id: d.id, data: () => d, ref: { path: d.refPath ?? `contacts/${d.id}` } });
  const snap = (docs: unknown[]) => ({ docs: docs.map((d) => docOf(d as { id: string })), size: docs.length, empty: docs.length === 0 });
  return {
    collection: vi.fn((_db, path) => ({ path })),
    collectionGroup: vi.fn((_db, path) => ({ path })),
    query: vi.fn((ref) => ref),
    orderBy: vi.fn(),
    limit: vi.fn(),
    onSnapshot: vi.fn((ref: { path?: string }, callback: (s: unknown) => void) => {
      const path = ref?.path ?? '';
      if (path === 'outreach') callback(snap([SEED_OUTREACH]));
      else if (path === 'contacts') callback(snap(SEED_CONTACTS));
      else if (path === 'users') callback(snap(SEED_USERS));
      else if (path === 'interactions') callback(snap(SEED_TOUCHES));
      else callback(snap([]));
      return () => {};
    }),
    updateDoc: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn(() => Promise.resolve({ id: 'new-outreach-id' })),
    deleteDoc: vi.fn(() => Promise.resolve()),
    doc: vi.fn((_db, path, id) => ({ path, id })),
    getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
  };
});

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

vi.mock('../lib/todos', () => ({
  addTodo: vi.fn(() => Promise.resolve('todo-1')),
}));

vi.mock('../lib/threads', () => ({
  addThreadMessage: vi.fn(() => Promise.resolve()),
}));

vi.mock('../components/modals/ContactDetailsModal', () => ({
  default: () => null,
}));

import { addTodo } from '../lib/todos';
import { updateDoc } from 'firebase/firestore';

describe('Outreach', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'u1', displayName: 'Tony Wang' }, role: 'admin' } as never);
    vi.clearAllMocks();
  });

  it('renders the header, pending queue and figures', async () => {
    render(<Outreach />);
    expect(screen.getByText('Outreach')).toBeTruthy();
    // Chloe has no touch since the outing → still waiting, in the queue.
    expect(await screen.findByText('Chloe Baptiste')).toBeTruthy();
    expect(screen.getByText(/5 days waiting/)).toBeTruthy();
    // Duy was rung the day after → reached, so he is NOT in the pending queue.
    expect(screen.queryByText('Duy Pham')).toBeNull();
    // Expand the outing card to read the names back, reached and all.
    fireEvent.click(screen.getByText('Cedar Park — the north lawn'));
    expect(await screen.findByText('Duy Pham')).toBeTruthy();
    expect(screen.getByText('1 reached')).toBeTruthy();
    // Figures.
    expect(screen.getByText('months out')).toBeTruthy();
    expect(screen.getAllByText('34').length).toBeGreaterThan(0); // Bibles into hands
  });

  it("take claims a name and drops the ring-todo", async () => {
    render(<Outreach />);
    const button = await screen.findByRole('button', { name: "I'll take this" });
    fireEvent.click(button);
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    await waitFor(() => expect(addTodo).toHaveBeenCalled());
    const todoCall = vi.mocked(addTodo).mock.calls[0][0];
    expect(todoCall.title).toContain('Ring Chloe');
    expect(todoCall.assigneeId).toBe('u1');
  });

  it('renders an empty state when nothing has been logged', async () => {
    const { onSnapshot } = await import('firebase/firestore');
    vi.mocked(onSnapshot).mockImplementation(((ref: { path?: string }, callback: (s: unknown) => void) => {
      const path = ref?.path ?? '';
      callback({
        docs: [],
        size: 0,
        empty: true,
      });
      return () => {};
    }) as never);
    render(<Outreach />);
    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
  });

  it('is admin-only — trainees, students and community are locked out', () => {
    expect(canAccessRoute('admin', '/outreach')).toBe(true);
    for (const role of ['manager', 'operator', 'viewer']) {
      expect(canAccessRoute(role, '/outreach')).toBe(false);
    }
  });
});
