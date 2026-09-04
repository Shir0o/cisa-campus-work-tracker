import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import HistoryView from '../views/History';
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
  collection: vi.fn((_db, path) => ({ path })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn((ref, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  doc: vi.fn((_db, path, id) => ({ path, id })),
  Timestamp: class MockTimestamp { static now() { return new MockTimestamp(); } toDate() { return new Date(); } },
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  addDoc: vi.fn().mockResolvedValue({ id: 'new-id' }),
  serverTimestamp: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  writeBatch: vi.fn(() => ({
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
  where: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', DELETE: 'DELETE', CREATE: 'CREATE', WRITE: 'WRITE' },
  logActivity: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('motion/react', () => {
  const React = require('react');
  return {
    AnimatePresence: ({ children }: any) => children,
    motion: {
      div: React.forwardRef(({ children, initial, animate, exit, transition, layout, ...props }: any, ref: any) =>
        React.createElement('div', { ...props, ref }, children)
      ),
      button: React.forwardRef(({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }: any, ref: any) =>
        React.createElement('button', { ...props, ref }, children)
      ),
      li: React.forwardRef(({ children, initial, animate, exit, transition, layout, ...props }: any, ref: any) =>
        React.createElement('li', { ...props, ref }, children)
      ),
      span: React.forwardRef(({ children, ...props }: any, ref: any) =>
        React.createElement('span', { ...props, ref }, children)
      ),
    },
  };
});

const mockContacts = [
  {
    id: 'c1',
    data: () => ({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      role: 'Student',
      stage: 'Lead',
    }),
  },
];

const mockActivities = [
  {
    id: 'a1',
    data: () => ({
      userName: 'Staff member',
      userPhoto: 'photo.jpg',
      action: 'created',
      targetName: 'Alice Johnson',
      targetType: 'contact',
      targetId: 'c1',
      type: 'steps',
      description: 'started walking with Alice',
      createdAt: '2026-06-15T08:00:00.000Z',
    }),
  },
];

describe('History View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 1 });
      } else if (ref?.path === 'activities') {
        callback({ docs: mockActivities, size: 1 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
    });

    (useLayout as any).mockReturnValue({
      setSelectedContact: vi.fn(),
    });
  });

  it('renders loading state initially by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());
    render(<HistoryView />);
    expect(screen.getByText('Gathering the last few days…')).toBeInTheDocument();
  });

  it('surfaces a load error when a listener fails', async () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, onError?: any) => {
      onError?.(new Error('permission-denied'));
      return vi.fn();
    });

    render(<HistoryView />);

    expect(await screen.findByText(/Couldn't load/)).toBeInTheDocument();
  });

  it('renders Looking back header and loaded activities list', async () => {
    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByText('Looking back')).toBeInTheDocument();
      expect(screen.getByText(/started walking with Alice/i)).toBeInTheDocument();
    });
  });

  it('filters activities based on category buttons', async () => {
    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByText(/started walking with Alice/i)).toBeInTheDocument();
    });

    // Click 'Prayer' category button (which is type 'prayer')
    const prayerButton = screen.getByRole('button', { name: 'Prayer' });
    fireEvent.click(prayerButton);

    expect(screen.queryByText(/started walking with Alice/i)).not.toBeInTheDocument();
    expect(screen.getByText('Nothing here yet for that filter')).toBeInTheDocument();
  });

  it('performs text search matching activity fields', async () => {
    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByText(/started walking with Alice/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Find a moment or a name/i);
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.queryByText(/started walking with Alice/i)).not.toBeInTheDocument();
    expect(screen.getByText('Nothing here yet for that filter')).toBeInTheDocument();
  });

  // ── humanize() action branch tests ─────────────────────────────────

  const makeActivity = (overrides: Partial<ReturnType<typeof mockActivities[0]['data']>>) => [{
    id: 'act-1',
    data: () => ({
      userName: 'Staff',
      userPhoto: '',
      action: 'created',
      targetName: 'Bob',
      targetType: 'contact',
      targetId: 'c1',
      type: 'create',
      description: '',
      createdAt: new Date().toISOString(),
      ...overrides,
    }),
  }];

  const renderWithActivity = (overrides: any) => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 1 });
      } else if (ref?.path === 'activities') {
        callback({ docs: makeActivity(overrides), size: 1 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });
    render(<HistoryView />);
  };

  it('humanize: "moved contact to stage" shows walked a step further', async () => {
    renderWithActivity({
      action: 'moved contact to stage "Believer"',
      description: 'Moved from Seeker to Believer',
    });
    await waitFor(() => {
      expect(screen.getByText('walked')).toBeInTheDocument();
      expect(screen.getByText('a step further')).toBeInTheDocument();
    });
  });

  it('humanize: "moved contact to stage" with regex match shows from/to detail', async () => {
    renderWithActivity({
      action: 'moved contact to stage "Growing"',
      description: 'Moved from Seeker to Growing',
    });
    await waitFor(() => {
      expect(screen.getByText(/A step forward — from Seeker toward Growing/)).toBeInTheDocument();
    });
  });

  it('humanize: "created a new contact" shows welcomed', async () => {
    renderWithActivity({ action: 'created a new contact', description: '' });
    await waitFor(() => {
      expect(screen.getByText('welcomed')).toBeInTheDocument();
    });
  });

  it('humanize: "created contact" also shows welcomed', async () => {
    renderWithActivity({ action: 'created contact', description: '' });
    await waitFor(() => {
      expect(screen.getByText('welcomed')).toBeInTheDocument();
    });
  });

  it('humanize: "deleted contact" shows let go of', async () => {
    renderWithActivity({ action: 'deleted contact', description: '' });
    await waitFor(() => {
      expect(screen.getByText('let go of')).toBeInTheDocument();
    });
  });

  it('humanize: "added a prayer burden for" shows started praying for', async () => {
    renderWithActivity({
      action: 'added a prayer burden for Alice',
      description: 'Lord, help Alice with her studies',
    });
    await waitFor(() => {
      expect(screen.getByText('started praying for')).toBeInTheDocument();
    });
  });

  it('humanize: "edited a prayer burden for" shows added to a prayer for', async () => {
    renderWithActivity({
      action: 'edited a prayer burden for Alice',
      description: 'Updated context about finals',
    });
    await waitFor(() => {
      expect(screen.getByText('added to a prayer for')).toBeInTheDocument();
    });
  });

  it('humanize: "marked a prayer burden as answered for" shows gave thanks', async () => {
    renderWithActivity({
      action: 'marked a prayer burden as answered for Alice',
      description: '',
    });
    await waitFor(() => {
      expect(screen.getByText('gave thanks for an answered prayer for')).toBeInTheDocument();
      expect(screen.getByText('Answered, after carrying it together.')).toBeInTheDocument();
    });
  });

  it('humanize: "marked a prayer burden as ongoing for" shows updated a prayer for', async () => {
    renderWithActivity({
      action: 'marked a prayer burden as ongoing for Alice',
      description: '',
    });
    await waitFor(() => {
      expect(screen.getByText('updated a prayer for')).toBeInTheDocument();
      expect(screen.getByText('Now marked ongoing.')).toBeInTheDocument();
    });
  });

  it('humanize: "logged an interaction for" with type call shows called', async () => {
    renderWithActivity({
      action: 'logged an interaction for Alice',
      type: 'call',
      description: 'Quick check-in call',
    });
    await waitFor(() => {
      expect(screen.getByText('called')).toBeInTheDocument();
    });
  });

  it('humanize: "logged an interaction for" with type email shows emailed', async () => {
    renderWithActivity({
      action: 'logged an interaction for Alice',
      type: 'email',
      description: 'Follow up email',
    });
    await waitFor(() => {
      expect(screen.getByText('emailed')).toBeInTheDocument();
    });
  });

  it('humanize: "logged an interaction for" with type event shows met with', async () => {
    renderWithActivity({
      action: 'logged an interaction for Alice',
      type: 'event',
      description: 'Met at coffee shop',
    });
    await waitFor(() => {
      expect(screen.getByText('met with')).toBeInTheDocument();
    });
  });

  it('humanize: "logged an interaction for" with type comment shows left a note for', async () => {
    renderWithActivity({
      action: 'logged an interaction for Alice',
      type: 'comment',
      description: 'Added a note',
    });
    await waitFor(() => {
      expect(screen.getByText('left a note for')).toBeInTheDocument();
    });
  });

  it('humanize: "logged an interaction for" with unknown type shows spent time with', async () => {
    renderWithActivity({
      action: 'logged an interaction for Alice',
      type: 'create',
      description: 'Hung out',
    });
    await waitFor(() => {
      expect(screen.getByText('spent time with')).toBeInTheDocument();
    });
  });

  it('humanize: "logged a batch interaction for" is handled', async () => {
    renderWithActivity({
      action: 'logged a batch interaction for group',
      type: 'event',
      description: 'Group meeting',
    });
    await waitFor(() => {
      expect(screen.getByText('met with')).toBeInTheDocument();
    });
  });

  it('humanize: "updated an interaction for" shows updated a conversation with', async () => {
    renderWithActivity({
      action: 'updated an interaction for Alice',
      description: '',
    });
    await waitFor(() => {
      expect(screen.getByText('updated a conversation with')).toBeInTheDocument();
    });
  });

  it('humanize: "left a comment on" shows left a note for', async () => {
    renderWithActivity({
      action: 'left a comment on Alice',
      description: 'Great progress this week',
    });
    await waitFor(() => {
      // There may be multiple "left a note for" in the DOM, just verify at least one
      const elements = screen.getAllByText('left a note for');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('humanize: tag add shows added a tag for', async () => {
    renderWithActivity({
      action: 'added tag "leader" to Alice',
      description: '',
    });
    await waitFor(() => {
      expect(screen.getByText('added a tag for')).toBeInTheDocument();
    });
  });

  it('humanize: tag remove shows removed a tag from', async () => {
    renderWithActivity({
      action: 'removed tag "inactive" from Alice',
      description: '',
    });
    await waitFor(() => {
      expect(screen.getByText('removed a tag from')).toBeInTheDocument();
    });
  });

  it('humanize: "updated attendance for event" shows noted who gathered at', async () => {
    renderWithActivity({
      action: 'updated attendance for "Sunday Service" to Present for',
      description: '',
    });
    await waitFor(() => {
      expect(screen.getByText('noted who gathered at')).toBeInTheDocument();
    });
  });

  it('humanize: "submitted feedback" shows shared some feedback', async () => {
    renderWithActivity({
      action: 'submitted feedback',
      targetType: 'other',
      targetId: undefined,
      description: 'This app is great',
    });
    await waitFor(() => {
      expect(screen.getByText('shared some feedback')).toBeInTheDocument();
    });
  });

  it('humanize: "transferred a person" shows handed off', async () => {
    renderWithActivity({
      action: 'transferred a person',
      targetName: 'Mei now cares for Grace.',
      description: 'From Tony to Mei',
    });
    await waitFor(() => {
      expect(screen.getByText('handed off')).toBeInTheDocument();
    });
  });
  it('humanize: "updated" fallback shows updated details for', async () => {
    renderWithActivity({
      action: 'updated phone number',
      description: 'Changed phone',
    });
    await waitFor(() => {
      expect(screen.getByText('updated details for')).toBeInTheDocument();
    });
  });

  it('humanize: unknown action falls back to raw action text', async () => {
    renderWithActivity({
      action: 'did something unusual',
      description: '',
    });
    await waitFor(() => {
      expect(screen.getByText('did something unusual')).toBeInTheDocument();
    });
  });

  // ── Who dropdown filter ────────────────────────────────────────────

  it('filters activities by staff member via Who dropdown', async () => {
    // Set up two activities from different staff
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 1 });
      } else if (ref?.path === 'activities') {
        callback({
          docs: [
            {
              id: 'a1',
              data: () => ({
                userName: 'Alice Staff',
                action: 'created a new contact',
                targetName: 'Bob',
                targetType: 'contact',
                targetId: 'c1',
                type: 'create',
                description: '',
                createdAt: new Date().toISOString(),
              }),
            },
            {
              id: 'a2',
              data: () => ({
                userName: 'Charlie Staff',
                action: 'created a new contact',
                targetName: 'Dave',
                targetType: 'contact',
                targetId: 'c2',
                type: 'create',
                description: '',
                createdAt: new Date().toISOString(),
              }),
            },
          ],
          size: 2,
        });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });

    // Filter by Charlie Staff
    const whoSelect = screen.getByDisplayValue('Whole team');
    fireEvent.change(whoSelect, { target: { value: 'Charlie Staff' } });

    await waitFor(() => {
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });
  });

  // ── Footer statistics ──────────────────────────────────────────────

  it('renders footer statistics with moments, people, hands', async () => {
    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByText('moments noted')).toBeInTheDocument();
      expect(screen.getByText('people remembered')).toBeInTheDocument();
      expect(screen.getByText('hands at work')).toBeInTheDocument();
    });
  });

  // ── Contact click opens modal ──────────────────────────────────────

  it('clicking a contact name in activity opens ContactDetailsModal', async () => {
    renderWithActivity({
      action: 'created a new contact',
      targetName: 'Alice Johnson',
      targetType: 'contact',
      targetId: 'c1',
    });

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Alice Johnson'));

    // The person detail is now a full page (not a popup): it replaces the
    // history view and shows the contact's name in the page header.
    expect(document.querySelector('.cd-page')).toBeTruthy();
    expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThanOrEqual(1);
  });

  it('renders mobile layout on mobile viewport', async () => {
    const mediaQuery = await import('../lib/useMediaQuery');
    vi.spyOn(mediaQuery, 'useMediaQuery').mockReturnValue(true);
    renderWithActivity({
      action: 'created a new contact',
      targetName: 'Alice Johnson',
      targetType: 'contact',
      targetId: 'c1',
    });

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });
    // Looking back title is rendered in mobile layout
    expect(screen.getByText('Looking back')).toBeInTheDocument();
  });

  it('renders clean DataLoadError on mobile when an error occurs', async () => {
    const mediaQuery = await import('../lib/useMediaQuery');
    vi.spyOn(mediaQuery, 'useMediaQuery').mockReturnValue(true);
    const firestore = await import('firebase/firestore');
    const onSnapshotMock = firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>;
    const original = onSnapshotMock.getMockImplementation();
    onSnapshotMock.mockImplementation((_ref, _cb, errCb) => {
      if (typeof errCb === 'function') errCb(new Error('firestore read failed'));
      return vi.fn();
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<HistoryView />);

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Looking back')).not.toBeInTheDocument();
    errSpy.mockRestore();
    onSnapshotMock.mockImplementation(original!);
  });
});
