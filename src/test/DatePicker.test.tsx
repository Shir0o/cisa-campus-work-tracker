import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import DatePicker from '../components/ui/DatePicker';

// Mock motion/react to prevent animation rendering issues/delays in test
vi.mock('motion/react', () => {
  return {
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: {
      div: React.forwardRef(({ children, initial, animate, exit, transition, ...props }: any, ref: any) => (
        <div ref={ref} {...props}>
          {children}
        </div>
      )),
    },
  };
});

describe('DatePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders label and placeholder text when no date value is provided', () => {
    render(<DatePicker label="Event Date" value="" onChange={vi.fn()} />);

    expect(screen.getByText('Event Date')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a date (e.g. "Friday", "tomorrow")')).toBeInTheDocument();
  });

  it('renders correctly formatted date when a valid value is provided', () => {
    render(<DatePicker label="Birth Date" value="2026-06-15" onChange={vi.fn()} />);

    expect(screen.getByDisplayValue('Jun 15, 2026')).toBeInTheDocument();
  });

  it('opens overlay calendar when clicking the picker button', () => {
    render(<DatePicker label="Date" value="2026-06-15" onChange={vi.fn()} />);

    // Click trigger button
    const triggerBtn = screen.getByRole('button', { name: 'Toggle calendar picker' });
    fireEvent.click(triggerBtn);

    // Overlay elements should show
    expect(screen.getByText('Select date')).toBeInTheDocument(); // Header title
    expect(screen.getByText('Mon, Jun 15')).toBeInTheDocument(); // Header formatted date
    expect(screen.getByText('June')).toBeInTheDocument(); // Current month label
    expect(screen.getByText('2026')).toBeInTheDocument(); // Current year label
  });

  it('calls onChange with correct date string and closes picker on day selection', () => {
    const handleChange = vi.fn();
    render(<DatePicker label="Date" value="2026-06-15" onChange={handleChange} />);

    // Open picker
    const triggerBtn = screen.getByRole('button', { name: 'Toggle calendar picker' });
    fireEvent.click(triggerBtn);

    // Select the 20th of June
    const dayBtn = screen.getByRole('button', { name: '20' });
    fireEvent.click(dayBtn);

    expect(handleChange).toHaveBeenCalledWith('2026-06-20');
    // Overlay should close
    expect(screen.queryByText('Mon, Jun 15')).not.toBeInTheDocument();
  });

  it('navigates to previous and next months using chevron buttons', () => {
    render(<DatePicker label="Date" value="2026-06-15" onChange={vi.fn()} />);

    // Open picker
    const triggerBtn = screen.getByRole('button', { name: 'Toggle calendar picker' });
    fireEvent.click(triggerBtn);

    expect(screen.getByText('June')).toBeInTheDocument();

    // Find Prev Month button (first chevron button inside picker controls)
    const navButtons = screen.getAllByRole('button');
    const prevMonthBtn = navButtons.find(btn => btn.innerHTML.includes('lucide-chevron-left'));
    const nextMonthBtn = navButtons.find(btn => btn.innerHTML.includes('lucide-chevron-right'));

    expect(prevMonthBtn).toBeDefined();
    expect(nextMonthBtn).toBeDefined();

    // Click prev month
    fireEvent.click(prevMonthBtn!);
    expect(screen.getByText('May')).toBeInTheDocument();

    // Click next month twice (May -> June -> July)
    fireEvent.click(nextMonthBtn!);
    fireEvent.click(nextMonthBtn!);
    expect(screen.getByText('July')).toBeInTheDocument();
  });

  it('switches views to month selector and selects a different month', () => {
    render(<DatePicker label="Date" value="2026-06-15" onChange={vi.fn()} />);

    // Open picker
    fireEvent.click(screen.getByRole('button', { name: 'Toggle calendar picker' }));

    // Click month label button to switch to month list view
    const monthViewBtn = screen.getByRole('button', { name: 'June' });
    fireEvent.click(monthViewBtn);

    // Click September
    const septBtn = screen.getByRole('button', { name: 'September' });
    fireEvent.click(septBtn);

    // Should return to calendar view on September
    expect(screen.getByText('September')).toBeInTheDocument();
  });

  it('switches views to year selector and selects a different year', () => {
    render(<DatePicker label="Date" value="2026-06-15" onChange={vi.fn()} />);

    // Open picker
    fireEvent.click(screen.getByRole('button', { name: 'Toggle calendar picker' }));

    // Click year label button to switch to year list view
    const yearViewBtn = screen.getByRole('button', { name: '2026' });
    fireEvent.click(yearViewBtn);

    // Click 2025
    const targetYearBtn = screen.getByRole('button', { name: '2025' });
    fireEvent.click(targetYearBtn);

    // Should return to calendar view on 2025
    expect(screen.getByText('2025')).toBeInTheDocument();
  });

  it('closes picker when Cancel button is clicked', () => {
    render(<DatePicker label="Date" value="2026-06-15" onChange={vi.fn()} />);

    // Open picker
    fireEvent.click(screen.getByRole('button', { name: 'Toggle calendar picker' }));
    expect(screen.getByText('Mon, Jun 15')).toBeInTheDocument();

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(screen.queryByText('Mon, Jun 15')).not.toBeInTheDocument();
  });

  it('closes picker when clicking outside of component container', () => {
    const { container } = render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <DatePicker label="Date" value="2026-06-15" onChange={vi.fn()} />
      </div>
    );

    // Open picker
    fireEvent.click(screen.getByRole('button', { name: 'Toggle calendar picker' }));
    expect(screen.getByText('Mon, Jun 15')).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(screen.getByTestId('outside-element'));

    // Overlay should close
    expect(screen.queryByText('Mon, Jun 15')).not.toBeInTheDocument();
  });

  it('allows smart parsing by typing a natural date', () => {
    const handleChange = vi.fn();
    render(<DatePicker label="Date" value="" onChange={handleChange} />);

    const input = screen.getByPlaceholderText('Type a date (e.g. "Friday", "tomorrow")') as HTMLInputElement;
    
    // Type "tomorrow"
    fireEvent.change(input, { target: { value: 'tomorrow' } });
    
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + 1);
    const expectedStr = expectedDate.getFullYear() + '-' + String(expectedDate.getMonth() + 1).padStart(2, '0') + '-' + String(expectedDate.getDate()).padStart(2, '0');
    
    expect(handleChange).toHaveBeenCalledWith(expectedStr);
    expect(screen.getByText(/Matches:/)).toBeInTheDocument();
  });
});
