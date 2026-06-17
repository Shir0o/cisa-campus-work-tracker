import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import OutreachBoard from '../views/OutreachBoard';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import React from 'react';

// ── Module-level mocks ──────────────────────────────────────────────────────

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../App', () => ({
  useLayout: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  collectionGroup: vi.fn((_db, group) => ({ group })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-id' })),
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id })),
  deleteDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  setDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  onSnapshot: vi.fn((_ref, callback: any) => {
    callback({ docs: [] });
    return vi.fn();
  }),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  limit: vi.fn(),
  getFirestore: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => 'mock-ts'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

// ── Fixture data ────────────────────────────────────────────────────────────

const staleDateISO = new Date(Date.now() - 10 * 86_400_000).toISOString();

const mockStages = [
  { id: 's1', data: () => ({ label: 'First Contact', color: 'bg-board-amber', order: 0 }) },
  { id: 's2', data: () => ({ label: 'Regular', color: 'bg-board-teal', order: 1 }) },
];

const mockContacts = [
  {
    id: 'c1',
    data: () => ({
      name: 'Alice Chen',
      initials: 'AC',
      stage: 'First Contact',
      email: 'alice@example.com',
      role: 'Student',
      location: 'North Campus',
      tags: ['Freshman'],
      notes: 'Met at orientation',
      phone: '',
      lastSeen: '',
    }),
  },
  {
    id: 'c2',
    data: () => ({
      name: 'Bob Park',
      initials: 'BP',
      stage: 'Regular',
      email: 'bob@example.com',
      role: 'Leader',
      location: '',
      tags: [],
      phone: '',
      lastSeen: '',
    }),
  },
  {
    id: 'c3',
    data: () => ({
      name: 'Charlie Kim',
      initials: 'CK',
      stage: 'Unknown Stage',
      email: 'charlie@example.com',
      role: 'Student',
      location: '',
      tags: [],
      phone: '',
      lastSeen: '',
    }),
  },
];

const mockInteractions = [
  {
    id: 'i1',
    ref: { path: 'contacts/c1/interactions/i1' },
    data: () => ({ contactId: 'c1', content: 'Coffee chat', createdAt: staleDateISO }),
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sets up a path-routing onSnapshot that feeds different data to different
 * Firestore collections / collectionGroups.
 */
function setupOnSnapshotWith({
  stages = [] as typeof mockStages,
  contacts = [] as typeof mockContacts,
  interactions = [] as typeof mockInteractions,
  comments = [] as { id: string; ref: { path: string }; data: () => Record<string, unknown> }[],
} = {}) {
  vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
    const path: string = ref?.path ?? '';
    const group: string = ref?.group ?? '';

    if (path === 'stages') {
      callback({ docs: stages });
    } else if (path === 'contacts') {
      callback({ docs: contacts });
    } else if (group === 'interactions') {
      callback({ docs: interactions });
    } else if (group === 'comments') {
      callback({ docs: comments });
    } else {
      callback({ docs: [] });
    }

    return vi.fn(); // unsubscribe
  });
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('OutreachBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Default: admin user, empty data
    (useAuth as any).mockReturnValue({
      user: { uid: '123', displayName: 'Admin User', email: 'admin@test.com' },
      isAdmin: true,
      role: 'admin',
      isApproved: true,
      loading: false,
    });

    (useLayout as any).mockReturnValue({
      isSidebarCollapsed: false,
      setIsSidebarCollapsed: vi.fn(),
      setSelectedContact: vi.fn(),
      openNewContact: vi.fn(),
    });

    // Default onSnapshot: all empty
    setupOnSnapshotWith();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. Existing: header ───────────────────────────────────────────────
  it('renders the "The Journey" header', async () => {
    render(<OutreachBoard />);
    // setTimeout inside the component delays setLoading(false) by 800ms
    vi.advanceTimersByTime(900);
    expect(await screen.findByRole('heading', { name: /The Journey/i, level: 1 })).toBeInTheDocument();
  });

  // ── 2. Existing: search input ─────────────────────────────────────────
  it('renders search input with correct placeholder', async () => {
    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);
    expect(await screen.findByPlaceholderText(/Find someone/i)).toBeInTheDocument();
  });

  // ── 3. Existing: empty state ──────────────────────────────────────────
  it('shows the empty journey state when no stages exist', async () => {
    // For admin with empty stages, the component tries to seed defaults.
    // We use a non-admin to see the pure empty state without seeding.
    (useAuth as any).mockReturnValue({
      user: { uid: '456' },
      isAdmin: false,
      role: 'operator',
      isApproved: true,
      loading: false,
    });
    setupOnSnapshotWith(); // all empty

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);
    expect(await screen.findByText(/journey hasn't been mapped yet/i)).toBeInTheDocument();
  });

  // ── 4. Existing: admin button ─────────────────────────────────────────
  it('shows the "Shape the journey" button for admin users', async () => {
    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);
    expect(await screen.findByRole('button', { name: /Shape the journey/i })).toBeInTheDocument();
  });

  // ── 5. Populated board with stages and contacts ───────────────────────
  it('renders stage columns and contact cards when data is present', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    // Stage column headers
    expect(await screen.findByText('First Contact')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument();

    // Contact names
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
    expect(screen.getByText('Bob Park')).toBeInTheDocument();

    // Header shows total people count
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/walking it/i)).toBeInTheDocument();
  });

  // ── 6. Non-admin: no "Shape the journey" button ───────────────────────
  it('hides the "Shape the journey" button for non-admin users', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: '456' },
      isAdmin: false,
      role: 'operator',
      isApproved: true,
      loading: false,
    });
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    // Wait for the board to render (stage headers appear)
    await screen.findByText('First Contact');
    expect(screen.queryByRole('button', { name: /Shape the journey/i })).not.toBeInTheDocument();
  });

  // ── 7. Search filtering ───────────────────────────────────────────────
  it('filters contacts when typing in the search box', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    const searchInput = await screen.findByPlaceholderText(/Find someone/i);

    // Both visible before search
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
    expect(screen.getByText('Bob Park')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    await waitFor(() => {
      expect(screen.getByText('Alice Chen')).toBeInTheDocument();
      expect(screen.queryByText('Bob Park')).not.toBeInTheDocument();
    });
  });

  // ── 8. Add-stage modal ────────────────────────────────────────────────
  it('opens the add-stage modal with form elements', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    const shapeBtn = await screen.findByRole('button', { name: /Shape the journey/i });
    fireEvent.click(shapeBtn);

    // Modal title for new stage
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Shape the journey/i, level: 2 })).toBeInTheDocument();
    });

    // Stage name input with placeholder
    expect(screen.getByPlaceholderText(/e\.g\. Following up/i)).toBeInTheDocument();

    // Colour label
    expect(screen.getByText('Colour')).toBeInTheDocument();

    // Submit button
    expect(screen.getByRole('button', { name: /Add this step/i })).toBeInTheDocument();

    // Cancel button
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  // ── 9. Unmapped contacts appear in "Unassigned" column ────────────────
  it('shows unmapped contacts in an "Unassigned" column', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    // Charlie has stage "Unknown Stage" which doesn't match any stage
    // The Unassigned column label is "Unassigned"
    await waitFor(() => {
      expect(screen.getByText('Unassigned')).toBeInTheDocument();
      expect(screen.getByText('Charlie Kim')).toBeInTheDocument();
    });
  });

  // ── 10. KanbanCard details ────────────────────────────────────────────
  it('renders card details: sub-info, notes, and tags', async () => {
    setupOnSnapshotWith({
      stages: mockStages,
      contacts: mockContacts,
      interactions: mockInteractions,
    });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    await screen.findByText('Alice Chen');

    // Sub-info: role · location
    expect(screen.getByText('Student · North Campus')).toBeInTheDocument();

    // Tag
    expect(screen.getByText('Freshman')).toBeInTheDocument();
  });

  // ── 11. Overdue dot / connected label for stale contact ───────────────
  it('shows "Last connected N days ago" for stale contacts', async () => {
    setupOnSnapshotWith({
      stages: mockStages,
      contacts: mockContacts,
      interactions: mockInteractions,
    });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    await screen.findByText('Alice Chen');

    // Alice's last interaction was 10 days ago
    expect(screen.getByText(/Last connected 10 days ago/i)).toBeInTheDocument();
  });

  // ── 12. Header breakdown ─────────────────────────────────────────────
  it('shows per-stage breakdown in the header', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    await screen.findByText('Alice Chen');

    expect(screen.getAllByText(/first contact/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/regular/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not yet placed/i).length).toBeGreaterThan(0);
  });

  // ── 13. Loading skeleton ──────────────────────────────────────────────
  it('shows the loading skeleton before data arrives', () => {
    // Never fire the callback → loading stays true
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());

    render(<OutreachBoard />);

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});
