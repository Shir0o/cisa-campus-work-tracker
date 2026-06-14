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
  collection: vi.fn(),
  onSnapshot: vi.fn((_, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  collectionGroup: vi.fn(),
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
      expect(screen.getByText('On your plate')).toBeInTheDocument();
      expect(screen.getByText("The leaders you're walking with")).toBeInTheDocument();
      expect(screen.getByText('Your week')).toBeInTheDocument();
      expect(screen.getByText("Prayers you're carrying")).toBeInTheDocument();
      expect(screen.getByText('Numbers are just a way of noticing people.')).toBeInTheDocument();
    });
  });

  it('shows warm empty states when nothing is owned', async () => {
    render(<MyDay />);
    await waitFor(() => {
      expect(
        screen.getByText('Nothing on your plate right now — a rare, quiet moment.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText("No one's in your care yet — the people you welcome will gather here."),
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
});
