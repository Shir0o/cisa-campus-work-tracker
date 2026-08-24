import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FindFreeSlot } from '../components/calendar/smart/FindFreeSlot';
import { RecurrenceBlock } from '../components/calendar/smart/RecurrenceBlock';
import { SuggestDates } from '../components/calendar/smart/SuggestDates';
import { TopBar } from '../components/calendar/TopBar';
import { Sidebar } from '../components/calendar/Sidebar';
import type { CalendarEvent, RRule } from '../lib/calendar/calendar';

const mockEvents: CalendarEvent[] = [
  {
    id: 'e1',
    title: 'Standup',
    cat: 'meeting',
    start: new Date(2026, 7, 24, 9, 30),
    dur: 30,
    loc: 'Zoom',
  },
  {
    id: 'e2',
    title: 'Review',
    cat: 'product',
    start: new Date(2026, 7, 24, 14, 0),
    dur: 60,
  },
];

describe('Calendar Smart & Layout Components', () => {
  it('renders FindFreeSlot and picks a slot', () => {
    const onPick = vi.fn();
    render(
      <FindFreeSlot
        allEvents={mockEvents}
        date={new Date(2026, 7, 24)}
        dur={30}
        currentH={9}
        currentM={0}
        onPick={onPick}
      />
    );

    const slotButtons = screen.getAllByRole('button');
    expect(slotButtons.length).toBeGreaterThan(0);
    fireEvent.click(slotButtons[0]);
    expect(onPick).toHaveBeenCalled();
  });

  it('renders RecurrenceBlock and toggles recurring rules', () => {
    const setRrule = vi.fn();

    render(
      <RecurrenceBlock
        rrule={null}
        setRrule={setRrule}
        date={new Date(2026, 7, 24)}
      />
    );

    const dailyBtn = screen.getByRole('button', { name: /Daily/i });
    fireEvent.click(dailyBtn);
    expect(setRrule).toHaveBeenCalled();
  });

  it('renders SuggestDates and picks a date suggestion', () => {
    const onPick = vi.fn();
    render(
      <SuggestDates
        allEvents={mockEvents}
        date={new Date(2026, 7, 24)}
        dur={30}
        onPick={onPick}
      />
    );

    const suggestions = screen.getAllByRole('button');
    expect(suggestions.length).toBeGreaterThan(0);
    fireEvent.click(suggestions[0]);
    expect(onPick).toHaveBeenCalled();
  });

  it('renders TopBar with navigation, search, and view buttons', () => {
    const setCursor = vi.fn();
    const setView = vi.fn();
    const setQuery = vi.fn();
    const onConflictClick = vi.fn();
    const onToday = vi.fn();

    render(
      <TopBar
        view="month"
        setView={setView}
        cursor={new Date(2026, 7, 24)}
        setCursor={setCursor}
        query=""
        setQuery={setQuery}
        conflictCount={2}
        onConflictClick={onConflictClick}
        onToday={onToday}
      />
    );

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Prev/i }));
    expect(setCursor).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(setCursor).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: /Week/i }));
    expect(setView).toHaveBeenCalledWith('week');
  });

  it('renders Sidebar with category toggles and coming up items', () => {
    const setCatFilter = vi.fn();
    const onCreate = vi.fn();
    const onOpenImport = vi.fn();
    const onPickEvent = vi.fn();
    const setCursor = vi.fn();
    const onSignOut = vi.fn();

    render(
      <Sidebar
        cursor={new Date(2026, 7, 24)}
        setCursor={setCursor}
        rawEvents={mockEvents}
        expandedEvents={mockEvents}
        catFilter={['meeting', 'product']}
        setCatFilter={setCatFilter}
        accent={{ c: '#2563eb' }}
        role="admin"
        canCreate={true}
        onCreate={onCreate}
        onOpenImport={onOpenImport}
        onPickEvent={onPickEvent}
        onSignOut={onSignOut}
      />
    );

    expect(screen.getByRole('button', { name: /New event/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import events/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /New event/i }));
    expect(onCreate).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Import events/i }));
    expect(onOpenImport).toHaveBeenCalled();
  });
});
