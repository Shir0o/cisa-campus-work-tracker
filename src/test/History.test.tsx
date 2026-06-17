import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import HistoryView from '../views/History';
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
  limit: vi.fn(),
  onSnapshot: vi.fn((ref, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  doc: vi.fn((_db, path, id) => ({ path, id })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST' },
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

const mockActivities = [
  {
    id: 'a1',
    data: () => ({
      userName: 'Staff member',
      userPhoto: 'photo.jpg',
      action: 'created',
      targetName: 'Alice Johnson',
      targetType: 'contact',
      targetId: 'c1',
      type: 'steps',
      description: 'started walking with Alice',
      createdAt: '2026-06-15T08:00:00.000Z',
    }),
  },
];

describe('History View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 1 });
      } else if (ref?.path === 'activities') {
        callback({ docs: mockActivities, size: 1 });
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

  it('renders loading state initially by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());
    render(<HistoryView />);
    expect(screen.getByText('Gathering the last few days…')).toBeInTheDocument();
  });

  it('renders Looking back header and loaded activities list', async () => {
    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByText('Looking back')).toBeInTheDocument();
      expect(screen.getByText(/started walking with Alice/i)).toBeInTheDocument();
    });
  });

  it('filters activities based on category buttons', async () => {
    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByText(/started walking with Alice/i)).toBeInTheDocument();
    });

    // Click 'Prayer' category button (which is type 'prayer')
    const prayerButton = screen.getByRole('button', { name: 'Prayer' });
    fireEvent.click(prayerButton);

    expect(screen.queryByText(/started walking with Alice/i)).not.toBeInTheDocument();
    expect(screen.getByText('Nothing here yet for that filter')).toBeInTheDocument();
  });

  it('performs text search matching activity fields', async () => {
    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByText(/started walking with Alice/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Find a moment or a name/i);
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.queryByText(/started walking with Alice/i)).not.toBeInTheDocument();
    expect(screen.getByText('Nothing here yet for that filter')).toBeInTheDocument();
  });
});
