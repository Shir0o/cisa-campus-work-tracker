import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import OutreachBoard from '../views/OutreachBoard';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import React from 'react';

// ── Module-level mocks ──────────────────────────────────────────────────────

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

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
      createdAt: '2026-06-10T00:00:00.000Z',
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
      avatar: 'http://example.com/avatar.png',
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

    // Header shows total people count. Match the exact count phrase rather
    // than /3/, which also matches incidental digits like relative dates
    // ("Last connected 13 days ago") and is therefore date-dependent.
    expect(screen.getByText('3 people')).toBeInTheDocument();
    expect(screen.getByText(/in our care/i)).toBeInTheDocument();
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

  // ── 14. Stage and Contact modifications ──
  it('submits a new stage successfully', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });
    const { addDoc } = await import('firebase/firestore');

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    const shapeBtn = await screen.findByRole('button', { name: /Shape the journey/i });
    fireEvent.click(shapeBtn);

    const input = screen.getByPlaceholderText(/e\.g\. Following up/i);
    fireEvent.change(input, { target: { value: 'New Test Stage' } });

    // Select color button
    const colorBtn = screen.getByTitle('Sage');
    fireEvent.click(colorBtn);

    const submitBtn = screen.getByRole('button', { name: /Add this step/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'stages' }),
        expect.objectContaining({
          label: 'New Test Stage',
          color: 'bg-board-teal',
          order: 2,
        })
      );
    });
  });

  it('submits edits to an existing stage and migrates contacts', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });
    const { updateDoc, writeBatch } = await import('firebase/firestore');

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    // Wait for loading to clear
    await screen.findByText('Alice Chen');

    // Click column header menu for "First Contact"
    const firstContactHeader = screen.getByRole('heading', { name: 'First Contact', level: 3 });
    const columnHeaderContainer = firstContactHeader.parentElement?.parentElement?.parentElement;
    const menuBtn = columnHeaderContainer?.querySelector('button[aria-label="Stage options"]')!;
    fireEvent.click(menuBtn);

    const renameBtn = screen.getByRole('button', { name: /Rename step/i });
    fireEvent.click(renameBtn);

    const input = screen.getByPlaceholderText(/e\.g\. Following up/i);
    fireEvent.change(input, { target: { value: 'Updated First Contact' } });

    const submitBtn = screen.getByRole('button', { name: /Save changes/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'stages/s1' }),
        expect.objectContaining({
          label: 'Updated First Contact',
        })
      );
      expect(writeBatch).toHaveBeenCalled();
    });
  });

  it('handles stage deletion confirmation', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });
    const { deleteDoc } = await import('firebase/firestore');
    const confirmSpy = vi.spyOn(window, 'confirm');

    // Cancel deletion
    confirmSpy.mockReturnValueOnce(false);
    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    // Wait for loading to clear
    await screen.findByText('Alice Chen');

    const firstContactHeader = screen.getByRole('heading', { name: 'First Contact', level: 3 });
    const columnHeaderContainer = firstContactHeader.parentElement?.parentElement?.parentElement;
    const menuBtn = columnHeaderContainer?.querySelector('button[aria-label="Stage options"]')!;
    fireEvent.click(menuBtn);

    const removeBtn = screen.getByRole('button', { name: /Remove step/i });
    fireEvent.click(removeBtn);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Remove this step'));
    expect(deleteDoc).not.toHaveBeenCalled();

    // Confirm deletion
    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(menuBtn);
    fireEvent.click(screen.getByRole('button', { name: /Remove step/i }));
    
    expect(deleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'stages/s1' })
    );

    confirmSpy.mockRestore();
  });

  it('handles firestore query errors for stages', async () => {
    const { handleFirestoreError } = await import('../lib/firebase');
    const mockError = new Error('Permission denied');
    
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, error?: any) => {
      if (error) {
        error(mockError);
      }
      return vi.fn();
    });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    expect(handleFirestoreError).toHaveBeenCalledWith(
      mockError,
      'LIST',
      'stages'
    );
    expect(screen.getByText(/Couldn't load/)).toBeInTheDocument();
  });

  // ── 15. Role filter menu ─────────────────────────────────────────────
  it('filters contacts by role using the filter menu', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    // Wait for the board to render
    await screen.findByText('Alice Chen');
    expect(screen.getByText('Bob Park')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Find someone/i);
    const filterBtn = searchInput.parentElement?.nextElementSibling?.querySelector('button');
    expect(filterBtn).toBeInTheDocument();

    // Open filter menu
    fireEvent.click(filterBtn!);
    expect(await screen.findByText('Filter by role')).toBeInTheDocument();

    // Click Student role button
    const studentFilterBtn = screen.getByRole('button', { name: 'Student' });
    fireEvent.click(studentFilterBtn);

    // Verify Bob (Leader) is filtered out, but Alice (Student) is still there
    await waitFor(() => {
      expect(screen.getByText('Alice Chen')).toBeInTheDocument();
      expect(screen.queryByText('Bob Park')).not.toBeInTheDocument();
    });

    // Reopen and select 'All'
    fireEvent.click(filterBtn!);
    const allFilterBtn = screen.getByRole('button', { name: 'All' });
    fireEvent.click(allFilterBtn);

    await waitFor(() => {
      expect(screen.getByText('Alice Chen')).toBeInTheDocument();
      expect(screen.getByText('Bob Park')).toBeInTheDocument();
    });
  });

  // ── 16. Escape key closes add-stage modal ────────────────────────────
  it('closes the add-stage modal when Escape key is pressed', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    const shapeBtn = await screen.findByRole('button', { name: /Shape the journey/i });
    fireEvent.click(shapeBtn);

    // Modal title
    expect(await screen.findByRole('heading', { name: /Shape the journey/i, level: 2 })).toBeInTheDocument();

    // Advance timers so useEffect registers keydown listener
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Fire Escape key
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    // Verify modal is closed
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Shape the journey/i, level: 2 })).not.toBeInTheDocument();
    });
  });

  // ── 17. Empty columns and footer text ────────────────────────────────
  it('renders "No one here just now." in empty columns and correct footer text', async () => {
    // Only Alice is in First Contact. Regular has no contacts.
    setupOnSnapshotWith({
      stages: mockStages,
      contacts: [
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
            notes: '',
            phone: '',
            lastSeen: '',
          }),
        },
      ],
    });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    await screen.findByText('First Contact');

    // First Contact has Alice
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
    // Regular has no contacts, shows empty column text
    expect(screen.getByText('No one here just now.')).toBeInTheDocument();

    // Verify footer texts
    expect(screen.getByRole('button', { name: 'Welcome someone new' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to Regular' })).toBeInTheDocument();
  });

  // ── 18. Default stage seeding ────────────────────────────────────────
  it('seeds default stages when stages collection is empty and user is admin', async () => {
    const { addDoc } = await import('firebase/firestore');
    // Mock onSnapshot to return empty stages at first
    setupOnSnapshotWith({ stages: [] });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(3);
    });

    expect(addDoc).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: 'stages' }),
      expect.objectContaining({ label: 'First Contact', color: 'bg-primary-fixed-dim', order: 0 })
    );
    expect(addDoc).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: 'stages' }),
      expect.objectContaining({ label: 'Second Contact', color: 'bg-primary', order: 1 })
    );
    expect(addDoc).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ path: 'stages' }),
      expect.objectContaining({ label: 'Regular', color: 'bg-secondary', order: 2 })
    );
  });

  // ── 19. Delete contact with confirmation via React fiber ─────────────
  it('deletes a contact when confirmed', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });
    const { deleteDoc } = await import('firebase/firestore');
    const confirmSpy = vi.spyOn(window, 'confirm');

    // 1. User cancels
    confirmSpy.mockReturnValueOnce(false);

    const { container } = render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    const cardName = await screen.findByText('Alice Chen');

    // Find and call onDeleteContact prop using fiber traversal
    const fiberKey = Object.keys(cardName).find(
      (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    );
    expect(fiberKey).toBeDefined();
    const fiberNode = (cardName as any)[fiberKey!];
    
    let onDeleteContactProp: ((id: string) => Promise<void>) | undefined;
    let current = fiberNode;
    while (current) {
      if (current.memoizedProps && current.memoizedProps.onDeleteContact) {
        onDeleteContactProp = current.memoizedProps.onDeleteContact;
        break;
      }
      current = current.return;
    }
    expect(onDeleteContactProp).toBeDefined();

    await onDeleteContactProp!('c1');
    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this person?');
    expect(deleteDoc).not.toHaveBeenCalled();

    // 2. User confirms
    confirmSpy.mockReturnValueOnce(true);
    await onDeleteContactProp!('c1');
    expect(deleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'contacts/c1' })
    );

    confirmSpy.mockRestore();
  });

  // ── 20. Modal backdrop, close and cancel clicks ──────────────────────
  it('closes the add-stage modal on clicking backdrop or close/cancel buttons', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    const shapeBtn = await screen.findByRole('button', { name: /Shape the journey/i });
    
    // 1. Test Cancel button
    fireEvent.click(shapeBtn);
    expect(await screen.findByRole('heading', { name: /Shape the journey/i, level: 2 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Shape the journey/i, level: 2 })).not.toBeInTheDocument();
    });

    // 2. Test Close button (X)
    fireEvent.click(shapeBtn);
    expect(await screen.findByRole('heading', { name: /Shape the journey/i, level: 2 })).toBeInTheDocument();
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Shape the journey/i, level: 2 })).not.toBeInTheDocument();
    });

    // 3. Test Backdrop click
    fireEvent.click(shapeBtn);
    expect(await screen.findByRole('heading', { name: /Shape the journey/i, level: 2 })).toBeInTheDocument();
    const backdrop = document.querySelector('.bg-black\\/40');
    fireEvent.click(backdrop!);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Shape the journey/i, level: 2 })).not.toBeInTheDocument();
    });
  });

  // ── 21. Drag and drop between columns ────────────────────────────────
  it('handles drag and drop events and updates contact stage', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });
    const { updateDoc } = await import('firebase/firestore');

    const { container } = render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    await screen.findByText('Alice Chen');

    // Traverse React fiber tree to find DndContext props
    const fiberKey = Object.keys(container.firstChild as any).find(
      (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    );
    expect(fiberKey).toBeDefined();
    const fiberNode = (container.firstChild as any)[fiberKey!];

    function findDndContextProps(node: any): any {
      // 1. Try upwards (ancestors) since DndContext is a parent of container's child
      let curr = node;
      while (curr) {
        if (curr.memoizedProps && curr.memoizedProps.onDragStart && curr.memoizedProps.onDragEnd) {
          return curr.memoizedProps;
        }
        curr = curr.return;
      }
      // 2. Try downwards (descendants) as fallback
      function searchDown(n: any): any {
        if (!n) return null;
        if (n.memoizedProps && n.memoizedProps.onDragStart && n.memoizedProps.onDragEnd) {
          return n.memoizedProps;
        }
        let child = n.child;
        while (child) {
          const found = searchDown(child);
          if (found) return found;
          child = child.sibling;
        }
        return null;
      }
      return searchDown(node);
    }

    const dndProps = findDndContextProps(fiberNode);
    expect(dndProps).not.toBeNull();

    // 1. Simulate onDragStart
    act(() => {
      dndProps.onDragStart({ active: { id: 'c1' } });
    });

    // 2. Simulate onDragOver (drag Alice 'c1' to Regular stage 's2')
    const dndPropsAfterStart = findDndContextProps((container.firstChild as any)[fiberKey!]);
    act(() => {
      dndPropsAfterStart.onDragOver({
        active: { id: 'c1' },
        over: { id: 's2' },
      });
    });

    // 3. Simulate onDragEnd (drop Alice on Regular stage)
    const dndPropsAfterOver = findDndContextProps((container.firstChild as any)[fiberKey!]);
    await act(async () => {
      await dndPropsAfterOver.onDragEnd({
        active: { id: 'c1' },
        over: { id: 's2' },
      });
    });

    // Verify updateDoc is called to save the new stage
    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'contacts/c1' }),
      expect.objectContaining({ stage: 'Regular' })
    );
  });

  // ── 22. Query errors ─────────────────────────────────────────────────
  it('handles stage deletion query errors', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });
    const { deleteDoc } = await import('firebase/firestore');
    const { handleFirestoreError } = await import('../lib/firebase');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const mockError = new Error('Delete failed');
    vi.mocked(deleteDoc).mockRejectedValueOnce(mockError);

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    await screen.findByText('Alice Chen');

    const firstContactHeader = screen.getByRole('heading', { name: 'First Contact', level: 3 });
    const columnHeaderContainer = firstContactHeader.parentElement?.parentElement?.parentElement;
    const menuBtn = columnHeaderContainer?.querySelector('button[aria-label="Stage options"]')!;
    fireEvent.click(menuBtn);

    const removeBtn = screen.getByRole('button', { name: /Remove step/i });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(handleFirestoreError).toHaveBeenCalledWith(mockError, 'DELETE', 'stages');
    });

    confirmSpy.mockRestore();
  });

  it('handles stage creation query errors', async () => {
    const { addDoc } = await import('firebase/firestore');
    const { handleFirestoreError } = await import('../lib/firebase');
    setupOnSnapshotWith({ stages: [] });

    const mockError = new Error('Add failed');
    vi.mocked(addDoc).mockRejectedValueOnce(mockError);

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    await waitFor(() => {
      expect(handleFirestoreError).toHaveBeenCalledWith(mockError, 'CREATE', 'stages');
    });
  });

  it('handles stage rename query errors', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });
    const { updateDoc } = await import('firebase/firestore');
    const { handleFirestoreError } = await import('../lib/firebase');

    const mockError = new Error('Update failed');
    vi.mocked(updateDoc).mockRejectedValueOnce(mockError);

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    await screen.findByText('Alice Chen');

    const firstContactHeader = screen.getByRole('heading', { name: 'First Contact', level: 3 });
    const columnHeaderContainer = firstContactHeader.parentElement?.parentElement?.parentElement;
    const menuBtn = columnHeaderContainer?.querySelector('button[aria-label="Stage options"]')!;
    fireEvent.click(menuBtn);

    const renameBtn = screen.getByRole('button', { name: /Rename step/i });
    fireEvent.click(renameBtn);

    const input = screen.getByPlaceholderText(/e\.g\. Following up/i);
    fireEvent.change(input, { target: { value: 'Updated First Contact' } });

    const submitBtn = screen.getByRole('button', { name: /Save changes/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleFirestoreError).toHaveBeenCalledWith(mockError, 'UPDATE', 'stages');
    });
  });

  it('handles contact deletion query errors', async () => {
    setupOnSnapshotWith({ stages: mockStages, contacts: mockContacts });
    const { deleteDoc } = await import('firebase/firestore');
    const { handleFirestoreError } = await import('../lib/firebase');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const mockError = new Error('Delete contact failed');
    vi.mocked(deleteDoc).mockRejectedValueOnce(mockError);

    render(<OutreachBoard />);
    vi.advanceTimersByTime(900);

    const cardName = await screen.findByText('Alice Chen');
    const fiberKey = Object.keys(cardName).find(
      (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    );
    const fiberNode = (cardName as any)[fiberKey!];
    
    let onDeleteContactProp: ((id: string) => Promise<void>) | undefined;
    let current = fiberNode;
    while (current) {
      if (current.memoizedProps && current.memoizedProps.onDeleteContact) {
        onDeleteContactProp = current.memoizedProps.onDeleteContact;
        break;
      }
      current = current.return;
    }
    
    await onDeleteContactProp!('c1');

    await waitFor(() => {
      expect(handleFirestoreError).toHaveBeenCalledWith(mockError, 'DELETE', 'contacts');
    });

    confirmSpy.mockRestore();
  });
});
