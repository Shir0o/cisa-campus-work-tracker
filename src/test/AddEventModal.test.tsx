import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const h = vi.hoisted(() => ({
  gatheringTypes: [
    { id: 't1', name: 'Weekly', blurb: 'Friday night', order: 0 },
    { id: 't2', name: 'Small Group', blurb: 'Around a table', order: 1 },
    { id: 't3', name: 'Special', blurb: '', order: 2 },
    { id: 't4', name: 'Outreach', blurb: '', order: 3 },
  ],
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE' },
}));

vi.mock('../lib/gatheringTypes', () => ({
  useGatheringTypes: () => h.gatheringTypes,
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

  it('selecting a type pill changes the logged event type', async () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={3} />);

    fireEvent.click(screen.getByRole('button', { name: /Small Group/i }));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i), {
      target: { value: 'Small Group Night' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Log gathering/i }));

    await waitFor(() => {
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'Small Group', order: 3 })
      );
    });
  });

  it('falls back to the first managed type when the current selection is no longer in the list', async () => {
    h.gatheringTypes = [{ id: 't5', name: 'All Staff', blurb: '', order: 0 }];
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={0} />);

    fireEvent.change(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i), {
      target: { value: 'Staff Sync' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log gathering/i }));

    await waitFor(() => {
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'All Staff' })
      );
    });
  });

  it('submits a recurring monthly event keeping the same day of month', async () => {
    const batchMock = firestore.writeBatch(null as any);
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={1} />);

    fireEvent.change(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i), {
      target: { value: 'Monthly Huddle' },
    });
    fireEvent.click(screen.getByText('Recurring Event').closest('.justify-between')?.querySelector('button')!);
    await screen.findByText('Frequency');

    const repeatSelect = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(repeatSelect, { target: { value: 'monthly' } });

    // Same-day is the default — the summary badge shows the day-of-month form.
    expect(screen.getByText(/Monthly on the 17th until/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create schedule/i }));

    await waitFor(() => {
      expect(firestore.writeBatch).toHaveBeenCalled();
      expect(batchMock.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ monthlyType: 'same-day', isRecurring: true })
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('falls back to the last occurrence when a month lacks the requested Nth weekday', async () => {
    const batchMock = firestore.writeBatch(null as any);
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={1} />);

    // Set the start date to the 5th Monday of June 2026 (a month with five
    // Mondays); the next month has only four, so the Nth-weekday search must
    // fall back to the last Monday (July 27).
    fireEvent.change(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i), {
      target: { value: 'Fifth Monday Club' },
    });
    const dateInput = screen.getByPlaceholderText(/Type a date/i);
    fireEvent.change(dateInput, { target: { value: '6/29/2026' } });

    fireEvent.click(screen.getByText('Recurring Event').closest('.justify-between')?.querySelector('button')!);
    await screen.findByText('Frequency');

    // Extend the schedule so the fallback occurrence (July 27) still fits.
    const endDateInput = screen.getAllByPlaceholderText(/Type a date/i)[1];
    fireEvent.change(endDateInput, { target: { value: '8/1/2026' } });

    const repeatSelect = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(repeatSelect, { target: { value: 'monthly' } });

    // Relative-day is selected (5th Monday of month), so July must fall back.
    fireEvent.click(screen.getByRole('button', { name: /5th Monday of month/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create schedule/i }));

    await waitFor(() => {
      expect(firestore.writeBatch).toHaveBeenCalled();
      const writtenDates = (batchMock as any).set.mock.calls.map((c: any[]) => c[1].date);
      expect(writtenDates).toContain('2026-07-27');
    });
  });

  it('never allows the weekly repeat-day selection to become empty', async () => {
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={1} />);

    fireEvent.click(screen.getByText('Recurring Event').closest('.justify-between')?.querySelector('button')!);
    await screen.findByText('Frequency');

    // Wednesday (the start date's weekday) is preselected — clicking it would
    // empty the list, so it must stay selected.
    const wedBtn = screen.getByRole('button', { name: 'W' });
    expect(wedBtn.className).toContain('bg-primary');
    fireEvent.click(wedBtn);
    expect(wedBtn.className).toContain('bg-primary');
  });

  it('honours a custom recurrence end date by stopping the schedule there', async () => {
    const batchMock = firestore.writeBatch(null as any);
    render(<AddEventModal isOpen={true} onClose={mockOnClose} currentEventCount={1} />);

    fireEvent.change(screen.getByPlaceholderText(/e.g. Friday Night Gathering/i), {
      target: { value: 'Short Daily Run' },
    });
    fireEvent.click(screen.getByText('Recurring Event').closest('.justify-between')?.querySelector('button')!);
    await screen.findByText('Frequency');

    const repeatSelect = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(repeatSelect, { target: { value: 'daily' } });

    // End the schedule two days out.
    const endDateInputs = screen.getAllByPlaceholderText(/Type a date/i);
    fireEvent.change(endDateInputs[1], { target: { value: '6/19/2026' } });

    fireEvent.click(screen.getByRole('button', { name: /Create schedule/i }));

    await waitFor(() => {
      const writtenDates = (batchMock as any).set.mock.calls.map((c: any[]) => c[1].date);
      expect(writtenDates).toContain('2026-06-17');
      expect(writtenDates).toContain('2026-06-19');
      expect(writtenDates).not.toContain('2026-06-20');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
