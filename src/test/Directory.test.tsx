import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import Directory from '../views/Directory';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import { logActivity, handleFirestoreError } from '../lib/firebase';
import React from 'react';

// Mock writeBatch operations
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockCommit = vi.fn().mockResolvedValue(undefined);

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
    update: mockUpdate,
    delete: mockDelete,
    commit: mockCommit,
  })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
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
  {
    id: 'c3',
    data: () => ({
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      avatar: 'https://example.com/charlie.png',
      role: 'Staff',
      stage: 'Lead',
      location: 'Off-campus',
      spiritualBackground: 'None',
      tags: [],
      createdAt: '2026-03-01T00:00:00.000Z',
    }),
  },
];

describe('Directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 3 });
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
      openNewContact: vi.fn(),
      setSelectedContact: vi.fn(),
    });
  });

  it('renders loading state initially by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn()); // Never fires callback
    render(<Directory />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders contacts directory title, stats, and contact cards', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('People')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
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

    const filtersButton = screen.getByText('Filters');
    fireEvent.click(filtersButton);

    const stageSelect = screen.getByText('Stage').nextElementSibling as HTMLSelectElement;
    fireEvent.change(stageSelect, { target: { value: 'Regular' } });

    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('filters contacts by role and spiritual background options', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const filtersButton = screen.getByText('Filters');
    fireEvent.click(filtersButton);

    // Filter by Role = Leader
    const roleSelect = screen.getByText('Group').nextElementSibling as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: 'Leader' } });
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();

    // Clear filters
    const clearBtn = screen.getByText('Clear all');
    fireEvent.click(clearBtn);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();

    // Filter by Spiritual Background = Christian
    fireEvent.click(filtersButton);
    const spiritualSelect = screen.getByText('Spiritual background').nextElementSibling as HTMLSelectElement;
    fireEvent.change(spiritualSelect, { target: { value: 'Christian' } });
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('filters contacts by tag chips', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const tagChip = screen.getByRole('button', { name: 'Freshman' });
    fireEvent.click(tagChip);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();

    // Clicking again toggles filter off
    fireEvent.click(tagChip);
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

  it('selects/deselects individual and all contacts, and performs bulk actions', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Checkbox toggles selection
    const checkboxes = screen.getAllByTitle('Select');
    expect(checkboxes.length).toBe(3);
    fireEvent.click(checkboxes[0]); // Select Alice

    expect(screen.getByText('1 selected')).toBeInTheDocument();

    // Bulk email redirection
    const originalLocation = window.location;
    delete (window as any).location;
    window.location = { href: '' } as any;

    const emailBtn = screen.getByTitle('Email selected');
    fireEvent.click(emailBtn);
    expect(window.location.href).toBe('mailto:alice@example.com');
    (window as any).location = originalLocation;

    // Bulk Tagging Modal flow
    const tagBtn = screen.getByTitle('Tag selected');
    fireEvent.click(tagBtn);
    expect(screen.getByText('Add a tag')).toBeInTheDocument();

    const tagInput = screen.getByPlaceholderText('e.g. leader-track');
    fireEvent.change(tagInput, { target: { value: 'new-tag' } });
    
    const submitBtn = screen.getByRole('button', { name: 'Add tag' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
      expect(logActivity).toHaveBeenCalled();
    });

    // Select all
    const selectAllLabel = screen.getByText('3 people', { selector: 'span' }).closest('label')!;
    fireEvent.click(selectAllLabel);
    expect(screen.getByText('3 selected')).toBeInTheDocument();

    // Deselect all
    const deselectAllLabel = screen.getByText('3 selected', { selector: 'span' }).closest('label')!;
    fireEvent.click(deselectAllLabel);
    expect(screen.queryByText('selected')).not.toBeInTheDocument();
  });

  it('performs bulk delete when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByTitle('Select');
    fireEvent.click(checkboxes[0]);

    const deleteBtn = screen.getByTitle('Remove selected');
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalled();
  });

  it('does not perform bulk delete if cancel is clicked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByTitle('Select');
    fireEvent.click(checkboxes[0]);

    const deleteBtn = screen.getByTitle('Remove selected');
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('renders avatars correctly', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Alice has initials AJ
    expect(screen.getByText('AJ')).toBeInTheDocument();
    // Charlie has avatar image
    const charlieImg = screen.getByAltText('Charlie Brown');
    expect(charlieImg).toHaveAttribute('src', 'https://example.com/charlie.png');
  });

  it('handles snapshot errors for contacts and stages', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any, errorCallback: any) => {
      if (errorCallback) {
        errorCallback(new Error('Firestore error'));
      }
      return vi.fn();
    });

    render(<Directory />);
    expect(handleFirestoreError).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

