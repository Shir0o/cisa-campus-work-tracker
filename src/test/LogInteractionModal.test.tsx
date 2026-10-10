import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LogInteractionModal from '../components/modals/LogInteractionModal';
import * as firestore from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';
import { useMediaQuery } from '../lib/useMediaQuery';

// Mock Auth
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// Phone vs desktop is switched through the shared media-query hook (#1447).
vi.mock('../lib/useMediaQuery', () => ({ useMediaQuery: vi.fn(() => false) }));

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

const mockContacts = [
  { id: 'c1', name: 'Alice Smith', email: 'alice@example.com', role: 'Student' },
  { id: 'c2', name: 'Bob Jones', email: 'bob@example.com', role: 'Faculty' },
];

describe('LogInteractionModal in the popup frame (#1449)', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useMediaQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
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

  it('renders as a labelled dialog in the frame with the people list', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByRole('dialog', { name: 'Log interaction' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Log interaction' })).toBeInTheDocument();
    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('offers Message, Email, Call and Meeting as one-tap kinds, in that order', () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    const kinds = ['Message', 'Email', 'Call', 'Meeting'];
    for (const kind of kinds) {
      expect(screen.getByRole('button', { name: kind })).toBeInTheDocument();
    }
    const order = kinds.map((k) => screen.getByRole('button', { name: k }));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('saves type "email" when Email is picked', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.click(screen.getByRole('button', { name: 'Email' }));
    fireEvent.change(screen.getByLabelText('What was said'), { target: { value: 'Sent her the schedule.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log for 1 person' }));

    const batchMock = firestore.writeBatch(null as any);
    await waitFor(() => expect(batchMock.commit).toHaveBeenCalled());
    expect(batchMock.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'email', content: 'Sent her the schedule.' }),
    );
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ type: 'email' }));
  });

  it('filters people on typing in the search query', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    const searchInput = screen.getByPlaceholderText(/Search people/i);
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('reads "Pick someone" and is unavailable until someone is picked', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByRole('button', { name: 'Pick someone' })).toBeDisabled();

    fireEvent.click(await screen.findByText('Alice Smith'));
    expect(screen.getByRole('button', { name: 'Log for 1 person' })).toBeEnabled();

    fireEvent.click(screen.getByText('Bob Jones'));
    expect(screen.getByRole('button', { name: 'Log for 2 people' })).toBeEnabled();
  });

  it('closes at once when nothing has been typed or picked', () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('asks before discarding once someone is picked, and keeps them on cancel', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('alertdialog', { name: 'Discard this interaction?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log for 1 person' })).toBeInTheDocument();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('asks before discarding on Escape once someone is picked', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByRole('alertdialog', { name: 'Discard this interaction?' })).toBeInTheDocument();
  });

  it('selects a person, adds follow-up rows, and logs the interaction', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2026-06-25' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add a follow-up' }));
    fireEvent.change(screen.getAllByPlaceholderText('Task description')[0], {
      target: { value: 'Follow up call' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add a follow-up' }));
    fireEvent.change(screen.getAllByPlaceholderText('Task description')[1], {
      target: { value: 'Second task to delete' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove follow-up' })[1]);

    fireEvent.change(screen.getByLabelText('What was said'), {
      target: { value: 'Had a great chat about life.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Log for 1 person' }));

    const batchMock = firestore.writeBatch(null as any);
    await waitFor(() => {
      expect(firestore.writeBatch).toHaveBeenCalled();
      expect(batchMock.set).toHaveBeenCalledTimes(2); // 1 interaction + 1 task (second was removed)
      expect(batchMock.update).toHaveBeenCalledTimes(1); // 1 contact updated
      expect(batchMock.commit).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('asks for what was said on save, and saves nothing', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.click(screen.getByRole('button', { name: 'Log for 1 person' }));

    expect(await screen.findByText('Write what was said.')).toBeInTheDocument();
    expect(firestore.writeBatch).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('resets form state when the modal closes', async () => {
    setupOnSnapshot(mockContacts);
    const { rerender } = render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.click(screen.getByRole('button', { name: 'Add a follow-up' }));
    fireEvent.change(screen.getByLabelText('What was said'), { target: { value: 'Some notes' } });

    rerender(<LogInteractionModal isOpen={false} onClose={mockOnClose} />);
    rerender(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.queryByPlaceholderText('Task description')).not.toBeInTheDocument();
    expect(screen.getByLabelText('What was said')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Pick someone' })).toBeDisabled();
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

  it('deselects a person by tapping their row again', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    expect(screen.getByRole('button', { name: 'Log for 1 person' })).toBeEnabled();

    fireEvent.click(screen.getByText('Alice Smith'));
    expect(screen.getByRole('button', { name: 'Pick someone' })).toBeDisabled();
  });

  it('notifies the full-timer when a trainee logs an interaction', async () => {
    setupOnSnapshot(mockContacts);
    (useAuth as any).mockReturnValue({
      user: { uid: 'JfcxyTTTFuNUYMLQTisyq2ppoy82', displayName: 'Sam Trainee' },
      role: 'trainee',
    });
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.click(screen.getByRole('button', { name: 'Meeting' }));
    fireEvent.change(screen.getByLabelText('What was said'), {
      target: { value: 'Great time discussing next steps together with a long enough note to check the truncation path works as expected.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log for 1 person' }));

    await waitFor(() => {
      expect(sendNotification).toHaveBeenCalledWith({
        userId: 'b5YPihN2cGRESPRgiTd8sMlNGBz2',
        title: 'Sam logged time with Alice Smith',
        message: expect.stringContaining('Great time'),
        type: 'info',
        targetId: 'c1',
        link: '/people/c1',
      });
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'logged an interaction for', type: 'event' }),
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('logs a batch interaction for multiple people', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(await screen.findByText('Alice Smith'));
    fireEvent.click(screen.getByText('Bob Jones'));
    fireEvent.change(screen.getByLabelText('What was said'), { target: { value: 'Met both.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log for 2 people' }));

    await waitFor(() => {
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'logged a batch interaction for', targetId: 'multiple' }),
      );
    });
  });

  describe('when the save is rejected', () => {
    // handleFirestoreError records and then rethrows; the modal must catch that.
    let errSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      (handleFirestoreError as any).mockImplementation(() => {
        throw new Error('rethrown by handleFirestoreError');
      });
      errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      (handleFirestoreError as any).mockReset();
      errSpy.mockRestore();
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    });

    const fill = async () => {
      fireEvent.click(await screen.findByText('Alice Smith'));
      fireEvent.change(screen.getByLabelText('What was said'), { target: { value: 'Notes' } });
      fireEvent.click(screen.getByRole('button', { name: 'Log for 1 person' }));
    };

    it('reports the failure, shows it in the footer, and keeps the form filled', async () => {
      setupOnSnapshot(mockContacts);
      const batchMock = firestore.writeBatch(null as any);
      (batchMock.commit as any).mockRejectedValueOnce(new Error('commit exploded'));

      render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);
      await fill();

      expect(await screen.findByText("Couldn't save. Nothing you typed was lost.")).toBeInTheDocument();
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'WRITE', 'batch/interactions');
      expect(screen.getByLabelText('What was said')).toHaveValue('Notes');
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('writes again on Try again and closes once it lands', async () => {
      setupOnSnapshot(mockContacts);
      const batchMock = firestore.writeBatch(null as any);
      (batchMock.commit as any).mockRejectedValueOnce(new Error('commit exploded'));

      render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);
      await fill();
      fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

      await waitFor(() => expect(mockOnClose).toHaveBeenCalled());
      expect(batchMock.commit).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument();
    });

    it('says so up front when offline, without starting a write', async () => {
      setupOnSnapshot(mockContacts);
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      const batchMock = firestore.writeBatch(null as any);

      render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);
      await fill();

      expect(await screen.findByText("Couldn't save — you're offline. Nothing was lost.")).toBeInTheDocument();
      expect(batchMock.commit).not.toHaveBeenCalled();
      expect(screen.getByLabelText('What was said')).toHaveValue('Notes');
    });
  });

  it('pre-selects the contact when initialContactId is provided', async () => {
    setupOnSnapshot(mockContacts);
    render(<LogInteractionModal isOpen={true} onClose={mockOnClose} initialContactId="c2" />);

    expect(await screen.findByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log for 1 person' })).toBeEnabled();
  });

  describe('on a phone, as a bottom sheet (#1447)', () => {
    // A swipe as pointer events on the handle: down, one move, up — the same
    // drag-end path a finger takes (real gestures don't run in jsdom).
    const swipe = (el: Element, dy: number) => {
      fireEvent.pointerDown(el, { pointerId: 1, clientY: 100 });
      fireEvent.pointerMove(el, { pointerId: 1, clientY: 100 + dy });
      fireEvent.pointerUp(el, { pointerId: 1, clientY: 100 + dy });
    };

    beforeEach(() => (useMediaQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true));

    it('opens with a grabber', () => {
      setupOnSnapshot(mockContacts);
      render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByRole('dialog', { name: 'Log interaction' })).toBeInTheDocument();
      expect(screen.getByTestId('popup-sheet-grabber')).toBeInTheDocument();
    });

    it('shows picked people as pills', async () => {
      setupOnSnapshot(mockContacts);
      render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(await screen.findByText('Alice Smith'));
      expect(screen.getByRole('button', { name: 'Remove Alice Smith' })).toBeInTheDocument();
    });

    it('dismisses at once by swipe when nothing has been typed', () => {
      setupOnSnapshot(mockContacts);
      render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);
      swipe(screen.getByTestId('popup-sheet-grabber'), 200);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('asks before discarding on swipe once someone is picked', async () => {
      setupOnSnapshot(mockContacts);
      render(<LogInteractionModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(await screen.findByText('Alice Smith'));
      swipe(screen.getByTestId('popup-sheet-grabber'), 200);

      expect(screen.getByRole('alertdialog', { name: 'Discard this interaction?' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });
});
