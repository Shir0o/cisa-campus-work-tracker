import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, updateDoc } from 'firebase/firestore';
import MyDay from '../views/MyDay';
import { useAuth } from '../components/AuthProvider';
import React from 'react';

// Mock dependencies (mirrors Dashboard.test.tsx)
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// ContactDetailsModal (rendered closed) pulls useLayout from ../App.
vi.mock('../App', () => ({
  useLayout: vi.fn(() => ({ setSelectedContact: vi.fn(), openLogInteraction: vi.fn() })),
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
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE' },
}));

// A single doc whose data satisfies every collection's mapping (contacts,
// stages, events, prayers, tasks, interactions/comments). Returned to all
// subscriptions to populate every section at once.
const soonISO = new Date(Date.now() + 2 * 86_400_000).toISOString();
const makeDoc = () => ({
  id: 'x1',
  ref: { path: 'contacts/x1/interactions/i1' },
  data: () => ({
    // contact
    name: 'Ana Lee',
    initials: 'AL',
    stage: 'Regular',
    email: 'ana@example.com',
    notes: 'a quiet note',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u-test',
    // task
    title: 'Plan Ana’s 1:1',
    dueDate: soonISO,
    status: 'pending',
    assigneeId: 'u-test',
    contactId: 'x1',
    contactName: 'Ana Lee',
    // prayer
    date: soonISO,
    burden: 'health and provision',
    // event
    order: 1,
    // stage
    label: 'Regular',
    color: 'bg-stage-teal-soft text-stage-teal',
    // touch (interaction/comment)
    content: 'coffee chat',
    text: 'left a comment',
  }),
});

describe('MyDay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((_, callback: any) => {
      callback({ docs: [], size: 0 });
      return vi.fn();
    });
    (useAuth as any).mockReturnValue({
      user: { displayName: 'Test User', uid: 'u-test' },
    });
  });

  it('renders the loading skeleton until data resolves', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn()); // never fires → stays loading
    render(<MyDay />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
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

  it('shows warm empty states when nothing is owned', async () => {
    render(<MyDay />);
    await waitFor(() => {
      expect(
        screen.getByText('Nothing on the horizon right now — a rare, quiet moment.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText("No one's in your care yet — the contacts you connect with will gather here."),
      ).toBeInTheDocument();
      expect(screen.getByText('Nothing on the calendar this week yet.')).toBeInTheDocument();
      expect(screen.getByText('No prayers in your care right now.')).toBeInTheDocument();
    });
  });

  it('renders owned tasks/leaders/prayers and handles check + “I prayed”', async () => {
    vi.mocked(onSnapshot).mockImplementation((_, callback: any) => {
      callback({ docs: [makeDoc()], size: 1 });
      return vi.fn();
    });

    render(<MyDay />);

    await waitFor(() => {
      expect(screen.getByText('Plan Ana’s 1:1')).toBeInTheDocument();
      expect(screen.getByText('I prayed')).toBeInTheDocument();
    });

    // Checking a task persists status to Firestore.
    fireEvent.click(screen.getByTitle('Mark done'));
    expect(updateDoc).toHaveBeenCalled();

    // "I prayed" flips to "Prayed today" (local state).
    fireEvent.click(screen.getByText('I prayed'));
    await waitFor(() => {
      expect(screen.getByText('Prayed today')).toBeInTheDocument();
    });
  });

  it('shows "Overdue" chip for tasks with a past due date', async () => {
    const pastISO = new Date(Date.now() - 2 * 86_400_000).toISOString();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const p = ref?.path;
      if (p === 'tasks') {
        callback({
          docs: [
            {
              id: 'overdue-1',
              ref: { path: 'tasks/overdue-1' },
              data: () => ({
                title: 'Call overdue contact',
                dueDate: pastISO,
                status: 'pending',
                assigneeId: 'u-test',
                contactId: 'x1',
                contactName: 'Ana Lee',
              }),
            },
          ],
          size: 1,
        });
      } else if (p === 'contacts') {
        // fire contacts so loading turns off
        callback({ docs: [], size: 0 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<MyDay />);
    await waitFor(() => {
      expect(screen.getByText('Overdue')).toBeInTheDocument();
    });
  });

  it('renders events in "Your week" section', async () => {
    const soonEventISO = new Date(Date.now() + 1 * 86_400_000).toISOString();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const p = ref?.path;
      if (p === 'events') {
        callback({
          docs: [
            {
              id: 'ev-1',
              ref: { path: 'events/ev-1' },
              data: () => ({
                name: 'Wednesday Bible Study',
                date: soonEventISO,
                type: 'Bible Study',
                location: 'Room 201',
                order: 1,
              }),
            },
          ],
          size: 1,
        });
      } else if (p === 'contacts') {
        callback({ docs: [], size: 0 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<MyDay />);
    await waitFor(() => {
      expect(screen.getByText('Wednesday Bible Study')).toBeInTheDocument();
      expect(screen.getByText(/up next/)).toBeInTheDocument();
    });
  });

  it('shows staleLeader nudge when a contact has not been touched in >=7 days', async () => {
    const oldDate = new Date(Date.now() - 15 * 86_400_000).toISOString();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const p = ref?.path;
      if (p === 'contacts') {
        callback({
          docs: [
            {
              id: 'stale-1',
              ref: { path: 'contacts/stale-1' },
              data: () => ({
                name: 'John Stale',
                initials: 'JS',
                stage: 'Regular',
                email: 'john@example.com',
                notes: '',
                createdAt: oldDate,
                createdBy: 'u-test',
              }),
            },
          ],
          size: 1,
        });
      } else if (p === 'interactions') {
        callback({
          docs: [
            {
              id: 'i-old',
              ref: { path: 'contacts/stale-1/interactions/i-old' },
              data: () => ({
                content: 'had coffee',
                createdAt: oldDate,
              }),
            },
          ],
          size: 1,
        });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<MyDay />);
    await waitFor(() => {
      // The nudge text is inline inside a <p> — match the paragraph by substring.
      expect(screen.getByText(/since you sat with John/)).toBeInTheDocument();
    });
  });

  it('renders completed tasks with line-through styling', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const p = ref?.path;
      if (p === 'tasks') {
        callback({
          docs: [
            {
              id: 'done-1',
              ref: { path: 'tasks/done-1' },
              data: () => ({
                title: 'Already finished task',
                dueDate: soonISO,
                status: 'completed',
                assigneeId: 'u-test',
                contactId: 'x1',
                contactName: 'Ana Lee',
              }),
            },
          ],
          size: 1,
        });
      } else if (p === 'contacts') {
        callback({ docs: [], size: 0 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<MyDay />);
    await waitFor(() => {
      const taskTitle = screen.getByText('Already finished task');
      expect(taskTitle.className).toContain('line-through');
    });
  });

  it('renders gracefully when user has no uid (no tasks subscription)', async () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'Test User' },
    });

    render(<MyDay />);
    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening), Test\./)).toBeInTheDocument();
      expect(
        screen.getByText('Nothing on the horizon right now — a rare, quiet moment.'),
      ).toBeInTheDocument();
    });
  });
});
