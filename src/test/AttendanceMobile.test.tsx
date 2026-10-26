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
  ...over,
} as any);

const session = (over: any = {}) => ({
  id: 's1',
  name: 'Bible Study',
  location: 'Room 101',
  date: '2026-08-01',
  ...over,
} as any);

const event = (over: any = {}) => ({
  id: 'e1',
  name: 'Worship Night',
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
  isAdmin: false,
  onOpenContact: vi.fn(),
  onLogGathering: vi.fn(),
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
    // `since` is a season-wide gap across every Rhythm, so the row may not say
    // the absences were all this Gathering's (#1835).
    expect(screen.getByText('Gone quiet — 3 gatherings since Bible Study')).toBeInTheDocument();
    expect(screen.queryByText(/Missed \d+ gatherings/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it("states the season-wide gap for Casey's shape: on one roster, counted across another (#1835)", () => {
    render(
      <AttendanceMobile
        {...baseProps}
        missed={[{ contact: contact(), since: 4, lastSeen: session({ name: 'Friday Night Gathering' }) }]}
      />
    );
    // Three of the four counted sessions are Fridays; the fourth is a Tuesday
    // he was never rostered for. The count stands — only the claim changes.
    expect(screen.getByText('Gone quiet — 4 gatherings since Friday Night Gathering')).toBeInTheDocument();
  });

  it('says the same gap in Spanish, keeping both placeholders (#1835)', async () => {
    const { LanguageProvider } = await import('../components/LanguageProvider');
    localStorage.setItem('cisa_language', 'es');
    try {
      render(
        <LanguageProvider defaultLanguage="es">
          <AttendanceMobile
            {...baseProps}
            missed={[{ contact: contact(), since: 3, lastSeen: session({ name: 'Bible Study' }) }]}
          />
        </LanguageProvider>
      );
      expect(screen.getByText('Sin señales — 3 reuniones desde Bible Study')).toBeInTheDocument();
      expect(screen.queryByText(/Faltó a \d+ reuniones/)).not.toBeInTheDocument();
    } finally {
      localStorage.clear();
    }
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

  it('renders past sessions with attended counts and opens the roster sheet', () => {
    const here = vi.fn((_g: any, contactId: string) => contactId === 'c1');
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session({ attendance: { present: ['c1'], absent: [] } })]}
        contacts={[contact(), contact({ id: 'c2', name: 'Bob Jones' })]}
        here={here}
      />
    );
    expect(screen.getByText('Bible Study')).toBeInTheDocument();
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(document.querySelector('.gthm-scount b')?.textContent).toBe('1');

    fireEvent.click(screen.getByText('Bible Study'));
    expect(screen.getByText('Came')).toBeInTheDocument();
    expect(screen.queryByText('Here')).not.toBeInTheDocument();
    expect(screen.getByText('We missed')).toBeInTheDocument();
    expect(screen.getByText(/Tap a name to cycle/)).toBeInTheDocument();
  });

  it('says a week nobody recorded is not recorded, on the row and in the sheet (#1769)', () => {
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[contact()]}
        here={vi.fn(() => false)}
      />
    );
    expect(screen.getByText('Not recorded')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Bible Study'));
    expect(screen.getByText(/Attendance not recorded yet/)).toBeInTheDocument();
  });

  it('says attendance was recorded when it was (#1769)', () => {
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session({ attendance: { present: [], absent: [] } })]}
        contacts={[]}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    expect(screen.getByText(/Attendance recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/Attendance not recorded yet/)).not.toBeInTheDocument();
  });

  it('never says "Everyone came" for a cancelled week, and offers no marks (#1769)', () => {
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session({ cancelled: true, attendance: { present: [], absent: [] } })]}
        contacts={[contact()]}
        resolvedRosterFor={() => ['c1']}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    expect(screen.getByText(/called off/)).toBeInTheDocument();
    expect(screen.queryByText('Everyone came!')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alice Smith/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Tap a name to cycle.')).not.toBeInTheDocument();
  });

  it('reports a mark and offers Undo, because a tap can record the opposite (#1769)', () => {
    const setAttendanceStatus = vi.fn().mockResolvedValue(undefined);
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session({ attendance: { present: ['c1'], absent: [] } })]}
        contacts={[contact()]}
        here={vi.fn(() => true)}
        resolvedRosterFor={() => ['c1']}
        setAttendanceStatus={setAttendanceStatus}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByRole('button', { name: /Alice Smith — came\. Tap to mark missed/ }));
    expect(setAttendanceStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 's1', 'absent');
    expect(screen.getByText('Alice Smith moved to We missed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(setAttendanceStatus).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c1' }), 's1', 'present');
  });

  it('undoes the first tap on an unrecorded week back to no mark at all (#1769)', () => {
    const setAttendanceStatus = vi.fn().mockResolvedValue(undefined);
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[contact()]}
        here={vi.fn(() => false)}
        resolvedRosterFor={() => ['c1']}
        setAttendanceStatus={setAttendanceStatus}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByRole('button', { name: /Alice Smith — missed\. Tap to mark came/ }));
    expect(setAttendanceStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 's1', 'present');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    // The week had no record; undoing the tap must not leave a recorded absence.
    expect(setAttendanceStatus).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c1' }), 's1', undefined);
  });

  it('names the chip state and the tap action for assistive tech (#1769)', () => {
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session({ attendance: { present: [], absent: ['c1'] } })]}
        contacts={[contact()]}
        here={vi.fn(() => false)}
        resolvedRosterFor={() => ['c1']}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    expect(screen.getByRole('button', { name: /Alice Smith — missed\. Tap to mark came/ })).toBeInTheDocument();
  });

  it('is a labelled dialog that closes on Escape (#1769)', () => {
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[contact()]}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Bible Study');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the manage actions from a Student, and shows them to a Full-timer (#1769)', () => {
    const { unmount } = render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[contact()]}
        isAdmin={false}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    expect(screen.queryByText('Edit details')).not.toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    unmount();

    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session()]}
        contacts={[contact()]}
        isAdmin
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    expect(screen.getByText('Edit details')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('opens a missed contact from a real button, and only offers Message when there is a number (#1769)', () => {
    const onOpenContact = vi.fn();
    render(
      <AttendanceMobile
        {...baseProps}
        onOpenContact={onOpenContact}
        missed={[{ contact: contact({ phone: '' }), since: 3, lastSeen: session() }]}
      />
    );
    const row = screen.getByRole('button', { name: /Alice Smith/ });
    fireEvent.click(row);
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    expect(screen.queryByLabelText('Message Alice Smith')).not.toBeInTheDocument();
  });

  it('lists the same day in When we met and Coming up, and follows the reader language (#1769)', () => {
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session({ date: '2026-08-01' })]}
        upcoming={[{ id: 'e1', name: 'Worship Night', date: '2026-09-14' }]}
      />
    );
    // 2026-08-01 is a Saturday and 2026-09-14 a Monday; a UTC parse would make
    // both render a day earlier west of Greenwich.
    expect(screen.getByText('Sat')).toBeInTheDocument();
    expect(screen.getByText('Sep')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('cycles attendance from the roster sheet', () => {
    const cycleAttendance = vi.fn().mockResolvedValue(undefined);
    const here = vi.fn(() => true);
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session({ attendance: { present: ['c1'], absent: [] } })]}
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
        isAdmin
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getByText('Remove this gathering and its record?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remove'));
    expect(onDeleteSession).toHaveBeenCalledWith('s1', 'Bible Study');
  });

  it('renders upcoming events with the RsvpCount component', () => {
    render(
      <AttendanceMobile
        {...baseProps}
        upcoming={[{ id: 'e1', name: 'Worship Night', date: '2026-08-28' }]}
      />
    );
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
        isAdmin
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByText('Edit details'));
    expect(onEditSession).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('cycles attendance for absent contacts in roster sheet', () => {
    const cycleAttendance = vi.fn().mockResolvedValue(undefined);
    const absentContact = contact();
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session({ attendance: { present: [], absent: ['c1'] } })]}
        contacts={[absentContact]}
        here={vi.fn(() => false)}
        resolvedRosterFor={() => ['c1']}
        cycleAttendance={cycleAttendance}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(cycleAttendance).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 's1');
  });

  it('offers a make-a-to-do for an absent person in the roster sheet (issue #336)', () => {
    const onOpenTodo = vi.fn();
    const absentContact = contact();
    render(
      <AttendanceMobile
        {...baseProps}
        sessions={[session({ attendance: { present: [], absent: ['c1'] } })]}
        contacts={[absentContact]}
        here={vi.fn(() => false)}
        resolvedRosterFor={() => ['c1']}
        onOpenTodo={onOpenTodo}
      />
    );
    fireEvent.click(screen.getByText('Bible Study'));
    fireEvent.click(screen.getByTitle('Make a to-do to check on Alice Smith'));
    expect(onOpenTodo).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), expect.objectContaining({ id: 's1' }));
  });
  describe('Gathering sheet member chips', () => {
    const rhythmWeek = (over: any = {}) =>
      session({ rhythmId: 'r1', attendance: { present: ['c2'], absent: [] }, ...over });
    const rhythmRoster = () => ['c1', 'c2'];

    it('resolves the Rhythm roster so a regular who did not come is under We missed', () => {
      render(
        <AttendanceMobile
          {...baseProps}
          sessions={[rhythmWeek()]}
          contacts={[contact(), contact({ id: 'c2', name: 'Bob Jones' })]}
          here={vi.fn((_g: any, id: string) => id === 'c2')}
          resolvedRosterFor={rhythmRoster}
        />
      );
      fireEvent.click(screen.getByText('Bible Study'));
      expect(screen.getByRole('button', { name: /Alice Smith — missed/ })).toHaveTextContent('Alice Smith');
      expect(screen.queryByText('walk-in')).not.toBeInTheDocument();
    });

    it('tags only people outside the resolved roster as walk-ins', () => {
      render(
        <AttendanceMobile
          {...baseProps}
          sessions={[rhythmWeek({ attendance: { present: ['c2', 'c3'], absent: [] } })]}
          contacts={[contact(), contact({ id: 'c2', name: 'Bob Jones' }), contact({ id: 'c3', name: 'Cara Newcomer' })]}
          here={vi.fn((_g: any, id: string) => id !== 'c1')}
          resolvedRosterFor={rhythmRoster}
        />
      );
      fireEvent.click(screen.getByText('Bible Study'));
      expect(screen.getAllByText('walk-in')).toHaveLength(1);
      expect(screen.getByRole('button', { name: /Cara Newcomer/ })).toHaveTextContent('walk-in');
      expect(screen.getByRole('button', { name: /Bob Jones/ })).not.toHaveTextContent('walk-in');
    });

    it('offers add-to-roster on a walk-in for Full-timers only, and renders no star badge', () => {
      const onToggleRoster = vi.fn().mockResolvedValue(undefined);
      const props = {
        ...baseProps,
        sessions: [rhythmWeek({ attendance: { present: ['c2', 'c3'], absent: [] } })],
        contacts: [contact(), contact({ id: 'c2', name: 'Bob Jones' }), contact({ id: 'c3', name: 'Cara Newcomer' })],
        here: vi.fn((_g: any, id: string) => id !== 'c1'),
        resolvedRosterFor: rhythmRoster,
        onToggleRoster,
      };
      const { unmount } = render(<AttendanceMobile {...props} isAdmin />);
      fireEvent.click(screen.getByText('Bible Study'));
      expect(screen.getAllByRole('button', { name: /Add .* to roster/ })).toHaveLength(1);
      expect(screen.queryByText('★')).not.toBeInTheDocument();
      expect(screen.queryByText('+ Roster')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Add Cara Newcomer to roster' }));
      expect(onToggleRoster).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'c3', true);
      unmount();

      render(<AttendanceMobile {...props} isAdmin={false} />);
      fireEvent.click(screen.getByText('Bible Study'));
      expect(screen.queryByRole('button', { name: /Add .* to roster/ })).not.toBeInTheDocument();
      expect(screen.getByText('walk-in')).toBeInTheDocument();
    });

    it('lists roster members before walk-ins, each alphabetical', () => {
      render(
        <AttendanceMobile
          {...baseProps}
          sessions={[rhythmWeek({ attendance: { present: ['c1', 'c2', 'c3'], absent: [] } })]}
          contacts={[
            contact({ id: 'c3', name: 'Aaron Walkin' }),
            contact({ id: 'c2', name: 'Zoe Jones' }),
            contact({ id: 'c1', name: 'Mia Smith' }),
          ]}
          here={vi.fn(() => true)}
          resolvedRosterFor={() => ['c1', 'c2']}
        />
      );
      fireEvent.click(screen.getByText('Bible Study'));
      const names = screen.getAllByRole('button', { name: /Mia Smith|Zoe Jones|Aaron Walkin/ }).map((b) => b.textContent);
      expect(names[0]).toContain('Mia Smith');
      expect(names[1]).toContain('Zoe Jones');
      expect(names[2]).toContain('Aaron Walkin');
    });
  });
});
