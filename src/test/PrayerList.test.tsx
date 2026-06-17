import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, updateDoc, addDoc } from 'firebase/firestore';
import PrayerList from '../views/PrayerList';
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
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-prayer-id' })),
  doc: vi.fn((_db, path, id) => ({ path, id })),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE' },
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

const mockPrayers = [
  {
    id: 'p1',
    data: () => ({
      contactId: 'c1',
      burden: 'Strength for finals',
      date: '2026-06-10T00:00:00.000Z',
      status: 'pending',
      updatedAt: '2026-06-10T00:00:00.000Z',
      updatedByName: 'Staff Member',
    }),
  },
];

describe('PrayerList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 1 });
      } else if (ref?.path === 'prayers') {
        callback({ docs: mockPrayers, size: 1 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
    });

    (useLayout as any).mockReturnValue({
      setSelectedContact: vi.fn(),
    });
  });

  it('renders initial loading state by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());
    render(<PrayerList />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders prayer log title and active prayer threads', async () => {
    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Prayer Log')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Strength for finals')).toBeInTheDocument();
    });
  });

  it('shows empty state when no prayers exist and mock is empty', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 1 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('No one to carry yet')).toBeInTheDocument();
    });
  });

  it('handles toggling unanswered status', async () => {
    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Strength for finals')).toBeInTheDocument();
    });

    // Find the toggle button (it should be an icon or button related to answering or marking)
    // Looking at the view, it has "Answered" or "Answer" buttons.
    // Let's click "Answer" or "Answered"
    const answerButton = screen.getByText('Answered');
    fireEvent.click(answerButton);

    expect(updateDoc).toHaveBeenCalled();
  });

  it('handles adding a new prayer burden', async () => {
    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText(/Write what we’re carrying for Alice this week/i)).toBeInTheDocument();
    });

    const writeButton = screen.getByText(/Write what we’re carrying for Alice this week/i);
    fireEvent.click(writeButton);

    const textarea = screen.getByPlaceholderText(/What are we praying for Alice this week/i);
    fireEvent.change(textarea, { target: { value: 'New prayer request text' } });

    const addButton = screen.getByText('Add prayer');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalled();
    });
  });
});
