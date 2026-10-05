import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { collection, collectionGroup, onSnapshot } from 'firebase/firestore';
import Directory from '../views/Directory';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import { logActivity, handleFirestoreError } from '../lib/firebase';
import { DEFAULT_DIRECTORY_FILTERS, writeDirectoryFilters, __resetDirectoryFilters } from '../lib/directoryFilters';
import React from 'react';

// Mock writeBatch operations
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockCommit = vi.fn().mockResolvedValue(undefined);

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
  collection: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
  collectionGroup: vi.fn((_db, group) => ({ group })),
  onSnapshot: vi.fn((ref, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  query: vi.fn((ref) => ref),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(),
  limit: vi.fn(),
  doc: vi.fn((_db, path, id) => ({ path, id })),
  writeBatch: vi.fn(() => ({
    update: mockUpdate,
    delete: mockDelete,
    commit: mockCommit,
  })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

const mockStages = [
  { id: 's1', data: () => ({ label: 'Lead', color: 'bg-board-indigo', order: 0 }) },
  { id: 's2', data: () => ({ label: 'Regular', color: 'bg-board-teal', order: 1 }) },
];

const mockContacts = [
  {
    id: 'c1',
    data: () => ({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      phone: '123-456-7890',
      role: 'Student',
      year: 'Sophomore',
      major: 'Biology',
      stage: 'Lead',
      location: 'Dorm A',
      spiritualBackground: 'None',
      tags: ['Freshman'],
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'u-other',
    }),
  },
  {
    id: 'c2',
    data: () => ({
      name: 'Bob Smith',
      email: 'bob@example.com',
      phone: '987-654-3210',
      role: 'Leader',
      year: 'Junior',
      stage: 'Regular',
      location: 'Off-campus',
      spiritualBackground: 'Christian',
      tags: ['Senior'],
      createdAt: '2026-02-01T00:00:00.000Z',
      createdBy: 'trainee-123',
    }),
  },
  {
    id: 'c3',
    data: () => ({
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      avatar: 'https://example.com/charlie.png',
      role: 'Staff',
      stage: 'Lead',
      location: 'Off-campus',
      spiritualBackground: 'None',
      tags: [],
      createdAt: '2026-03-01T00:00:00.000Z',
      coCreators: ['trainee-123'],
    }),
  },
];

describe('Directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDirectoryFilters();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 3 });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
      effectiveUserId: 'u-test',
    });

    (useLayout as any).mockReturnValue({
      openNewContact: vi.fn(),
      setSelectedContact: vi.fn(),
    });
  });

  it('renders loading state initially by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn()); // Never fires callback
    render(<Directory />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('lets the header actions wrap below the summary on narrow widths (#1128)', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const header = screen.getByText('People').closest('header') as HTMLElement;
    expect(header).not.toBeNull();

    // The header must be allowed to wrap so the action buttons can reflow onto
    // their own row instead of reserving the full row width on narrow laptop
    // screens, which crushed the summary text against the left edge.
    expect(header.className).toContain('flex-wrap');

    // The summary keeps a readable minimum width rather than shrinking to 0,
    // which is what allowed the button group to steal its row.
    const summary = header.firstElementChild as HTMLElement;
    expect(summary.className).not.toContain('min-w-0');
    expect(summary.className).toMatch(/min-w-/);
  });

  it('renders contacts directory title, stats, and contact cards', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('People')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    });
  });

  it('filters contacts by search query', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
  });

  it('does not surface a contact\'s location or metVia in the sub-text (#730)', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Alice has `location: 'Dorm A'` and the rest have `location: 'Off-campus'`
    // in the fixture. The card sub-text must not surface either value now
    // that the field is removed from the UI.
    expect(screen.queryByText(/Dorm A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Off-campus/)).not.toBeInTheDocument();
  });

  it('does not match contacts on `location` text in the search predicate (#730)', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Alice's location is "Dorm A" — searching for "Dorm" used to surface her.
    // That matching is gone with the field.
    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Dorm' } });

    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
  });
  it('filters contacts by stage dropdown option', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const filtersButton = screen.getByText('Filters');
    fireEvent.click(filtersButton);

    const stageSelect = screen.getByText('Stage').parentElement?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(stageSelect, { target: { value: 'Regular' } });

    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('filters contacts by spiritual background', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const filtersButton = screen.getByText('Filters');
    fireEvent.click(filtersButton);

    const spiritualSelect = screen.getByText('Spiritual background').parentElement?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(spiritualSelect, { target: { value: 'Christian' } });
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear all'));
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
  });

  // #1345: the free-text group (`role`) is retired; kind is the only answer to
  // "what sort of person is this".
  it('has no Group filter in the Filters menu (#1345)', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Filters'));

    expect(screen.getByText('Spiritual background')).toBeInTheDocument();
    expect(screen.queryByText('Group')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'All groups' })).not.toBeInTheDocument();
  });

  it('loads saved filter state that still carries a Group value, and ignores it (#1345)', async () => {
    writeDirectoryFilters('u-test', { ...DEFAULT_DIRECTORY_FILTERS, filterRole: 'Leader' } as any);
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
  });

  it('does not match a person on their stored role text (#1345)', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Alice's doc still says role: 'Student'; that is the only thing "student"
    // would have matched.
    fireEvent.change(screen.getByPlaceholderText(/Find someone by name/i), { target: { value: 'student' } });

    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
  });

  it('subtitles each card with year · major, skipping what is missing, and shows nothing when both are (#1345)', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    expect(screen.getByText('Sophomore · Biology')).toBeInTheDocument();
    expect(screen.getByText('Junior')).toBeInTheDocument();
    // Charlie has neither: no subtitle, and the old role text is not shown.
    expect(screen.queryByText('Staff')).not.toBeInTheDocument();
    expect(screen.queryByText('Student')).not.toBeInTheDocument();
    expect(screen.queryByText('Leader')).not.toBeInTheDocument();
  });

  it('filters contacts by tag chips', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const tagChip = screen.getByRole('button', { name: /^Freshman/ });
    fireEvent.click(tagChip);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();

    // Clicking again toggles filter off
    fireEvent.click(tagChip);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('reads "Not reached yet" for a contact nobody has reached (#1293)', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            {
              id: 'c-new',
              data: () => ({
                name: 'New Person',
                role: 'Student',
                stage: 'Lead',
                createdAt: twoDaysAgo,
                tags: [],
              }),
            },
          ],
          size: 1,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => expect(screen.getByText('New Person')).toBeInTheDocument());

    expect(screen.getByText('Not reached yet')).toBeInTheDocument();
    expect(screen.queryByText(/Last connected 2 days ago/i)).not.toBeInTheDocument();
  });

  it('filters contacts by Added When (today, week, month)', async () => {
    const today = new Date().toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const twentyDaysAgo = new Date(Date.now() - 20 * 86_400_000).toISOString();
    const twoMonthsAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            { id: 'c-today', data: () => ({ name: 'Today User', role: 'Student', stage: 'Lead', createdAt: today, tags: [] }) },
            { id: 'c-week', data: () => ({ name: 'Week User', role: 'Student', stage: 'Lead', createdAt: threeDaysAgo, tags: [] }) },
            { id: 'c-month', data: () => ({ name: 'Month User', role: 'Student', stage: 'Lead', createdAt: twentyDaysAgo, tags: [] }) },
            { id: 'c-old', data: () => ({ name: 'Old User', role: 'Student', stage: 'Lead', createdAt: twoMonthsAgo, tags: [] }) },
          ],
          size: 4,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Today User')).toBeInTheDocument();
      expect(screen.getByText('Week User')).toBeInTheDocument();
      expect(screen.getByText('Month User')).toBeInTheDocument();
      expect(screen.getByText('Old User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Filters'));
    const addedSelect = screen.getByText('Added').parentElement?.querySelector('select') as HTMLSelectElement;

    // Filter by Added today
    fireEvent.change(addedSelect, { target: { value: 'today' } });
    expect(screen.getByText('Today User')).toBeInTheDocument();
    expect(screen.queryByText('Week User')).not.toBeInTheDocument();
    expect(screen.queryByText('Month User')).not.toBeInTheDocument();
    expect(screen.queryByText('Old User')).not.toBeInTheDocument();

    // Filter by Added this week
    fireEvent.change(addedSelect, { target: { value: 'week' } });
    expect(screen.getByText('Today User')).toBeInTheDocument();
    expect(screen.getByText('Week User')).toBeInTheDocument();
    expect(screen.queryByText('Month User')).not.toBeInTheDocument();
    expect(screen.queryByText('Old User')).not.toBeInTheDocument();

    // Filter by Added this month
    fireEvent.change(addedSelect, { target: { value: 'month' } });
    expect(screen.getByText('Today User')).toBeInTheDocument();
    expect(screen.getByText('Week User')).toBeInTheDocument();
    expect(screen.getByText('Month User')).toBeInTheDocument();
    expect(screen.queryByText('Old User')).not.toBeInTheDocument();

    // Clear filters
    fireEvent.click(screen.getByText('Clear all'));
    expect(screen.getByText('Old User')).toBeInTheDocument();
  });

  it('buckets Added today by calendar day, so yesterday evening is not today (#1072)', async () => {
    // Pin system time to midday so "yesterday 23:00" is less than 24 hours ago
    // (which would have matched the old rolling window) yet falls on the
    // previous calendar day.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-17T12:00:00'));
    try {
      vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
        if (ref?.path === 'contacts') {
          callback({
            docs: [
              { id: 'c-today', data: () => ({ name: 'Today User', role: 'Student', stage: 'Lead', createdAt: '2026-08-17T08:00:00', tags: [] }) },
              { id: 'c-yesterday', data: () => ({ name: 'Yesterday User', role: 'Student', stage: 'Lead', createdAt: '2026-08-16T23:00:00', tags: [] }) },
            ],
            size: 2,
          });
        } else if (ref?.path === 'stages') {
          callback({ docs: mockStages, size: 2 });
        } else {
          callback({ docs: [], size: 0 });
        }
        return vi.fn();
      });

      render(<Directory />);
      await waitFor(() => {
        expect(screen.getByText('Today User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Filters'));
      const addedSelect = screen.getByText('Added').parentElement?.querySelector('select') as HTMLSelectElement;

      // Yesterday evening is on the previous calendar day, so it must NOT match
      // "Added today" even though it is under 24 hours old.
      fireEvent.change(addedSelect, { target: { value: 'today' } });
      expect(screen.getByText('Today User')).toBeInTheDocument();
      expect(screen.queryByText('Yesterday User')).not.toBeInTheDocument();

      // It should instead surface under "Added this week".
      fireEvent.change(addedSelect, { target: { value: 'week' } });
      expect(screen.getByText('Yesterday User')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders dynamic new tag for contacts created within past week and allows filtering by new tag', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            { id: 'c-fresh', data: () => ({ name: 'Fresh User', role: 'Student', stage: 'Lead', createdAt: twoDaysAgo, tags: ['Freshman'] }) },
            { id: 'c-old', data: () => ({ name: 'Old User', role: 'Student', stage: 'Lead', createdAt: fortyDaysAgo, tags: ['Senior'] }) },
          ],
          size: 2,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Fresh User')).toBeInTheDocument();
    });

    // Tag chip for 'new' should be present in tag chips
    const newTagChip = screen.getByRole('button', { name: /^new/ });
    expect(newTagChip).toBeInTheDocument();

    // Clicking 'new' tag chip should filter down to fresh contacts
    fireEvent.click(newTagChip);
    expect(screen.getByText('Fresh User')).toBeInTheDocument();
    expect(screen.queryByText('Old User')).not.toBeInTheDocument();
  });

  it('normalizes compact season tags in the people tag chips', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            ...mockContacts,
            {
              id: 'c4',
              data: () => ({
                name: 'Dana Fall',
                email: 'dana@example.com',
                phone: '',
                role: 'Student',
                stage: 'Lead',
                location: '',
                spiritualBackground: '',
                tags: ['Fall2025'],
                createdAt: '2026-03-01T00:00:00.000Z',
              }),
            },
          ],
          size: 4,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Dana Fall')).toBeInTheDocument();
    });

    // The chip is the spaced, human-readable version.
    const tagChip = screen.getByRole('button', { name: /^Fall 2025/ });
    fireEvent.click(tagChip);

    expect(screen.getByText('Dana Fall')).toBeInTheDocument();
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
  });

  it('shows empty state when no contacts match query', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });

    expect(screen.getByText('No one matches that just yet')).toBeInTheDocument();
  });

  it('selects/deselects individual and all contacts, and performs bulk actions', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Checkbox toggles selection
    const checkboxes = screen.getAllByTitle('Select');
    expect(checkboxes.length).toBe(3);
    fireEvent.click(checkboxes[0]); // Select Alice

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    // Bulk copy emails to clipboard instead of opening mail client (#751)
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const emailBtn = screen.getByTitle('Copy emails');
    fireEvent.click(emailBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('alice@example.com');
    });
    // Toast confirms the copy
    expect(await screen.findByText(/Copied 1 email/i)).toBeInTheDocument();
    const tagBtn = screen.getByTitle('Tag selected');
    fireEvent.click(tagBtn);
    expect(screen.getByText('Add a tag')).toBeInTheDocument();

    const tagInput = screen.getByPlaceholderText('e.g. leader-track');
    fireEvent.change(tagInput, { target: { value: 'new-tag' } });
    
    const submitBtn = screen.getByRole('button', { name: 'Add tag' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
      expect(logActivity).toHaveBeenCalled();
    });

    // Wait for the modal to close and the selection to be cleared
    await waitFor(() => {
      expect(screen.queryByText('Add a tag')).not.toBeInTheDocument();
    });

    // Select all
    let selectAllLabel: HTMLElement | null = null;
    await waitFor(() => {
      const span = screen.getByText((_content, element) => {
        return element?.tagName.toLowerCase() === 'span' && element.textContent?.includes('3 people') === true;
      });
      selectAllLabel = span.closest('label');
      expect(selectAllLabel).not.toBeNull();
    });
    fireEvent.click(selectAllLabel!);
    expect(screen.getByText('3 selected')).toBeInTheDocument();

    // Deselect all
    const deselectAllLabel = screen.getByText('3 selected', { selector: 'span' }).closest('label')!;
    fireEvent.click(deselectAllLabel);
    expect(screen.queryByText('selected')).not.toBeInTheDocument();
  });

  it('performs bulk stage change when selected', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByTitle('Select');
    fireEvent.click(checkboxes[0]); // Select Alice

    const stageBtn = screen.getByTitle('Change stage for selected');
    fireEvent.click(stageBtn);
    expect(screen.getByText('Change stage')).toBeInTheDocument();

    const select = screen.getByTestId('bulk-stage-select');
    fireEvent.change(select, { target: { value: 'Regular' } });

    const submitBtn = screen.getByRole('button', { name: 'Update stage' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ stage: 'Regular' })
      );
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'updated stage to Regular for' })
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('Change stage')).not.toBeInTheDocument();
    });
  });

  // #1263: like the kind picker, the stage picker offers no pre-chosen answer.
  it('opens the bulk stage picker blank, with Update waiting for a choice', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());

    fireEvent.click(screen.getAllByTitle('Select')[0]);
    fireEvent.click(screen.getByTitle('Change stage for selected'));

    expect((screen.getByTestId('bulk-stage-select') as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Update stage' })).toBeDisabled();
  });

  // #1263: on a long list the actions follow the reader down while a
  // selection exists, rather than waiting at the top of the page.
  it('pins the selection row only while something is selected', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());

    expect(screen.getByTestId('selection-row')).not.toHaveClass('sticky');
    fireEvent.click(screen.getAllByTitle('Select')[0]);
    expect(screen.getByTestId('selection-row')).toHaveClass('sticky');
  });

  it('performs bulk delete when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
      effectiveUserId: 'u-test',
      isManager: true,
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByTitle('Select');
    fireEvent.click(checkboxes[0]);

    const deleteBtn = screen.getByTitle('Remove selected');
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalled();
  });

  it('does not perform bulk delete if cancel is clicked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
      effectiveUserId: 'u-test',
      isManager: true,
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByTitle('Select');
    fireEvent.click(checkboxes[0]);

    const deleteBtn = screen.getByTitle('Remove selected');
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  // #1368: Firestore's delete rule requires isManager (Full-timer or Trainee),
  // so a Student is never offered the Directory's bulk Remove.
  it('hides bulk Remove from a Student with people selected (#1368)', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-student', displayName: 'Student User' },
      effectiveUserId: 'u-student',
      role: 'operator',
      isAdmin: false,
      isManager: false,
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTitle('Select')[0]);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByTitle('Remove selected')).not.toBeInTheDocument();
  });

  it('keeps bulk Remove for a Trainee with people selected (#1368)', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'trainee-123', displayName: 'Trainee User' },
      effectiveUserId: 'trainee-123',
      role: 'manager',
      isAdmin: false,
      isManager: true,
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTitle('Select')[0]);
    expect(screen.getByTitle('Remove selected')).toBeInTheDocument();
  });

  it('keeps bulk Remove for a Full-timer with people selected (#1368)', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User' },
      effectiveUserId: 'u-admin',
      role: 'admin',
      isAdmin: true,
      isManager: true,
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTitle('Select')[0]);
    expect(screen.getByTitle('Remove selected')).toBeInTheDocument();
  });

  it('renders avatars correctly', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Alice has initials AJ
    expect(screen.getByText('AJ')).toBeInTheDocument();
    // Charlie has avatar image
    const charlieImg = screen.getByAltText('Charlie Brown');
    expect(charlieImg).toHaveAttribute('src', 'https://example.com/charlie.png');
  });

  it('displays scoped count line copy for trainees', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'u1', email: 'trainee@example.com' },
      role: 'manager',
      isAdmin: false,
    } as any);

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText(/everyone you added, or were named on/)).toBeInTheDocument();
    });
  });

  it('enforces simulated trainee permissions when impersonating a trainee', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'u-admin-1', email: 'admin@cisa.campus' },
      role: 'manager',
      isAdmin: false,
      effectiveUserId: 'trainee-123',
    } as any);

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
      expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    });
  });

  it('handles snapshot errors for contacts and stages', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any, errorCallback: any) => {
      if (errorCallback) {
        errorCallback(new Error('Firestore error'));
      }
      return vi.fn();
    });

    render(<Directory />);
    expect(handleFirestoreError).toHaveBeenCalled();
    expect(await screen.findByText(/Couldn't load/)).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it('intersects a custom From/To range with the active preset (#751)', async () => {
    // Three-day-ago contact is inside both the "week"/"month" presets AND a 7-day
    // From-window. Eighteen-day-ago contact is inside "month" preset but outside
    // the 7-day From-window. With "month" preset + From=7 days ago + To=today the
    // 18-day-old contact must be excluded (preset passes, range fails). Drop the
    // From to "no filter" and the 18-day contact reappears (still inside "month").
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const eighteenDaysAgo = new Date(Date.now() - 18 * 86_400_000).toISOString();

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            { id: 'c-week', data: () => ({ name: 'Week User', role: 'Student', stage: 'Lead', createdAt: threeDaysAgo, tags: [] }) },
            { id: 'c-month', data: () => ({ name: 'Month User', role: 'Student', stage: 'Lead', createdAt: eighteenDaysAgo, tags: [] }) },
          ],
          size: 2,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Week User')).toBeInTheDocument();
      expect(screen.getByText('Month User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Filters'));

    // Set the "month" preset AND a From=7 days ago / To=today window.
    // Month User (18 days ago) is inside "month" but OUTSIDE the 7-day window —
    // intersection filters it out.
    const addedSelect = screen.getByText('Added').parentElement?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(addedSelect, { target: { value: 'month' } });

    const fromInput = await waitFor(() => screen.getByLabelText(/From/i)) as HTMLInputElement;
    const toInput = await waitFor(() => screen.getByLabelText(/To/i)) as HTMLInputElement;
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    fireEvent.change(fromInput, { target: { value: sevenDaysAgo } });
    fireEvent.change(toInput, { target: { value: todayStr } });

    expect(screen.getByText('Week User')).toBeInTheDocument();
    expect(screen.queryByText('Month User')).not.toBeInTheDocument();

    // Loosen the From to "all-time" via Clear all; the preset still applies so
    // both contacts are now visible — proving the range was the binding constraint.
    fireEvent.click(screen.getByText('Clear all'));
    expect(screen.getByText('Week User')).toBeInTheDocument();
    expect(screen.getByText('Month User')).toBeInTheDocument();
  });
  it('shows a validation toast and applies no range when From is after To (#751)', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Filters'));

    const fromInput = await waitFor(() => screen.getByLabelText(/From/i)) as HTMLInputElement;
    const toInput = await waitFor(() => screen.getByLabelText(/To/i)) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: '2026-08-25' } });
    fireEvent.change(toInput, { target: { value: '2026-08-10' } });

    expect(await screen.findByText(/start date before/i)).toBeInTheDocument();
    // Invalid range must NOT hide contacts
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
  });

   it('shows a no-emails toast when selected contacts have no email addresses (#751)', async () => {
    const noEmail = {
      id: 'c-noemail',
      data: () => ({
        name: 'No Email Person',
        role: 'Student',
        stage: 'Lead',
        email: '',
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    };
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: [noEmail], size: 1 });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

     render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('No Email Person')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTitle('Select')[0]);
    fireEvent.click(screen.getByTitle('Copy emails'));

    expect(writeText).not.toHaveBeenCalled();
    expect(await screen.findByText(/No email addresses/i)).toBeInTheDocument();
  });

  it('renders Tag M/F button in the toolbar and opens TagGenderModal', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const tagGenderBtn = screen.getByRole('button', { name: /Tag M\/F/i });
    expect(tagGenderBtn).toBeInTheDocument();

    fireEvent.click(tagGenderBtn);
    expect(await screen.findByText('Tag M / F')).toBeInTheDocument();
  });

  it('toggles mobile More menu and triggers actions from dropdown', async () => {
    const openSmartImport = vi.fn();
    (useLayout as any).mockReturnValue({
      openNewContact: vi.fn(),
      setSelectedContact: vi.fn(),
      openSmartImport,
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Locate mobile "More" button
    const moreBtn = screen.getByRole('button', { name: 'More' });
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');

    // Open More menu
    fireEvent.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'true');

    // Check menu items
    const combineItem = screen.getAllByRole('menuitem', { name: /combine tags/i })[0];
    const tagGenderItem = screen.getByRole('menuitem', { name: /Tag M\/F/i });
    const smartImportItem = screen.getByRole('menuitem', { name: /smart import/i });
    expect(combineItem).toBeInTheDocument();
    expect(tagGenderItem).toBeInTheDocument();
    expect(smartImportItem).toBeInTheDocument();

    // Click Smart Import item
    fireEvent.click(smartImportItem);
    expect(openSmartImport).toHaveBeenCalled();
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');

    // Reopen and test Escape key closes menu
    fireEvent.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');

    // Reopen and test mousedown outside closes menu
    fireEvent.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseDown(document.body);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');

    // Reopen and test Tag Gender item
    fireEvent.click(moreBtn);
    fireEvent.click(tagGenderItem);
    expect(await screen.findByText('Tag M / F')).toBeInTheDocument();

    // Close Tag Gender modal
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText('Tag M / F')).not.toBeInTheDocument();
    });

    // Reopen and test Combine Tags item
    fireEvent.click(moreBtn);
    const newCombineItem = await screen.findByRole('menuitem', { name: /combine tags/i });
    fireEvent.click(newCombineItem);
    expect(await screen.findByText('No duplicate or overlapping tags found.')).toBeInTheDocument();
  });

  it('renders Combine contacts button for admin and opens CombineContactsModal', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User' },
      role: 'admin',
      effectiveUserId: 'u-admin',
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const combineContactsBtn = screen.getByRole('button', { name: /combine contacts/i });
    expect(combineContactsBtn).toBeInTheDocument();

    fireEvent.click(combineContactsBtn);
    expect(await screen.findByText(/No duplicate contacts found/i)).toBeInTheDocument();
  });

  it('does not render Combine contacts button for non-admin', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-trainee', displayName: 'Trainee User' },
      role: 'manager',
      isAdmin: false,
      effectiveUserId: 'trainee-123',
    });

    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /combine contacts/i })).not.toBeInTheDocument();
  });

  it('retains search and filters across an open-then-close contact detail cycle (#1067)', async () => {
    const { unmount } = render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Apply a search query plus a stage filter.
    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Bob' } });

    fireEvent.click(screen.getByText('Filters'));
    const stageSelect = screen.getByText('Stage').parentElement?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(stageSelect, { target: { value: 'Regular' } });
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();

    // Simulate navigating into a contact detail (the directory unmounts)...
    unmount();

    // ...and back (the directory remounts): the exact selections are restored.
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    const restoredInput = screen.getByPlaceholderText(/Find someone by name/i) as HTMLInputElement;
    expect(restoredInput.value).toBe('Bob');
  });

  it('lets Clear all reset every filter so nothing is restored on return (#1067)', async () => {
    const { unmount } = render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Alice' } });
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Filters'));
    fireEvent.click(screen.getByText('Clear all'));
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();

    // Return from the contact detail: filters must NOT come back.
    unmount();
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    const restoredInput = screen.getByPlaceholderText(/Find someone by name/i) as HTMLInputElement;
    expect(restoredInput.value).toBe('');
  });

  // The rules deny a Trainee the interactions collection group (it spans
  // people outside their visibleTo), so their last-touch feed reads each
  // visible person's interactions instead.
  it('reads a Trainee\'s last touches through their visible contacts, never the collection group', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'trainee-1', displayName: 'Trainee' },
      effectiveUserId: 'trainee-1',
      role: 'manager',
    });
    render(<Directory />);
    await waitFor(() => expect(collection).toHaveBeenCalledWith({}, 'contacts', mockContacts[0].id, 'interactions'));
    expect(collectionGroup).not.toHaveBeenCalledWith({}, 'interactions');
  });

  // Same for threads: the collection group spans people outside a Trainee's
  // visibleTo, so their thread touches come from each visible person.
  it('reads a Trainee\'s thread touches through their visible contacts, never the collection group', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'trainee-1', displayName: 'Trainee' },
      effectiveUserId: 'trainee-1',
      role: 'manager',
    });
    render(<Directory />);
    await waitFor(() => expect(collection).toHaveBeenCalledWith({}, 'contacts', mockContacts[0].id, 'threads'));
    expect(collectionGroup).not.toHaveBeenCalledWith({}, 'threads');
  });

  it('keeps the threads collection group for a reader who sees every person', async () => {
    (useAuth as any).mockReturnValue({ user: { uid: 'admin-1' }, effectiveUserId: 'admin-1', role: 'admin' });
    render(<Directory />);
    await waitFor(() => expect(collectionGroup).toHaveBeenCalledWith({}, 'threads'));
  });

  it('keeps the interactions collection group for a reader who sees every person', async () => {
    (useAuth as any).mockReturnValue({ user: { uid: 'admin-1' }, effectiveUserId: 'admin-1', role: 'admin' });
    render(<Directory />);
    await waitFor(() => expect(collectionGroup).toHaveBeenCalledWith({}, 'interactions'));
  });

  it('shows each tag chip its not-reached count, over Contacts added in the last 30 days (#1300)', async () => {
    (useAuth as any).mockReturnValue({ user: { uid: 'admin-1' }, effectiveUserId: 'admin-1', role: 'admin' });
    const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            { id: 'r-bfa1', data: () => ({ name: 'Recent BFA One', role: 'Student', stage: 'Lead', createdAt: days(2), tags: ['BFA'] }) },
            { id: 'r-bfa2', data: () => ({ name: 'Recent BFA Two', role: 'Student', stage: 'Lead', createdAt: days(10), tags: ['BFA'] }) },
            { id: 'r-bfa-old', data: () => ({ name: 'Old BFA', role: 'Student', stage: 'Lead', createdAt: days(40), tags: ['BFA'] }) },
            { id: 'r-bfa-saint', data: () => ({ name: 'Saint BFA', role: 'Student', stage: 'Lead', inChurchLife: true, isStudent: false, createdAt: days(2), tags: ['BFA'] }) },
            { id: 'r-fresh', data: () => ({ name: 'Freshman Recent', role: 'Student', stage: 'Lead', createdAt: days(3), tags: ['Freshman'] }) },
          ],
          size: 5,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Recent BFA One')).toBeInTheDocument());

    // Two recent Contacts (the 40-day-old contact is outside the window, the
    // Local saint never counts).
    expect(screen.getByRole('button', { name: 'BFA · 2 not reached' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Freshman · 1 not reached' })).toBeInTheDocument();
  });

  it('the Not reached yet filter combines with tags and reaches back past 30 days (#1300)', async () => {
    (useAuth as any).mockReturnValue({ user: { uid: 'admin-1' }, effectiveUserId: 'admin-1', role: 'admin' });
    const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            { id: 'f-bfa-new', data: () => ({ name: 'BFA New', role: 'Student', stage: 'Lead', createdAt: days(2), tags: ['BFA'] }) },
            { id: 'f-bfa-old', data: () => ({ name: 'BFA Old', role: 'Student', stage: 'Lead', createdAt: days(90), tags: ['BFA'] }) },
            { id: 'f-bfa-reached', data: () => ({ name: 'BFA Reached', role: 'Student', stage: 'Lead', createdAt: days(2), tags: ['BFA'] }) },
            { id: 'f-other', data: () => ({ name: 'Other Freshman', role: 'Student', stage: 'Lead', createdAt: days(2), tags: ['Freshman'] }) },
          ],
          size: 4,
        });
      } else if (ref?.group === 'interactions') {
        callback({
          docs: [
            {
              id: 'i1',
              ref: { path: 'contacts/f-bfa-reached/interactions/i1' },
              data: () => ({ createdAt: days(1), content: 'Talked' }),
            },
          ],
          size: 1,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => expect(screen.getByText('BFA New')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Filters'));
    fireEvent.click(screen.getByTestId('filter-not-reached'));

    expect(screen.getByText('BFA New')).toBeInTheDocument();
    expect(screen.getByText('BFA Old')).toBeInTheDocument();
    expect(screen.getByText('Other Freshman')).toBeInTheDocument();
    expect(screen.queryByText('BFA Reached')).not.toBeInTheDocument();

    // Combining with a tag narrows to the BFA people nobody has reached, old
    // ones included.
    fireEvent.click(screen.getByRole('button', { name: /^BFA ·/ }));
    expect(screen.getByText('BFA New')).toBeInTheDocument();
    expect(screen.getByText('BFA Old')).toBeInTheDocument();
    expect(screen.queryByText('Other Freshman')).not.toBeInTheDocument();
    expect(screen.queryByText('BFA Reached')).not.toBeInTheDocument();
  });

  it('a Full-timer sees a person reached long before the 500 newest interactions as reached, everywhere (#1335)', async () => {
    (useAuth as any).mockReturnValue({ user: { uid: 'admin-1' }, effectiveUserId: 'admin-1', role: 'admin' });
    const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            // Their only interaction is older than the 500 the page reads; the
            // reach stamp it left on them is all that remains.
            { id: 'old-reached', data: () => ({ name: 'Old Reached', role: 'Student', stage: 'Lead', createdAt: days(2), tags: ['BFA'], reachedAt: days(200) }) },
            // Public sign-up while a teammate was signed in: the last-contacted
            // trio, but nobody logged an interaction and they were never present.
            {
              id: 'signed-up',
              data: () => ({
                name: 'Signed Up', role: 'Student', stage: 'Lead', createdAt: days(2), tags: ['BFA'],
                lastContactedById: 'u-ft', lastContactedBy: 'Ana', lastContactedDate: days(2),
              }),
            },
          ],
          size: 2,
        });
      } else if (ref?.group === 'interactions') {
        callback({
          docs: [
            { id: 'i1', ref: { path: 'contacts/someone-else/interactions/i1' }, data: () => ({ createdAt: days(1), content: 'Talked' }) },
          ],
          size: 1,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Old Reached')).toBeInTheDocument());
    const rowOf = (name: string) => screen.getByText(name).parentElement!.parentElement!;

    // The row label.
    expect(within(rowOf('Old Reached')).queryByText('Not reached yet')).not.toBeInTheDocument();
    expect(within(rowOf('Signed Up')).getByText('Not reached yet')).toBeInTheDocument();

    // The tag count.
    expect(screen.getByRole('button', { name: 'BFA · 1 not reached' })).toBeInTheDocument();

    // The filter.
    fireEvent.click(screen.getByText('Filters'));
    fireEvent.click(screen.getByTestId('filter-not-reached'));
    expect(screen.getByText('Signed Up')).toBeInTheDocument();
    expect(screen.queryByText('Old Reached')).not.toBeInTheDocument();
  });
});

describe('Directory — search by relationship fields (#1176)', () => {
  const mockUsers = [
    { id: 'founder-1', data: () => ({ displayName: 'Sarah Founder', role: 'manager' }) },
    { id: 'carer-1',   data: () => ({ displayName: 'Mark Carer',   role: 'manager' }) },
    { id: 'co-1',      data: () => ({ displayName: 'Dana CoCreate', role: 'manager' }) },
  ];

  const mockContactsWithTies = [
    {
      id: 'r1',
      data: () => ({
        name: 'Alpha Contact',
        email: 'alpha@example.com',
        role: 'Student',
        stage: 'Lead',
        spiritualBackground: '',
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        founders: ['founder-1'],
      }),
    },
    {
      id: 'r2',
      data: () => ({
        name: 'Beta Contact',
        email: 'beta@example.com',
        role: 'Student',
        stage: 'Lead',
        spiritualBackground: '',
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        carers: ['carer-1'],
      }),
    },
    {
      id: 'r3',
      data: () => ({
        name: 'Gamma Contact',
        email: 'gamma@example.com',
        role: 'Student',
        stage: 'Lead',
        spiritualBackground: '',
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        coCreators: ['co-1'],
      }),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    __resetDirectoryFilters();

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContactsWithTies, size: 3 });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else if (ref?.path === 'users') {
        callback({ docs: mockUsers, size: 3 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
      effectiveUserId: 'u-test',
    });

    (useLayout as any).mockReturnValue({
      openNewContact: vi.fn(),
      setSelectedContact: vi.fn(),
    });
  });

  it('finds a contact when searching by a founder display name', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Alpha Contact')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Sarah' } });

    expect(screen.getByText('Alpha Contact')).toBeInTheDocument();
    expect(screen.queryByText('Beta Contact')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Contact')).not.toBeInTheDocument();
  });

  it('finds a contact when searching by a carer display name', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Beta Contact')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Mark' } });

    expect(screen.getByText('Beta Contact')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Contact')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Contact')).not.toBeInTheDocument();
  });

  it('finds a contact when searching by a co-creator display name', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Gamma Contact')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Dana' } });

    expect(screen.getByText('Gamma Contact')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Contact')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta Contact')).not.toBeInTheDocument();
  });

  it('search by relationship name is case-insensitive', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Alpha Contact')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'sarah founder' } });

    expect(screen.getByText('Alpha Contact')).toBeInTheDocument();
  });

  it('a contact with no relationship ties is not shown when searching a teammate name', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            ...mockContactsWithTies,
            {
              id: 'r4',
              data: () => ({
                name: 'Unrelated Contact',
                email: 'unrelated@example.com',
                role: 'Student',
                stage: 'Lead',
                spiritualBackground: '',
                tags: [],
                createdAt: '2026-01-01T00:00:00.000Z',
              }),
            },
          ],
          size: 4,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else if (ref?.path === 'users') {
        callback({ docs: mockUsers, size: 3 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Unrelated Contact')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Sarah' } });

    expect(screen.getByText('Alpha Contact')).toBeInTheDocument();
    expect(screen.queryByText('Unrelated Contact')).not.toBeInTheDocument();
  });

  it('matches word-boundary, not mid-word substrings (#1192)', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            { id: 'w1', data: () => ({ name: 'Christian Hall', email: 'chris@example.com', role: 'Student', stage: 'Lead', spiritualBackground: 'Christian', tags: [], createdAt: '2026-01-01T00:00:00.000Z' }) },
            { id: 'w2', data: () => ({ name: 'Ian Marks', email: 'ian@example.com', role: 'Student', stage: 'Lead', spiritualBackground: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z' }) },
          ],
          size: 2,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else if (ref?.path === 'users') {
        callback({ docs: mockUsers, size: 3 });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Christian Hall')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'ian' } });

    expect(screen.getByText('Ian Marks')).toBeInTheDocument();
    expect(screen.queryByText('Christian Hall')).not.toBeInTheDocument();
  });

  it('ranks name matches above relationship-only matches and captions the latter (#1192)', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            { id: 'n1', data: () => ({ name: 'Julia Bell', email: 'julia@example.com', role: 'Student', stage: 'Lead', spiritualBackground: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z' }) },
            {
              id: 'n2',
              data: () => ({ name: 'Tied Person', email: 'tied@example.com', role: 'Student', stage: 'Lead', spiritualBackground: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', carers: ['carer-julia'] }),
            },
          ],
          size: 2,
        });
      } else if (ref?.path === 'stages') {
        callback({ docs: mockStages, size: 2 });
      } else if (ref?.path === 'users') {
        callback({
          docs: [
            { id: 'carer-julia', data: () => ({ displayName: 'Julia Worker', role: 'manager' }) },
          ],
          size: 1,
        });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    });

    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Julia Bell')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'julia' } });

    // The name match and the carer match both show, and the name match comes first.
    expect(screen.getByText('Julia Bell')).toBeInTheDocument();
    expect(screen.getByText('Tied Person')).toBeInTheDocument();
    const nameCard = screen.getByText('Julia Bell');
    const tiedCard = screen.getByText('Tied Person');
    expect(nameCard.compareDocumentPosition(tiedCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The relationship-only hit explains itself with a "matched by" caption.
    expect(screen.getByText('Matched by Julia Worker')).toBeInTheDocument();
  });
});

// The kind segments and chips in the Directory (#1296, ADR 0030).
describe('Directory — the kind of person', () => {
  const kindContacts = [
    { id: 'k1', data: () => ({ name: 'Saint Local', email: 's@example.com', phone: '', role: '', stage: 'Regular', location: '', spiritualBackground: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', inChurchLife: true, isStudent: false, kindSetBy: 'u1', kindSetAt: '2026-09-23T00:00:00.000Z' }) },
    { id: 'k2', data: () => ({ name: 'Ours Student', email: 'o@example.com', phone: '', role: '', stage: 'Regular', location: '', spiritualBackground: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', inChurchLife: true, isStudent: true, kindSetBy: 'u1', kindSetAt: '2026-09-23T00:00:00.000Z' }) },
    { id: 'k3', data: () => ({ name: 'Plain Contact', email: 'p@example.com', phone: '', role: '', stage: 'Lead', location: '', spiritualBackground: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', inChurchLife: false, isStudent: true, kindSetBy: 'u1', kindSetAt: '2026-09-23T00:00:00.000Z' }) },
    { id: 'k4', data: () => ({ name: 'Nobody Sorted', email: 'n@example.com', phone: '', role: '', stage: 'Lead', location: '', spiritualBackground: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z' }) },
  ];

  beforeEach(() => {
    __resetDirectoryFilters();
    (useLayout as any).mockReturnValue({
      openNewContact: vi.fn(),
      setSelectedContact: vi.fn(),
    });
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
      effectiveUserId: 'u-test',
      role: 'admin',
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: kindContacts, size: kindContacts.length });
      else if (ref?.path === 'stages') callback({ docs: mockStages, size: 2 });
      else callback({ docs: [], size: 0 });
      return vi.fn();
    });
  });

  it('opens on the Contacts segment, which narrows the list to Contacts', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Plain Contact')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Contacts' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    // The segment is doing the filtering: Local saint and Our own are hidden.
    expect(screen.queryByText('Saint Local')).not.toBeInTheDocument();
    expect(screen.queryByText('Ours Student')).not.toBeInTheDocument();
  });

  it('narrows to one kind when a segment is picked', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Plain Contact')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Local saints' }));

    expect(screen.getByText('Saint Local')).toBeInTheDocument();
    expect(screen.queryByText('Ours Student')).not.toBeInTheDocument();
    expect(screen.queryByText('Plain Contact')).not.toBeInTheDocument();
  });

  it('looks across every kind when a search is typed, whatever segment is on', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Plain Contact')).toBeInTheDocument());

    // The segment is still Contacts, but a search ignores it (#1296).
    const searchInput = screen.getByPlaceholderText(/Find someone by name/i);
    fireEvent.change(searchInput, { target: { value: 'Saint' } });

    expect(screen.getByText('Saint Local')).toBeInTheDocument();
    expect(screen.queryByText('Plain Contact')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Ours' } });
    expect(screen.getByText('Ours Student')).toBeInTheDocument();
  });

  it('carries a kind chip on every row', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Plain Contact')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    const chips = screen.getAllByTestId('kind-chip').map((el) => el.textContent);
    expect(chips).toContain('Local saint');
    expect(chips).toContain('Our own');
    expect(chips).toContain('Contact');
  });

  it('keeps Not sorted yet in the filter panel, as its own worklist', async () => {
    render(<Directory />);
    await waitFor(() => expect(screen.getByText('Plain Contact')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Filters'));
    const unsorted = screen.getByTestId('filter-unsorted');
    expect(unsorted).toBeInTheDocument();

    fireEvent.click(unsorted);

    expect(screen.getByText('Nobody Sorted')).toBeInTheDocument();
    expect(screen.queryByText('Plain Contact')).not.toBeInTheDocument();
    expect(screen.queryByText('Saint Local')).not.toBeInTheDocument();
  });
});

// #1152 review follow-up: the bulk picker offers three kinds, but a Contact can
// be a student or a local — the fourth cell. Setting someone to Contact must
// not silently overwrite what we know about their being a student.
describe('Directory — bulk-setting the kind', () => {
  const studentContact = [
    { id: 'b1', data: () => ({ name: 'Known Student', email: 'ks@example.com', phone: '', role: '', stage: 'Lead', location: '', spiritualBackground: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', inChurchLife: true, isStudent: true, kindSetBy: 'u1', kindSetAt: '2026-09-23T00:00:00.000Z' }) },
  ];

  beforeEach(() => {
    __resetDirectoryFilters();
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'ft1', email: 'ft@example.com', displayName: 'Full Timer' },
      role: 'admin',
      isAdmin: true,
    } as any);
    (useLayout as any).mockReturnValue({
      openNewContact: vi.fn(),
      setSelectedContact: vi.fn(),
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: studentContact, size: 1 });
      else if (ref?.path === 'stages') callback({ docs: mockStages, size: 2 });
      else callback({ docs: [], size: 0 });
      return vi.fn();
    });
  });

  const setKindTo = async (value: string) => {
    render(<Directory />);
    // The student is Our own, so the default Contacts segment hides them.
    fireEvent.click(await screen.findByRole('button', { name: 'All' }));
    await waitFor(() => expect(screen.getByText('Known Student')).toBeInTheDocument());
    fireEvent.click(screen.getAllByTitle('Select')[0]);
    fireEvent.click(screen.getByTitle('Set who the selected people are'));
    fireEvent.change(screen.getByTestId('bulk-kind-select'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  };

  it('leaves the student fact alone when setting someone to Contact', async () => {
    await setKindTo('contact');
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const written = mockUpdate.mock.calls.at(-1)?.[1];
    expect(written.inChurchLife).toBe(false);
    expect(written).not.toHaveProperty('isStudent');
    expect(written.kindSetBy).toBe('ft1');
  });

  it('sets both when making someone Our own', async () => {
    await setKindTo('our-own');
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const written = mockUpdate.mock.calls.at(-1)?.[1];
    expect(written.inChurchLife).toBe(true);
    expect(written.isStudent).toBe(true);
  });

  // #1263: saving the kind is a person deciding, so the picker never offers a
  // pre-chosen answer — not a default, and not whatever was saved last time.
  it('opens blank every time, and Save waits for a choice', async () => {
    await setKindTo('our-own');
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('bulk-kind-select')).not.toBeInTheDocument());

    fireEvent.click(screen.getAllByTitle('Select')[0]);
    fireEvent.click(screen.getByTitle('Set who the selected people are'));
    expect((screen.getByTestId('bulk-kind-select') as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(screen.getByTestId('bulk-kind-select'), { target: { value: 'local-saint' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('records the change in the team\u2019s own words, not slugs', async () => {
    await setKindTo('local-saint');
    await waitFor(() => expect(logActivity).toHaveBeenCalled());
    const logged = vi.mocked(logActivity).mock.calls.at(-1)?.[0] as any;
    expect(logged.description).toContain('Local saint');
    expect(logged.description).not.toContain('local-saint');
  });
});

// #1351: Moving up a year. Next to Not sorted yet, a Full-timer confirms every
// student's year for the new school year — all at once, with exceptions.
describe('Directory — Moving up a year', () => {
  const person = (id: string, name: string, extra: Record<string, unknown>) => ({
    id,
    data: () => ({ name, email: `${id}@example.com`, phone: '', stage: 'Lead', tags: [], createdAt: '2025-09-01T00:00:00.000Z', ...extra }),
  });
  const students = [
    person('m1', 'Fresh Face', { isStudent: true, inChurchLife: false, year: 'Freshman' }),
    person('m2', 'Gap Year', { isStudent: true, inChurchLife: false, year: 'Junior' }),
    person('m3', 'Senior Ours', { isStudent: true, inChurchLife: true, year: 'Senior', kindSetBy: 'u0', kindSetAt: '2025-09-01T00:00:00.000Z' }),
    person('m4', 'Grad Student', { isStudent: true, inChurchLife: false, year: 'Graduate' }),
    person('m5', 'Done Already', { isStudent: true, year: 'Junior', yearConfirmedFor: '2026-27', yearConfirmedBy: 'u0', yearConfirmedAt: '2026-08-02T00:00:00.000Z' }),
    person('m6', 'Local Saint', { isStudent: false, inChurchLife: true }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0));
    __resetDirectoryFilters();
    (useLayout as any).mockReturnValue({ openNewContact: vi.fn(), setSelectedContact: vi.fn() });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') callback({ docs: students, size: students.length });
      else if (ref?.path === 'stages') callback({ docs: mockStages, size: 2 });
      else callback({ docs: [], size: 0 });
      return vi.fn();
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const asFullTimer = () => vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'ft1', email: 'ft@example.com', displayName: 'Full Timer' },
    effectiveUserId: 'ft1', role: 'admin', isAdmin: true,
  } as any);

  const openFilters = async () => {
    render(<Directory />);
    fireEvent.click(await screen.findByText('Filters'));
  };

  it('moves everyone up at once, keeps the exceptions, and graduates a Senior into a Local saint', async () => {
    asFullTimer();
    await openFilters();

    // Four students are unconfirmed for 2026–27; the confirmed one and the
    // non-student are not counted.
    fireEvent.click(screen.getByRole('button', { name: /Years to confirm\s*4/ }));
    const dialog = screen.getByRole('dialog', { name: 'Moving up a year' });
    expect(within(dialog).queryByText('Done Already')).toBeNull();
    expect(within(dialog).queryByText('Local Saint')).toBeNull();

    const choice = (id: string) => within(dialog).getByTestId(`year-choice-${id}`) as HTMLSelectElement;
    expect(choice('m1').value).toBe('year:Sophomore');
    expect(choice('m3').value).toBe('graduated');
    // A Graduate has no next step, so nothing is chosen for them.
    expect(choice('m4').value).toBe('');

    // The exception: a gap year keeps them where they are.
    fireEvent.change(choice('m2'), { target: { value: 'year:Junior' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm 3' }));

    await waitFor(() => expect(mockCommit).toHaveBeenCalled());
    const writes = Object.fromEntries(mockUpdate.mock.calls.map(([ref, data]) => [ref.id, data]));
    expect(Object.keys(writes).sort()).toEqual(['m1', 'm2', 'm3']);
    expect(writes.m1).toMatchObject({ year: 'Sophomore', yearConfirmedFor: '2026-27', yearConfirmedBy: 'ft1' });
    expect(writes.m2).toMatchObject({ yearConfirmedFor: '2026-27', yearConfirmedBy: 'ft1' });
    expect(writes.m2).not.toHaveProperty('year');
    expect(writes.m3).toMatchObject({ isStudent: false, year: '', kindSetBy: 'ft1' });
    expect(writes.m3.kindSetAt).toEqual(expect.any(String));
    expect(writes.m3).not.toHaveProperty('inChurchLife');

    const logged = vi.mocked(logActivity).mock.calls.map(([a]) => a as any);
    expect(logged.find((a) => a.targetId === 'm1')?.description).toBe('year: "Freshman" → "Sophomore"');
    expect(logged.find((a) => a.targetId === 'm3')?.description).toBe('graduated or left school\nkind: "Our own" → "Local saint"');
    expect(logged.find((a) => a.targetId === 'm2')).toBeUndefined();
  });

  it('is not there for a Trainee', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'tr1', displayName: 'Trainee' }, effectiveUserId: 'tr1', role: 'manager', isAdmin: false,
    } as any);
    await openFilters();
    expect(screen.getByTestId('filter-unsorted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Years to confirm/ })).toBeNull();
  });
});
