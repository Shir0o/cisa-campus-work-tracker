import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthView } from '../components/calendar/MonthView';
import { WeekView } from '../components/calendar/WeekView';
import { AgendaView } from '../components/calendar/AgendaView';
import { TimelineView } from '../components/calendar/TimelineView';
import { YearView } from '../components/calendar/YearView';
import { EventDetailsModal } from '../components/calendar/EventDetailsModal';
import { EventEditorModal } from '../components/calendar/EventEditorModal';
import { BulkImportModal } from '../components/calendar/BulkImportModal';
import { HoverPreview } from '../components/calendar/HoverPreview';
import { MorePopover } from '../components/calendar/MorePopover';
import { UndoToast } from '../components/calendar/UndoToast';
import { TweaksPanel } from '../components/calendar/TweaksPanel';
import type { CalendarEvent } from '../lib/calendar/calendar';

const mockEvents: CalendarEvent[] = [
  {
    id: 'e1',
    title: 'Standup',
    cat: 'meeting',
    start: new Date(2026, 7, 24, 9, 30),
    dur: 30,
    loc: 'Zoom',
    notes: 'Morning sync',
  },
  {
    id: 'e2',
    title: 'Code Review',
    cat: 'product',
    start: new Date(2026, 7, 24, 10, 0),
    dur: 60,
  },
  {
    id: 'e3',
    title: 'All-Day Hackathon',
    cat: 'workshop',
    start: new Date(2026, 7, 24, 0, 0),
    allDay: true,
  },
];

const mockConflicts = new Map<string, number>([['e1', 1]]);

describe('Calendar Views & Components', () => {
  it('renders MonthView with all-day bars, deadlines, conflicts, hover, drag-and-drop, and more buttons', () => {
    const onPickEvent = vi.fn();
    const onCreateAt = vi.fn();
    const onPickMore = vi.fn();
    const onMoveEvent = vi.fn();
    const setHoverEvent = vi.fn();

    const richEvents: CalendarEvent[] = [
      ...mockEvents,
      {
        id: 'travel-1',
        title: 'Conference Trip',
        cat: 'travel',
        start: new Date(2026, 7, 24),
        end: new Date(2026, 7, 27),
        allDay: true,
      },
      {
        id: 'deadline-1',
        title: 'Grant Submission',
        cat: 'deadline',
        start: new Date(2026, 7, 25, 17, 0),
      },
      { id: 'm1', title: 'M1', cat: 'meeting', start: new Date(2026, 7, 24, 11, 0) },
      { id: 'm2', title: 'M2', cat: 'meeting', start: new Date(2026, 7, 24, 12, 0) },
      { id: 'm3', title: 'M3', cat: 'meeting', start: new Date(2026, 7, 24, 13, 0) },
      { id: 'm4', title: 'M4', cat: 'meeting', start: new Date(2026, 7, 24, 14, 0) },
      { id: 'm5', title: 'M5', cat: 'meeting', start: new Date(2026, 7, 24, 15, 0) },
    ];

    render(
      <MonthView
        cursor={new Date(2026, 7, 24)}
        events={richEvents}
        conflicts={new Map([['e1', 1]])}
        onPickEvent={onPickEvent}
        onPickMore={onPickMore}
        onMoveEvent={onMoveEvent}
        onCreateAt={onCreateAt}
        density="default"
        showWeekends={true}
        canDrag={true}
        setHoverEvent={setHoverEvent}
      />
    );

    expect(screen.getByText('Conference Trip')).toBeInTheDocument();
    expect(screen.getByText('Grant Submission')).toBeInTheDocument();

    // Test hover on month event
    const standupBtn = screen.getByText('Standup').closest('button')!;
    fireEvent.mouseEnter(standupBtn, { clientX: 150, clientY: 200 });
    expect(setHoverEvent).toHaveBeenCalled();
    fireEvent.mouseLeave(standupBtn);

    // Test more button
    const moreBtn = screen.getByRole('button', { name: /\+.*more/i });
    fireEvent.click(moreBtn);
    expect(onPickMore).toHaveBeenCalled();

    // Test drag and drop
    const dataTransfer = { setData: vi.fn(), getData: () => 'travel-1' };
    fireEvent.dragStart(standupBtn, { dataTransfer });

    const dayCells = screen.getAllByText('24');
    fireEvent.dragOver(dayCells[0]);
    fireEvent.drop(dayCells[0], { dataTransfer });
  });

  it('renders WeekView with timed events and handles slot creation and hover', () => {
    const onPickEvent = vi.fn();
    const onCreateAt = vi.fn();
    const setHoverEvent = vi.fn();

    render(
      <WeekView
        cursor={new Date(2026, 7, 24)}
        events={mockEvents}
        conflicts={mockConflicts}
        density="default"
        onPickEvent={onPickEvent}
        onMoveEvent={vi.fn()}
        onCreateAt={onCreateAt}
        showWeekends={true}
        canDrag={true}
        setHoverEvent={setHoverEvent}
      />
    );

    expect(screen.getByText('Standup')).toBeInTheDocument();
    expect(screen.getByText('All-Day Hackathon')).toBeInTheDocument();

    const standup = screen.getByText('Standup').closest('button')!;
    fireEvent.mouseEnter(standup, { clientX: 100, clientY: 100 });
    expect(setHoverEvent).toHaveBeenCalled();
    fireEvent.mouseLeave(standup);
  });

  it('renders AgendaView and groups items by date', () => {
    const onPickEvent = vi.fn();

    render(
      <AgendaView
        cursor={new Date(2026, 7, 24)}
        events={mockEvents}
        conflicts={mockConflicts}
        onPickEvent={onPickEvent}
      />
    );

    expect(screen.getByText('Standup')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Standup'));
    expect(onPickEvent).toHaveBeenCalled();
  });

  it('renders TimelineView horizontal bars', () => {
    const onPickEvent = vi.fn();

    render(
      <TimelineView
        cursor={new Date(2026, 7, 24)}
        events={mockEvents}
        conflicts={mockConflicts}
        onPickEvent={onPickEvent}
        setHoverEvent={vi.fn()}
      />
    );

    expect(screen.getByText('Standup')).toBeInTheDocument();
  });

  it('renders YearView 12-month overview', () => {
    const onPickMonth = vi.fn();

    render(
      <YearView
        cursor={new Date(2026, 7, 24)}
        events={mockEvents}
        onPickEvent={vi.fn()}
        onPickMonth={onPickMonth}
      />
    );

    expect(screen.getByText('August')).toBeInTheDocument();
    fireEvent.click(screen.getByText('August'));
    expect(onPickMonth).toHaveBeenCalled();
  });

  it('renders EventDetailsModal with actions and edit/delete triggers', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();

    render(
      <EventDetailsModal
        event={mockEvents[0]}
        allEvents={mockEvents}
        canEdit={true}
        onClose={onClose}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText('Standup')).toBeInTheDocument();
    expect(screen.getByText('Zoom')).toBeInTheDocument();
    expect(screen.getByText('Morning sync')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
    expect(onEdit).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('renders EventEditorModal and modifies title, allDay, notes, and submits changes', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const onDelete = vi.fn();

    render(
      <EventEditorModal
        initial={{ ...mockEvents[0], start: mockEvents[0].start }}
        allEvents={mockEvents}
        onClose={onClose}
        onSave={onSave}
        onDelete={onDelete}
      />
    );

    expect(screen.getByDisplayValue('Standup')).toBeInTheDocument();

    // Toggle all-day button
    const allDayToggle = screen.getByText('No').closest('button')!;
    fireEvent.click(allDayToggle);

    // Change location and notes
    const locationInput = screen.getByPlaceholderText(/Galileo Room/i);
    fireEvent.change(locationInput, { target: { value: 'Building 5' } });

    const notesInput = screen.getByPlaceholderText(/Agenda, links/i);
    fireEvent.change(notesInput, { target: { value: 'Updated notes' } });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it('renders BulkImportModal, parses rows, edits title, and imports', () => {
    const onClose = vi.fn();
    const onCommit = vi.fn();

    render(
      <BulkImportModal
        existing={mockEvents}
        onClose={onClose}
        onCommit={onCommit}
      />
    );

    expect(screen.getByText('Upload .ics')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Paste text/i }));

    const textarea = screen.getByPlaceholderText(/Paste rows/i);
    fireEvent.change(textarea, {
      target: {
        value:
          'Title,Date,Start,End,Category,Location,Notes\nTeam Lunch,2026-08-25,12:00,13:00,Social,Cafe,Tacos',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Preview rows/i }));
    expect(screen.getByDisplayValue('Team Lunch')).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue('Team Lunch');
    fireEvent.change(titleInput, { target: { value: 'Team Mexican Lunch' } });

    const importBtn = screen.getByRole('button', { name: /Import 1 event/i });
    fireEvent.click(importBtn);
  });

  it('renders HoverPreview card', () => {
    render(
      <HoverPreview
        hover={{
          ev: mockEvents[0],
          x: 100,
          y: 100,
          conflicts: 0,
        }}
      />
    );

    expect(screen.getByText('Standup')).toBeInTheDocument();
  });

  it('renders MorePopover list', () => {
    const onPickEvent = vi.fn();
    const onClose = vi.fn();

    render(
      <MorePopover
        payload={{
          day: new Date(2026, 7, 24),
          events: mockEvents,
        }}
        onClose={onClose}
        onPickEvent={onPickEvent}
      />
    );

    expect(screen.getByText('Standup')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Standup'));
    expect(onPickEvent).toHaveBeenCalled();
  });

  it('renders TweaksPanel controls', () => {
    const setTweak = vi.fn();

    render(
      <TweaksPanel
        tweaks={{
          density: 'default',
          showWeekends: true,
          theme: 'light',
          accent: '#2563eb',
          defaultView: 'month',
          showConflicts: true,
        }}
        setTweak={setTweak}
      />
    );

    const fab = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(fab);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
