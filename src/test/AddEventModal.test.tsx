import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AddEventModal from '../components/modals/AddEventModal';
import * as firestore from 'firebase/firestore';
import { handleFirestoreError } from '../lib/firebase';

// AddEventModal is "Log a gathering" — a one-off Gathering only (issue #957
// / ADR 0016). Cadence/roster-as-a-standing-thing moved to CreateRhythmModal.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn().mockReturnValue({ id: 'mock-collection-id' }),
  addDoc: vi.fn().mockResolvedValue({ id: 'mock-event-id' }),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE' },
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('AddEventModal Component', () => {
  const mockOnClose = vi.fn();

  let dateSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const RealDate = global.Date;
    dateSpy = vi.spyOn(global, 'Date').mockImplementation(function (this: Date, ...args: any[]) {
      if (args.length === 0) {
        return new RealDate('2026-06-17T12:00:00Z');
      }
      // @ts-ignore
      return new RealDate(...args);
    } as any);
    vi.spyOn(Date, 'now').mockReturnValue(new RealDate('2026-06-17T12:00:00Z').getTime());
  });

  afterEach(() => {
    dateSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(<AddEventModal isOpen={false} onClose={mockOnClose} currentEventCount={0} />);
    expect(screen.queryByText('Log a gathering')).not.toBeInTheDocument();
  });

  it('renders correctly with form fields when isOpen is true', () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={0} />);
    expect(screen.getByText('Log a gathering')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. Welcome BBQ/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. Lower Common Room/i)).toBeInTheDocument();
  });

  it('submits a one-off gathering successfully', async () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={5} />);

    fireEvent.change(screen.getByPlaceholderText(/e.g. Welcome BBQ/i), { target: { value: 'Welcome BBQ' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. Lower Common Room/i), { target: { value: 'Student Union' } });

    const submitBtn = screen.getByRole('button', { name: /Log gathering/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Welcome BBQ',
          location: 'Student Union',
          order: 5,
        }),
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
    // No rhythmId, no cadence/type fields — it's a plain one-off.
    const [, payload] = vi.mocked(firestore.addDoc).mock.calls[0];
    expect(payload).not.toHaveProperty('rhythmId');
    expect(payload).not.toHaveProperty('type');
    expect(payload).not.toHaveProperty('isRecurring');
  });

  it('allows selecting expected attendees for the roster', async () => {
    const mockContacts = [
      { id: 'c1', name: 'Alice', role: '', location: '', email: '', phone: '', stage: '', lastSeen: '', initials: 'A' },
      { id: 'c2', name: 'Bob', role: '', location: '', email: '', phone: '', stage: '', lastSeen: '', initials: 'B' },
    ];
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={1} contacts={mockContacts} />);

    fireEvent.change(screen.getByPlaceholderText(/e.g. Welcome BBQ/i), { target: { value: 'Team Gathering' } });

    const aliceBtn = screen.getByText('Alice');
    fireEvent.click(aliceBtn);

    const submitBtn = screen.getByRole('button', { name: /Log gathering/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Team Gathering',
          roster: ['c1'],
        }),
      );
    });
  });

  it('handles submission errors and calls handleFirestoreError', async () => {
    vi.mocked(firestore.addDoc).mockRejectedValueOnce(new Error('Firebase error'));
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={1} />);

    fireEvent.change(screen.getByPlaceholderText(/e.g. Welcome BBQ/i), { target: { value: 'Failed Gathering' } });

    const submitBtn = screen.getByRole('button', { name: /Log gathering/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleFirestoreError).toHaveBeenCalled();
    });
  });

  it('closes modal on Escape key press', () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={0} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes modal on Cancel click', () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={0} />);
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('does not submit when the name is empty', () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={0} />);
    const submitBtn = screen.getByRole('button', { name: /Log gathering/i });
    expect(submitBtn).toBeDisabled();
  });
});
