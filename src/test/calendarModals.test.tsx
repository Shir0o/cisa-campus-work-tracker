import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FindFreeSlot } from '../components/calendar/smart/FindFreeSlot';
import { RecurrenceBlock } from '../components/calendar/smart/RecurrenceBlock';
import { SuggestDates } from '../components/calendar/smart/SuggestDates';
import { SearchResults } from '../components/calendar/SearchResults';
import { UndoToast } from '../components/calendar/UndoToast';
import { pushUndo } from '../lib/calendar/undo';
import type { CalendarEvent } from '../lib/calendar/calendar';

const sampleEvents: CalendarEvent[] = [
  {
    id: 'ev-1',
    title: 'Morning Meeting',
    cat: 'meeting',
    start: new Date(2026, 7, 24, 9, 0),
    dur: 60,
  },
  {
    id: 'ev-2',
    title: 'Afternoon Sync',
    cat: 'product',
    start: new Date(2026, 7, 24, 14, 0),
    dur: 60,
  },
];

describe('Calendar Modals & Smart Widgets', () => {
  it('renders FindFreeSlot and selects a suggested slot', () => {
    const onSelect = vi.fn();
    render(
      <FindFreeSlot
        date={new Date(2026, 7, 24)}
        dur={30}
        allEvents={sampleEvents}
        currentH={10}
        currentM={0}
        onPick={onSelect}
      />
    );

    expect(screen.getByText(/Aug 24/i)).toBeInTheDocument();
    const slotButtons = screen.getAllByRole('button');
    expect(slotButtons.length).toBeGreaterThan(0);
    fireEvent.click(slotButtons[0]);
    expect(onSelect).toHaveBeenCalled();
  });

  it('renders SuggestDates and selects a date option', () => {
    const onSelect = vi.fn();
    render(
      <SuggestDates
        date={new Date(2026, 7, 24)}
        dur={60}
        allEvents={sampleEvents}
        onPick={onSelect}
      />
    );

    expect(screen.getByText(/Quiet/i)).toBeInTheDocument();
    const dateButtons = screen.getAllByRole('button');
    expect(dateButtons.length).toBeGreaterThan(0);
    fireEvent.click(dateButtons[0]);
    expect(onSelect).toHaveBeenCalled();
  });

  it('renders RecurrenceBlock with daily, weekly, and custom recurrence controls', () => {
    const onChange = vi.fn();
    render(
      <RecurrenceBlock
        rrule={{ freq: 'weekly', interval: 1, byday: ['MO', 'WE'] }}
        date={new Date(2026, 7, 24)}
        setRrule={onChange}
      />
    );

    expect(screen.getByText(/Weekly on this day/i)).toBeInTheDocument();

    // Select custom
    fireEvent.click(screen.getByText(/Custom…/i));
    expect(onChange).toHaveBeenCalled();
  });

  it('renders SearchResults and handles picking and closing', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();

    render(
      <SearchResults
        query="Morning"
        events={sampleEvents}
        onPick={onPick}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Morning Meeting')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Morning Meeting'));
    expect(onPick).toHaveBeenCalledWith(sampleEvents[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders UndoToast and pops undo when Undo is clicked', () => {
    const applyFn = vi.fn();
    act(() => {
      pushUndo({ label: 'Deleted "Test Event"', apply: applyFn });
    });

    render(<UndoToast />);

    expect(screen.getByText(/Deleted "Test Event"/i)).toBeInTheDocument();
    const undoBtn = screen.getByRole('button', { name: /Undo/i });
    fireEvent.click(undoBtn);
    expect(applyFn).toHaveBeenCalled();
  });
});
