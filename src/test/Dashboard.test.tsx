import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import Dashboard from '../views/Dashboard';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import React from 'react';

// Mock dependencies
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../App', () => ({
  useLayout: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  collectionGroup: vi.fn((_db: unknown, group: string) => ({ path: group })),
  onSnapshot: vi.fn((_, callback) => {
    callback({
      docs: [],
      size: 0,
    });
    return vi.fn();
  }),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST' },
}));

// ── Fixture data ──────────────────────────────────────────────────────
const staleDateISO = new Date(Date.now() - 7 * 86_400_000).toISOString(); // 7 days ago
const recentDateISO = new Date(Date.now() - 3 * 86_400_000).toISOString(); // 3 days ago
const soonISO = new Date(Date.now() + 2 * 86_400_000).toISOString();

const mockStages = [
  {
    id: 's1',
    data: () => ({
      label: 'Regular',
      color: 'bg-stage-teal-soft text-stage-teal',
      order: 0,
    }),
  },
];

const mockContacts = [
  {
    id: 'c1',
    data: () => ({
      name: 'Alice Chen',
      initials: 'AC',
      stage: 'Regular',
      email: 'alice@example.com',
      role: 'Student',
      location: 'Dorm B',
      notes: 'Great conversation last time',
      createdAt: recentDateISO,
      attendance: { '2026-06-01': true, '2026-06-08': true, '2026-06-15': 'late' },
    }),
  },
  {
    id: 'c2',
    data: () => ({
      name: 'Bob Park',
      initials: 'BP',
      stage: 'Regular',
      email: 'bob@example.com',
      createdAt: staleDateISO,
    }),
  },
];

const mockEvents = [
  {
    id: 'e1',
    data: () => ({
      name: 'Bible Study',
      date: soonISO,
      order: 1,
      type: 'study',
    }),
  },
];

const mockPrayers = [
  {
    id: 'p1',
    data: () => ({
      contactId: 'c1',
      date: staleDateISO,
      burden: 'healing and peace',
      status: 'pending',
    }),
  },
];

const mockInteractions = [
  {
    id: 'i1',
    ref: { path: 'contacts/c2/interactions/i1' },
    data: () => ({
      contactId: 'c2',
      content: 'Had coffee together',
      createdAt: staleDateISO,
    }),
  },
];

function populatedSnapshot(ref: any, callback: any) {
  const p = ref?.path;
  if (p === 'contacts') {
    callback({ docs: mockContacts, size: mockContacts.length });
  } else if (p === 'stages') {
    callback({ docs: mockStages, size: mockStages.length });
  } else if (p === 'events') {
    callback({ docs: mockEvents, size: mockEvents.length });
  } else if (p === 'prayers') {
    callback({ docs: mockPrayers, size: mockPrayers.length });
  } else if (p === 'interactions') {
    callback({ docs: mockInteractions, size: mockInteractions.length });
  } else {
    callback({ docs: [], size: 0 });
  }
  return vi.fn();
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default: callback fires immediately so loading resolves
    vi.mocked(onSnapshot).mockImplementation((_, callback: any) => {
      callback({ docs: [], size: 0 });
      return vi.fn();
    });
    (useAuth as any).mockReturnValue({
      user: { displayName: 'Test User' },
    });
    (useLayout as any).mockReturnValue({
      isSidebarCollapsed: false,
      openNewContact: vi.fn(),
    });
  });

  it('renders loading state initially by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn()); // Don't call callback → stays loading

    render(<Dashboard />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('surfaces a load error when a listener fails', async () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, onError?: any) => {
      onError?.(new Error('permission-denied'));
      return vi.fn();
    });

    render(<Dashboard />);

    expect(await screen.findByText(/Couldn't load/)).toBeInTheDocument();
  });

  it('renders the warm greeting, care sections and quiet figures footer', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening), Test\./)).toBeInTheDocument();
      expect(screen.getByText('People to reach out to')).toBeInTheDocument();
      expect(screen.getByText('New faces')).toBeInTheDocument();
      expect(screen.getByText('This week')).toBeInTheDocument();
      expect(screen.getByText("Prayers we're carrying")).toBeInTheDocument();
      expect(
        screen.getByText('Numbers are just a way of noticing people.'),
      ).toBeInTheDocument();
    });
  });

  it('does not surface KPI cards, sparklines or DB ids', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('People to reach out to')).toBeInTheDocument();
    });
    expect(screen.queryByText('Total Contacts')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Follow-ups')).not.toBeInTheDocument();
    expect(screen.queryByText('Contact Log')).not.toBeInTheDocument();
  });

  it('shows warm empty states when there is no data', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(
        screen.getByText("No one's overdue for a hello — you're all caught up."),
      ).toBeInTheDocument();
      expect(screen.getByText('No new faces in the last two weeks.')).toBeInTheDocument();
      expect(screen.getByText('Nothing on the calendar this week yet.')).toBeInTheDocument();
      expect(screen.getByText('No open prayers right now.')).toBeInTheDocument();
    });
  });

  // ── Populated-data tests ───────────────────────────────────────────

  it('renders follow-up cards when contacts are stale', async () => {
    vi.mocked(onSnapshot).mockImplementation(populatedSnapshot as any);

    render(<Dashboard />);

    await waitFor(() => {
      // Bob's last interaction was 7 days ago → needs follow-up
      expect(screen.getAllByText('Bob Park')[0]).toBeInTheDocument();
      expect(screen.getByText('Last connected 7 days ago')).toBeInTheDocument();
    });
  });

  it('renders new faces when contacts were created within 14 days', async () => {
    vi.mocked(onSnapshot).mockImplementation(populatedSnapshot as any);

    render(<Dashboard />);

    await waitFor(() => {
      // Alice was created 3 days ago — qualifies as a new face
      expect(screen.getByText('Alice Chen')).toBeInTheDocument();
      expect(screen.getByText(/Student · Dorm B/)).toBeInTheDocument();
    });
  });

  it('renders upcoming events in the "This week" section', async () => {
    vi.mocked(onSnapshot).mockImplementation(populatedSnapshot as any);

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Bible Study')).toBeInTheDocument();
    });
  });

  it('renders open prayer cards with burden text and contact name', async () => {
    vi.mocked(onSnapshot).mockImplementation(populatedSnapshot as any);

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('healing and peace')).toBeInTheDocument();
      // Prayer card shows "for Alice Chen" as a button
      expect(screen.getByText('for Alice Chen')).toBeInTheDocument();
      // "held N days" label
      expect(screen.getByText(/held 7 days/)).toBeInTheDocument();
    });
  });

  it('renders quiet figures with populated data', async () => {
    vi.mocked(onSnapshot).mockImplementation(populatedSnapshot as any);

    render(<Dashboard />);

    await waitFor(() => {
      // "2" in our care (2 contacts)
      expect(screen.getByText('in our care')).toBeInTheDocument();
      // "1" newly arrived (Alice, 3 days old)
      expect(screen.getByText('newly arrived')).toBeInTheDocument();
      // attendance rate: Alice has 3 records (true, true, 'late') → 100%
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.getByText('showing up')).toBeInTheDocument();
      // "1" prayer open
      expect(screen.getByText('prayers open')).toBeInTheDocument();
    });
  });

  it('uses correct pluralization for people and prayers', async () => {
    vi.mocked(onSnapshot).mockImplementation(populatedSnapshot as any);

    render(<Dashboard />);

    await waitFor(() => {
      // Check full text content since text spans multiple tags/elements
      expect(document.body.textContent).toContain('2 people in your care');
      expect(document.body.textContent).toContain('1 prayer is still open');
    });
  });
});
