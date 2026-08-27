import "./useMediaQuery.mock";
import "../lib/useMediaQuery";
import { useMediaQuery } from '../lib/useMediaQuery';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onSnapshot, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import MyDay from '../views/MyDay';
import { useAuth } from '../components/AuthProvider';
import { format } from 'date-fns';

// ── Mocks ──────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const mockSetSelectedContact = vi.fn();
// ContactDetailsModal (rendered closed) pulls useLayout from ../App.
vi.mock('../App', () => ({
  useLayout: vi.fn(() => ({ setSelectedContact: mockSetSelectedContact, openLogInteraction: vi.fn() })),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  onSnapshot: vi.fn((_, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  collectionGroup: vi.fn((_db: unknown, group: string) => ({ path: group })),
  doc: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(() => Promise.resolve()),
  getFirestore: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
  serverTimestamp: vi.fn(),
  Timestamp: class MockTimestamp {
    static now() { return new MockTimestamp(); }
    static fromDate(_d: Date) { return new MockTimestamp(); }
    toDate() { return new Date(); }
  },
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE', DELETE: 'DELETE', WRITE: 'WRITE' },
}));

// New My Day libs — mocked so we can drive subscription data and assert calls.
// (todos stays real so dueChip / presets run against the mocked firestore.)
const h = vi.hoisted(() => ({
  saveUserPreferences: vi.fn(),
  addPersonalPrayer: vi.fn(),
  updatePersonalPrayer: vi.fn(),
  deletePersonalPrayer: vi.fn(),
  updatePrayerStatus: vi.fn(),
  openMessage: vi.fn(),
  prefsData: {} as any,
  personalPrayersData: [] as any[],
}));
vi.mock('../lib/userPreferences', () => ({
  subscribeUserPreferences: (_uid: string, cb: any) => {
    cb(h.prefsData);
    return vi.fn();
  },
  saveUserPreferences: (...a: any[]) => h.saveUserPreferences(...a),
}));
vi.mock('../lib/personalPrayers', () => ({
  subscribePersonalPrayers: (_uid: string, cb: any) => {
    cb(h.personalPrayersData);
    return vi.fn();
  },
  addPersonalPrayer: (...a: any[]) => h.addPersonalPrayer(...a),
  updatePersonalPrayer: (...a: any[]) => h.updatePersonalPrayer(...a),
  deletePersonalPrayer: (...a: any[]) => h.deletePersonalPrayer(...a),
}));
vi.mock('../lib/prayers', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    updatePrayerStatus: (...a: any[]) => h.updatePrayerStatus(...a),
  };
});
vi.mock('../lib/messaging', () => ({
  openMessage: (...a: any[]) => h.openMessage(...a),
}));

const soonISO = new Date(Date.now() + 2 * 86_400_000).toISOString();

// Build an onSnapshot implementation that returns specific docs per collection
// path and empty results for everything else.
type DocLike = { id: string; ref: { path: string }; data: () => any };
const byPath =
  (map: Record<string, DocLike[]>) =>
  (ref: any, callback: any) => {
    const p = ref?.path;
    callback({ docs: (p && map[p]) || [], size: (p && map[p]?.length) || 0 });
    return vi.fn();
  };

const contactDoc = (id: string, data: any): DocLike => ({
  id,
  ref: { path: `contacts/${id}` },
  data: () => data,
});
const taskDoc = (id: string, data: any): DocLike => ({
  id,
  ref: { path: `tasks/${id}` },
  data: () => data,
});
const prayerDoc = (id: string, data: any): DocLike => ({
  id,
  ref: { path: `prayers/${id}` },
  data: () => data,
});
const eventDoc = (id: string, data: any): DocLike => ({
  id,
  ref: { path: `events/${id}` },
  data: () => data,
});

describe('MyDay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    h.prefsData = {};
    h.personalPrayersData = [];
    vi.mocked(onSnapshot).mockImplementation((_: any, callback: any) => {
      callback({ docs: [], size: 0 });
      return vi.fn();
    });
    (useAuth as any).mockReturnValue({
      user: { displayName: 'Test User', uid: 'u-test' },
    });
  });

  afterEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  it('renders the loading skeleton until data resolves', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn()); // never fires
    render(<MyDay />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('surfaces a load error when a listener fails', async () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, onError?: any) => {
      onError?.(new Error('permission-denied'));
      return vi.fn();
    });
    render(<MyDay />);
    expect(await screen.findByText(/Couldn't load/)).toBeInTheDocument();
  });

  it('renders greeting, all sections and the quiet figures footer', async () => {
    render(<MyDay />);
    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening), Test\./)).toBeInTheDocument();
      expect(screen.getByText('On the horizon')).toBeInTheDocument();
      expect(screen.getByText('Your sheep')).toBeInTheDocument();
      expect(screen.getByText('Your week')).toBeInTheDocument();
      expect(screen.getByText('Your prayers')).toBeInTheDocument();
      expect(screen.getByText('Numbers are just a way of noticing people.')).toBeInTheDocument();
    });
  });

  it('shows the day’s goal figure to a full-timer when someone is new today (#544)', async () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'Test User', uid: 'u-test' }, role: 'admin' });
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-new', { name: 'Ana', createdBy: 'u-test', createdAt: new Date().toISOString() })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => {
      expect(screen.getByText('new people today, across the team')).toBeInTheDocument();
    });
  });

  it('never shows the day’s goal figure to a trainee', async () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'Test User', uid: 'u-test' }, role: 'manager' });
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-new', { name: 'Ana', createdBy: 'u-test', createdAt: new Date().toISOString() })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening), Test\./)).toBeInTheDocument();
    });
    expect(screen.queryByText('new people today, across the team')).toBeNull();
  });

  it('shows warm empty states when nothing is owned', async () => {
    render(<MyDay />);
    await waitFor(() => {
      expect(
        screen.getByText('Nothing on the horizon right now — a rare, quiet moment.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText("No one's in your care yet — pick your contacts to gather them here."),
      ).toBeInTheDocument();
      expect(screen.getByText('Nothing on the calendar this week yet.')).toBeInTheDocument();
      expect(screen.getByText('No prayers in your care right now.')).toBeInTheDocument();
    });
  });

  it('renders gracefully when user has no uid (no tasks subscription)', async () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'Test User' } });
    render(<MyDay />);
    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening), Test\./)).toBeInTheDocument();
    });
  });

  // ── On the horizon: two tiers ──────────────────────────────────────────
  it('treats a sourced task as read-only "Assigned to you" with a From link', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('t-team', {
            title: 'Confirm the setlist',
            dueDate: soonISO,
            status: 'pending',
            assigneeId: 'u-test',
            createdById: 'someone-else',
            sourceDocId: 'BD-fri',
            sourceDocTitle: 'Friday run of show',
          }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Confirm the setlist')).toBeInTheDocument());

    expect(screen.getByText('Assigned to you')).toBeInTheDocument();
    expect(screen.getByText(/From Friday run of show/)).toBeInTheDocument();

    // Expanding reveals a due editor but NO text input (text is read-only here).
    fireEvent.click(screen.getByText('Confirm the setlist'));
    await waitFor(() => expect(screen.getByText('open it on The Board')).toBeInTheDocument());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    // Adjusting the due date persists via updateTodo → updateDoc.
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(updateDoc).toHaveBeenCalled();

    // Jump-to-board navigates with the focus doc id.
    fireEvent.click(screen.getByText('open it on The Board'));
    expect(mockNavigate).toHaveBeenCalledWith('/coordination', { state: { focusDocId: 'BD-fri' } });
  });

  it('treats a sourceless self-created task as a fully editable personal task', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('t-mine', {
            title: 'Plan my week',
            dueDate: soonISO,
            status: 'pending',
            assigneeId: 'u-test',
            createdById: 'u-test',
          }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Plan my week')).toBeInTheDocument());

    // No group labels when only one group is present.
    expect(screen.queryByText('Assigned to you')).not.toBeInTheDocument();

    // Expand → editable text field.
    fireEvent.click(screen.getByText('Plan my week'));
    const input = await screen.findByDisplayValue('Plan my week');
    fireEvent.change(input, { target: { value: 'Plan my week carefully' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateDoc).toHaveBeenCalled();
  });

  it('deletes a personal task', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('t-mine', {
            title: 'Throwaway task',
            status: 'pending',
            assigneeId: 'u-test',
            createdById: 'u-test',
          }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Throwaway task')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Throwaway task'));
    fireEvent.click(await screen.findByRole('button', { name: /Delete/ }));
    expect(deleteDoc).toHaveBeenCalled();
  });

  it('adds a personal task through the inline composer', async () => {
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Add a task')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add a task'));
    const input = await screen.findByPlaceholderText('What needs doing?');
    fireEvent.change(input, { target: { value: 'A brand new task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addDoc).toHaveBeenCalled();
  });

  it('marks an assigned task done via the check button', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('t1', {
            title: 'Finish me',
            status: 'pending',
            assigneeId: 'u-test',
            sourceDocId: 'BD-x',
            sourceDocTitle: 'Doc',
          }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Finish me')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Mark done'));
    expect(updateDoc).toHaveBeenCalled();
  });

  it('renders completed tasks with line-through styling', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('done-1', {
            title: 'Already finished task',
            status: 'completed',
            assigneeId: 'u-test',
            createdById: 'u-test',
          }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Show completed')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Show completed'));
    await waitFor(() => {
      expect(screen.getByText('Already finished task').className).toContain('line-through');
    });
  });

  it('hides completed tasks via the toggle and restores them on show', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('done-1', {
            title: 'Finished task',
            status: 'completed',
            assigneeId: 'u-test',
            createdById: 'u-test',
          }),
          taskDoc('todo-1', {
            title: 'Open task',
            status: 'pending',
            assigneeId: 'u-test',
            createdById: 'u-test',
          }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Open task')).toBeInTheDocument());
    expect(screen.queryByText('Finished task')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Show completed'));
    await waitFor(() => expect(screen.getByText('Finished task')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Hide completed'));
    await waitFor(() => expect(screen.queryByText('Finished task')).not.toBeInTheDocument());
  });

  it('omits the hide-completed toggle when nothing is completed', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('todo-1', {
            title: 'Only open task',
            status: 'pending',
            assigneeId: 'u-test',
            createdById: 'u-test',
          }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Only open task')).toBeInTheDocument());
    expect(screen.queryByText('Hide completed')).not.toBeInTheDocument();
  });

  it('handles toggle errors gracefully via handleFirestoreError', async () => {
    const { handleFirestoreError } = await import('../lib/firebase');
    // setTodoDone wraps its own try/catch; force the firestore call to reject.
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error('Permission denied'));
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('t-err', { title: 'Failing task', status: 'pending', assigneeId: 'u-test', createdById: 'u-test' }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Failing task')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Mark done'));
    await waitFor(() => expect(handleFirestoreError).toHaveBeenCalled());
  });

  it('covers all dueChip variant labels', async () => {
    const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
    const soonName = format(new Date(Date.now() + 3 * 86_400_000), 'EEEE');
    const farName = format(new Date(Date.now() + 10 * 86_400_000), 'MMM d');
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('a', { title: 'A', dueDate: iso(0), status: 'pending', assigneeId: 'u-test', sourceDocId: 'd' }),
          taskDoc('b', { title: 'B', dueDate: iso(1), status: 'pending', assigneeId: 'u-test', sourceDocId: 'd' }),
          taskDoc('c', { title: 'C', dueDate: iso(3), status: 'pending', assigneeId: 'u-test', sourceDocId: 'd' }),
          taskDoc('e', { title: 'E', dueDate: iso(10), status: 'pending', assigneeId: 'u-test', sourceDocId: 'd' }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => {
      expect(screen.getByText('Due today')).toBeInTheDocument();
      expect(screen.getByText('Due tomorrow')).toBeInTheDocument();
      expect(screen.getByText(`Due ${soonName}`)).toBeInTheDocument();
      expect(screen.getByText(`Due ${farName}`)).toBeInTheDocument();
    });
  });

  // ── Your sheep ────────────────────────────────────────────────────────
  it('lists all personal contacts (no cap) and opens the picker', async () => {
    const contacts = Array.from({ length: 8 }, (_, i) =>
      contactDoc(`c-${i}`, { name: `Sheep ${i}`, initials: `S${i}`, stage: 'First Contact', createdBy: 'u-test' }),
    );
    vi.mocked(onSnapshot).mockImplementation(byPath({ contacts }));
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Sheep 0')).toBeInTheDocument());
    // No 6-cap anymore.
    expect(screen.getByText('Sheep 7')).toBeInTheDocument();

    // Open the picker and toggle a contact → persists via saveUserPreferences.
    fireEvent.click(screen.getByRole('button', { name: /Your contacts/i }));
    const checkboxes = await screen.findAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(h.saveUserPreferences).toHaveBeenCalledWith(
      'u-test',
      expect.objectContaining({ personalContactIds: expect.any(Array) }),
    );
  });

  it('sorts the desktop contacts picker with personal contacts first alphabetically', async () => {
    h.prefsData = { personalContactIds: ['mara'], desktopMessagingApp: 'google' };
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [
          contactDoc('zoe', { name: 'Zoe Adams', initials: 'ZA', stage: 'Regular', createdBy: 'u-test' }),
          contactDoc('alice', { name: 'Alice Brown', initials: 'AB', stage: 'Regular', createdBy: 'u-test' }),
          contactDoc('mara', { name: 'Mara Vale', initials: 'MV', stage: 'Regular', createdBy: 'u-test' }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Mara Vale')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Your contacts/i }));
    const checkboxes = await screen.findAllByRole('checkbox');
    const names = checkboxes.map((cb) => cb.closest('label')?.textContent?.replace(/\s+/g, ' ') ?? '');
    expect(names[0]).toContain('Mara Vale');
    expect(names[1]).toContain('Alice Brown');
    expect(names[2]).toContain('Zoe Adams');
  });

  it('uses the Message button for contacts with a phone, Email otherwise', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [
          contactDoc('c-phone', { name: 'Phoned Friend', initials: 'PF', stage: 'Regular', createdBy: 'u-test', phone: '5551234' }),
          contactDoc('c-email', { name: 'Emailed Friend', initials: 'EF', stage: 'Regular', createdBy: 'u-test', email: 'e@x.com' }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Phoned Friend')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Message/i }));
    expect(h.openMessage).toHaveBeenCalledWith('5551234', undefined);

    const emailLink = screen.getByRole('link', { name: /Email/i });
    expect(emailLink).toHaveAttribute('href', 'mailto:e@x.com');
  });

  it('respects an explicit personal-contacts preference and messaging app', async () => {
    h.prefsData = { personalContactIds: ['c-keep'], desktopMessagingApp: 'google' };
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [
          contactDoc('c-keep', { name: 'Kept', initials: 'K', stage: 'Regular', createdBy: 'someone', phone: '999' }),
          contactDoc('c-drop', { name: 'Dropped', initials: 'D', stage: 'Regular', createdBy: 'u-test' }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Kept')).toBeInTheDocument());
    // Not created by me but explicitly chosen → shows; created by me but not chosen → hidden.
    expect(screen.queryByText('Dropped')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Message/i }));
    expect(h.openMessage).toHaveBeenCalledWith('999', 'google');
  });

  it('shows the stale-leader nudge for a contact untouched >= 7 days', async () => {
    const old = new Date(Date.now() - 15 * 86_400_000).toISOString();
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('stale-1', { name: 'John Stale', initials: 'JS', stage: 'Regular', createdBy: 'u-test', createdAt: old })],
        interactions: [
          { id: 'i', ref: { path: 'contacts/stale-1/interactions/i' }, data: () => ({ content: 'coffee', createdAt: old }) },
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText(/since you sat with John/)).toBeInTheDocument());
  });

  // ── Your week ─────────────────────────────────────────────────────────
  it('features the soonest gathering (honest data, no "up next") and lists the rest', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        events: [
          eventDoc('ev-lead', { name: 'Friday Gathering', date: new Date(Date.now() + 86_400_000).toISOString(), type: 'Weekly', location: 'Hall', order: 1 }),
          eventDoc('ev-rest', { name: 'Sunday Service', date: new Date(Date.now() + 2 * 86_400_000).toISOString(), type: 'Service', location: 'Chapel', order: 2 }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => {
      expect(screen.getByText('Friday Gathering')).toBeInTheDocument();
      expect(screen.getByText('Sunday Service')).toBeInTheDocument();
    });
    expect(screen.queryByText(/up next/i)).not.toBeInTheDocument();
  });

  // ── Your prayers ──────────────────────────────────────────────────────
  it('renders a read-only contact prayer with status pills and a Prayer Log link', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'Mara Vale', initials: 'MV', stage: 'Regular', createdBy: 'u-test' })],
        prayers: [prayerDoc('p-1', { contactId: 'c-1', burden: 'health and provision', status: 'pending', date: soonISO })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('health and provision')).toBeInTheDocument());

    // "for {name}" appears, and there's no editing textbox (read-only).
    expect(screen.getByRole('button', { name: 'for Mara Vale' })).toBeInTheDocument();

    // Clicking a status pill writes the mapped status to the shared prayer.
    fireEvent.click(screen.getByRole('button', { name: 'answered' }));
    expect(h.updatePrayerStatus).toHaveBeenCalledWith('p-1', 'answered', expect.anything(), undefined, expect.any(String));

    // Archive maps to the existing "unanswered" status.
    fireEvent.click(screen.getByRole('button', { name: 'archive' }));
    expect(h.updatePrayerStatus).toHaveBeenCalledWith('p-1', 'unanswered', expect.anything(), undefined, undefined);

    // Prayer Log link navigates to the Prayer page.
    fireEvent.click(screen.getByRole('button', { name: /Prayer Log/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/prayer');
  });

  it('allows status updates for prayers created in the prayer page', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'Mara Vale', initials: 'MV', stage: 'Regular', createdBy: 'u-test' })],
        prayers: [prayerDoc('p-1', { contactId: 'c-1', burden: 'health and provision', status: 'pending', date: soonISO, prayerPage: true })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('health and provision')).toBeInTheDocument());

    const answeredButton = screen.getByRole('button', { name: 'answered' });
    expect(answeredButton).not.toBeDisabled();

    fireEvent.click(answeredButton);
    expect(h.updatePrayerStatus).toHaveBeenCalledWith('p-1', 'answered', expect.anything(), undefined, expect.any(String));
  });

  it('hides archived (unanswered) contact prayers', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'Mara', initials: 'M', stage: 'Regular', createdBy: 'u-test' })],
        prayers: [prayerDoc('p-arch', { contactId: 'c-1', burden: 'archived burden', status: 'unanswered', date: soonISO })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Your prayers')).toBeInTheDocument());
    expect(screen.queryByText('archived burden')).not.toBeInTheDocument();
  });

  it('hides answered contact prayers from home too (#464)', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'Mara', initials: 'M', stage: 'Regular', createdBy: 'u-test' })],
        prayers: [prayerDoc('p-done', { contactId: 'c-1', burden: 'answered burden', status: 'answered', date: soonISO })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Your prayers')).toBeInTheDocument());
    expect(screen.queryByText('answered burden')).not.toBeInTheDocument();
  });


  it('renders, edits, status-updates and deletes a personal prayer (with optional contact tag)', async () => {
    h.personalPrayersData = [
      { id: 'pp-1', title: 'pray for exams', contactId: null, date: soonISO, status: 'open' },
      { id: 'pp-2', title: 'tagged prayer', contactId: 'c-1', date: soonISO, status: 'open' },
    ];
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'Mara', initials: 'M', stage: 'Regular', createdBy: 'u-test' })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('pray for exams')).toBeInTheDocument());

    // Untagged shows "personal"; tagged shows "for {name}".
    expect(screen.getByText('personal')).toBeInTheDocument();
    expect(screen.getByText('tagged prayer')).toBeInTheDocument();

    // Status pill → updatePersonalPrayer({status}).
    fireEvent.click(screen.getAllByRole('button', { name: 'answered' })[0]);
    expect(h.updatePersonalPrayer).toHaveBeenCalledWith('u-test', 'pp-1', { status: 'answered', answeredAt: expect.any(String) });

    // Expand the first → edit + save.
    fireEvent.click(screen.getByText('pray for exams'));
    const input = await screen.findByDisplayValue('pray for exams');
    fireEvent.change(input, { target: { value: 'pray for finals' } });
    const saveButton = screen.getAllByRole('button', { name: 'Save' }).find(btn => btn.className.includes('text-sm'))!;
    fireEvent.click(saveButton);
    expect(h.updatePersonalPrayer).toHaveBeenCalledWith(
      'u-test',
      'pp-1',
      expect.objectContaining({ title: 'pray for finals' }),
    );

    // The mocked update doesn't mutate data, so the row collapses back to its
    // original title; re-open it to delete.
    fireEvent.click(screen.getByText('pray for exams'));
    fireEvent.click(await screen.findByRole('button', { name: /Delete/ }));
    expect(h.deletePersonalPrayer).toHaveBeenCalledWith('u-test', 'pp-1');
  });

  it('adds a personal prayer with an optional contact tag', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'Mara', initials: 'M', stage: 'Regular', createdBy: 'u-test' })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Add a personal prayer')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add a personal prayer'));
    const input = await screen.findByPlaceholderText('What would you like to pray for?');
    fireEvent.change(input, { target: { value: 'pray for the team' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(h.addPersonalPrayer).toHaveBeenCalledWith('u-test', { title: 'pray for the team', contactId: 'c-1' });
  });

  it('hides archived personal prayers', async () => {
    h.personalPrayersData = [{ id: 'pp-x', title: 'archived personal', contactId: null, date: soonISO, status: 'archived' }];
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Your prayers')).toBeInTheDocument());
    expect(screen.queryByText('archived personal')).not.toBeInTheDocument();
  });

  // ── Navigation ────────────────────────────────────────────────────────
  it('wires the section navigation links', async () => {
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Your sheep')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Full calendar/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/attendance');
    fireEvent.click(screen.getByRole('button', { name: /See everyone/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/directory');
    fireEvent.click(screen.getByRole('button', { name: /Pray together/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/prayer');
    fireEvent.click(screen.getByRole('button', { name: /The team's board/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/coordination');
    fireEvent.click(screen.getByRole('button', { name: /Team prayers/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/prayer');
  });

  it('opens the contact details modal from a sheep card', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'John Sheep', initials: 'JS', stage: 'First Contact', createdBy: 'u-test' })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('John Sheep')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(mockSetSelectedContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-1', name: 'John Sheep' }));
  });

  it('shows undo snackbar when a contact prayer is archived and allows undoing it', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'Mara', initials: 'M', stage: 'Regular', createdBy: 'u-test' })],
        prayers: [prayerDoc('p-1', { contactId: 'c-1', burden: 'pray for provision', status: 'ongoing', date: soonISO })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('pray for provision')).toBeInTheDocument());

    // Archive it
    fireEvent.click(screen.getByRole('button', { name: 'archive' }));
    expect(h.updatePrayerStatus).toHaveBeenLastCalledWith('p-1', 'unanswered', expect.anything(), undefined, undefined);

    // Snackbar should appear
    expect(await screen.findByText('Prayer archived')).toBeInTheDocument();

    // Click Undo
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(h.updatePrayerStatus).toHaveBeenLastCalledWith('p-1', 'ongoing', expect.anything(), undefined, undefined);

    // Snackbar should disappear
    await waitFor(() => expect(screen.queryByText('Prayer archived')).not.toBeInTheDocument());
  });

  it('shows undo snackbar when a personal prayer is archived and allows undoing it', async () => {
    h.personalPrayersData = [
      { id: 'pp-1', title: 'personal concern', contactId: null, date: soonISO, status: 'open' },
    ];
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('personal concern')).toBeInTheDocument());

    // Archive it
    fireEvent.click(screen.getByRole('button', { name: 'archive' }));
    expect(h.updatePersonalPrayer).toHaveBeenLastCalledWith('u-test', 'pp-1', { status: 'archived', answeredAt: null, answeredBody: null });

    // Snackbar should appear
    expect(await screen.findByText('Personal prayer archived')).toBeInTheDocument();

    // Click Undo
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(h.updatePersonalPrayer).toHaveBeenLastCalledWith('u-test', 'pp-1', { status: 'open' });

    // Snackbar should disappear
    await waitFor(() => expect(screen.queryByText('Personal prayer archived')).not.toBeInTheDocument());
  });

  it('automatically hides the undo snackbar after timeout', async () => {
    h.personalPrayersData = [
      { id: 'pp-1', title: 'personal concern', contactId: null, date: soonISO, status: 'open' },
    ];
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('personal concern')).toBeInTheDocument());

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'archive' }));

    // Flush microtasks so the state update runs
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Personal prayer archived')).toBeInTheDocument();

    // Now advance fake timers to dismiss snackbar
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('Personal prayer archived')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  // ── Mobile shell ──────────────────────────────────────────────────────
  it('renders the mobile variant on small screens', async () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'Mara Vale', initials: 'MV', stage: 'Regular', createdBy: 'u-test' })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => {
      expect(screen.getAllByText(/Mara Vale/i).length).toBeGreaterThan(0);
    });
  });

  // ── Your-contacts picker close paths ──────────────────────────────────
  it('closes the contact picker via the X button or the backdrop', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'Backdrop Friend', initials: 'BF', stage: 'Regular', createdBy: 'u-test' })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Backdrop Friend')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Your contacts/i }));
    await screen.findByText('Your personal contacts');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Your personal contacts')).not.toBeInTheDocument();

    // Reopen and close by clicking the backdrop (the fixed full-screen layer).
    fireEvent.click(screen.getByRole('button', { name: /Your contacts/i }));
    await screen.findByText('Your personal contacts');
    const backdrop = screen.getByText('Your personal contacts').closest('.fixed.inset-0')!;
    fireEvent.click(backdrop);
    expect(screen.queryByText('Your personal contacts')).not.toBeInTheDocument();
  });

  // ── Keyboard paths in the task editors ────────────────────────────────
  it('closes the assigned-task editor with its Done button', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('t-src', {
            title: 'Sourced task',
            status: 'pending',
            assigneeId: 'u-test',
            sourceDocId: 'BD-1',
            sourceDocTitle: 'Board doc',
          }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Sourced task')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Sourced task'));
    await screen.findByText('open it on The Board');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('open it on The Board')).not.toBeInTheDocument();
  });

  it('saves a personal task with Enter and cancels with Escape', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('t-edit', { title: 'Editable task', status: 'pending', assigneeId: 'u-test', createdById: 'u-test' }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Editable task')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Editable task'));
    const input = await screen.findByDisplayValue('Editable task');

    fireEvent.change(input, { target: { value: 'Renamed via Enter' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(updateDoc).toHaveBeenCalled();

    // Reopen and cancel with Escape — no write, editor collapses. (The mocked
    // update doesn't mutate data, so the row shows its original title again.)
    fireEvent.click(screen.getByText('Editable task'));
    const reopened = await screen.findByDisplayValue('Editable task');
    fireEvent.keyDown(reopened, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('ignores an empty-text save in the personal task editor', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('t-edit', { title: 'Whitespace task', status: 'pending', assigneeId: 'u-test', createdById: 'u-test' }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Whitespace task')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Whitespace task'));
    const input = await screen.findByDisplayValue('Whitespace task');
    fireEvent.change(input, { target: { value: '   ' } });
    // Enter calls save() directly (bypassing the disabled button).
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('commits a new task with Enter and cancels the composer with Escape', async () => {
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Add a task')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add a task'));
    const input = await screen.findByPlaceholderText('What needs doing?');

    fireEvent.change(input, { target: { value: 'Entered task' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(addDoc).toHaveBeenCalled();

    // Reopen the composer and bail out with Escape.
    fireEvent.click(screen.getByText('Add a task'));
    const composer = await screen.findByPlaceholderText('What needs doing?');
    fireEvent.keyDown(composer, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('What needs doing?')).not.toBeInTheDocument();
  });

  it('selects the contact to open details', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [contactDoc('c-1', { name: 'Closable Friend', initials: 'CF', stage: 'Regular', createdBy: 'u-test' })],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Closable Friend')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Closable Friend'));
    expect(mockSetSelectedContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-1', name: 'Closable Friend' }));
  });

  it('sorts completed tasks after pending ones', async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        tasks: [
          taskDoc('t-done', { title: 'Zeta done', status: 'completed', assigneeId: 'u-test', createdById: 'u-test' }),
          taskDoc('t-pend', { title: 'Alpha pending', status: 'pending', assigneeId: 'u-test', createdById: 'u-test' }),
        ],
      }),
    );
    render(<MyDay />);
    await waitFor(() => expect(screen.getByText('Show completed')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Show completed'));
    await waitFor(() => expect(screen.getByText('Zeta done')).toBeInTheDocument());
    const pending = screen.getByText('Alpha pending').closest('.py-4')!;
    const done = screen.getByText('Zeta done').closest('.py-4')!;
    expect(pending.compareDocumentPosition(done)).toBe(4);
  });
});
