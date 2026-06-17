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
});
