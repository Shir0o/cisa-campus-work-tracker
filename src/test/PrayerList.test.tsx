import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, updateDoc } from 'firebase/firestore';
import PrayerList from '../views/PrayerList';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import { logActivity, handleFirestoreError } from '../lib/firebase';
import { uploadPrayerAnswerPhotos } from '../lib/prayerPhotos';
import React from 'react';

const batch = vi.hoisted(() => ({
  set: vi.fn(),
  update: vi.fn(),
  commit: vi.fn(() => Promise.resolve()),
}));

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

vi.mock('../lib/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((ref, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  updateDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-prayer-id' })),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  writeBatch: vi.fn(() => ({
    set: batch.set,
    update: batch.update,
    commit: batch.commit,
  })),
  doc: vi.fn((_db, ...parts) => {
    if (parts.length === 0 && _db?.path) return { path: _db.path, id: 'new-prayer-id' };
    if (parts.length === 1 && parts[0]?.path) return { path: parts[0].path, id: 'new-prayer-id' };
    const [path, id] = parts;
    return { path, id };
  }),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE' },
  logActivity: vi.fn(),
}));

// The answer-photo upload runs against Cloud Storage; the component test only
// cares that the returned metadata lands on the prayer, so stub the upload.
vi.mock('../lib/prayerPhotos', () => ({
  MAX_ANSWER_PHOTOS: 4,
  uploadPrayerAnswerPhotos: vi.fn((_id: string, files: File[]) =>
    Promise.resolve(
      Array.from(files).map((f, i) => ({
        path: `prayers/x/${i}.jpg`,
        url: `https://storage.example/${i}.jpg`,
        name: f.name,
      })),
    ),
  ),
}));

// We'll mock the ContactDetailsModal to keep this test fast and isolated
vi.mock('../components/modals/ContactDetailsModal', () => ({
  default: ({ isOpen, onClose, contact }: any) => 
    isOpen ? (
      <div data-testid="contact-modal">
        Modal Open for {contact?.name}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
}));

const mockContacts = [
  {
    id: 'c1',
    data: () => ({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      role: 'Student',
      stage: 'Lead',
      tags: ['Year 2'],
      gender: 'Female',
    }),
  },
  {
    id: 'c2',
    data: () => ({
      name: 'Bob Smith',
      email: 'bob@example.com',
      role: 'Leader',
      stage: 'Regular',
      gender: 'Male',
    }),
  },
];

const mockPrayers = [
  {
    id: 'p1',
    data: () => ({
      contactId: 'c1',
      burden: 'Strength for finals',
      date: '2026-06-10T00:00:00.000Z',
      status: 'pending',
      updatedAt: '2026-06-10T00:00:00.000Z',
      updatedByName: 'Staff Member',
    }),
  },
  {
    id: 'p2',
    data: () => ({
      contactId: 'c2',
      prayedFor: 'Health and recovery',
      unanswered: true,
      updatedAt: '2026-06-11T00:00:00.000Z',
    }),
  },
];

describe('PrayerList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'prayers') {
        callback({ docs: mockPrayers, size: 2 });
      } else if (ref?.path === 'users') {
        callback({ docs: [{ id: 'u-test', data: () => ({ displayName: 'Test User', approved: true, role: 'admin' }) }], size: 1 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
      role: 'operator',
    });

    (useLayout as any).mockReturnValue({
      setSelectedContact: vi.fn(),
      openLogInteraction: vi.fn(),
    });
  });

  it('renders initial loading state by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());
    render(<PrayerList />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('surfaces a load error when a listener fails', async () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, onError?: any) => {
      onError?.(new Error('permission-denied'));
      return vi.fn();
    });

    render(<PrayerList />);

    expect(await screen.findByText(/Couldn't load/)).toBeInTheDocument();
  });

  it('renders on our hearts title and active prayer threads with legacy support', async () => {
    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getAllByText('On our hearts').length).toBeGreaterThan(0);
      // Alice (normal prayer)
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Strength for finals')).toBeInTheDocument();
      // Bob (legacy prayer)
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      expect(screen.getByText('Health and recovery')).toBeInTheDocument();
      expect(screen.getAllByText('Archived').length).toBeGreaterThan(0);
    });
  });

  it('does not render an eyebrow label with lit dot in the desktop header (#1598)', async () => {
    const { container } = render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'On our hearts' })).toBeInTheDocument();
    });

    expect(container.querySelector('.ans-eyebrow')).not.toBeInTheDocument();
    expect(container.querySelector('.ans-lit')).not.toBeInTheDocument();
  });

  it('turns a prayer burden into a to-do linked to the prayer (issue #336)', async () => {
    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Strength for finals')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTitle('Make a to-do from this prayer')[0]);

    // The composer opens pre-filled with the burden, tied to the person.
    expect(screen.getByPlaceholderText('What needs doing?')).toHaveValue('Strength for finals');
    expect(screen.getByText('Prayer for Alice')).toBeInTheDocument();
  });

  it('excludes service accounts (cisa-*, reviewer-*) from the to-do assignees (issues #348/#349)', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'prayers') {
        callback({ docs: mockPrayers, size: 2 });
      } else if (ref?.path === 'users') {
        callback({
          docs: [
            { id: 'u-test', data: () => ({ displayName: 'Test User', approved: true, role: 'admin' }) },
            { id: 'u-cisa', data: () => ({ displayName: 'cisa-trainee', approved: true, role: 'manager' }) },
            { id: 'u-reviewer', data: () => ({ displayName: 'reviewer-appstore', approved: true, role: 'admin' }) },
          ],
          size: 3,
        });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Strength for finals')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTitle('Make a to-do from this prayer')[0]);

    expect(screen.getAllByTitle('Test User').length).toBeGreaterThan(0);
    expect(screen.queryByTitle('cisa-trainee')).not.toBeInTheDocument();
    expect(screen.queryByTitle('reviewer-appstore')).not.toBeInTheDocument();
  });

  it('filters the roster by gender (Brothers/Sisters)', async () => {
    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    // Brothers → only Bob (Male) remains
    fireEvent.click(screen.getByRole('button', { name: 'Brothers' }));
    await waitFor(() => expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument());
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();

    // Sisters → only Alice (Female) remains
    fireEvent.click(screen.getByRole('button', { name: 'Sisters' }));
    await waitFor(() => expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument());
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();

    // Back to All → both return
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
  });

  // The phone's log sheet can keep a burden off this page ("Bring it to team
  // prayer", off by default). Prayers written before that toggle existed have
  // no flag at all and must stay — hence `teamPrayer !== false`, not truthiness.
  it('leaves out burdens kept private, and keeps flagless ones', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'prayers') {
        callback({
          docs: [
            // Flagless — written before the toggle, still the team's.
            mockPrayers[0],
            {
              id: 'p-private',
              data: () => ({
                contactId: 'c2',
                burden: 'Something Bob told me in confidence',
                date: '2026-06-12T00:00:00.000Z',
                status: 'pending',
                updatedAt: '2026-06-12T00:00:00.000Z',
                teamPrayer: false,
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

    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Strength for finals')).toBeInTheDocument();
    });
    expect(screen.queryByText('Something Bob told me in confidence')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
  });

  it('shows empty state when no prayers exist and mock is empty', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('No one to pray for yet')).toBeInTheDocument();
    });
  });

  it('handles toggling status marks', async () => {
    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Strength for finals')).toBeInTheDocument();
    });

    // Mark as Answered
    const answerButton = screen.getAllByRole('button', { name: 'Answered' }).find(btn => !btn.className.includes('ans-toggle-opt'))!;
    fireEvent.click(answerButton);
    expect(updateDoc).toHaveBeenCalled();
    await waitFor(() => expect(logActivity).toHaveBeenCalled());

    // Mark as Ongoing
    const ongoingButton = screen.getAllByRole('button', { name: 'Ongoing' })[0];
    fireEvent.click(ongoingButton);
    expect(updateDoc).toHaveBeenCalled();

    // Mark as Still waiting / Archived
    const unansweredButton = screen.getAllByRole('button', { name: 'Archived' })[0];
    fireEvent.click(unansweredButton);
    expect(updateDoc).toHaveBeenCalled();

    // Verify archive reason composer appears
    expect(await screen.findByPlaceholderText(/A note on why this is archived/i)).toBeInTheDocument();
  });

  it('handles writing, saving, editing, and skipping an archive reason when marking prayer as archived', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    const archiveBtn = screen.getAllByRole('button', { name: 'Archived' })[0];
    fireEvent.click(archiveBtn);

    const textarea = await screen.findByPlaceholderText(/A note on why this is archived/i);
    fireEvent.change(textarea, { target: { value: 'Graduated and moved away' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const calls = vi.mocked(updateDoc).mock.calls;
      const patch = calls[calls.length - 1][1] as unknown as Record<string, unknown>;
      expect(patch.archiveReason).toBe('Graduated and moved away');
      expect(patch.status).toBe('unanswered');
    });
  });

  it('handles editing an existing archive reason on archived prayer', async () => {
    const archivedPrayer = [
      {
        id: 'p-arch',
        data: () => ({
          contactId: 'c1',
          burden: 'Graduation prayers',
          date: '2026-06-12T00:00:00.000Z',
          status: 'unanswered',
          archiveReason: 'No longer on campus',
          updatedAt: '2026-06-12T00:00:00.000Z',
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'prayers') {
        callback({ docs: archivedPrayer, size: 1 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Graduation prayers')).toBeInTheDocument());

    expect(screen.getByText('No longer on campus')).toBeInTheDocument();
    const editReasonBtn = screen.getByText('Edit Reason');
    fireEvent.click(editReasonBtn);

    const textarea = screen.getByDisplayValue('No longer on campus');
    fireEvent.change(textarea, { target: { value: 'Graduated and moved to another city' } });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    expect(updateDoc).toHaveBeenCalled();
  });

  it('submits archive reason with ⌘+Enter and Ctrl+Enter, but not plain Enter (#1599)', async () => {
    const archivedPrayer = [
      {
        id: 'p-arch-key',
        data: () => ({
          contactId: 'c1',
          burden: 'Graduation prayers',
          date: '2026-06-12T00:00:00.000Z',
          status: 'unanswered',
          archiveReason: 'No longer on campus',
          updatedAt: '2026-06-12T00:00:00.000Z',
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: mockContacts, size: 2 });
      else if (ref?.path === 'prayers') callback({ docs: archivedPrayer, size: 1 });
      else callback({ docs: [], size: 0 });
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Graduation prayers')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit Reason'));
    const textarea = screen.getByDisplayValue('No longer on campus');

    // Plain Enter does not submit
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(updateDoc).not.toHaveBeenCalled();

    // Ctrl+Enter submits
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(updateDoc).toHaveBeenCalledTimes(1);

    // Re-open and verify Cmd+Enter submits
    fireEvent.click(screen.getByText('Edit Reason'));
    const textarea2 = screen.getByDisplayValue('No longer on campus');
    fireEvent.keyDown(textarea2, { key: 'Enter', metaKey: true });
    expect(updateDoc).toHaveBeenCalledTimes(2);
  });

  it('handles adding a new prayer burden and canceling input', async () => {
    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText(/Write what we're praying for Alice this week/i)).toBeInTheDocument();
    });

    const writeButton = screen.getByText(/Write what we're praying for Alice this week/i);
    fireEvent.click(writeButton);

    // Cancel input
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/What are we praying for Alice this week/i)).not.toBeInTheDocument();
    });

    // Re-open and add burden
    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/i));
    const textarea = screen.getByPlaceholderText(/What are we praying for Alice this week/i);
    fireEvent.change(textarea, { target: { value: 'New prayer request text' } });

    const addButton = screen.getByRole('button', { name: 'Add prayer' });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(batch.set).toHaveBeenCalled();
      expect(logActivity).toHaveBeenCalled();
    });
    // The prayer page is the one place a burden is the team's — said out loud,
    // not left to the "absent means team" default (#1406).
    expect(batch.set.mock.calls[0][1]).toMatchObject({
      prayerPage: true,
      teamPrayer: true,
    });
  });

  it('submits the week composer with ⌘+Enter (#1402)', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/i));
    const textarea = screen.getByPlaceholderText(/What are we praying for Alice this week/i);
    fireEvent.change(textarea, { target: { value: 'Pray for rest' } });

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(batch.set).toHaveBeenCalled());
    // On success the field clears and the composer closes.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/What are we praying for Alice this week/i)).not.toBeInTheDocument();
    });
  });

  it('treats Ctrl+Enter like ⌘+Enter in the week composer (#1402)', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/i));
    const textarea = screen.getByPlaceholderText(/What are we praying for Alice this week/i);
    fireEvent.change(textarea, { target: { value: 'Pray for rest' } });

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(batch.set).toHaveBeenCalled());
  });

  it('does not submit the week composer on plain Enter (#1402)', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/i));
    const textarea = screen.getByPlaceholderText(/What are we praying for Alice this week/i);
    fireEvent.change(textarea, { target: { value: 'Pray for rest' } });

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(batch.set).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/What are we praying for Alice this week/i)).toBeInTheDocument();
  });

  it('ignores ⌘+Enter when the week composer is empty or whitespace-only (#1402)', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/i));
    const textarea = screen.getByPlaceholderText(/What are we praying for Alice this week/i);
    fireEvent.change(textarea, { target: { value: '   ' } });

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    expect(batch.set).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/What are we praying for Alice this week/i)).toBeInTheDocument();
  });

  it('does not fire a second save while the week composer is saving (#1402)', async () => {
    let resolveAdd!: (value: unknown) => void;
    batch.commit.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAdd = resolve;
      }),
    );
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/i));
    const textarea = screen.getByPlaceholderText(/What are we praying for Alice this week/i);
    fireEvent.change(textarea, { target: { value: 'Pray for rest' } });

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    expect(batch.set).toHaveBeenCalledTimes(1);
    resolveAdd(undefined);
    await waitFor(() => expect(batch.set).toHaveBeenCalledTimes(1));
  });

  it('handles editing an existing prayer burden and canceling edits', async () => {
    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Strength for finals')).toBeInTheDocument();
    });

    // Click edit
    const editBtn = screen.getAllByRole('button', { name: 'Edit' })[0];
    fireEvent.click(editBtn);

    const textarea = await screen.findByDisplayValue('Strength for finals');
    fireEvent.change(textarea, { target: { value: 'Strength for finals and life' } });

    // Cancel edit
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/What are we praying/i)).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Edit' })[0]).toBeInTheDocument();
    });

    // Edit again and save
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const textarea2 = await screen.findByDisplayValue('Strength for finals');
    fireEvent.change(textarea2, { target: { value: 'New edited text' } });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
    });
  });

  it('handles starting to hold a suggested contact', async () => {
    // Let's verify we can find the search input
    render(<PrayerList />);
    await waitFor(() => {
      expect(screen.getByText('Strength for finals')).toBeInTheDocument();
    });

    // Let's verify we can find the search input
    const searchInput = screen.getByPlaceholderText('Find someone…');
    expect(searchInput).toBeInTheDocument();
  });

  it('handles folding earlier prayers', async () => {
    // Contact c1 has 6 prayers (1 this week, 5 earlier)
    const multiplePrayers = [
      { id: 'pw', data: () => ({ contactId: 'c1', burden: 'This week burden', date: new Date().toISOString(), status: 'pending' }) },
      { id: 'p_last', data: () => ({ contactId: 'c1', burden: 'Last week burden', date: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
      { id: 'p_e1', data: () => ({ contactId: 'c1', burden: 'Earlier 1', date: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
      { id: 'p_e2', data: () => ({ contactId: 'c1', burden: 'Earlier 2', date: new Date(Date.now() - 22 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
      { id: 'p_e3', data: () => ({ contactId: 'c1', burden: 'Earlier 3', date: new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
      { id: 'p_e4', data: () => ({ contactId: 'c1', burden: 'Earlier 4', date: new Date(Date.now() - 36 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
      { id: 'p_e5', data: () => ({ contactId: 'c1', burden: 'Earlier 5', date: new Date(Date.now() - 43 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'prayers') {
        callback({ docs: multiplePrayers, size: 7 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => {
      expect(screen.getByText('This week burden')).toBeInTheDocument();
    });

    const earlierToggle = screen.getByRole('button', { name: /Earlier — 5 prayers/i });
    expect(earlierToggle).toBeInTheDocument();

    // Toggle open
    fireEvent.click(earlierToggle);
    expect(screen.getByText('Earlier 1')).toBeInTheDocument();
    expect(screen.getByText('see Alice’s full history')).toBeInTheDocument();

    // Toggle close
    fireEvent.click(earlierToggle);
    expect(screen.queryByText('Earlier 1')).not.toBeInTheDocument();
  });

  it('labels a surfaced prior prayer honestly when last week was not logged (#1041)', async () => {
    // Nothing logged last week: the newest prior prayer is a fortnight back,
    // and it is still surfaced for context — just not as "Last week".
    const stalePrayers = [
      { id: 'pw', data: () => ({ contactId: 'c1', burden: 'This week burden', date: new Date().toISOString(), status: 'pending' }) },
      { id: 'p_e1', data: () => ({ contactId: 'c1', burden: 'A fortnight back', date: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
      { id: 'p_e2', data: () => ({ contactId: 'c1', burden: 'Three weeks back', date: new Date(Date.now() - 22 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'prayers') {
        callback({ docs: stalePrayers, size: 3 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => {
      expect(screen.getByText('This week burden')).toBeInTheDocument();
    });

    // The fortnight-old burden stays visible (it is not folded away), but it
    // does not wear the "Last week" label; only the third prayer is folded.
    expect(screen.getByText('A fortnight back')).toBeInTheDocument();
    expect(screen.queryByText('Last week')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Earlier — 1 prayer/i })).toBeInTheDocument();
  });

  it('still labels a prayer from last week "Last week" (#1041)', async () => {
    const prayersWithLastWeek = [
      { id: 'pw', data: () => ({ contactId: 'c1', burden: 'This week burden', date: new Date().toISOString(), status: 'pending' }) },
      { id: 'p_last', data: () => ({ contactId: 'c1', burden: 'Last week burden', date: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'prayers') {
        callback({ docs: prayersWithLastWeek, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => {
      expect(screen.getByText('This week burden')).toBeInTheDocument();
    });

    expect(screen.getByText('Last week')).toBeInTheDocument();
  });

  // #709 — an opened fold used to print a full prayer per entry: date row,
  // burden, and the whole Mark chip row, four times over, with no gap between
  // them. Each earlier prayer is now one summary line you open in place.
  it('collapses each earlier prayer to a summary line and opens it in place', async () => {
    const prayers = [
      { id: 'pw', data: () => ({ contactId: 'c1', burden: 'This week burden', date: new Date().toISOString(), status: 'pending' }) },
      { id: 'p_last', data: () => ({ contactId: 'c1', burden: 'Last week burden', date: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
      { id: 'p_e1', data: () => ({ contactId: 'c1', burden: 'Earlier one', date: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(), status: 'ongoing' }) },
      { id: 'p_e2', data: () => ({ contactId: 'c1', burden: 'Earlier two', date: new Date(Date.now() - 22 * 24 * 3600 * 1000).toISOString(), status: 'answered' }) },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: mockContacts, size: 2 });
      else if (ref?.path === 'prayers') callback({ docs: prayers, size: 4 });
      else callback({ docs: [], size: 0 });
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('This week burden')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Earlier — 2 prayers/i }));

    // This week and last week each carry a mark row; the two folded prayers
    // add none until they are opened.
    const markRows = () => screen.getAllByRole('button', { name: 'Ongoing' }).length;
    expect(markRows()).toBe(2);

    // The burden is on the summary line, but its controls are not rendered yet.
    const summary = screen.getByRole('button', { name: /Earlier one/i });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(within(summary).queryByText('Edit')).not.toBeInTheDocument();

    fireEvent.click(summary);
    const expanded = screen.getByRole('button', { name: /Earlier one/i });
    expect(expanded).toHaveAttribute('aria-expanded', 'true');
    expect(markRows()).toBe(3);

    fireEvent.click(expanded);
    expect(screen.getByRole('button', { name: /Earlier one/i })).toHaveAttribute('aria-expanded', 'false');
    expect(markRows()).toBe(2);
  });

  // #709 — "the line coloring". The rail carried both where-you-are and
  // how-it-landed, so it ran from --primary (17:1 on the card) to
  // --outline-variant (1.15:1). Structure is now one neutral spine; state is a
  // dot on it. No prayer entry carries a coloured left border any more.
  it('draws one neutral spine instead of a per-entry coloured rail', async () => {
    const prayers = [
      { id: 'pw', data: () => ({ contactId: 'c1', burden: 'This week burden', date: new Date().toISOString(), status: 'ongoing' }) },
      { id: 'p_last', data: () => ({ contactId: 'c1', burden: 'Last week burden', date: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), status: 'answered' }) },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: mockContacts, size: 2 });
      else if (ref?.path === 'prayers') callback({ docs: prayers, size: 2 });
      else callback({ docs: [], size: 0 });
      return vi.fn();
    });

    const { container } = render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('This week burden')).toBeInTheDocument());

    expect(container.querySelector('.border-l-primary')).toBeNull();
    expect(container.querySelector('.border-l-success\\/50')).toBeNull();
    expect(container.querySelectorAll('[data-testid="prayer-spine"]')).toHaveLength(1);
    // One dot per entry, carrying the status the rail used to carry.
    expect(container.querySelectorAll('[data-testid="prayer-dot"]')).toHaveLength(2);
  });

  it('handles writing and saving a testimony when marking prayer as answered', async () => {
    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Strength for finals')).toBeInTheDocument();
    });

    const markSection = screen.getByText('Mark').parentElement!;
    const answerButton = within(markSection).getByRole('button', { name: 'Answered' });
    fireEvent.click(answerButton);

    const textarea = await screen.findByPlaceholderText(/A sentence on how God answered/i);
    fireEvent.change(textarea, { target: { value: 'God provided grace and peace during exams' } });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    expect(updateDoc).toHaveBeenCalled();
  });

  it('submits testimony with ⌘+Enter and Ctrl+Enter, but not plain Enter (#1599)', async () => {
    const answeredPrayer = [
      {
        id: 'p-ans-key',
        data: () => ({
          contactId: 'c1',
          burden: 'Passed all exams',
          date: '2026-06-12T00:00:00.000Z',
          status: 'answered',
          answer: 'Got an A on the final',
          answeredAt: '2026-06-12',
          updatedAt: '2026-06-12T00:00:00.000Z',
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: mockContacts, size: 2 });
      else if (ref?.path === 'prayers') callback({ docs: answeredPrayer, size: 1 });
      else callback({ docs: [], size: 0 });
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Passed all exams')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit Testimony'));
    const textarea = screen.getByDisplayValue('Got an A on the final');

    // Plain Enter does not submit
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(updateDoc).not.toHaveBeenCalled();

    // Ctrl+Enter submits
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(updateDoc).toHaveBeenCalledTimes(1);

    // Re-open and verify Cmd+Enter submits
    fireEvent.click(screen.getByText('Edit Testimony'));
    const textarea2 = screen.getByDisplayValue('Got an A on the final');
    fireEvent.keyDown(textarea2, { key: 'Enter', metaKey: true });
    expect(updateDoc).toHaveBeenCalledTimes(2);
  });

  it('handles editing an existing testimony on answered prayer', async () => {
    const answeredPrayer = [
      {
        id: 'p-ans',
        data: () => ({
          contactId: 'c1',
          burden: 'Passed all exams',
          date: '2026-06-12T00:00:00.000Z',
          status: 'answered',
          answer: 'Got an A on the final',
          answeredAt: '2026-06-12',
          updatedAt: '2026-06-12T00:00:00.000Z',
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'prayers') {
        callback({ docs: answeredPrayer, size: 1 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Passed all exams')).toBeInTheDocument();
    });

    const editTestimonyBtn = screen.getByText('Edit Testimony');
    fireEvent.click(editTestimonyBtn);

    const textarea = screen.getByDisplayValue('Got an A on the final');
    fireEvent.change(textarea, { target: { value: 'Got an A+ on the final!' } });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    expect(updateDoc).toHaveBeenCalled();
  });

  it('opens the choose-people picker in the popup frame and adds a selected person', async () => {
    const contacts = [
      ...mockContacts,
      {
        id: 'c3',
        data: () => ({
          name: 'Carol Lee',
          email: 'carol@example.com',
          role: 'Student',
          stage: 'New',
          tags: ['Year 1'],
        }),
      },
    ];
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: contacts, size: 3 });
      else if (ref?.path === 'prayers') callback({ docs: mockPrayers, size: 2 });
      else callback({ docs: [], size: 0 });
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Choose people/i }));

    // The picker renders through the shared frame as a labelled dialog.
    const dialog = screen.getByRole('dialog', { name: 'Who are we praying for?' });
    // Alice and Bob are already held: greyed, labelled, and can't be ticked.
    expect(within(dialog).getAllByText('already on our prayer list')).toHaveLength(2);
    expect(within(dialog).getByText('Alice Johnson').closest('button')).toBeDisabled();

    // Carol is not held, so ticking her counts in the footer.
    fireEvent.click(within(dialog).getByText('Carol Lee').closest('button')!);
    expect(within(dialog).getByText('1 added')).toBeInTheDocument();
    expect(within(dialog).getByText(/3 on our hearts/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    await waitFor(() =>
      expect(screen.getByText(/Write what we're praying for Carol this week/i)).toBeInTheDocument(),
    );
  });

  it('persists chosen contacts to Firestore as pending team prayers when Done is clicked (#1600)', async () => {
    const contacts = [
      ...mockContacts,
      {
        id: 'c3',
        data: () => ({
          name: 'Carol Lee',
          email: 'carol@example.com',
          role: 'Student',
          stage: 'New',
          tags: ['Year 1'],
        }),
      },
    ];
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: contacts, size: 3 });
      else if (ref?.path === 'prayers') callback({ docs: mockPrayers, size: 2 });
      else callback({ docs: [], size: 0 });
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Choose people/i }));

    const dialog = screen.getByRole('dialog', { name: 'Who are we praying for?' });
    fireEvent.click(within(dialog).getByText('Carol Lee').closest('button')!);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      const picked = batch.set.mock.calls.find(([, data]: any[]) => data?.contactId === 'c3');
      expect(picked?.[1]).toMatchObject({
        contactId: 'c3',
        teamPrayer: true,
        prayerPage: true,
        status: 'pending',
        burden: expect.any(String),
      });
    });
  });

  it('attaches photos when saving an answer', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    const markSection = screen.getByText('Mark').parentElement!;
    fireEvent.click(within(markSection).getByRole('button', { name: 'Answered' }));

    const textarea = await screen.findByPlaceholderText(/A sentence on how God answered/i);
    fireEvent.change(textarea, { target: { value: 'God answered with peace' } });

    const file = new File(['x'], 'answer.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('prayer-answer-photo-input'), { target: { files: [file] } });

    // The picked file shows as a thumbnail, not just a filename.
    expect(await screen.findByAltText('Photo attachment 1')).toHaveAttribute('src', 'blob:preview');
    expect(screen.getByText('1 photo — add another')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(uploadPrayerAnswerPhotos).toHaveBeenCalledWith('p2', [file]));
    const calls = vi.mocked(updateDoc).mock.calls;
    const patch = calls[calls.length - 1][1] as unknown as Record<string, unknown>;
    expect(patch.answer).toBe('God answered with peace');
    expect(patch.answeredPhotos).toEqual([
      { path: 'prayers/x/0.jpg', url: 'https://storage.example/0.jpg', name: 'answer.jpg' },
    ]);
  });

  it('renders a photo avatar when the contact has one', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [{ id: 'c1', data: () => ({ name: 'Alice Johnson', avatar: 'https://example.com/alice.jpg' }) }],
          size: 1,
        });
      } else if (ref?.path === 'prayers') {
        callback({ docs: mockPrayers, size: 1 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);
    const img = await screen.findByAltText('Alice Johnson');
    expect(img).toHaveAttribute('src', 'https://example.com/alice.jpg');
  });

  it('does not add a prayer when the composer submits empty text', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/i));
    fireEvent.click(screen.getByRole('button', { name: 'Add prayer' }));
    expect(batch.set).not.toHaveBeenCalled();
  });

  it('logs and swallows failures when adding a burden fails', async () => {
    batch.commit.mockRejectedValueOnce(new Error('write failed'));
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/i));
    fireEvent.change(screen.getByPlaceholderText(/What are we praying for Alice this week/i), {
      target: { value: 'Pray for rest' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add prayer' }));

    await waitFor(() => expect(handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      'CREATE',
      'prayers',
    ));
  });

  it('logs failures when marking a prayer status fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error('write failed'));
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    const answerButton = screen.getAllByRole('button', { name: 'Answered' }).find((btn) => !btn.className.includes('ans-toggle-opt'))!;
    fireEvent.click(answerButton);

    await waitFor(() => expect(errSpy).toHaveBeenCalledWith('Error updating status:', expect.any(Error)));
    errSpy.mockRestore();
  });

  it('skips the Firestore write when an edit saves the same burden text', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await screen.findByDisplayValue('Strength for finals');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('logs failures when saving an edited burden fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error('write failed'));
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const textarea = await screen.findByDisplayValue('Strength for finals');
    fireEvent.change(textarea, { target: { value: 'Edited text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(errSpy).toHaveBeenCalledWith('Error editing burden:', expect.any(Error)));
    errSpy.mockRestore();
  });

  it('filters entries by search text across name and tags, not role (#1345)', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Find someone…');
    fireEvent.change(searchInput, { target: { value: 'Bob' } });
    await waitFor(() => expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument());
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();

    // Bob's doc still says role: 'Leader'; that no longer finds him.
    fireEvent.change(searchInput, { target: { value: 'Leader' } });
    expect(await screen.findByText('No one matches that just yet')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Year 2' } });
    await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument());

    fireEvent.change(searchInput, { target: { value: 'Nope' } });
    expect(await screen.findByText('No one matches that just yet')).toBeInTheDocument();
  });

  it('offers to start holding a searched-but-unheld contact', async () => {
    const contacts = [
      ...mockContacts,
      { id: 'c3', data: () => ({ name: 'Carol Lee', email: 'carol@example.com', role: 'Student', stage: 'New' }) },
    ];
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: contacts, size: 3 });
      else if (ref?.path === 'prayers') callback({ docs: mockPrayers, size: 2 });
      else callback({ docs: [], size: 0 });
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Find someone…');
    fireEvent.change(searchInput, { target: { value: 'Carol' } });

    const startBtn = await screen.findByRole('button', { name: /Start praying for Carol/i });
    fireEvent.click(startBtn);

    expect(await screen.findByPlaceholderText(/What are we praying for Carol this week/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Find someone…')).toHaveValue('');
  });

  it('opens contact details when clicking on a contact name in prayer list (issue #345)', async () => {
    const mockSetSelectedContact = vi.fn();
    (useLayout as any).mockReturnValue({
      setSelectedContact: mockSetSelectedContact,
    });

    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());

    const contactNameBtns = screen.getAllByTitle('Open profile');
    fireEvent.click(contactNameBtns[0]);

    expect(mockSetSelectedContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Alice Johnson' })
    );
  });

  it('clears a team removal when a team burden is added (#565, #1692)', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/i));
    fireEvent.change(screen.getByPlaceholderText(/What are we praying for Alice this week/i), {
      target: { value: 'Peace in her studies' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add prayer' }));

    // Adding on /prayer is the team adding, so the prayer and the contact's
    // cleared removal go in one batch (#1692).
    await waitFor(() => expect(batch.set).toHaveBeenCalled());
    expect(batch.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'prayers' }),
      expect.objectContaining({ contactId: 'c1', burden: 'Peace in her studies', teamPrayer: true, prayerPage: true }),
    );
    expect(batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'contacts', id: 'c1' }),
      expect.objectContaining({ prayerListRemoved: expect.anything() }),
    );
    expect(batch.commit).toHaveBeenCalled();
  });

  it('draws the list from the shared contact, so a team removal hides the person (#1692)', async () => {
    let contactsCb: any;
    const alice = {
      id: 'c1',
      data: () => ({
        name: 'Alice Johnson',
        email: 'alice@example.com',
        role: 'Student',
        stage: 'Lead',
        tags: ['Year 2'],
        gender: 'Female',
      }),
    };
    const aliceRemoved = {
      id: 'c1',
      data: () => ({
        ...alice.data(),
        prayerListRemoved: { at: '2026-10-01T00:00:00.000Z', by: 'u-other', byName: 'Other Admin' },
      }),
    };

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        contactsCb = callback;
        callback({ docs: [aliceRemoved], size: 1 });
      } else if (ref?.path === 'prayers') {
        callback({ docs: mockPrayers, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);
    await waitFor(() => expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument());

    // Another teammate clearing it is enough: no local state to undo, the
    // shared contact now says she belongs on the list.
    act(() => contactsCb({ docs: [alice], size: 1 }));
    await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());
  });

  it('removes a person for the whole team from the row menu (#715, #1692)', async () => {
    render(<PrayerList />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /More for Alice Johnson/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove Alice from the team's prayer list/i }));

    expect(await screen.findByText("Removed Alice from the team's prayer list")).toBeInTheDocument();
    const patch = vi.mocked(updateDoc).mock.calls.find(([ref]) => (ref as any).path === 'contacts')?.[1] as Record<string, any>;
    expect(patch.prayerListRemoved).toMatchObject({ by: 'u-test', byName: 'Test User' });
  });

  it('puts the person back for the whole team when the removal is undone (#715, #1692)', async () => {
    render(<PrayerList />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /More for Alice Johnson/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove Alice from the team's prayer list/i }));

    expect(await screen.findByText("Removed Alice from the team's prayer list")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(() => {
      const patches = vi.mocked(updateDoc).mock.calls
        .filter(([ref]) => (ref as any).path === 'contacts')
        .map(([, data]) => data as Record<string, any>);
      expect(patches.some((p) => 'prayerListRemoved' in p && p.prayerListRemoved?.__deleteField)).toBe(true);
    });
  });

  it('renders stale badge and quick actions for stale contacts (>30 days or no interaction)', async () => {
    const mockOpenLog = vi.fn();
    (useLayout as any).mockReturnValue({
      setSelectedContact: vi.fn(),
      openLogInteraction: mockOpenLog,
    });

    render(<PrayerList />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Alice and Bob have no interaction dates in mockContacts, so they are stale
    const staleBadges = screen.getAllByTestId('stale-badge');
    expect(staleBadges.length).toBeGreaterThanOrEqual(1);

    // Stale quick actions should be visible
    const staleActionBars = screen.getAllByTestId('stale-quick-actions');
    expect(staleActionBars.length).toBeGreaterThanOrEqual(1);

    // Click "Log Interaction" button on first stale card
    const logBtns = screen.getAllByRole('button', { name: /Log Interaction/i });
    fireEvent.click(logBtns[0]);
    expect(mockOpenLog).toHaveBeenCalledWith('c1');
  });

  it('no longer spells removal as archiving on the stale strip (#714)', async () => {
    render(<PrayerList />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    expect(screen.getAllByTestId('stale-quick-actions').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: /Archive from Prayer List/i })).not.toBeInTheDocument();
  });

  it('displays Cared for by and Added by in contact header metadata (issue #716)', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            {
              id: 'c-meta',
              data: () => ({
                name: 'Samuel Green',
                role: 'Student',
                year: 'Junior',
                owner: 'u-mei',
                carers: ['u-mei'],
                createdByName: 'Tony Wang',
              }),
            },
          ],
          size: 1,
        });
      } else if (ref?.path === 'prayers') {
        callback({
          docs: [
            {
              id: 'p-meta',
              data: () => ({
                contactId: 'c-meta',
                burden: 'Exam peace',
                date: new Date().toISOString(),
                status: 'pending',
                prayerPage: true,
              }),
            },
          ],
          size: 1,
        });
      } else if (ref?.path === 'users') {
        callback({
          docs: [
            { id: 'u-mei', data: () => ({ displayName: 'Mei Tanaka', approved: true, role: 'admin' }) },
          ],
          size: 1,
        });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Samuel Green')).toBeInTheDocument();
    });

    expect(screen.getByText(/Cared for by Mei Tanaka/)).toBeInTheDocument();
    expect(screen.getByText(/Added by Tony Wang/)).toBeInTheDocument();
  });

  it('delegates contact opening to global setSelectedContact and does not mount a local ContactDetailsModal (#713)', async () => {
    const mockSetSelectedContact = vi.fn();
    (useLayout as any).mockReturnValue({
      setSelectedContact: mockSetSelectedContact,
      openLogInteraction: vi.fn(),
    });

    render(<PrayerList />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Click on Alice's profile button
    const openProfileBtn = screen.getAllByTitle('Open profile')[0];
    fireEvent.click(openProfileBtn);

    expect(mockSetSelectedContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Alice Johnson' }),
    );
    // There should be no local modal mounted inside PrayerList; App.tsx owns it
    expect(screen.queryByTestId('contact-modal')).toBeNull();
  });

  it('renders PrayerListMobile on mobile viewport even while loading', async () => {
    const { useMediaQuery } = await import('../lib/useMediaQuery');
    vi.mocked(useMediaQuery).mockReturnValue(true);
    render(<PrayerList />);
    await waitFor(() => {
      expect(document.querySelector('.prm')).toBeTruthy();
    });
  });
});

// ── The phone card at 375×812 (#1765) ───────────────────────────────────────
describe('PrayerList — phone card', () => {
  beforeEach(async () => {
    const { useMediaQuery } = await import('../lib/useMediaQuery');
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(async () => {
    const { useMediaQuery } = await import('../lib/useMediaQuery');
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  /** Serve a contacts/prayers snapshot for one test without touching the rest. */
  function seed(contacts: any[], prayers: any[]) {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: contacts, size: contacts.length });
      else if (ref?.path === 'prayers') callback({ docs: prayers, size: prayers.length });
      else if (ref?.path === 'users') {
        callback({ docs: [{ id: 'u-test', data: () => ({ displayName: 'Test User', approved: true, role: 'operator' }) }], size: 1 });
      } else callback({ docs: [], size: 0 });
      return vi.fn();
    });
  }

  const alice = {
    id: 'c1',
    data: () => ({ name: 'Alice Johnson', gender: 'Female' }),
  };

  it('never calls an unmarked prayer “All answered”', async () => {
    seed([alice], [{
      id: 'p1',
      data: () => ({ contactId: 'c1', burden: 'Strength for finals', date: '2026-10-20T00:00:00.000Z', status: 'pending' }),
    }]);

    render(<PrayerList />);

    expect(await screen.findByText('Needs marking')).toBeInTheDocument();
    expect(screen.queryByText('All answered')).toBeNull();
  });

  it('asks what we are praying for instead of printing the placeholder burden', async () => {
    seed([alice], [{
      id: 'p1',
      data: () => ({ contactId: 'c1', burden: 'Holding in prayer', date: '2026-10-20T00:00:00.000Z', status: 'pending' }),
    }]);

    render(<PrayerList />);

    expect(await screen.findByText('What are we praying for Alice this week?')).toBeInTheDocument();
    expect(screen.queryByText('Holding in prayer')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add prayer' })).toBeInTheDocument();
  });

  it('prints a real burden as prose', async () => {
    seed([alice], [{
      id: 'p1',
      data: () => ({ contactId: 'c1', burden: 'Strength for finals', date: '2026-10-20T00:00:00.000Z', status: 'ongoing' }),
    }]);

    render(<PrayerList />);

    expect(await screen.findByText('Strength for finals')).toBeInTheDocument();
    expect(screen.queryByText(/What are we praying for Alice/)).toBeNull();
  });

  it('names the status control for assistive tech', async () => {
    seed([alice], [{
      id: 'p1',
      // This week's prayer: the "last week" fold has its own label ("Where did
      // it land?"), so a fixed date drifts out of the label this test names.
      data: () => ({ contactId: 'c1', burden: 'Strength for finals', date: new Date().toISOString(), status: 'pending' }),
    }]);

    render(<PrayerList />);

    const select = await screen.findByLabelText('Mark status');
    expect(select.tagName).toBe('SELECT');
  });

  it('says an empty filter is empty, offers everyone, and keeps the team count', async () => {
    seed([alice], [{
      id: 'p1',
      data: () => ({ contactId: 'c1', burden: 'Strength for finals', date: '2026-10-20T00:00:00.000Z', status: 'ongoing' }),
    }]);

    render(<PrayerList />);
    await screen.findByText('Alice Johnson');

    fireEvent.click(screen.getByRole('button', { name: 'Brothers' }));

    expect(await screen.findByText('No brothers on our hearts yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show everyone' })).toBeInTheDocument();
    // The badge is the team list, not the filter: one person is still held.
    expect(screen.getByRole('button', { name: /Pray for someone — 1 on our hearts/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }));
    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument();
  });

  it('still knows who is already held while a filter is active', async () => {
    seed([alice], [{
      id: 'p1',
      data: () => ({ contactId: 'c1', burden: 'Strength for finals', date: '2026-10-20T00:00:00.000Z', status: 'ongoing' }),
    }]);

    render(<PrayerList />);
    await screen.findByText('Alice Johnson');

    fireEvent.click(screen.getByRole('button', { name: 'Brothers' }));
    fireEvent.click(screen.getByRole('button', { name: /Pray for someone/ }));

    // Alice is on the list even though the Brothers filter hides her, so the
    // picker must not offer her as someone to add (#1765).
    expect(await screen.findByText('already on our prayer list')).toBeInTheDocument();
    expect(screen.getByText(/1 on our hearts/)).toBeInTheDocument();
  });
});



