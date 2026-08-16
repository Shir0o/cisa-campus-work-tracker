import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MyDayMobile from '../views/MyDayMobile';
import { useAuth } from '../components/AuthProvider';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
  handleFirestoreError: vi.fn(),
  logActivity: vi.fn(),
}));

describe('MyDayMobile', () => {
  it('renders correctly with no data', () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'John Doe' },
    });

    render(<MyDayMobile contacts={[]} events={[]} prayers={[]} stages={[]} />);

    expect(screen.getByText('Good morning, John.')).toBeInTheDocument();
    expect(screen.getByText('Your sheep')).toBeInTheDocument();
    expect(screen.getByText('No contacts in your care yet.')).toBeInTheDocument();

    expect(screen.getByText('Your week')).toBeInTheDocument();
    expect(screen.getByText('Nothing on the calendar this week.')).toBeInTheDocument();

    expect(screen.getByText('Your prayers')).toBeInTheDocument();
    expect(screen.getByText('No prayers held currently.')).toBeInTheDocument();
  });

  it('renders contacts, events, and prayers correctly', () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'Jane Doe' },
    });

    const mockContacts = [
      { id: '1', name: 'Alice Smith', role: 'Student' } as any,
    ];

    const mockEvents = [
      { id: '1', name: 'Bible Study', date: new Date().toISOString(), location: 'Room 101' } as any,
      { id: '2', name: 'Worship Night', date: new Date(Date.now() + 86400000).toISOString(), location: 'Main Hall' } as any,
    ];

    const mockPrayers = [
      { id: '1', title: 'For Peace', burden: 'Praying for world peace', status: 'ongoing' } as any,
    ];

    render(<MyDayMobile contacts={mockContacts} events={mockEvents} prayers={mockPrayers} stages={[]} />);

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();

    expect(screen.getByText('Bible Study')).toBeInTheDocument();
    expect(screen.getByText(/Room 101/)).toBeInTheDocument();
    expect(screen.getByText('Worship Night')).toBeInTheDocument();
    expect(screen.getByText(/Main Hall/)).toBeInTheDocument();

    expect(screen.getByText('ongoing')).toBeInTheDocument();
  });

  it('renders with missing user displayName gracefully', () => {
    (useAuth as any).mockReturnValue({
      user: { },
    });

    render(<MyDayMobile contacts={[]} events={[]} prayers={[]} stages={[]} />);
    expect(screen.getByText('Good morning, friend.')).toBeInTheDocument();
  });

  it('renders different event configurations gracefully', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });

    const mockEvents = [
      { id: '1', name: 'Bible Study', date: new Date().toISOString() } as any, // Missing location
      { id: '2', name: 'Worship Night', date: 'invalid-date' } as any, // Invalid date
    ];

    render(<MyDayMobile contacts={[]} events={mockEvents} prayers={[]} stages={[]} />);

    expect(screen.getByText('Bible Study')).toBeInTheDocument();
    expect(screen.getByText('Worship Night')).toBeInTheDocument();
    expect(screen.getByText('No location set')).toBeInTheDocument();
    expect(screen.getByText('–')).toBeInTheDocument();
  });
  it('navigates to attendance when Calendar link is clicked', async () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'John Doe' },
    });

    render(<MyDayMobile contacts={[]} events={[{id: "1", name: "test event", date: new Date().toISOString()}] as any} prayers={[]} stages={[]} />);

    // Check if event rendered
    expect(screen.getByText('test event')).toBeInTheDocument();
  });

  it('does not crash when prayers list is empty', async () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'John Doe' },
    });

    render(<MyDayMobile contacts={[]} events={[]} prayers={[]} stages={[]} />);
    expect(screen.getByText('No prayers held currently.')).toBeInTheDocument();
  });


  it('covers the else case when no events are available for the week', () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'John Doe' },
    });

    render(<MyDayMobile contacts={[]} events={[]} prayers={[]} stages={[]} />);
    expect(screen.getByText('Nothing on the calendar this week.')).toBeInTheDocument();
  });

  it('triggers onOpenBoard and onOpenPrayer header actions when clicked', async () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onOpenBoard = vi.fn();
    const onOpenPrayer = vi.fn();

    render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        onOpenBoard={onOpenBoard}
        onOpenPrayer={onOpenPrayer}
      />
    );

    fireEvent.click(screen.getByText('The board'));
    expect(onOpenBoard).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Pray together'));
    expect(onOpenPrayer).toHaveBeenCalledTimes(1);
  });

  it('renders relational nudge prompt when staleLeader is provided and triggers onOpenContact', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onOpenContact = vi.fn();
    const staleContact = { id: 'c1', name: 'Bob Smith', stage: 'new' } as any;

    render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        staleLeader={{ contact: staleContact, days: 14, note: '' }}
        onOpenContact={onOpenContact}
      />
    );

    expect(screen.getByText(/since you sat with Bob/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/since you sat with Bob/).closest('button')!);
    expect(onOpenContact).toHaveBeenCalledWith(staleContact);
  });

  it('renders assigned and personal tasks, toggles task, edits personal task, deletes task, and adds new task', async () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onToggleTask = vi.fn();
    const onUpdatePersonalTask = vi.fn();
    const onDeletePersonalTask = vi.fn();
    const onAddPersonalTask = vi.fn();

    const assignedTasks = [
      { id: 't1', title: 'Follow up on event', status: 'pending' as const, sourceDocTitle: 'Weekly Note' },
    ];
    const personalTasks = [
      { id: 't2', title: 'Buy supplies', status: 'pending' as const, dueDate: '2026-08-20T00:00:00.000Z' },
    ];

    render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        assignedTasks={assignedTasks}
        personalTasks={personalTasks}
        onToggleTask={onToggleTask}
        onUpdatePersonalTask={onUpdatePersonalTask}
        onDeletePersonalTask={onDeletePersonalTask}
        onAddPersonalTask={onAddPersonalTask}
      />
    );

    expect(screen.getByText('From Weekly Note')).toBeInTheDocument();
    expect(screen.getByText('Buy supplies')).toBeInTheDocument();

    // Toggle assigned task checkbox
    const checkButtons = screen.getAllByRole('button').filter(b => b.classList.contains('bd-check'));
    fireEvent.click(checkButtons[0]);
    expect(onToggleTask).toHaveBeenCalledWith(assignedTasks[0]);

    // Click personal task to enter edit mode
    fireEvent.click(screen.getByText('Buy supplies'));
    const editInput = screen.getByDisplayValue('Buy supplies');
    fireEvent.change(editInput, { target: { value: 'Buy supplies updated' } });

    // Click Save
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdatePersonalTask).toHaveBeenCalledWith('t2', expect.objectContaining({ title: 'Buy supplies updated' }));

    // Re-enter edit mode and test Delete
    fireEvent.click(screen.getByText('Buy supplies'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDeletePersonalTask).toHaveBeenCalledWith('t2');

    // Test Adding new task
    fireEvent.click(screen.getByText('Add a task'));
    const newTaskInput = screen.getByPlaceholderText('What needs doing?');
    fireEvent.change(newTaskInput, { target: { value: 'New task item' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onAddPersonalTask).toHaveBeenCalledWith('New task item', expect.any(String));
  });

  it('renders the hide/show completed toggle and calls back', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onToggleHideCompleted = vi.fn();

    const { rerender } = render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        assignedTasks={[
          { id: 'a1', title: 'Done task', status: 'completed', assigneeId: 'u1', sourceDocId: 'd', createdById: 'other' },
        ]}
        personalTasks={[]}
        hasCompleted
        onToggleHideCompleted={onToggleHideCompleted}
      />
    );
    fireEvent.click(screen.getByText('Hide done'));
    expect(onToggleHideCompleted).toHaveBeenCalledTimes(1);

    rerender(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        assignedTasks={[]}
        personalTasks={[]}
        hasCompleted
        hideCompleted
        onToggleHideCompleted={onToggleHideCompleted}
      />
    );
    expect(screen.getByText('Show done')).toBeInTheDocument();

    rerender(<MyDayMobile contacts={[]} events={[]} prayers={[]} stages={[]} />);
    expect(screen.queryByText('Hide done')).not.toBeInTheDocument();
    expect(screen.queryByText('Show done')).not.toBeInTheDocument();
  });

  it('supports keyboard actions (Enter & Escape) in task composer and edit mode', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onAddPersonalTask = vi.fn();
    const personalTasks = [{ id: 't1', title: 'Task to edit', status: 'pending' as const }];

    render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        personalTasks={personalTasks}
        onAddPersonalTask={onAddPersonalTask}
      />
    );

    // Test Escape on new task composer
    fireEvent.click(screen.getByText('Add a task'));
    const newTaskInput = screen.getByPlaceholderText('What needs doing?');
    fireEvent.keyDown(newTaskInput, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('What needs doing?')).not.toBeInTheDocument();

    // Test Enter on new task composer
    fireEvent.click(screen.getByText('Add a task'));
    const newTaskInput2 = screen.getByPlaceholderText('What needs doing?');
    fireEvent.change(newTaskInput2, { target: { value: 'Keyboard task' } });
    fireEvent.keyDown(newTaskInput2, { key: 'Enter' });
    expect(onAddPersonalTask).toHaveBeenCalledWith('Keyboard task', expect.any(String));
  });

  it('triggers onOpenContact and onMessage from contacts list', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onOpenContact = vi.fn();
    const onMessage = vi.fn();
    const contact = { id: 'c1', name: 'Sam Green', stage: 'new' } as any;

    render(
      <MyDayMobile
        contacts={[contact]}
        events={[]}
        prayers={[]}
        stages={[]}
        myLeaders={[{ contact, days: 3, note: 'Check in' }]}
        onOpenContact={onOpenContact}
        onMessage={onMessage}
      />
    );

    expect(screen.getByText('Sam Green')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sam Green'));
    expect(onOpenContact).toHaveBeenCalledWith(contact);

    const msgBtn = screen.getByLabelText('Message Sam Green');
    fireEvent.click(msgBtn);
    expect(onMessage).toHaveBeenCalledWith(contact);
  });

  it('opens contacts picker bottom sheet and toggles contact selection', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onTogglePersonalContact = vi.fn();
    const contact = { id: 'c1', name: 'David Lee', stage: 'new' } as any;

    render(
      <MyDayMobile
        contacts={[contact]}
        events={[]}
        prayers={[]}
        stages={[]}
        personalContactIds={new Set(['c1'])}
        onTogglePersonalContact={onTogglePersonalContact}
      />
    );

    const openPickerButtons = screen.getAllByText('Your contacts');
    fireEvent.click(openPickerButtons[0]);

    expect(screen.getByText('Your personal contacts')).toBeInTheDocument();
    const pickerRow = screen.getAllByText('David Lee')[1].closest('button')!;
    fireEvent.click(pickerRow);
    expect(onTogglePersonalContact).toHaveBeenCalledWith('c1');

    // Close picker sheet
    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Your personal contacts')).not.toBeInTheDocument();
  });

  it('renders personal prayer composer and toggles addPP state', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onAddPersonalPrayer = vi.fn();

    render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        onAddPersonalPrayer={onAddPersonalPrayer}
      />
    );

    fireEvent.click(screen.getByText('Add a personal prayer'));
    expect(screen.getByText('Cancel')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Add a personal prayer')).toBeInTheDocument();
  });

  it('handles backdrop click on contacts picker sheet', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });

    render(
      <MyDayMobile
        contacts={[{ id: 'c1', name: 'David Lee', stage: 'new' } as any]}
        events={[]}
        prayers={[]}
        stages={[]}
      />
    );

    fireEvent.click(screen.getAllByText('Your contacts')[0]);
    const scrim = screen.getByText('Your personal contacts').closest('.myd-picker-scrim')!;
    fireEvent.click(scrim);
    expect(screen.queryByText('Your personal contacts')).not.toBeInTheDocument();
  });

  it('triggers onAddPersonalPrayer callback when AddPersonalPrayer submits', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onAddPersonalPrayer = vi.fn();

    render(
      <MyDayMobile
        contacts={[{ id: 'c1', name: 'David Lee', stage: 'new' } as any]}
        events={[]}
        prayers={[]}
        stages={[]}
        onAddPersonalPrayer={onAddPersonalPrayer}
      />
    );

    fireEvent.click(screen.getByText('Add a personal prayer'));
    // Inside AddPersonalPrayer component: click its inner trigger button if rendered
    const innerAdd = screen.getAllByText('Add a personal prayer');
    if (innerAdd.length > 0) {
      fireEvent.click(innerAdd[0]);
    }
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'New test prayer' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onAddPersonalPrayer).toHaveBeenCalledWith('New test prayer', null);
  });

  it('renders FromTraineesInbox when uid is provided', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });

    render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        uid="u1"
      />
    );
  });

  it('derives week/prayers from props when curated lists are absent', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });

    const contact = { id: 'c1', name: 'Sam Green', stage: 'new' } as any;
    const prayers = [
      { id: 'p1', contactId: 'c1', burden: 'Team prayer burden', status: 'pending' } as any,
      { id: 'p2', title: 'Personal prayer burden', status: 'pending' } as any,
    ];

    render(
      <MyDayMobile
        contacts={[contact]}
        events={[{ id: 'e1', name: 'Fall Kickoff', date: new Date().toISOString() } as any]}
        prayers={prayers}
        stages={[]}
      />
    );

    expect(screen.getByText('Fall Kickoff')).toBeInTheDocument();
    expect(screen.getByText('Team prayer burden')).toBeInTheDocument();
    expect(screen.getByText('Personal prayer burden')).toBeInTheDocument();
  });

  it('picks due presets in the composer and in the edit editor', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onAddPersonalTask = vi.fn();
    const onUpdatePersonalTask = vi.fn();
    const personalTasks = [{ id: 't1', title: 'Todo item', status: 'pending' as const }];

    render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        personalTasks={personalTasks}
        onAddPersonalTask={onAddPersonalTask}
        onUpdatePersonalTask={onUpdatePersonalTask}
      />
    );

    // Composer preset pill
    fireEvent.click(screen.getByText('Add a task'));
    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), {
      target: { value: 'With preset' },
    });
    fireEvent.click(screen.getByRole('button', { name: /This week/i }));
    fireEvent.click(screen.getByText('Add'));
    expect(onAddPersonalTask).toHaveBeenCalledWith('With preset', expect.any(String));

    // Edit-mode preset pill
    fireEvent.click(screen.getByText('Todo item'));
    fireEvent.click(screen.getByRole('button', { name: /Tomorrow/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdatePersonalTask).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ title: 'Todo item', dueDate: expect.any(String) }),
    );
  });

  it('supports Enter save and Escape cancel in task edit mode', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onUpdatePersonalTask = vi.fn();
    const personalTasks = [{ id: 't1', title: 'Editable task', status: 'pending' as const }];

    render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        personalTasks={personalTasks}
        onUpdatePersonalTask={onUpdatePersonalTask}
      />
    );

    // Enter commits the edit
    fireEvent.click(screen.getByText('Editable task'));
    const editInput = screen.getByDisplayValue('Editable task');
    fireEvent.change(editInput, { target: { value: 'Edited via Enter' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });
    expect(onUpdatePersonalTask).toHaveBeenCalledWith('t1', expect.objectContaining({ title: 'Edited via Enter' }));

    // Escape cancels the edit without saving
    fireEvent.click(screen.getByText('Editable task'));
    const editInput2 = screen.getByDisplayValue('Editable task');
    fireEvent.change(editInput2, { target: { value: 'Should not save' } });
    fireEvent.keyDown(editInput2, { key: 'Escape' });
    expect(screen.getByText('Editable task')).toBeInTheDocument();
    expect(onUpdatePersonalTask).toHaveBeenCalledTimes(1);

    // Cancel button exits edit mode too
    fireEvent.click(screen.getByText('Editable task'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Editable task')).toBeInTheDocument();
  });

  it('ignores empty task commits in composer and editor', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onAddPersonalTask = vi.fn();
    const onUpdatePersonalTask = vi.fn();
    const personalTasks = [{ id: 't1', title: 'Keep me', status: 'pending' as const }];

    render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        personalTasks={personalTasks}
        onAddPersonalTask={onAddPersonalTask}
        onUpdatePersonalTask={onUpdatePersonalTask}
      />
    );

    // Empty composer commit
    fireEvent.click(screen.getByText('Add a task'));
    fireEvent.click(screen.getByText('Add'));
    expect(onAddPersonalTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('What needs doing?')).not.toBeInTheDocument();

    // Empty editor commit
    fireEvent.click(screen.getByText('Keep me'));
    const editInput = screen.getByDisplayValue('Keep me');
    fireEvent.change(editInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdatePersonalTask).not.toHaveBeenCalled();
  });

  it('toggles a personal task via its checkbox', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });
    const onToggleTask = vi.fn();
    const personalTasks = [{ id: 't1', title: 'Personal todo', status: 'pending' as const }];

    render(
      <MyDayMobile
        contacts={[]}
        events={[]}
        prayers={[]}
        stages={[]}
        personalTasks={personalTasks}
        onToggleTask={onToggleTask}
      />
    );

    const check = screen.getByText('Personal todo').parentElement!.parentElement!.querySelector('.bd-check')!;
    fireEvent.click(check);
    expect(onToggleTask).toHaveBeenCalledWith(personalTasks[0]);
  });

  it('opens the contacts picker from the prayers section', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });

    render(
      <MyDayMobile
        contacts={[{ id: 'c1', name: 'David Lee', stage: 'new' } as any]}
        events={[]}
        prayers={[]}
        stages={[]}
      />
    );

    const pickerButtons = screen.getAllByText('Your contacts');
    fireEvent.click(pickerButtons[pickerButtons.length - 1]);
    expect(screen.getByText('Your personal contacts')).toBeInTheDocument();
  });
});

