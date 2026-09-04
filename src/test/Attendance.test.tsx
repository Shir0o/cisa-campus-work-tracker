import './useMediaQuery.mock';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import Attendance from '../views/Attendance';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import React from 'react';

// Mock dependencies
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
  onSnapshot: vi.fn((ref, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  updateDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-event-id' })),
  deleteDoc: vi.fn(() => Promise.resolve()),
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
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="sync-sheet-modal">Sync with Google Sheet</div> : null,
}));

vi.mock('../components/modals/AddEventModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="add-event-modal">Add Event Modal</div> : null,
}));

vi.mock('../components/modals/EditEventModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="edit-event-modal">Edit Event Modal</div> : null,
}));

vi.mock('../components/modals/ManageGatheringTypesModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="manage-types-modal">Manage Types</div> : null,
}));

vi.mock('../lib/gatheringTypes', () => ({
  useGatheringTypes: () => [
    { id: 't1', name: 'Weekly', blurb: 'Friday night, the whole fellowship', order: 0 },
    { id: 't2', name: 'Small Group', blurb: 'A handful, around a table', order: 1 },
    { id: 't3', name: 'Special', blurb: '', order: 2 },
    { id: 't4', name: 'Outreach', blurb: '', order: 3 },
  ],
  blurbOf: (types: any[], name?: string) => types.find((t) => t.name === name)?.blurb ?? '',
  seedDefaultGatheringTypesIfEmpty: vi.fn(() => Promise.resolve()),
}));

vi.mock('../components/modals/ContactDetailsModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="contact-details-modal">Contact Details</div> : null,
}));

const mockContacts = [
  {
    id: 'c1',
    data: () => ({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      role: 'Student',
      stage: 'Lead',
      attendance: {
        e3: true, // Attended only event 3 (so missed event 1 and event 2)
      },
    }),
  },
  {
    id: 'c2',
    data: () => ({
      name: 'Bob Lee',
      email: 'bob@example.com',
      role: 'Student',
      stage: 'Lead',
      attendance: {
        e1: true, // Attended latest event
      },
    }),
  },
];

const mockEvents = [
  {
    id: 'e1',
    data: () => ({
      name: 'Friday Gathering 1',
      date: '2026-06-12',
      type: 'Weekly',
      order: 1,
      roster: ['c1', 'c2'],
    }),
  },
  {
    id: 'e2',
    data: () => ({
      name: 'Friday Gathering 2',
      date: '2026-06-05',
      type: 'Weekly',
      order: 2,
      roster: ['c1', 'c2'],
    }),
  },
  {
    id: 'e3',
    data: () => ({
      name: 'Small Group 1',
      date: '2026-05-29',
      type: 'Small Group',
      order: 3,
      roster: ['c1', 'c2'],
    }),
  },
];

describe('Attendance', () => {
  const mockSetSelectedContact = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'events') {
        callback({ docs: mockEvents, size: 3 });
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
      setSelectedContact: mockSetSelectedContact,
    });

    global.URL.createObjectURL = vi.fn(() => 'mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('renders loading state initially by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());
    render(<Attendance />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('surfaces a load error when a listener fails', async () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, onError?: any) => {
      onError?.(new Error('permission-denied'));
      return vi.fn();
    });

    render(<Attendance />);

    expect(await screen.findByText(/Couldn't load/)).toBeInTheDocument();
  });

  it('renders title and loaded events stats', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Gatherings')).toBeInTheDocument();
      expect(screen.getByText('3 times')).toBeInTheDocument();
    });
  });

  it('filters events based on type filter pills', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Friday Gathering 1')).toBeInTheDocument();
    });

    // Select the 'Small Group' filter (pills now show the managed type names)
    const smallGroupsFilter = screen.getByRole('button', { name: 'Small Group' });
    fireEvent.click(smallGroupsFilter);

    expect(screen.queryByText('Friday Gathering 1')).not.toBeInTheDocument();
    expect(screen.getByText('Small Group 1')).toBeInTheDocument();
  });

  it('handles clicking the log gathering button to open modal', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Log a gathering')).toBeInTheDocument();
    });

    const logButton = screen.getByText('Log a gathering');
    fireEvent.click(logButton);

    expect(screen.getByTestId('add-event-modal')).toBeInTheDocument();
  });

  it('renders the missed contacts section and allows interactions', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText("Who we've missed lately")).toBeInTheDocument();
      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    });

    // Click "Open" on Alice in the missed section
    const openBtn = screen.getAllByRole('button', { name: 'Open' })[0];
    fireEvent.click(openBtn);
    
    // Expect the ContactDetailsModal to open
    expect(screen.getByTestId('contact-details-modal')).toBeInTheDocument();
  });

  it('handles expanding a session and cycling attendance', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Friday Gathering 1')).toBeInTheDocument();
    });

    // Expand Friday Gathering 1
    const headerBtn = screen.getByText('Friday Gathering 1');
    fireEvent.click(headerBtn);

    // Expect to see attendance lists
    expect(screen.getByText(/Attended/i)).toBeInTheDocument();
    expect(screen.getByText(/We missed/i)).toBeInTheDocument();

    // Toggle Bob Lee (who is present for e1)
    const bobBtn = screen.getByRole('button', { name: /Bob Lee/ });
    fireEvent.click(bobBtn);

    expect(updateDoc).toHaveBeenCalled();
  });

  it('allows exporting to CSV', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    const exportBtn = screen.getByText('Export');
    fireEvent.click(exportBtn);

    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('allows deleting an event', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Friday Gathering 1')).toBeInTheDocument();
    });

    // Click trash icon button
    const deleteBtn = screen.getAllByTitle('Remove gathering')[0];
    fireEvent.click(deleteBtn);

    expect(deleteDoc).toHaveBeenCalled();
  });

  it('opens edit event modal when pencil button is clicked', async () => {
    const { container } = render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Friday Gathering 1')).toBeInTheDocument();
    });

    const editBtn = screen.getAllByTitle('Edit gathering')[0];
    fireEvent.click(editBtn);

    expect(screen.getByTestId('edit-event-modal')).toBeInTheDocument();
  });

  it('cycles attendance for absent contact in expanded gathering', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Friday Gathering 1')).toBeInTheDocument();
    });

    // Expand Friday Gathering 1 (e1, where Alice is absent)
    fireEvent.click(screen.getByText('Friday Gathering 1'));

    // Alice is in "We missed" section for e1
    const aliceBtn = screen.getByTitle('Tap to mark present');
    fireEvent.click(aliceBtn);

    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        attendance: expect.objectContaining({ e1: true }),
        lastSeen: '2026-06-12',
        lastContactedDate: '2026-06-12',
        lastContactedBy: 'Test User',
        lastContactedById: 'u-test',
        hasNewActivity: true,
      }),
    );
  });

  it('offers a make-a-to-do for an absent person (issue #336)', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Friday Gathering 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Friday Gathering 1'));

    // Alice is absent from e1 — a make-a-to-do affordance sits beside her.
    const makeTodo = screen.getByTitle('Make a to-do to check on Alice Johnson');
    fireEvent.click(makeTodo);

    // The composer opens pre-filled to check on her, and can be committed.
    expect(screen.getByPlaceholderText('What needs doing?')).toHaveValue('Check on Alice');
    fireEvent.click(screen.getByRole('button', { name: /add to-do/i }));
  });

  it('opens manage gathering types modal when gear button is clicked', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText(/Manage kinds/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Manage kinds/));
    expect(screen.getByTestId('manage-types-modal')).toBeInTheDocument();
  });

  it('opens sync sheet modal', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Sync sheet')).toBeInTheDocument();
    });

    const syncBtn = screen.getByText('Sync sheet');
    fireEvent.click(syncBtn);

    expect(screen.getByTestId('sync-sheet-modal')).toBeInTheDocument();
  });

  it('renders coming up section for future events', async () => {
    const futureDate = new Date(Date.now() + 10 * 86_400_000).toISOString().split('T')[0];
    const futureEvents = [
      {
        id: 'e-future',
        data: () => ({
          name: 'Upcoming Retreat',
          date: futureDate,
          type: 'Special',
          location: 'Camp Ground',
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'events') {
        callback({ docs: futureEvents, size: 1 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Coming up')).toBeInTheDocument();
      expect(screen.getAllByText('Upcoming Retreat').length).toBeGreaterThan(0);
    });
  });

  it('allows checking in a walk-in attendee via search and creating an inline contact', async () => {
    // Contact c3 is not on the roster for e1
    const extraContact = {
      id: 'c3',
      data: () => ({
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        role: 'Student',
        stage: 'Lead',
        attendance: {},
      }),
    };

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: [...mockContacts, extraContact], size: 3 });
      } else if (ref?.path === 'events') {
        callback({ docs: mockEvents, size: 3 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Friday Gathering 1')).toBeInTheDocument();
    });

    // Expand session e1
    fireEvent.click(screen.getByText('Friday Gathering 1'));

    // Search for non-roster contact Charlie
    const searchInput = screen.getByPlaceholderText(/Add attendee or walk-in/i);
    fireEvent.change(searchInput, { target: { value: 'Charlie' } });

    // Check in Charlie
    const checkInBtn = screen.getByText('Charlie Brown').closest('button')!;
    fireEvent.click(checkInBtn);

    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        attendance: expect.objectContaining({ e1: true }),
      }),
    );

    // Search for a brand-new walk-in who is not in the system
    fireEvent.change(searchInput, { target: { value: 'New Visitor' } });

    const createBtn = screen.getByRole('button', { name: /Create contact "New Visitor"/i });
    fireEvent.click(createBtn);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'New Visitor',
        role: 'Student',
        stage: 'Lead',
        attendance: expect.objectContaining({ e1: true }),
      }),
    );
  });

  it('renders AttendanceMobile on mobile viewport even while loading', async () => {
    const { useMediaQuery } = await import('../lib/useMediaQuery');
    vi.mocked(useMediaQuery).mockReturnValue(true);
    // On mobile with no events yet (loading state)
    render(<Attendance />);
    await waitFor(() => {
      // AttendanceMobile container rendered
      expect(document.querySelector('.gthm')).toBeTruthy();
    });
  });
});
