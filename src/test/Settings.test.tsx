import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import Settings from '../views/Settings';
import { useAuth } from '../components/AuthProvider';
import React from 'react';

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const mockSetTheme = vi.fn();
vi.mock('../components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'system', setTheme: mockSetTheme }),
}));

vi.mock('./FeedbackList', () => ({
  default: () => {
    const { createElement } = require('react');
    return createElement('div', { 'data-testid': 'feedback-list' }, 'FeedbackList');
  },
}));

vi.mock('motion/react', () => {
  const { forwardRef, createElement, Fragment } = require('react');
  return {
    motion: {
      div: forwardRef(({ children, ...props }: any, ref: any) =>
        createElement('div', { ...props, ref }, children),
      ),
      button: forwardRef(({ children, ...props }: any, ref: any) =>
        createElement('button', { ...props, ref }, children),
      ),
    },
    AnimatePresence: ({ children }: any) => createElement(Fragment, null, children),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: any, path: string) => ({ path })),
  onSnapshot: vi.fn((_ref: any, callback: any) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  query: vi.fn((ref: any) => ref),
  orderBy: vi.fn(),
  doc: vi.fn((_db: any, coll: string, id: string) => ({ path: `${coll}/${id}`, id })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));

// ── Fixtures ───────────────────────────────────────────────────────────

const mockUsers = [
  {
    id: 'u1',
    data: () => ({
      uid: 'u1',
      email: 'alice@test.com',
      displayName: 'Alice Johnson',
      approved: true,
      role: 'operator',
      photoURL: null,
    }),
  },
  {
    id: 'u2',
    data: () => ({
      uid: 'u2',
      email: 'bob@test.com',
      displayName: 'Bob Smith',
      approved: false,
      role: 'viewer',
      photoURL: null,
    }),
  },
];

const mockInvitations = [
  {
    id: 'inv1',
    data: () => ({
      email: 'charlie@test.com',
      role: 'operator',
      approved: true,
      invitedBy: 'u-admin',
      createdAt: '2026-01-01',
    }),
  },
];

// ── Helpers ────────────────────────────────────────────────────────────

function setupManagerAuth(overrides: Record<string, any> = {}) {
  (useAuth as any).mockReturnValue({
    user: {
      uid: 'u-admin',
      displayName: 'Admin User',
      email: 'admin@test.com',
      photoURL: null,
    },
    isAdmin: true,
    isManager: true,
    role: 'admin',
    isApproved: true,
    ...overrides,
  });
}

function setupNonManagerAuth(overrides: Record<string, any> = {}) {
  (useAuth as any).mockReturnValue({
    user: {
      uid: 'u-viewer',
      displayName: 'Regular User',
      email: 'regular@test.com',
      photoURL: null,
    },
    isAdmin: false,
    isManager: false,
    role: 'operator',
    isApproved: true,
    ...overrides,
  });
}

function setupManagerSnapshot() {
  vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
    if (ref?.path === 'users') {
      callback({ docs: mockUsers });
    } else if (ref?.path === 'invitations') {
      callback({ docs: mockInvitations });
    } else {
      callback({ docs: [] });
    }
    return vi.fn();
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // Default: non-manager view
    setupNonManagerAuth();
    // Default: onSnapshot fires immediately with empty docs
    vi.mocked(onSnapshot).mockImplementation((_ref: any, callback: any) => {
      callback({ docs: [], size: 0 });
      return vi.fn();
    });
  });

  // ── 1. Loading state (manager) ──

  describe('loading state (manager)', () => {
    it('shows loading skeletons when onSnapshot has not fired', () => {
      setupManagerAuth();
      // Never call callback → stays loading forever
      vi.mocked(onSnapshot).mockImplementation(() => vi.fn());

      render(<Settings />);
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  // ── 2. Non-manager profile view ──

  describe('non-manager profile view', () => {
    it('renders h1, subtitle, approval badge, role label, and footer message', () => {
      setupNonManagerAuth({ role: 'operator', isApproved: true });

      render(<Settings />);

      expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
      expect(screen.getByText('Your account and preferences.')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getAllByText('Student')[0]).toBeInTheDocument();
      expect(screen.getByText('More account settings will arrive in time.')).toBeInTheDocument();
    });
  });

  // ── 3. Non-manager pending approval ──

  describe('non-manager pending approval', () => {
    it('shows "Pending approval" badge when isApproved is false', () => {
      setupNonManagerAuth({ isApproved: false });

      render(<Settings />);

      expect(screen.getByText('Pending approval')).toBeInTheDocument();
      expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    });
  });

  // ── 4. Manager view renders team section ──

  describe('manager view team section', () => {
    it('renders Your team, search input, Add someone button, and member names', async () => {
      setupManagerAuth();
      setupManagerSnapshot();

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('Your team')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('Find a teammate…')).toBeInTheDocument();
      expect(screen.getByText('Add someone')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });
      expect(screen.getByText('charlie@test.com')).toBeInTheDocument();
    });
  });

  // ── 5. Search filtering ──

  describe('search filtering', () => {
    it('filters team members by search query', async () => {
      setupManagerAuth();
      setupManagerSnapshot();

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Find a teammate…');
      fireEvent.change(searchInput, { target: { value: 'alice' } });

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
        expect(screen.queryByText('charlie@test.com')).not.toBeInTheDocument();
      });
    });

    it('shows empty state when no results match search', async () => {
      setupManagerAuth();
      setupManagerSnapshot();

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Find a teammate…');
      fireEvent.change(searchInput, { target: { value: 'zzznomatch' } });

      await waitFor(() => {
        expect(screen.getByText('No teammates or invites match your search.')).toBeInTheDocument();
      });
    });
  });

  // ── 6. Invite flow ──

  describe('invite flow', () => {
    it('opens invite modal, fills email, submits, and calls setDoc', async () => {
      setupManagerAuth();
      setupManagerSnapshot();

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('Add someone')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add someone'));

      await waitFor(() => {
        expect(screen.getByText('Add someone by email')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('their@email.com');
      fireEvent.change(emailInput, { target: { value: 'newuser@test.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(setDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: 'invitations/newuser@test.com' }),
          expect.objectContaining({
            email: 'newuser@test.com',
            role: 'operator',
            approved: true,
            invitedBy: 'u-admin',
          }),
        );
      });
    });
  });

  // ── 7. Toggle approval ──

  describe('toggle approval', () => {
    it('calls updateDoc when clicking Approve on a pending user', async () => {
      setupManagerAuth();
      setupManagerSnapshot();

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('1 person is asking to join')).toBeInTheDocument();
      });

      const approveButton = screen.getByRole('button', { name: /Approve/i });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: 'users/u2' }),
          expect.objectContaining({ approved: true, updatedAt: 'mock-timestamp' }),
        );
      });
    });
  });

  // ── 8. Appearance section ──

  describe('appearance section', () => {
    it('renders Light, Dark, System buttons and calls setTheme on click', () => {
      setupNonManagerAuth();

      render(<Settings />);

      expect(screen.getByText('Light')).toBeInTheDocument();
      expect(screen.getByText('Dark')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Light'));
      expect(mockSetTheme).toHaveBeenCalledWith('light');

      fireEvent.click(screen.getByText('Dark'));
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });
  });

  // ── 9. Roles reference cards ──

  describe('roles reference cards', () => {
    it('renders all 4 role cards: Full-timer, Trainee, Student, Community', () => {
      setupNonManagerAuth();

      render(<Settings />);

      expect(screen.getByText('FT')).toBeInTheDocument();
      expect(screen.getByText('TR')).toBeInTheDocument();
      expect(screen.getByText('ST')).toBeInTheDocument();
      expect(screen.getByText('CM')).toBeInTheDocument();

      // Check descriptions are present (partial)
      expect(screen.getByText(/Full-time staff/)).toBeInTheDocument();
      expect(screen.getByText(/Walks alongside the team/)).toBeInTheDocument();
      expect(screen.getByText(/Can add and update people/)).toBeInTheDocument();
      expect(screen.getByText(/A read-only window/)).toBeInTheDocument();
    });
  });

  // ── 10. Current role highlighted ──

  describe('current role highlighted', () => {
    it('shows "your role" badge on the admin card when role is admin', () => {
      setupNonManagerAuth({ role: 'admin' });

      render(<Settings />);

      expect(screen.getByText('your role')).toBeInTheDocument();
    });

    it('does not show "your role" badge on non-matching cards', () => {
      setupNonManagerAuth({ role: 'viewer' });

      render(<Settings />);

      // "your role" should appear exactly once (on Community card)
      const badges = screen.getAllByText('your role');
      expect(badges).toHaveLength(1);
    });
  });

  // ── 11. Additional P4 Unit Tests ──

  describe('User invitations validation and role management', () => {
    it('shows an alert when trying to invite an existing user email', async () => {
      setupManagerAuth();
      setupManagerSnapshot();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('Add someone')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add someone'));

      await waitFor(() => {
        expect(screen.getByText('Add someone by email')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('their@email.com');
      fireEvent.change(emailInput, { target: { value: 'alice@test.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('A user with this email already exists.');
      });
      alertSpy.mockRestore();
    });

    it('handles revoking/canceling invitation via revokeInvitation', async () => {
      setupManagerAuth();
      setupManagerSnapshot();

      const confirmSpy = vi.spyOn(window, 'confirm');
      
      // Cancel scenario
      confirmSpy.mockReturnValueOnce(false);
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('charlie@test.com')).toBeInTheDocument();
      });

      const cancelButtons = screen.getAllByRole('button', { name: /Cancel invite/i });
      fireEvent.click(cancelButtons[0]);

      expect(confirmSpy).toHaveBeenCalledWith('Cancel this invitation?');
      expect(deleteDoc).not.toHaveBeenCalled();

      // Confirm scenario
      confirmSpy.mockReturnValueOnce(true);
      fireEvent.click(cancelButtons[0]);
      expect(deleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'charlie@test.com' })
      );

      confirmSpy.mockRestore();
    });

    it('handles role updates through EditRoleModal', async () => {
      setupManagerAuth();
      setupManagerSnapshot();

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      // MemberCard options button
      const optionsButtons = screen.getAllByRole('button', { name: /Member options/i });
      // Alice is first approved member
      fireEvent.click(optionsButtons[0]);

      // Click "Edit role"
      const editRoleButton = screen.getByText('Edit role');
      fireEvent.click(editRoleButton);

      // Verify Modal rendered
      expect(screen.getByText('Edit role')).toBeInTheDocument();
      expect(screen.getByText('alice@test.com')).toBeInTheDocument();

      // Cancel modal
      const cancelModalButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelModalButton);
      expect(screen.queryByText('Edit role')).not.toBeInTheDocument();

      // Re-open and save
      fireEvent.click(optionsButtons[0]);
      fireEvent.click(screen.getByText('Edit role'));

      // Change role select
      const roleSelect = screen.getByRole('combobox');
      fireEvent.change(roleSelect, { target: { value: 'viewer' } });

      const saveButton = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: 'users/u1' }),
          expect.objectContaining({ role: 'viewer', updatedAt: 'mock-timestamp' })
        );
      });
    });

    it('handles removing access through RemoveConfirmModal', async () => {
      setupManagerAuth();
      setupManagerSnapshot();

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      // MemberCard options button
      const optionsButtons = screen.getAllByRole('button', { name: /Member options/i });
      fireEvent.click(optionsButtons[0]);

      // Click "Remove access"
      const removeAccessButton = screen.getByText('Remove access');
      fireEvent.click(removeAccessButton);

      // Verify Modal rendered
      expect(screen.getByText('Remove access?')).toBeInTheDocument();

      // Cancel remove
      const cancelRemoveButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelRemoveButton);
      expect(screen.queryByText('Remove access?')).not.toBeInTheDocument();

      // Re-open and confirm
      fireEvent.click(optionsButtons[0]);
      fireEvent.click(screen.getByText('Remove access'));

      const confirmRemoveButton = screen.getByRole('button', { name: 'Remove' });
      fireEvent.click(confirmRemoveButton);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: 'users/u1' }),
          expect.objectContaining({ approved: false, updatedAt: 'mock-timestamp' })
        );
      });
    });

    it('closes member options menu when clicking outside', async () => {
      setupManagerAuth();
      setupManagerSnapshot();

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const optionsButtons = screen.getAllByRole('button', { name: /Member options/i });
      fireEvent.click(optionsButtons[0]);

      // Verify menu is open
      expect(screen.getByText('Edit role')).toBeInTheDocument();

      // Mousedown on document outside ref
      fireEvent.mouseDown(document.body);

      // Verify menu is closed
      expect(screen.queryByText('Edit role')).not.toBeInTheDocument();
    });
  });

  describe('Quick Add / Integrations Section', () => {
    it('performs quick add with success response', async () => {
      setupManagerAuth();
      
      const mockFetchResponse = {
        success: true,
        contact: {
          name: 'Jane Smith',
          role: 'Student',
          location: 'Dorm C',
          stage: 'Interested',
          notes: 'Likes books'
        }
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          json: () => Promise.resolve(mockFetchResponse),
        } as Response)
      );

      render(<Settings />);

      const quickAddInput = screen.getByPlaceholderText(/e\.g\. Met John/i);
      fireEvent.change(quickAddInput, { target: { value: 'Met Jane Smith at Dorm C' } });

      const tryItButton = screen.getByRole('button', { name: /Try it/i });
      fireEvent.click(tryItButton);

      // Wait for success screen
      await waitFor(() => {
        expect(screen.getByText('Parsed into a contact')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('Dorm C')).toBeInTheDocument();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/quick-add',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            text: 'Met Jane Smith at Dorm C',
            userId: 'u-admin',
            userName: 'Admin User'
          })
        })
      );

      fetchSpy.mockRestore();
    });

    it('performs quick add with failure response', async () => {
      setupManagerAuth();

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          json: () => Promise.resolve({ success: false, error: 'AI processing failed' }),
        } as Response)
      );

      render(<Settings />);

      const quickAddInput = screen.getByPlaceholderText(/e\.g\. Met John/i);
      fireEvent.change(quickAddInput, { target: { value: 'Met Jane Smith at Dorm C' } });

      const tryItButton = screen.getByRole('button', { name: /Try it/i });
      fireEvent.click(tryItButton);

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText('AI processing failed')).toBeInTheDocument();
      });
      fetchSpy.mockRestore();
    });

    it('performs quick add with network exception', async () => {
      setupManagerAuth();

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.reject(new Error('Network offline'))
      );

      render(<Settings />);

      const quickAddInput = screen.getByPlaceholderText(/e\.g\. Met John/i);
      fireEvent.change(quickAddInput, { target: { value: 'Met Jane Smith at Dorm C' } });

      const tryItButton = screen.getByRole('button', { name: /Try it/i });
      fireEvent.click(tryItButton);

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText('Network offline')).toBeInTheDocument();
      });
      fetchSpy.mockRestore();
    });
  });

  describe('Webhook Logs Console', () => {
    const mockWebhookLogs = [
      {
        id: 'log1',
        data: () => ({
          source: 'GroupMe',
          status: 'success',
          result: 'Contact added: Jerry Doe',
          timestamp: '2026-06-17T12:00:00Z',
          payload: '{"text": "add contact Jerry"}',
          headers: '{"content-type": "application/json"}',
        }),
      },
      {
        id: 'log2',
        data: () => ({
          source: 'SMS',
          status: 'error',
          result: 'Parsing failed',
          timestamp: '2026-06-17T12:05:00Z',
          payload: 'invalid payload',
          headers: '{"content-type": "text/plain"}',
          error: 'Invalid format',
        }),
      },
    ];

    it('renders and manages logs', async () => {
      setupManagerAuth();

      // Hook up onSnapshot to return webhook logs when path is webhook_logs
      vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
        if (ref?.path === 'webhook_logs') {
          callback({ docs: mockWebhookLogs });
        } else if (ref?.path === 'users') {
          callback({ docs: mockUsers });
        } else if (ref?.path === 'invitations') {
          callback({ docs: mockInvitations });
        } else {
          callback({ docs: [] });
        }
        return vi.fn();
      });

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('API & webhook console')).toBeInTheDocument();
        expect(screen.getByText('Contact added: Jerry Doe')).toBeInTheDocument();
        expect(screen.getByText('Parsing failed')).toBeInTheDocument();
      });

      // Expand a success log
      fireEvent.click(screen.getByText('Contact added: Jerry Doe'));
      expect(screen.getByText('Raw payload (POST body)')).toBeInTheDocument();
      expect(screen.getByText('Request headers')).toBeInTheDocument();

      // Expand an error log
      fireEvent.click(screen.getByText('Parsing failed'));
      expect(screen.getByText('Failure detail')).toBeInTheDocument();
      expect(screen.getByText('Invalid format')).toBeInTheDocument();

      // Test clearing logs
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const clearButton = screen.getByRole('button', { name: /Clear/i });
      fireEvent.click(clearButton);

      expect(confirmSpy).toHaveBeenCalledWith('Clear all webhook debugging logs?');
      confirmSpy.mockRestore();
    });
  });
});
