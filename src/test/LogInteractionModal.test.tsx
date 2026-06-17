import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LogInteractionModal from '../components/modals/LogInteractionModal';
import * as firestore from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';

// Mock Auth
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// Mock Firestore
vi.mock('firebase/firestore', () => {
  const mockBatch = {
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(true),
  };
  return {
    collection: vi.fn().mockReturnValue({ id: 'mock-collection-id' }),
    query: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    doc: vi.fn().mockReturnValue({ id: 'mock-doc-id' }),
    writeBatch: vi.fn(() => mockBatch),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
  };
});

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE' },
  logActivity: vi.fn(),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockContacts = [
  { id: 'c1', name: 'Alice Smith', email: 'alice@example.com', role: 'Student' },
  { id: 'c2', name: 'Bob Jones', email: 'bob@example.com', role: 'Faculty' },
];

describe('LogInteractionModal Component', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-123', displayName: 'Test Operator' },
      role: 'operator',
    });
  });

  const setupOnSnapshot = (contactsData: any[]) => {
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      successCallback({
        docs: contactsData.map((c) => ({
          id: c.id,
          data: () => {
            const { id, ...data } = c;
            return data;
          },
        })),
      });
      return vi.fn(); // Unsubscribe
    });
  };

  it('does not render if role is viewer', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-123', displayName: 'Test Viewer' },
      role: 'viewer',
    });
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.queryByText('Log interaction')).not.toBeInTheDocument();
  });

  it('renders contacts list and form correctly when open', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByRole('heading', { name: 'Log Interaction' })).toBeInTheDocument();
    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('filters contacts on typing in search query', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    const searchInput = screen.getByPlaceholderText(/Search to add contacts\.\.\./i);
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('allows selecting/toggling contacts and adding tasks', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    // Click contact to select
    const aliceContact = await screen.findByText('Alice Smith');
    fireEvent.click(aliceContact);

    // Add follow-up task
    const addTaskBtn = screen.getByText(/Add Follow-Up Task/i);
    fireEvent.click(addTaskBtn);

    // Fill task title
    const taskTitleInput = screen.getByPlaceholderText(/Task description/i);
    fireEvent.change(taskTitleInput, { target: { value: 'Follow up call' } });

    // Fill interaction notes
    const notesArea = screen.getByPlaceholderText(/What was discussed\?/i);
    fireEvent.change(notesArea, { target: { value: 'Had a great chat about life.' } });

    // Submit log
    const submitBtn = screen.getByRole('button', { name: /Log interaction/i });
    fireEvent.click(submitBtn);

    const batchMock = firestore.writeBatch(null as any);
    await waitFor(() => {
      expect(firestore.writeBatch).toHaveBeenCalled();
      expect(batchMock.set).toHaveBeenCalledTimes(2); // 1 interaction + 1 task
      expect(batchMock.update).toHaveBeenCalledTimes(1); // 1 contact updated
      expect(batchMock.commit).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
