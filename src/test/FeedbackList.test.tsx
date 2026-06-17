import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import FeedbackList from '../views/FeedbackList';
import { useAuth } from '../components/AuthProvider';
import React from 'react';

// Mock dependencies
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
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
  deleteDoc: vi.fn(() => Promise.resolve()),
  doc: vi.fn((_db, path, id) => ({ path, id })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

const mockFeedback = [
  {
    id: 'f1',
    data: () => ({
      userName: 'Alice Johnson',
      userEmail: 'alice@example.com',
      message: 'Bug when clicking save',
      type: 'bug',
      kind: 'off',
      status: 'new',
      archived: false,
      createdAt: '2026-06-15T08:00:00.000Z',
    }),
  },
  {
    id: 'f2',
    data: () => ({
      userName: 'Bob Smith',
      userEmail: 'bob@example.com',
      message: 'Add dark mode support',
      type: 'enhancement',
      kind: 'request',
      status: 'completed',
      archived: false,
      createdAt: '2026-06-16T08:00:00.000Z',
    }),
  },
];

describe('FeedbackList View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Access Denied when user is not admin', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-viewer', displayName: 'Viewer User', email: 'viewer@example.com' },
      isAdmin: false,
    });

    render(<FeedbackList />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('renders loading state initially by mocking onSnapshot delay', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com' },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());

    render(<FeedbackList />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders Feedback title and metrics dashboard', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com' },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      // Mock forEach on snapshot
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('User Feedback')).toBeInTheDocument();
      // Total feedback count = 2
      expect(screen.getAllByText('2')[0]).toBeInTheDocument();
      // Bugs count = 1
      expect(screen.getAllByText('1')[0]).toBeInTheDocument();
      // Alice's feedback message
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
      // Bob's feedback message
      expect(screen.getByText('Add dark mode support')).toBeInTheDocument();
    });
  });

  it('filters feedback items by search input', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com' },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search feedback/i);
    fireEvent.change(searchInput, { target: { value: 'dark mode' } });

    await waitFor(() => {
      expect(screen.queryByText('Bug when clicking save')).not.toBeInTheDocument();
      expect(screen.getByText('Add dark mode support')).toBeInTheDocument();
    });
  });
});
