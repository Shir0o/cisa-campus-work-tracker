import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import OutreachBoard from '../views/OutreachBoard';

// Regression for #29: the header total bolds every contact on the board
// (including unassigned ones), so the per-stage breakdown must include a
// "not yet placed" term for the Unassigned column — otherwise the numbers
// don't reconcile and it looks like a bug.

const stagesDocs = [
  { id: 's1', data: () => ({ label: 'First Contact', color: 'bg-primary', order: 0 }) },
  { id: 's2', data: () => ({ label: 'Regular', color: 'bg-secondary', order: 1 }) },
];

const contact = (key: string, stage: string) => ({
  id: key,
  data: () => ({
    name: `Person ${key}`,
    role: 'Student',
    email: `${key}@example.com`,
    stage,
    tags: [],
    createdAt: new Date().toISOString(),
  }),
});

// 2 First Contact + 3 Regular + 2 with a stage that isn't an active column
// (→ "Unassigned" / not yet placed). Total = 7.
const contactsDocs = [
  contact('a', 'First Contact'),
  contact('b', 'First Contact'),
  contact('c', 'Regular'),
  contact('d', 'Regular'),
  contact('e', 'Regular'),
  contact('f', 'Unassigned'),
  contact('g', 'Unassigned'),
];

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: '123' },
    isAdmin: true,
    role: 'admin',
    isApproved: true,
    loading: false,
  }),
}));

// Mock Firestore. `collection`/`collectionGroup` tag the ref with the path so
// `onSnapshot` can feed the right data regardless of subscription order.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  collectionGroup: vi.fn((_db, group) => ({ group })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn() })),
  onSnapshot: vi.fn((ref: { path?: string; group?: string }, onNext: (s: unknown) => void) => {
    if (ref?.path === 'stages') onNext({ docs: stagesDocs });
    else if (ref?.path === 'contacts') onNext({ docs: contactsDocs });
    else onNext({ docs: [] });
    return vi.fn();
  }),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  getFirestore: vi.fn(() => ({})),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

vi.mock('../App', () => ({
  useLayout: () => ({
    isSidebarCollapsed: false,
    setIsSidebarCollapsed: vi.fn(),
    setSelectedContact: vi.fn(),
    openNewContact: vi.fn(),
  }),
}));

describe('OutreachBoard header reconciliation (#29)', () => {
  it('breakdown includes a "not yet placed" term that sums to the bold total', async () => {
    const { container } = render(<OutreachBoard />);
    await screen.findByRole('heading', { name: /The Journey/i, level: 1 });

    const text = (container.textContent || '').replace(/\s+/g, ' ');
    // Bold total counts every contact on the board, unassigned included.
    expect(text).toContain('7 people walking it');
    // Per-stage breakdown reconciles: 2 + 3 + 2 = 7.
    expect(text).toMatch(/2 first contact, 3 regular, 2 not yet placed\./);
  });
});
