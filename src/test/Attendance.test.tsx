import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
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

const mockContacts = [
  {
    id: 'c1',
    data: () => ({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      role: 'Student',
      stage: 'Lead',
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
      attendance: {
        c1: true,
      },
    }),
  },
];

describe('Attendance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 1 });
      } else if (ref?.path === 'events') {
        callback({ docs: mockEvents, size: 1 });
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

  it('renders loading state initially by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());
    render(<Attendance />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders title and loaded events stats', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Gatherings')).toBeInTheDocument();
      expect(screen.getByText('1 time')).toBeInTheDocument();
    });
  });

  it('filters events based on type filter pills', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Friday Gathering 1')).toBeInTheDocument();
    });

    // Select 'Small Group' filter
    const smallGroupsFilter = screen.getByText('Small Groups');
    fireEvent.click(smallGroupsFilter);

    expect(screen.queryByText('Friday Gathering 1')).not.toBeInTheDocument();
  });

  it('handles clicking the log gathering button to open modal', async () => {
    render(<Attendance />);

    await waitFor(() => {
      expect(screen.getByText('Log a gathering')).toBeInTheDocument();
    });

    const logButton = screen.getByText('Log a gathering');
    fireEvent.click(logButton);

    // Expect the modal to show (e.g., event name input)
    expect(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i)).toBeInTheDocument();
  });
});
