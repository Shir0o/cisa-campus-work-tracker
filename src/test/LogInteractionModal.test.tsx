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

// Roster under test (#549): the trainee (Sam) and one full-timer.
vi.mock('../lib/walking', () => ({
  isFullTimer: (uid?: string | null) => uid === 'b5YPihN2cGRESPRgiTd8sMlNGBz2',
  isTrainee: (uid?: string | null) => uid === 'JfcxyTTTFuNUYMLQTisyq2ppoy82',
  fullTimerIds: () => ['b5YPihN2cGRESPRgiTd8sMlNGBz2'],
  traineeIds: () => ['JfcxyTTTFuNUYMLQTisyq2ppoy82'],
  applyRoster: () => {},
  applyWalkingPairs: () => {},
  walkingRecipient: () => null,
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
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', WRITE: 'WRITE' },
  logActivity: vi.fn(),
  sendNotification: vi.fn(),
}));

import { logActivity, sendNotification, handleFirestoreError } from '../lib/firebase';

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

    // Select interaction type 'Call'
    const callTypeBtn = screen.getByText('Call');
    fireEvent.click(callTypeBtn);

    // Change date field
    const dateInput = screen.getByText('Date').nextElementSibling?.querySelector('input') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-06-25' } });

    // Add follow-up task
    const addTaskBtn = screen.getByText(/Add Follow-Up Task/i);
    fireEvent.click(addTaskBtn);

    // Fill task title
    const taskTitleInput = screen.getByPlaceholderText(/Task description/i);
    fireEvent.change(taskTitleInput, { target: { value: 'Follow up call' } });

    // Change task due date
    const taskDueDateInput = screen.getByPlaceholderText(/Task description/i).nextElementSibling as HTMLInputElement;
    fireEvent.change(taskDueDateInput, { target: { value: '2026-07-01' } });

    // Add manual/second follow-up task
    const addManualBtn = screen.getByText(/Add Manual/i);
    fireEvent.click(addManualBtn);

    // Fill second task title
    const taskTitleInputs = screen.getAllByPlaceholderText(/Task description/i);
    fireEvent.change(taskTitleInputs[1], { target: { value: 'Second task to delete' } });

    // Remove the second task
    const tasksContainer = screen.getByText('Follow-Up Tasks').closest('.space-y-3')!;
    const taskItems = tasksContainer.querySelectorAll('.flex.gap-2.items-start');
    expect(taskItems.length).toBe(2);
    const removeBtn = taskItems[1].querySelector('button')!;
    fireEvent.click(removeBtn);

    // Fill interaction notes
    const notesArea = screen.getByPlaceholderText(/What was discussed\?/i);
    fireEvent.change(notesArea, { target: { value: 'Had a great chat about life.' } });

    // Submit log
    const submitBtn = screen.getByRole('button', { name: /Log interaction/i });
    fireEvent.click(submitBtn);

    const batchMock = firestore.writeBatch(null as any);
    await waitFor(() => {
      expect(firestore.writeBatch).toHaveBeenCalled();
      expect(batchMock.set).toHaveBeenCalledTimes(2); // 1 interaction + 1 task (second task was removed)
      expect(batchMock.update).toHaveBeenCalledTimes(1); // 1 contact updated
      expect(batchMock.commit).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('resets form state when the modal closes', async () => {
    setupOnSnapshot(mockContacts);
    const { rerender } = render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.click(screen.getByText(/Add Follow-Up Task/i));
    fireEvent.change(screen.getByPlaceholderText(/What was discussed\?/i), { target: { value: 'Some notes' } });

    rerender(<LogInteractionModal isOpen={false} onClose={mockOnClose} />);
    rerender(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.queryByText('Follow-Up Tasks')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/What was discussed\?/i)).toHaveValue('');
    expect(screen.getByText(/Add Follow-Up Task/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log interaction/i })).toBeDisabled();
  });

  it('handles the contacts snapshot error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (firestore.onSnapshot as any).mockImplementation((q: any, success: any, error: any) => {
      error(new Error('permission denied'));
      return vi.fn();
    });
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    expect(await screen.findByText(/No contacts matching/i)).toBeInTheDocument();
    expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'LIST', 'contacts');
    errSpy.mockRestore();
  });

  it('deselects a contact via the selected chip', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    const aliceMatches = screen.getAllByText('Alice Smith');
    const chip = aliceMatches.map((el) => el.closest('div')).find((d) => d!.querySelector('button'));
    fireEvent.click(chip!.querySelector('button')!);
    expect(screen.queryByText(/contacts logged/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log interaction/i })).toBeDisabled();
  });

  it('notifies the full-timer when a trainee logs an interaction', async () => {
    setupOnSnapshot(mockContacts);
    (useAuth as any).mockReturnValue({
      user: { uid: 'JfcxyTTTFuNUYMLQTisyq2ppoy82', displayName: 'Sam Trainee' },
      role: 'trainee',
    });
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.click(screen.getByText('Meeting'));
    fireEvent.change(screen.getByPlaceholderText(/What was discussed\?/i), {
      target: { value: 'Great time discussing next steps together with a long enough note to check the truncation path works as expected.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log interaction/i }));

    await waitFor(() => {
      expect(sendNotification).toHaveBeenCalledWith({
        userId: 'b5YPihN2cGRESPRgiTd8sMlNGBz2',
        title: 'Sam logged time with Alice Smith',
        message: expect.stringContaining('Great time'),
        type: 'info',
        targetId: 'c1',
      });
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'logged an interaction for', type: 'event' }),
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('logs a batch interaction for multiple contacts', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.click(screen.getByText('Bob Jones'));
    fireEvent.change(screen.getByPlaceholderText(/What was discussed\?/i), { target: { value: 'Met both.' } });
    fireEvent.click(screen.getByRole('button', { name: /Log interaction/i }));

    await waitFor(() => {
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'logged a batch interaction for', targetId: 'multiple' }),
      );
    });
  });

  it('reports commit failures through handleFirestoreError', async () => {
    setupOnSnapshot(mockContacts);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const batchMock = firestore.writeBatch(null as any);
    (batchMock.commit as any).mockRejectedValueOnce(new Error('commit exploded'));

    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.change(screen.getByPlaceholderText(/What was discussed\?/i), { target: { value: 'Notes' } });
    fireEvent.click(screen.getByRole('button', { name: /Log interaction/i }));

    await waitFor(() => {
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'WRITE', 'batch/interactions');
    });
    expect(mockOnClose).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
