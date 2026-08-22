import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AttendanceMobile from '../views/AttendanceMobile';

vi.mock('../lib/messaging', () => ({
  openMessage: vi.fn(),
}));
import { openMessage } from '../lib/messaging';

const RsvpStub = ({ eventId }: any) => <span data-testid={`rsvp-${eventId}`}>rsvp</span>;

const contact = (over: any = {}) => ({
  id: 'c1',
  name: 'Alice Smith',
  role: 'Student',
  location: 'Miller Hall',
  phone: '+15551234',
  attendance: {} as any,
  ...over,
} as any);

const session = (over: any = {}) => ({
  id: 's1',
  name: 'Bible Study',
  type: 'Bible Study',
  location: 'Room 101',
  date: '2026-08-01',
  ...over,
} as any);

const event = (over: any = {}) => ({
  id: 'e1',
  name: 'Worship Night',
  type: 'Worship',
  location: 'Main Hall',
  date: '2026-08-12',
  ...over,
} as any);

const baseProps = {
  contacts: [] as any[],
  events: [] as any[],
  sessions: [] as any[],
  upcoming: [] as any[],
  missed: [] as any[],
  avgPer: 0,
  activeFilter: 'All',
  setTypeFilter: vi.fn(),
  gatheringTypes: [{ id: 'g1', name: 'Outreach' }] as any[],
  isAdmin: false,
  onOpenContact: vi.fn(),
  onLogGathering: vi.fn(),
  onManageTypes: vi.fn(),
  onEditSession: vi.fn(),
  onDeleteSession: vi.fn().mockResolvedValue(undefined),
  cycleAttendance: vi.fn().mockResolvedValue(undefined),
  here: vi.fn(() => false),
  RsvpCountComponent: RsvpStub,
};

describe('AttendanceMobile', () => {
  it('renders header stats and the log button for admins only', () => {
    const { rerender } = render(<AttendanceMobile {...baseProps} events={[event()]} avgPer={12} isAdmin />);
    expect(screen.getByText('Gatherings')).toBeInTheDocument();
    expect(screen.getByText('1 times')).toBeInTheDocument();
    expect(screen.getByText('12 people')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Log a gathering'));
    expect(baseProps.onLogGathering).toHaveBeenCalled();

    rerender(<AttendanceMobile {...baseProps} isAdmin={false} />);
    expect(screen.queryByText('Log a gathering')).not.toBeInTheDocument();
  });

  it('lists missed contacts and opens them on tap', () => {
    const onOpenContact = vi.fn();
    render(
      <AttendanceMobile
        {...baseProps}
        onOpenContact={onOpenContact}
        missed={[{ contact: contact(), since: 3, lastSeen: session({ name: 'Bible Study' }) }]}
      />
    );
    expect(screen.getByText("Who we've missed")).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText(/Missed/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it('messages a missed contact via openMessage', () => {
    render(
      <AttendanceMobile
        {...baseProps}
        missed={[{ contact: contact(), since: 1, lastSeen: session() }]}
      />
    );
    fireEvent.click(screen.getByLabelText('Message Alice Smith'));
    expect(openMessage).toHaveBeenCalledWith('+15551234');
  });

  it('renders filter pills and calls setTypeFilter on selection', () => {
    const setTypeFilter = vi.fn();
    render(<AttendanceMobile {...baseProps} setTypeFilter={setTypeFilter} />);
    fireEvent.click(screen.getByText('Outreach'));
    expect(setTypeFilter).toHaveBeenCalledWith('Outreach');
  });

  it('renders past sessions with attended counts and opens the roster sheet', () => {
    const here = vi.fn((c: any) => c.id === 'c1');
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[contact(), contact({ id: 'c2', name: 'Bob Jones' })]}
        here={here}
      />
    );
    expect(screen.getByText('Bible Study')).toBeInTheDocument();
    expect(screen.getByText('Bible Study · Room 101')).toBeInTheDocument();
    expect(document.querySelector('.gthm-scount b')?.textContent).toBe('1');

    fireEvent.click(screen.getByText('Bible Study'));
    expect(screen.getAllByText('Here').length).toBeGreaterThan(0);
    expect(screen.getByText('We missed')).toBeInTheDocument();
    expect(screen.getByText('Tap a name to cycle.')).toBeInTheDocument();
  });

  it('cycles attendance from the roster sheet', () => {
    const cycleAttendance = vi.fn().mockResolvedValue(undefined);
    const here = vi.fn(() => true);
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[contact()]}
        here={here}
        cycleAttendance={cycleAttendance}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(cycleAttendance).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 's1');
  });

  it('deletes a session after confirmation', async () => {
    const onDeleteSession = vi.fn().mockResolvedValue(undefined);
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[contact()]}
        onDeleteSession={onDeleteSession}
        here={vi.fn(() => true)}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getByText('Remove this gathering and its record?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remove'));
    expect(onDeleteSession).toHaveBeenCalledWith('s1', 'Bible Study');
  });

  it('renders upcoming events with the RsvpCount component', () => {
    render(<AttendanceMobile {...baseProps} upcoming={[{ ev: event(), ms: 1000 }]} />);
    expect(screen.getByText('Worship Night')).toBeInTheDocument();
    expect(screen.getByTestId('rsvp-e1')).toBeInTheDocument();
    expect(screen.queryByText('Nothing on the calendar this week.')).not.toBeInTheDocument();
  });

  it('calls onEditSession when Edit details is clicked in session sheet', () => {
    const onEditSession = vi.fn();
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[contact()]}
        onEditSession={onEditSession}
        here={vi.fn(() => true)}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByText('Edit details'));
    expect(onEditSession).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('cycles attendance for absent contacts in roster sheet', () => {
    const cycleAttendance = vi.fn().mockResolvedValue(undefined);
    const absentContact = contact({ attendance: { s1: 'absent' } });
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[absentContact]}
        here={vi.fn(() => false)}
        cycleAttendance={cycleAttendance}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(cycleAttendance).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 's1');
  });

  it('offers a make-a-to-do for an absent person in the roster sheet (issue #336)', () => {
    const onOpenTodo = vi.fn();
    const absentContact = contact({ attendance: { s1: 'absent' } });
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[absentContact]}
        here={vi.fn(() => false)}
        onOpenTodo={onOpenTodo}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByTitle('Make a to-do to check on Alice Smith'));
    expect(onOpenTodo).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), expect.objectContaining({ id: 's1' }));
  });
});
