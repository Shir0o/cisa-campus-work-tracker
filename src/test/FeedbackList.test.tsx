import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import FeedbackList from '../views/FeedbackList';
import { useAuth } from '../components/AuthProvider';
import React from 'react';

// Mock dependencies
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
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
  deleteDoc: vi.fn(() => Promise.resolve()),
  doc: vi.fn((_db, path, id) => ({ path, id })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

const mockFeedback = [
  {
    id: 'f1',
    data: () => ({
      userName: 'Alice Johnson',
      userEmail: 'alice@example.com',
      message: 'Bug when clicking save',
      type: 'bug',
      kind: 'off',
      status: 'new',
      archived: false,
      createdAt: '2026-06-15T08:00:00.000Z',
    }),
  },
  {
    id: 'f2',
    data: () => ({
      userName: 'Bob Smith',
      userEmail: 'bob@example.com',
      message: 'Add dark mode support',
      type: 'enhancement',
      kind: 'request',
      status: 'completed',
      archived: false,
      createdAt: '2026-06-16T08:00:00.000Z',
    }),
  },
];

describe('FeedbackList View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  it('renders Access Denied when user is not admin', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-viewer', displayName: 'Viewer User', email: 'viewer@example.com' },
      isAdmin: false,
    });

    render(<FeedbackList />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('renders loading state initially by mocking onSnapshot delay', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com' },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());

    render(<FeedbackList />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders Feedback title and metrics dashboard', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com' },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      // Mock forEach on snapshot
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('User Feedback')).toBeInTheDocument();
      // Total feedback count = 2
      expect(screen.getAllByText('2')[0]).toBeInTheDocument();
      // Bugs count = 1
      expect(screen.getAllByText('1')[0]).toBeInTheDocument();
      // Alice's feedback message
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
      // Bob's feedback message
      expect(screen.getByText('Add dark mode support')).toBeInTheDocument();
    });
  });

  it('filters feedback items by search input', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com' },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search feedback/i);
    fireEvent.change(searchInput, { target: { value: 'dark mode' } });

    await waitFor(() => {
      expect(screen.queryByText('Bug when clicking save')).not.toBeInTheDocument();
      expect(screen.getByText('Add dark mode support')).toBeInTheDocument();
    });
  });

  // ── Status update via dropdown ─────────────────────────────────────

  it('updates feedback status via dropdown select', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u-admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
    });

    const selects = screen.getAllByLabelText('Update status');
    fireEvent.change(selects[0], { target: { value: 'resolved' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/feedback/update', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'f1', status: 'resolved' }),
      }));
    });
  });

  // ── Archive/restore toggle ─────────────────────────────────────────

  it('toggles archive status', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u-admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
    });

    const archiveButtons = screen.getAllByTitle('Archive Feedback');
    fireEvent.click(archiveButtons[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/feedback/update', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'f1', archived: true }),
      }));
    });
  });

  // ── Delete with confirm ────────────────────────────────────────────

  it('deletes feedback item after user confirmation', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u-admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTitle('Delete Feedback');
    fireEvent.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Are you sure you want to delete'));
    expect(deleteDoc).toHaveBeenCalled();

    // Test cancel delete
    confirmSpy.mockReturnValue(false);
    vi.mocked(deleteDoc).mockClear();
    fireEvent.click(deleteButtons[0]);
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  // ── GitHub issue creation ──────────────────────────────────────────

  it('creates GitHub issue and marks status to in_progress', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u-admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
    });

    const createIssueButtons = screen.getAllByTitle('Create prefilled GitHub Issue');
    fireEvent.click(createIssueButtons[0]);

    expect(openSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/feedback/update', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'f1', status: 'in_progress' }),
      }));
    });
  });

  it('includes screenshot image markdown in GitHub issue URL when screenshot exists', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u-admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      },
      isAdmin: true,
    });
    const mockFeedbackWithImg = [
      {
        id: 'f-img-create',
        data: () => ({
          userName: 'Dave',
          userEmail: 'dave@example.com',
          message: 'Screenshot issue',
          type: 'bug',
          kind: 'off',
          status: 'new',
          archived: false,
          screenshot: 'data:image/jpeg;base64,mock',
          createdAt: '2026-06-15T08:00:00.000Z',
        }),
      },
    ];
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedbackWithImg.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 1 });
      return vi.fn();
    });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Screenshot issue')).toBeInTheDocument();
    });

    const createBtn = screen.getByTitle('Create prefilled GitHub Issue');
    fireEvent.click(createBtn);

    expect(openSpy).toHaveBeenCalled();
    const openedUrl = openSpy.mock.calls[0][0] as string;
    const bodyParam = new URL(openedUrl).searchParams.get('body') || '';
    expect(bodyParam).toContain('![Feedback Screenshot](');
    expect(bodyParam).toContain('/api/feedback/f-img-create/screenshot)');
  });

  // ── Save/unlink GitHub link ────────────────────────────────────────

  it('links and unlinks GitHub issue URLs', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u-admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
    });

    // Link issue
    const linkButtons = screen.getAllByTitle('Link existing GitHub Issue');
    fireEvent.click(linkButtons[0]);

    const input = screen.getByPlaceholderText(/Paste issue URL or #number/i);
    fireEvent.change(input, { target: { value: 'https://github.com/Shir0o/cisa-campus-work-tracker/issues/123' } });
    
    const saveButton = screen.getByRole('button', { name: 'Link' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/feedback/update', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'f1', githubIssueUrl: 'https://github.com/Shir0o/cisa-campus-work-tracker/issues/123' }),
      }));
    });
  });

  // ── "Not auto-synced" indicator ─────────────────────────────────────

  it('shows a "Not auto-synced" label when an item has no GitHub issue linked', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com', getIdToken: vi.fn().mockResolvedValue('mock-token') },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: mockFeedback.length });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
    });

    // Neither mockFeedback item has a githubIssueUrl, so both rows show it.
    expect(screen.getAllByText('Not auto-synced')).toHaveLength(mockFeedback.length);
  });

  it('does not show "Not auto-synced" once an item has a linked GitHub issue', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com', getIdToken: vi.fn().mockResolvedValue('mock-token') },
      isAdmin: true,
    });

    const mockFeedbackWithIssue = [
      {
        id: 'f3',
        data: () => ({
          userName: 'Charlie',
          userEmail: 'charlie@example.com',
          message: 'GitHub link test message',
          type: 'bug',
          kind: 'off',
          status: 'new',
          archived: false,
          githubIssueUrl: 'https://github.com/Shir0o/cisa-campus-work-tracker/issues/789',
          createdAt: '2026-06-15T08:00:00.000Z',
        }),
      },
    ];
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedbackWithIssue.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 1 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('#789')).toBeInTheDocument();
    });

    expect(screen.queryByText('Not auto-synced')).not.toBeInTheDocument();
  });

  it('resolves issue shorthand number and handles Enter/Escape key down', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u-admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Bug when clicking save')).toBeInTheDocument();
    });

    // Click link icon to show input
    const linkButtons = screen.getAllByTitle('Link existing GitHub Issue');
    fireEvent.click(linkButtons[0]);

    const input = screen.getByPlaceholderText(/Paste issue URL or #number/i);
    
    // Test Escape key closes the linking UI
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByPlaceholderText(/Paste issue URL or #number/i)).not.toBeInTheDocument();

    // Open again
    fireEvent.click(linkButtons[0]);
    const input2 = screen.getByPlaceholderText(/Paste issue URL or #number/i);
    fireEvent.change(input2, { target: { value: '456' } });
    fireEvent.keyDown(input2, { key: 'Enter' });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/feedback/update', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'f1', githubIssueUrl: 'https://github.com/Shir0o/cisa-campus-work-tracker/issues/456' }),
      }));
    });
  });

  it('unlinks linked GitHub issue', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u-admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      },
      isAdmin: true,
    });
    
    const mockFeedbackWithIssue = [
      {
        id: 'f3',
        data: () => ({
          userName: 'Charlie',
          userEmail: 'charlie@example.com',
          message: 'GitHub link test message',
          type: 'bug',
          kind: 'off',
          status: 'new',
          archived: false,
          githubIssueUrl: 'https://github.com/Shir0o/cisa-campus-work-tracker/issues/789',
          createdAt: '2026-06-15T08:00:00.000Z',
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedbackWithIssue.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 1 });
      return vi.fn();
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('#789')).toBeInTheDocument();
    });

    const unlinkBtn = screen.getByTitle('Unlink GitHub Issue');
    fireEvent.click(unlinkBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/feedback/update', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'f3', githubIssueUrl: null }),
      }));
    });
  });

  // ── Kind/status/archive filters ────────────────────────────────────

  it('filters feedback items by tabs, status select, and archive select', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u-admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      },
      isAdmin: true,
    });

    const mockFeedbackFilters = [
      {
        id: 'f-bug',
        data: () => ({
          userName: 'Alice',
          userEmail: 'alice@example.com',
          message: 'Actual bug message',
          type: 'bug',
          kind: 'off',
          status: 'new',
          archived: false,
          createdAt: '2026-06-15T08:00:00.000Z',
        }),
      },
      {
        id: 'f-req',
        data: () => ({
          userName: 'Bob',
          userEmail: 'bob@example.com',
          message: 'Actual request message',
          type: 'enhancement',
          kind: 'request',
          status: 'resolved',
          archived: false,
          createdAt: '2026-06-16T08:00:00.000Z',
        }),
      },
      {
        id: 'f-arch',
        data: () => ({
          userName: 'Charlie',
          userEmail: 'charlie@example.com',
          message: 'Archived message',
          type: 'bug',
          kind: 'off',
          status: 'new',
          archived: true,
          createdAt: '2026-06-17T08:00:00.000Z',
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedbackFilters.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 3 });
      return vi.fn();
    });

    render(<FeedbackList />);

    // Initial state: Unresolved + Active only -> f-bug (new) visible; f-req (resolved) and f-arch (archived) hidden by default.
    await waitFor(() => {
      expect(screen.getByText('Actual bug message')).toBeInTheDocument();
      expect(screen.queryByText('Actual request message')).not.toBeInTheDocument();
      expect(screen.queryByText('Archived message')).not.toBeInTheDocument();
    });

    // Select "All Statuses" to show resolved items as well
    const statusSelect = screen.getAllByRole('combobox')[0]; // Statuses select
    fireEvent.change(statusSelect, { target: { value: 'all' } });
    await waitFor(() => {
      expect(screen.getByText('Actual bug message')).toBeInTheDocument();
      expect(screen.getByText('Actual request message')).toBeInTheDocument();
    });

    // Filter by kind tab: "Something's off"
    const bugTab = screen.getByRole('button', { name: /Something's off/i });
    fireEvent.click(bugTab);
    await waitFor(() => {
      expect(screen.getByText('Actual bug message')).toBeInTheDocument();
      expect(screen.queryByText('Actual request message')).not.toBeInTheDocument();
    });

    // Reset kind filter
    const allTab = screen.getByText(/All Items/i);
    fireEvent.click(allTab);
    await waitFor(() => {
      expect(screen.getByText('Actual bug message')).toBeInTheDocument();
      expect(screen.getByText('Actual request message')).toBeInTheDocument();
    });

    // Filter by Status dropdown: 'resolved'
    fireEvent.change(statusSelect, { target: { value: 'resolved' } });
    await waitFor(() => {
      expect(screen.queryByText('Actual bug message')).not.toBeInTheDocument();
      expect(screen.getByText('Actual request message')).toBeInTheDocument();
    });

    // Reset status filter back to 'all'
    fireEvent.change(statusSelect, { target: { value: 'all' } });
    await waitFor(() => {
      expect(screen.getByText('Actual bug message')).toBeInTheDocument();
      expect(screen.getByText('Actual request message')).toBeInTheDocument();
    });

    // Filter by Archive dropdown
    const archiveSelect = screen.getAllByRole('combobox')[1]; // Archive select
    fireEvent.change(archiveSelect, { target: { value: 'archived' } });
    await waitFor(() => {
      expect(screen.queryByText('Actual bug message')).not.toBeInTheDocument();
      expect(screen.queryByText('Actual request message')).not.toBeInTheDocument();
      expect(screen.getByText('Archived message')).toBeInTheDocument();
    });

    // Filter by All Feedback (including archived)
    fireEvent.change(archiveSelect, { target: { value: 'all' } });
    await waitFor(() => {
      expect(screen.getByText('Actual bug message')).toBeInTheDocument();
      expect(screen.getByText('Actual request message')).toBeInTheDocument();
      expect(screen.getByText('Archived message')).toBeInTheDocument();
    });
  });

  // ── isMe bypass ────────────────────────────────────────────────────

  it('allows access bypass for yilongwang05@gmail.com', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-is-me', displayName: 'Yilong Wang', email: 'yilongwang05@gmail.com' },
      isAdmin: false,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedback.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
      expect(screen.getByText('User Feedback')).toBeInTheDocument();
    });
  });

  // ── Empty filtered state ───────────────────────────────────────────

  it('renders "No feedback found" when filter returns empty list', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com' },
      isAdmin: true,
    });
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      callback({ forEach: () => {}, size: 0 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('No feedback found')).toBeInTheDocument();
    });
  });

  // ── Diagnostics + screenshot ───────────────────────────────────────

  it('renders diagnostics metadata and screenshot if available', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com' },
      isAdmin: true,
    });

    const mockFeedbackDiags = [
      {
        id: 'f-diag',
        data: () => ({
          userName: 'Alice',
          userEmail: 'alice@example.com',
          message: 'Diagnostic test message',
          type: 'bug',
          kind: 'off',
          status: 'new',
          archived: false,
          createdAt: '2026-06-15T08:00:00.000Z',
          url: 'https://test.com/path',
          viewport: '1920x1080',
          userAgent: 'Chrome/120.0.0.0',
          screenshot: 'data:image/png;base64,mock-screenshot',
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedbackDiags.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 1 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Diagnostic test message')).toBeInTheDocument();
      expect(screen.getByText('URL:')).toBeInTheDocument();
      expect(screen.getByText('https://test.com/path')).toBeInTheDocument();
      expect(screen.getByText(/1920x1080/)).toBeInTheDocument();
      expect(screen.getByText(/Chrome\/120.0.0.0/)).toBeInTheDocument();
      expect(screen.getByText('View Screenshot')).toBeInTheDocument();
    });

    // Click screenshot to open lightbox modal
    const screenshotImg = screen.getByAltText('Captured Screenshot');
    fireEvent.click(screenshotImg);

    expect(await screen.findByAltText('Enlarged Screenshot')).toBeInTheDocument();

    // Click close button
    const closeBtn = screen.getByRole('button', { name: 'Close enlarged screenshot' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByAltText('Enlarged Screenshot')).not.toBeInTheDocument();
    });

    // Test Esc key to close enlarged image
    fireEvent.click(screenshotImg);
    expect(await screen.findByAltText('Enlarged Screenshot')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByAltText('Enlarged Screenshot')).not.toBeInTheDocument();
    });
  });

  it('filters items by new, in_progress, and unresolved statuses', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com' },
      isAdmin: true,
    });

    const mockItems = [
      {
        id: 'f1',
        data: () => ({
          userName: 'User 1',
          userEmail: 'u1@example.com',
          message: 'New item message',
          type: 'bug',
          kind: 'off',
          status: 'new',
          archived: false,
          createdAt: '2026-06-15T08:00:00.000Z',
        }),
      },
      {
        id: 'f2',
        data: () => ({
          userName: 'User 2',
          userEmail: 'u2@example.com',
          message: 'In progress item message',
          type: 'enhancement',
          kind: 'request',
          status: 'in_progress',
          archived: false,
          createdAt: '2026-06-16T08:00:00.000Z',
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockItems.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 2 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('New item message')).toBeInTheDocument();
      expect(screen.getByText('In progress item message')).toBeInTheDocument();
    });

    const statusSelect = screen.getAllByRole('combobox')[0];

    fireEvent.change(statusSelect, { target: { value: 'new' } });
    await waitFor(() => {
      expect(screen.getByText('New item message')).toBeInTheDocument();
      expect(screen.queryByText('In progress item message')).not.toBeInTheDocument();
    });

    fireEvent.change(statusSelect, { target: { value: 'in_progress' } });
    await waitFor(() => {
      expect(screen.queryByText('New item message')).not.toBeInTheDocument();
      expect(screen.getByText('In progress item message')).toBeInTheDocument();
    });
  });

  // ── getFormattedDate fallback ──────────────────────────────────────

  it('renders fallback raw string for invalid date formats', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'u-admin', displayName: 'Admin User', email: 'admin@example.com' },
      isAdmin: true,
    });

    const mockFeedbackInvalidDate = [
      {
        id: 'f-invalid-date',
        data: () => ({
          userName: 'Alice',
          userEmail: 'alice@example.com',
          message: 'Invalid date message',
          type: 'bug',
          kind: 'off',
          status: 'new',
          archived: false,
          createdAt: 'not-a-valid-date-string',
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      const forEach = (cb: any) => {
        mockFeedbackInvalidDate.forEach(docSnap => cb(docSnap));
      };
      callback({ forEach, size: 1 });
      return vi.fn();
    });

    render(<FeedbackList />);

    await waitFor(() => {
      expect(screen.getByText('Invalid Date')).toBeInTheDocument();
    });
  });
});

