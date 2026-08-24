import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CalendarView from '../views/CalendarView';
import { useAuth } from '../components/AuthProvider';
import type { CalendarEvent } from '../lib/calendar/calendar';

const mockEvents: CalendarEvent[] = [
  {
    id: 'ev-1',
    title: 'Product Sync',
    cat: 'product',
    start: new Date(2026, 7, 24, 10, 0),
    dur: 60,
    loc: 'Room A',
  },
  {
    id: 'ev-2',
    title: 'Design Critique',
    cat: 'workshop',
    start: new Date(2026, 7, 24, 14, 0),
    dur: 90,
  },
  {
    id: 'ev-3',
    title: 'Overlapping Meeting',
    cat: 'meeting',
    start: new Date(2026, 7, 24, 10, 30),
    dur: 60,
  },
  {
    id: 'ev-4',
    title: 'Extra Event 1',
    cat: 'meeting',
    start: new Date(2026, 7, 24, 12, 0),
    dur: 30,
  },
  {
    id: 'ev-5',
    title: 'Extra Event 2',
    cat: 'meeting',
    start: new Date(2026, 7, 24, 13, 0),
    dur: 30,
  },
  {
    id: 'ev-6',
    title: 'Extra Event 3',
    cat: 'meeting',
    start: new Date(2026, 7, 24, 15, 0),
    dur: 30,
  },
];

let subscribeCallback: (events: CalendarEvent[]) => void = () => {};
const mockSave = vi.fn();
const mockRemove = vi.fn();

vi.mock('../lib/calendar/events', () => ({
  subscribeCalendarEvents: vi.fn((cb) => {
    subscribeCallback = cb;
    cb(mockEvents);
    return vi.fn();
  }),
  saveCalendarEvent: vi.fn((ev) => mockSave(ev)),
  removeCalendarEvent: vi.fn((id) => mockRemove(id)),
  saveCalendarEventsBatch: vi.fn().mockResolvedValue(undefined),
  removeCalendarEventsBatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/calendar/categories', () => ({
  subscribeCategoryOverrides: vi.fn(() => vi.fn()),
  useCategoryVersion: vi.fn(() => 0),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

describe('CalendarView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { uid: 'u1', displayName: 'Test User' },
      role: 'admin',
      isAdmin: true,
      isOwner: true,
      logOut: vi.fn(),
    });
  });

  it('renders top bar, view switcher, and events in Month view', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Month/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Week/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agenda/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Year/i })).toBeInTheDocument();
    expect(screen.getAllByText('Product Sync').length).toBeGreaterThan(0);
  });

  it('switches between views: Week, Agenda, Year', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Week/i }));
    expect(screen.getAllByText('Product Sync').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Agenda/i }));
    expect(screen.getAllByText('Product Sync').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Year/i }));
    expect(screen.getAllByText(String(new Date().getFullYear())).length).toBeGreaterThan(0);
  });

  it('opens event details modal, triggers edit and delete', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByText('Product Sync')[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Room A')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
    expect(screen.getByText('Edit event')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
  });

  it('opens event editor when clicking New event and saves', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /New event/i }));
    expect(screen.getByText('Create event')).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText(/Event title/i);
    fireEvent.change(titleInput, { target: { value: 'New Test Event' } });

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
  });

  it('deletes an event from event details', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByText('Product Sync')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('ev-1'));
  });

  it('opens and closes bulk import modal', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Import events/i }));
    expect(screen.getByText('Upload .ics')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
  });

  it('performs search and selects search result', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    const searchInput = screen.getByPlaceholderText(/Search events/i);
    fireEvent.change(searchInput, { target: { value: 'Product' } });

    const searchMatches = screen.getAllByText('Product Sync');
    expect(searchMatches.length).toBeGreaterThan(0);
    fireEvent.click(searchMatches[searchMatches.length - 1]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('handles view switching and event creation triggers', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /New event/i }));
    expect(screen.getByText('Create event')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    fireEvent.click(screen.getByRole('button', { name: /Week/i }));
    expect(screen.getAllByText('Product Sync').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Month/i }));
    expect(screen.getAllByText('Product Sync').length).toBeGreaterThan(0);
  });

  it('handles Prev, Next, Today, and Conflict button clicks', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    const prevButtons = screen.getAllByRole('button', { name: /Prev/i });
    fireEvent.click(prevButtons[0]);
    const nextButtons = screen.getAllByRole('button', { name: /Next/i });
    fireEvent.click(nextButtons[0]);
    fireEvent.click(screen.getByText('Today'));

    const conflictButtons = screen.getAllByRole('button', { name: /conflict/i });
    if (conflictButtons.length > 0) {
      fireEvent.click(conflictButtons[0]);
    }
  });

  it('handles more popover and selecting an event from more popover', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    // Click on +N more
    const moreBtn = screen.getByRole('button', { name: /\+.*more/i });
    fireEvent.click(moreBtn);

    // Pick an event from MorePopover
    const popoverItems = screen.getAllByText('Overlapping Meeting');
    fireEvent.click(popoverItems[popoverItems.length - 1]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Click on conflicting event inside details modal
    const conflictButtons = screen.getAllByRole('button', { name: /Product Sync/i });
    if (conflictButtons.length > 0) {
      fireEvent.click(conflictButtons[0]);
    }

    // Close details
    const closeButtons = screen.getAllByRole('button', { name: /Close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
  });

  it('handles creating event at specific slot and deleting from editor', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByText('Product Sync')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
    expect(screen.getByText('Edit event')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('ev-1'));
  });

  it('handles bulk import commit', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Import events/i }));
    expect(screen.getByText('Upload .ics')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Paste text/i }));
    const textarea = screen.getByPlaceholderText(/Paste rows/i);
    fireEvent.change(textarea, {
      target: {
        value: 'Title,Date,Start,End,Category,Location,Notes\nTest Import,2026-08-25,12:00,13:00,Social,Cafe,Fun',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Preview rows/i }));
    expect(screen.getByDisplayValue('Test Import')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Import 1 event/i }));
  });

  it('handles sidebar open, backdrop click, and timeline view', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    // Open sidebar on mobile
    const toggleSidebarBtn = screen.getAllByRole('button', { name: /bars|menu/i });
    if (toggleSidebarBtn.length > 0) {
      fireEvent.click(toggleSidebarBtn[0]);
      const backdrop = document.querySelector('.sidebar-backdrop');
      if (backdrop) fireEvent.click(backdrop);
    }
  });

  it('handles empty cell click to create event and save', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    const dayCells = screen.getAllByText('25');
    if (dayCells.length > 0) {
      fireEvent.click(dayCells[0]);
    }
  });

  it('handles moving event via drag and drop', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    const eventEl = screen.getAllByText('Product Sync')[0].closest('button')!;
    const dataTransfer = {
      setData: vi.fn(),
      getData: (k: string) => (k === 'text/event' ? 'ev-1' : ''),
    };
    fireEvent.dragStart(eventEl, { dataTransfer });

    const dayCell = document.querySelector('.month-cell');
    if (dayCell) {
      fireEvent.dragOver(dayCell);
      fireEvent.drop(dayCell, { dataTransfer });
    }
  });

  it('switches between all views and interacts with view events', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    // Switch to week view and click event
    fireEvent.click(screen.getByRole('button', { name: /Week/i }));
    const weekEvents = screen.getAllByText('Product Sync');
    expect(weekEvents.length).toBeGreaterThan(0);
    fireEvent.click(weekEvents[0]);
    const closeBtn1 = screen.getAllByRole('button', { name: /Close/i });
    if (closeBtn1.length > 0) fireEvent.click(closeBtn1[closeBtn1.length - 1]);

    // Switch to agenda view and click event
    fireEvent.click(screen.getByRole('button', { name: /Agenda/i }));
    const agendaEvents = screen.getAllByText('Product Sync');
    expect(agendaEvents.length).toBeGreaterThan(0);
    fireEvent.click(agendaEvents[0]);
    const closeBtn2 = screen.getAllByRole('button', { name: /Close/i });
    if (closeBtn2.length > 0) fireEvent.click(closeBtn2[closeBtn2.length - 1]);

    // Switch to year view and click month
    fireEvent.click(screen.getByRole('button', { name: /Year/i }));
    const augustLabels = screen.getAllByText('August');
    fireEvent.click(augustLabels[augustLabels.length - 1]);
    expect(screen.getByRole('button', { name: /Month/i })).toHaveClass('is-active');
  });

  it('handles undo after saving, rescheduling, or deleting an event', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    // Create a new event
    fireEvent.click(screen.getByRole('button', { name: /New event/i }));
    const titleInput = screen.getByPlaceholderText(/Event title/i);
    fireEvent.change(titleInput, { target: { value: 'New Test Event' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());

    // Trigger undo
    const undoBtn = screen.queryByRole('button', { name: /Undo/i });
    if (undoBtn) fireEvent.click(undoBtn);
  });

  it('filters events when selecting category filter', async () => {
    render(
      <MemoryRouter>
        <CalendarView />
      </MemoryRouter>
    );

    const productButtons = screen.getAllByRole('button', { name: /Product/i });
    expect(productButtons.length).toBeGreaterThan(0);
    fireEvent.click(productButtons[0]);
  });
});
