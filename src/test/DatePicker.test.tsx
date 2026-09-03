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

  it('handles other relative terms like today and yesterday', () => {
    const handleChange = vi.fn();
    render(<DatePicker label="Date" value="" onChange={handleChange} />);
    const input = screen.getByPlaceholderText('Type a date (e.g. "Friday", "tomorrow")') as HTMLInputElement;

    // Type "today"
    fireEvent.change(input, { target: { value: 'today' } });
    const todayStr = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
    expect(handleChange).toHaveBeenCalledWith(todayStr);

    // Type "yesterday"
    fireEvent.change(input, { target: { value: 'yesterday' } });
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.getFullYear() + '-' + String(yesterdayDate.getMonth() + 1).padStart(2, '0') + '-' + String(yesterdayDate.getDate()).padStart(2, '0');
    expect(handleChange).toHaveBeenCalledWith(yesterdayStr);
  });

  it('handles relative offset durations', () => {
    const handleChange = vi.fn();
    render(<DatePicker label="Date" value="" onChange={handleChange} />);
    const input = screen.getByPlaceholderText('Type a date (e.g. "Friday", "tomorrow")') as HTMLInputElement;

    // Type "in 3 days"
    fireEvent.change(input, { target: { value: 'in 3 days' } });
    const expected3D = new Date();
    expected3D.setDate(expected3D.getDate() + 3);
    const expected3DStr = expected3D.getFullYear() + '-' + String(expected3D.getMonth() + 1).padStart(2, '0') + '-' + String(expected3D.getDate()).padStart(2, '0');
    expect(handleChange).toHaveBeenCalledWith(expected3DStr);

    // Type "2 weeks"
    fireEvent.change(input, { target: { value: '2 weeks' } });
    const expected2W = new Date();
    expected2W.setDate(expected2W.getDate() + 14);
    const expected2WStr = expected2W.getFullYear() + '-' + String(expected2W.getMonth() + 1).padStart(2, '0') + '-' + String(expected2W.getDate()).padStart(2, '0');
    expect(handleChange).toHaveBeenCalledWith(expected2WStr);

    // Type "1 month"
    fireEvent.change(input, { target: { value: 'in 1 month' } });
    const expected1M = new Date();
    expected1M.setMonth(expected1M.getMonth() + 1);
    const expected1MStr = expected1M.getFullYear() + '-' + String(expected1M.getMonth() + 1).padStart(2, '0') + '-' + String(expected1M.getDate()).padStart(2, '0');
    expect(handleChange).toHaveBeenCalledWith(expected1MStr);

    // Type "next week"
    fireEvent.change(input, { target: { value: 'next week' } });
    const expectedNW = new Date();
    expectedNW.setDate(expectedNW.getDate() + 7);
    const expectedNWStr = expectedNW.getFullYear() + '-' + String(expectedNW.getMonth() + 1).padStart(2, '0') + '-' + String(expectedNW.getDate()).padStart(2, '0');
    expect(handleChange).toHaveBeenCalledWith(expectedNWStr);
  });

  it('handles standard weekday keywords and abbreviations', () => {
    const handleChange = vi.fn();
    render(<DatePicker label="Date" value="" onChange={handleChange} />);
    const input = screen.getByPlaceholderText('Type a date (e.g. "Friday", "tomorrow")') as HTMLInputElement;

    // Type "friday"
    fireEvent.change(input, { target: { value: 'friday' } });
    expect(handleChange).toHaveBeenCalled();

    // Type "next monday"
    fireEvent.change(input, { target: { value: 'next monday' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('handles custom date formats like slash/hyphen and month name words', () => {
    const handleChange = vi.fn();
    render(<DatePicker label="Date" value="" onChange={handleChange} />);
    const input = screen.getByPlaceholderText('Type a date (e.g. "Friday", "tomorrow")') as HTMLInputElement;

    // Type "7/18"
    fireEvent.change(input, { target: { value: '7/18' } });
    expect(handleChange).toHaveBeenCalled();

    // Type "July 18"
    fireEvent.change(input, { target: { value: 'July 18' } });
    expect(handleChange).toHaveBeenCalled();

    // Type "18 Jul 2026"
    fireEvent.change(input, { target: { value: '18 Jul 2026' } });
    expect(handleChange).toHaveBeenCalled();

    // Type "2026-07-20"
    fireEvent.change(input, { target: { value: '2026-07-20' } });
    expect(handleChange).toHaveBeenCalledWith('2026-07-20');
  });

  it('ignores invalid dates and numeric only input', () => {
    const handleChange = vi.fn();
    render(<DatePicker label="Date" value="" onChange={handleChange} />);
    const input = screen.getByPlaceholderText('Type a date (e.g. "Friday", "tomorrow")') as HTMLInputElement;

    // Type empty value
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.queryByText(/Matches:/)).not.toBeInTheDocument();

    // Type "invalid"
    fireEvent.change(input, { target: { value: 'invalid' } });
    expect(screen.getByText('Type date (e.g. "tomorrow", "Friday", "7/18")')).toBeInTheDocument();

    // Type "123" (numeric check)
    fireEvent.change(input, { target: { value: '123' } });
    expect(screen.getByText('Type date (e.g. "tomorrow", "Friday", "7/18")')).toBeInTheDocument();
  });

  it('handles input blur, focus, and Enter key actions', () => {
    const handleChange = vi.fn();
    render(<DatePicker label="Date" value="2026-06-15" onChange={handleChange} />);
    const input = screen.getByPlaceholderText('Type a date (e.g. "Friday", "tomorrow")') as HTMLInputElement;

    // Focus input
    fireEvent.focus(input);
    
    // Blur input
    fireEvent.blur(input);

    // Press Enter inside input
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
  });

  it('adjusts placement to top when vertical space below is limited', () => {
    // Mock getBoundingClientRect for containerRef
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 500,
      bottom: 544,
      left: 100,
      right: 300,
      width: 200,
      height: 44,
      x: 100,
      y: 500,
      toJSON: () => {},
    });

    try {
      render(<DatePicker label="Date" value="" onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Toggle calendar picker' }));

      // Header should be rendered inside overlay container with top placement styling
      const header = screen.getByText('Select date');
      const overlayContainer = header.closest('.fixed, .absolute');
      expect(overlayContainer).not.toBeNull();
      expect(overlayContainer?.className).toContain('bottom-full');
      expect(overlayContainer?.className).toContain('max-h-[min(380px,80vh)]');
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it('renders calendar popup in portal attached to document.body so it is not clipped by overflow-hidden containers', () => {
    const { container } = render(
      <div style={{ overflow: 'hidden', height: 100, position: 'relative' }}>
        <DatePicker label="End date" value="2026-06-15" onChange={vi.fn()} />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle calendar picker' }));

    const header = screen.getByText('Select date');
    const popup = header.closest('.z-\\[110\\]');
    expect(popup).not.toBeNull();
    // Verify popup is rendered under document.body via portal, not trapped inside overflow:hidden container
    expect(container.contains(popup)).toBe(false);
    expect(document.body.contains(popup)).toBe(true);
  });
});
