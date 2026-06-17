import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AddEventModal from '../components/modals/AddEventModal';
import * as firestore from 'firebase/firestore';

// Mock dependencies
vi.mock('firebase/firestore', () => {
  const mockBatch = {
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(true),
  };
  return {
    collection: vi.fn().mockReturnValue({ id: 'mock-collection-id' }),
    addDoc: vi.fn().mockResolvedValue({ id: 'mock-event-id' }),
    doc: vi.fn().mockReturnValue({ id: 'mock-doc-id' }),
    writeBatch: vi.fn(() => mockBatch),
  };
});

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(<AddEventModal isOpen={false} onClose={mockOnClose} currentEventCount={0} />);
    expect(screen.queryByText('Log a gathering')).not.toBeInTheDocument();
  });

  it('renders correctly with form fields when isOpen is true', () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={0} />);
    expect(screen.getByText('Log a gathering')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. Lower Common Room/i)).toBeInTheDocument();
  });

  it('submits a single non-recurring event successfully', async () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={5} />);

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i), { target: { value: 'Bible Study' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. Lower Common Room/i), { target: { value: 'Student Union' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Log gathering/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Bible Study',
          location: 'Student Union',
          isRecurring: false,
          recurrenceType: 'none',
          type: 'Weekly',
          order: 5,
        })
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('shows recurrence options when isRecurring checkbox is checked', async () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={0} />);

    // Initially recurrence fields are hidden
    expect(screen.queryByText('Frequency')).not.toBeInTheDocument();

    // Click the recurring toggle button
    const toggleBtn = screen.getByText('Recurring Event').closest('.justify-between')?.querySelector('button')!;
    fireEvent.click(toggleBtn);

    // Wait for the elements to render
    await screen.findByText('Frequency');
    expect(screen.getByText('End By')).toBeInTheDocument();
  });

  it('submits recurring daily events via batch write', async () => {
    const batchMock = firestore.writeBatch(null as any);
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={1} />);

    // Fill details
    fireEvent.change(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i), { target: { value: 'Daily Prayers' } });
    
    // Toggle recurring
    const toggleBtn = screen.getByText('Recurring Event').closest('.justify-between')?.querySelector('button')!;
    fireEvent.click(toggleBtn);

    // Wait for recurrence options to render
    await screen.findByText('Frequency');

    // Select daily recurrence
    const repeatSelect = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(repeatSelect, { target: { value: 'daily' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Create schedule/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firestore.writeBatch).toHaveBeenCalled();
      expect(batchMock.set).toHaveBeenCalled();
      expect(batchMock.commit).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('closes modal on Escape key press', () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={0} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });
});
