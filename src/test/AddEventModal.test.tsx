import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AddEventModal from '../components/modals/AddEventModal';
import * as firestore from 'firebase/firestore';
import { handleFirestoreError } from '../lib/firebase';

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

  it('submits recurring weekly events and allows day toggling', async () => {
    const batchMock = firestore.writeBatch(null as any);
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={1} />);

    // Fill details
    fireEvent.change(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i), { target: { value: 'Weekly Gathering' } });
    
    // Toggle recurring
    const toggleBtn = screen.getByText('Recurring Event').closest('.justify-between')?.querySelector('button')!;
    fireEvent.click(toggleBtn);

    // Wait for recurrence options to render
    await screen.findByText('Frequency');

    // Select weekly recurrence
    const repeatSelect = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(repeatSelect, { target: { value: 'weekly' } });

    // Click repeat on Mon (day value is 1)
    const monBtn = screen.getByRole('button', { name: 'M' });
    fireEvent.click(monBtn); // Toggle on Monday
    
    // Submit
    const submitBtn = screen.getByRole('button', { name: /Create schedule/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firestore.writeBatch).toHaveBeenCalled();
      expect(batchMock.commit).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('submits recurring monthly events relative or same day', async () => {
    const batchMock = firestore.writeBatch(null as any);
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={1} />);

    // Fill details
    fireEvent.change(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i), { target: { value: 'Monthly Meeting' } });
    
    // Toggle recurring
    const toggleBtn = screen.getByText('Recurring Event').closest('.justify-between')?.querySelector('button')!;
    fireEvent.click(toggleBtn);

    // Wait for recurrence options to render
    await screen.findByText('Frequency');

    // Select monthly recurrence
    const repeatSelect = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(repeatSelect, { target: { value: 'monthly' } });

    // Dynamically calculate the relative day button text to match AddEventModal logic
    const date = new Date();
    const weekIndex = Math.ceil(date.getDate() / 7);
    const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
    const ordinal = ordinals[weekIndex - 1] || 'last';
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
    const expectedText = `${ordinal} ${dayName} of month`;

    // Toggle to relative day
    const relativeDayBtn = screen.getByText(expectedText);
    fireEvent.click(relativeDayBtn);

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Create schedule/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firestore.writeBatch).toHaveBeenCalled();
      expect(batchMock.commit).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('handles submission errors and calls handleFirestoreError', async () => {
    vi.mocked(firestore.addDoc).mockRejectedValueOnce(new Error('Firebase error'));
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={1} />);

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i), { target: { value: 'Failed Gathering' } });

    // Submit
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
});
