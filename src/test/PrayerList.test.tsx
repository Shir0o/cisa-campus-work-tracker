import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, updateDoc, addDoc } from 'firebase/firestore';
import PrayerList from '../views/PrayerList';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import { logActivity } from '../lib/firebase';
import { uploadPrayerAnswerPhotos } from '../lib/prayerPhotos';
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
  onSnapshot: vi.fn((ref, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  updateDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-prayer-id' })),
  doc: vi.fn((_db, path, id) => ({ path, id })),
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

    // Mark as Still waiting
    const unansweredButton = screen.getAllByRole('button', { name: 'Archived' })[0];
    fireEvent.click(unansweredButton);
    expect(updateDoc).toHaveBeenCalled();
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
      expect(addDoc).toHaveBeenCalled();
      expect(logActivity).toHaveBeenCalled();
    });
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
      { id: 'p_last', data: () => ({ contactId: 'c1', burden: 'Last week burden', date: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(), status: 'pending' }) },
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

  it('opens the choose-people picker and adds a selected person', async () => {
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

    // Alice and Bob are already held; Carol is not.
    expect(screen.getByText('Who are we praying for?')).toBeInTheDocument();
    expect(screen.getAllByText('already on our prayer list').length).toBe(2);

    fireEvent.click(screen.getByText('Carol Lee').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByText(/Write what we're praying for Carol this week/i)).toBeInTheDocument(),
    );
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
    expect(await screen.findByAltText('answer.jpg')).toHaveAttribute('src', 'blob:preview');
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
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('logs and swallows failures when adding a burden fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(addDoc).mockRejectedValueOnce(new Error('write failed'));
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Strength for finals')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/i));
    fireEvent.change(screen.getByPlaceholderText(/What are we praying for Alice this week/i), {
      target: { value: 'Pray for rest' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add prayer' }));

    await waitFor(() => expect(errSpy).toHaveBeenCalledWith('Error adding burden:', expect.any(Error)));
    errSpy.mockRestore();
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

  it('filters entries by search text across name, role, and tags', async () => {
    render(<PrayerList />);
    await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Find someone…');
    fireEvent.change(searchInput, { target: { value: 'Bob' } });
    await waitFor(() => expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument());
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Leader' } });
    await waitFor(() => expect(screen.getByText('Bob Smith')).toBeInTheDocument());
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();

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

  it('auto-unhides a hidden contact when a prayer burden is added for them (#565)', async () => {
    // Seed localStorage with c1 hidden
    localStorage.setItem('cisa.prayer.hidden', JSON.stringify(['c1']));

    render(<PrayerList />);
    await waitFor(() => {
      // Bob is visible (not hidden), Alice is hidden
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    });

    // Search for Alice (she'll appear as a suggestion since she's not held)
    const searchInput = screen.getByPlaceholderText('Find someone…');
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    // Start holding Alice (this unhides her and opens compose)
    const startBtn = await screen.findByRole('button', { name: /Start praying for Alice/i });
    fireEvent.click(startBtn);

    // Fill in the burden and submit
    const textarea = await screen.findByPlaceholderText(/What are we praying for Alice this week/i);
    fireEvent.change(textarea, { target: { value: 'Peace in her studies' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add prayer' }));

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalled();
    });

    // Alice is now visible and localStorage no longer contains her ID
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    const hidden = JSON.parse(localStorage.getItem('cisa.prayer.hidden') || '[]');
    expect(hidden).not.toContain('c1');

    // Clean up
    localStorage.removeItem('cisa.prayer.hidden');
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

  it('prompts confirmation on clicking Archive and removes contact from prayer list', async () => {
    localStorage.clear();
    render(<PrayerList />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Click "Archive from Prayer List"
    const archiveBtns = screen.getAllByRole('button', { name: /Archive from Prayer List/i });
    fireEvent.click(archiveBtns[0]);

    // Should now show confirmation prompt with Archive / Keep buttons
    expect(screen.getByText(/Archive from prayer\?/i)).toBeInTheDocument();
    const confirmArchiveBtn = screen.getByRole('button', { name: /^Archive$/i });
    fireEvent.click(confirmArchiveBtn);

    // Alice should now be removed from active view and added to hidden in localStorage
    await waitFor(() => {
      expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    });
    const hidden = JSON.parse(localStorage.getItem('cisa.prayer.hidden') || '[]');
    expect(hidden).toContain('c1');
  });
});



