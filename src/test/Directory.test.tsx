import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import Directory from '../views/Directory';
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
  collectionGroup: vi.fn((_db, group) => ({ group })),
  onSnapshot: vi.fn((ref, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  doc: vi.fn((_db, path, id) => ({ path, id })),
  writeBatch: vi.fn(() => ({
    update: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE' },
}));

const mockStages = [
  { id: 's1', data: () => ({ label: 'Lead', color: 'bg-board-indigo', order: 0 }) },
  { id: 's2', data: () => ({ label: 'Regular', color: 'bg-board-teal', order: 1 }) },
];

const mockContacts = [
  {
    id: 'c1',
    data: () => ({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      phone: '123-456-7890',
      role: 'Student',
      stage: 'Lead',
      location: 'Dorm A',
      spiritualBackground: 'None',
      tags: ['Freshman'],
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
  },
  {
    id: 'c2',
    data: () => ({
      name: 'Bob Smith',
      email: 'bob@example.com',
      phone: '987-654-3210',
      role: 'Leader',
      stage: 'Regular',
      location: 'Off-campus',
      spiritualBackground: 'Christian',
      tags: ['Senior'],
      createdAt: '2026-02-01T00:00:00.000Z',
    }),
  },
];

describe('Directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
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
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn()); // Never fires callback
    render(<Directory />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders contacts directory title and contact cards', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('People')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });
  });

  it('filters contacts by search query', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
  });

  it('filters contacts by stage dropdown option', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Open filter menus if they are collapsed, or verify filter functions
    // Since options are rendered, we can find elements and select them.
    // Let's filter by Stage = Regular
    const filtersButton = screen.getByText('Filters');
    fireEvent.click(filtersButton);

    const stageSelect = screen.getByText('Stage').nextElementSibling as HTMLSelectElement;
    fireEvent.change(stageSelect, { target: { value: 'Regular' } });

    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('shows empty state when no contacts match query', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });

    expect(screen.getByText('No one matches that just yet')).toBeInTheDocument();
  });
});
