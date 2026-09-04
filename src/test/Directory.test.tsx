import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import Directory from '../views/Directory';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import { logActivity, handleFirestoreError } from '../lib/firebase';
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
  collection: vi.fn((_db, path) => ({ path })),
  collectionGroup: vi.fn((_db, group) => ({ group })),
  onSnapshot: vi.fn((ref, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  query: vi.fn((ref) => ref),
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

    const stageSelect = screen.getByText('Stage').nextElementSibling as HTMLSelectElement;
    fireEvent.change(stageSelect, { target: { value: 'Regular' } });

    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('filters contacts by role and spiritual background options', async () => {
    render(<Directory />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const filtersButton = screen.getByText('Filters');
    fireEvent.click(filtersButton);

    // Filter by Role = Leader
    const roleSelect = screen.getByText('Group').nextElementSibling as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: 'Leader' } });
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();

    // Clear filters
    const clearBtn = screen.getByText('Clear all');
    fireEvent.click(clearBtn);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();

    // Filter by Spiritual Background = Christian
    fireEvent.click(filtersButton);
    const spiritualSelect = screen.getByText('Spiritual background').nextElementSibling as HTMLSelectElement;
    fireEvent.change(spiritualSelect, { target: { value: 'Christian' } });
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('omits blank roles from the Group filter dropdown (issue #359)', async () => {
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({
          docs: [
            ...mockContacts,
            { id: 'c4', data: () => ({ name: 'No Role Yet', email: 'none@example.com', phone: '', role: '', stage: 'Lead', location: '', spiritualBackground: '', tags: [], createdAt: '2026-03-01T00:00:00.000Z' }) },
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
      expect(screen.getByText('No Role Yet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Filters'));

    const groupSelect = screen.getByText('Group').nextElementSibling as HTMLSelectElement;
    const optionValues = Array.from(groupSelect.options).map((o) => o.value);
    expect(optionValues).toContain('All');
    expect(optionValues).toContain('Student');
    // No blank/whitespace option for contacts without a group.
    expect(optionValues.every((v) => v.trim() !== '')).toBe(true);
  });

  it('filters contacts by tag chips', async () => {
    render(<Directory />);
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const tagChip = screen.getByRole('button', { name: 'Freshman' });
    fireEvent.click(tagChip);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();

    // Clicking again toggles filter off
    fireEvent.click(tagChip);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
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
    const addedSelect = screen.getByText('Added').nextElementSibling as HTMLSelectElement;

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
    const newTagChip = screen.getByRole('button', { name: 'new' });
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
    const tagChip = screen.getByRole('button', { name: 'Fall 2025' });
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

  it('performs bulk delete when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

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
    const addedSelect = screen.getByText('Added').nextElementSibling as HTMLSelectElement;
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
});


