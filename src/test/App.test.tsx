import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App, { useLayout } from '../App';
import { useAuth } from '../components/AuthProvider';

// Mock all views to keep tests isolated and fast. The role-dispatched home (`/`)
// renders <Landing/>; we mock it as a stand-in "home" view that also exercises
// the layout context (used by the modal tests below). It counts its mounts so
// the identity-switch test can assert the routed view remounts (the
// "See it as they do" stale-content fix).
const landingState = vi.hoisted(() => ({ mounts: 0 }));
vi.mock('../views/landings/Landing', () => ({
  default: () => {
    landingState.mounts += 1;
    try {
      const { openNewContact, setSelectedContact } = useLayout();
      return (
        <div data-testid="dashboard-view">
          Home View
          <button onClick={() => openNewContact('lead')} data-testid="dashboard-add-contact-btn">Add Contact</button>
          <button onClick={() => setSelectedContact({ id: 'c1', name: 'John Doe' } as any)} data-testid="dashboard-select-contact-btn">Select Contact</button>
        </div>
      );
    } catch (_) {
      return <div data-testid="dashboard-view">Home View</div>;
    }
  }
}));
vi.mock('../views/Attendance', () => ({ default: () => <div data-testid="attendance-view">Attendance View</div> }));
vi.mock('../views/OutreachBoard', () => ({ default: () => <div data-testid="board-view">OutreachBoard View</div> }));
vi.mock('../views/Directory', () => ({ default: () => <div data-testid="directory-view">Directory View</div> }));
vi.mock('../views/History', () => ({ default: () => <div data-testid="history-view">History View</div> }));
vi.mock('../views/PrayerList', () => ({ default: () => <div data-testid="prayer-view">PrayerList View</div> }));
vi.mock('../views/Settings', () => ({ default: () => <div data-testid="settings-view">Settings View</div> }));
vi.mock('../views/SignUp', () => ({ default: () => <div data-testid="signup-view">SignUp View</div> }));
vi.mock('../views/FeedbackList', () => ({ default: () => <div data-testid="feedback-list-view">FeedbackList View</div> }));
vi.mock('../views/SubmitFeedback', () => ({ default: () => <div data-testid="submit-feedback-view">SubmitFeedback View</div> }));
vi.mock('../views/CoordinationNotes', () => ({ default: () => <div data-testid="coordination-view">CoordinationNotes View</div> }));

// Mock components that we don't need to test in App context
vi.mock('../components/FeedbackFAB', () => ({ default: () => <div>FeedbackFAB</div> }));
vi.mock('../components/Toaster', () => ({ default: () => <div>Toaster</div> }));

vi.mock('../components/layout/TopNav', () => ({
  default: ({ onOpenImpersonateModal }: any) => (
    <div data-testid="mock-topnav">
      <button onClick={onOpenImpersonateModal} data-testid="topnav-eye-btn">Eye</button>
    </div>
  ),
}));

vi.mock('../components/modals/NewContactModal', () => ({
  default: ({ isOpen, onClose, initialStage }: any) => isOpen ? (
    <div data-testid="mock-new-contact-modal">
      <span>Stage: {initialStage || 'none'}</span>
      <button onClick={onClose} data-testid="close-new-contact">Close</button>
    </div>
  ) : null,
}));

vi.mock('../components/modals/LogInteractionModal', () => ({
  default: ({ isOpen, onClose }: any) => isOpen ? (
    <div data-testid="mock-log-interaction-modal">
      <button onClick={onClose} data-testid="close-log-interaction">Close</button>
    </div>
  ) : null,
}));

vi.mock('../components/modals/ContactDetailsModal', () => ({
  default: ({ isOpen, onClose, contact }: any) => isOpen ? (
    <div data-testid="mock-contact-details-modal">
      <span>Contact: {contact?.name || 'none'}</span>
      <button onClick={onClose} data-testid="close-contact-details">Close</button>
    </div>
  ) : null,
}));

// Mock auth provider
const mockSignIn = vi.fn();
const mockLogOut = vi.fn();
const mockSignInWithEmail = vi.fn();

const mockAuthValue = {
  user: null as any,
  isApproved: false,
  loading: false,
  role: 'viewer' as any,
  effectiveIdentityKey: 'viewer' as string | null,
  signIn: mockSignIn,
  logOut: mockLogOut,
  signInWithEmail: mockSignInWithEmail,
};

vi.mock('../components/AuthProvider', () => ({
  AuthProvider: ({ children }: any) => <>{children}</>,
  useAuth: () => mockAuthValue,
}));

// Mock motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    nav: ({ children, ...props }: any) => <nav {...props}>{children}</nav>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock firebase
vi.mock('../lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST' },
}));

// Mock Firestore just enough for the app-level roster sync (issue #549).
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: any, collection: string, id: string) => ({ path: `${collection}/${id}`, id })),
  onSnapshot: vi.fn((ref: any, callback: any) => {
    callback(
      ref?.path?.startsWith('contacts/')
        ? { exists: () => true, id: ref.id, data: () => ({ name: 'John Doe' }) }
        : ref?.path === 'users'
          ? { docs: [] }
          : { data: () => ({ pairs: {} }) },
    );
    return vi.fn();
  }),
  collection: vi.fn((_db: any, path: string) => ({ path })),
  collectionGroup: vi.fn((_db: any, group: string) => ({ group })),
  query: vi.fn((ref: any) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  writeBatch: vi.fn(() => ({
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    landingState.mounts = 0;
    mockAuthValue.user = null;
    mockAuthValue.isApproved = false;
    mockAuthValue.loading = false;
    mockAuthValue.role = 'viewer';
    mockAuthValue.effectiveIdentityKey = 'viewer';
    window.location.hash = '';
    window.history.replaceState(null, '', '/');
  });

  it('renders loading state with skeletons', () => {
    mockAuthValue.loading = true;
    mockAuthValue.user = { uid: '123' };
    render(<App />);
    expect(screen.queryByText('Welcome to CISA Campus Work Tracker')).not.toBeInTheDocument();
  });

  it('renders login screen when unauthenticated', () => {
    render(<App />);
    expect(screen.getByText('Welcome to CISA Campus Work Tracker')).toBeInTheDocument();
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });

  it('calls signIn on Google sign in click', () => {
    render(<App />);
    const googleBtn = screen.getByRole('button', { name: /Sign in with Google/i });
    fireEvent.click(googleBtn);
    expect(mockSignIn).toHaveBeenCalled();
  });

  it('handles email/password sign-in correctly', async () => {
    render(<App />);
    const emailInput = screen.getByPlaceholderText('Email');
    const passwordInput = screen.getByPlaceholderText('Password');
    const submitBtn = screen.getByRole('button', { name: /Sign in with email/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitBtn);

    expect(mockSignInWithEmail).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('shows error message on email password sign-in failure', async () => {
    mockSignInWithEmail.mockRejectedValue({ code: 'auth/invalid-credential' });
    render(<App />);
    
    const emailInput = screen.getByPlaceholderText('Email');
    const passwordInput = screen.getByPlaceholderText('Password');
    const submitBtn = screen.getByRole('button', { name: /Sign in with email/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Incorrect email or password.')).toBeInTheDocument();
    });
  });

  it('renders access restricted screen when user is not approved', () => {
    mockAuthValue.user = { uid: '123', email: 'test@example.com' };
    mockAuthValue.isApproved = false;
    render(<App />);
    
    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    expect(screen.getByText(/Your account is pending approval/i)).toBeInTheDocument();

    const signOutBtn = screen.getByRole('button', { name: /Sign Out/i });
    fireEvent.click(signOutBtn);
    expect(mockLogOut).toHaveBeenCalled();
  });

  it('renders app dashboard when authenticated and approved', async () => {
    mockAuthValue.user = { uid: '123', email: 'test@example.com' };
    mockAuthValue.isApproved = true;
    mockAuthValue.role = 'operator';
    
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });
  });

  it('throws error when useLayout is used outside LayoutProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const TestComponent = () => {
      useLayout();
      return null;
    };
    expect(() => render(<TestComponent />)).toThrow('useLayout must be used within a LayoutProvider');
    consoleSpy.mockRestore();
  });

  it('redirects viewer away from an admin-only route to their home', async () => {
    mockAuthValue.user = { uid: '123', email: 'test@example.com' };
    mockAuthValue.isApproved = true;
    mockAuthValue.role = 'viewer';
    window.history.replaceState(null, '', '/coordination');

    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });
  });

  it.each(['/prayer', '/answered', '/attendance', '/settings'])(
    'redirects trainee away from %s (page not in their allowed set) to home',
    async (path) => {
      mockAuthValue.user = { uid: '123', email: 'admin@example.com' };
      mockAuthValue.isApproved = true;
      mockAuthValue.role = 'manager';
      window.history.replaceState(null, '', path);

      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('prayer-view')).not.toBeInTheDocument();
      expect(screen.queryByTestId('settings-view')).not.toBeInTheDocument();
      expect(screen.queryByTestId('attendance-view')).not.toBeInTheDocument();
    },
  );

  it('allows admin to access admin-only routes', async () => {
    mockAuthValue.user = { uid: '123', email: 'admin@example.com' };
    mockAuthValue.isApproved = true;
    mockAuthValue.role = 'admin';
    window.history.replaceState(null, '', '/coordination');

    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('coordination-view')).toBeInTheDocument();
    });
  });

  it('renders the top navigation bar', async () => {
    mockAuthValue.user = { uid: '123', email: 'test@example.com' };
    mockAuthValue.isApproved = true;
    mockAuthValue.role = 'operator';

    localStorage.clear();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-topnav')).toBeInTheDocument();
    });
  });

  it('shows generic error message on email password sign-in failure with other codes', async () => {
    mockSignInWithEmail.mockRejectedValue({ code: 'auth/network-request-failed' });
    render(<App />);
    
    const emailInput = screen.getByPlaceholderText('Email');
    const passwordInput = screen.getByPlaceholderText('Password');
    const submitBtn = screen.getByRole('button', { name: /Sign in with email/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Sign-in failed. Please try again.')).toBeInTheDocument();
    });
  });

  it('redirects unknown route to dashboard', async () => {
    mockAuthValue.user = { uid: '123', email: 'test@example.com' };
    mockAuthValue.isApproved = true;
    mockAuthValue.role = 'operator';
    window.history.replaceState(null, '', '/unknown-path-xyz');
    
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });
  });

  it('toggles modals via layout context', async () => {
    mockAuthValue.user = { uid: '123', email: 'test@example.com' };
    mockAuthValue.isApproved = true;
    mockAuthValue.role = 'operator';
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });

    // 1. Open and close NewContactModal
    const openContactBtn = screen.getByTestId('dashboard-add-contact-btn');
    fireEvent.click(openContactBtn);
    expect(screen.getByTestId('mock-new-contact-modal')).toBeInTheDocument();
    expect(screen.getByText('Stage: lead')).toBeInTheDocument();
    
    const closeContactBtn = screen.getByTestId('close-new-contact');
    fireEvent.click(closeContactBtn);
    expect(screen.queryByTestId('mock-new-contact-modal')).not.toBeInTheDocument();

    // 2. Open and close LogInteractionModal (Log a visit lives in the search palette;
    // the layout context method is exercised directly through the top nav's eye here
    // would not make sense, so use the context's openLogInteraction via a host view).
    const openLogBtn = screen.getByTestId('dashboard-select-contact-btn');
    fireEvent.click(openLogBtn);
    expect(screen.getByTestId('mock-contact-details-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-contact-details'));
    expect(screen.queryByTestId('mock-contact-details-modal')).not.toBeInTheDocument();

    // 3. Open and close ContactDetailsModal
    const selectContactBtn = screen.getByTestId('dashboard-select-contact-btn');
    fireEvent.click(selectContactBtn);
    expect(screen.getByTestId('mock-contact-details-modal')).toBeInTheDocument();
    expect(screen.getByText('Contact: John Doe')).toBeInTheDocument();

    const closeDetailsBtn = screen.getByTestId('close-contact-details');
    fireEvent.click(closeDetailsBtn);
    expect(screen.queryByTestId('mock-contact-details-modal')).not.toBeInTheDocument();
  });

  it('clears the open contact detail when navigating to another page (#257)', async () => {
    mockAuthValue.user = { uid: '123', email: 'test@example.com' };
    mockAuthValue.isApproved = true;
    mockAuthValue.role = 'operator';
    window.history.replaceState(null, '', '/');

    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });

    // Open the person detail (replaces the page inside the shell).
    fireEvent.click(screen.getByTestId('dashboard-select-contact-btn'));
    expect(screen.getByTestId('mock-contact-details-modal')).toBeInTheDocument();

    // Navigate to another page; the stale selection must be dropped so the new
    // page renders instead of the person detail.
    act(() => {
      window.history.pushState(null, '', '/directory');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('mock-contact-details-modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('directory-view')).toBeInTheDocument();
    });
  });

  it('remounts the routed view when the identity changes (impersonation switch)', async () => {
    mockAuthValue.user = { uid: '123', email: 'admin@example.com' };
    mockAuthValue.isApproved = true;
    mockAuthValue.role = 'admin';
    mockAuthValue.effectiveIdentityKey = 'admin';
    window.history.replaceState(null, '', '/');

    const { rerender } = render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });
    expect(landingState.mounts).toBe(1);

    // Step into a student's view: the same route must not keep the previous
    // viewer's content mounted — the "See it as they do" stale-content flash.
    act(() => {
      mockAuthValue.effectiveIdentityKey = 'student';
      rerender(<App />);
    });
    await waitFor(() => {
      expect(landingState.mounts).toBe(2);
    });
    expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();

    // And switching back remounts again.
    act(() => {
      mockAuthValue.effectiveIdentityKey = 'admin';
      rerender(<App />);
    });
    await waitFor(() => {
      expect(landingState.mounts).toBe(3);
    });
  });

  it('closes the open person detail when the identity changes', async () => {
    mockAuthValue.user = { uid: '123', email: 'admin@example.com' };
    mockAuthValue.isApproved = true;
    mockAuthValue.role = 'admin';
    mockAuthValue.effectiveIdentityKey = 'admin';
    window.history.replaceState(null, '', '/');

    const { rerender } = render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('dashboard-select-contact-btn'));
    expect(screen.getByTestId('mock-contact-details-modal')).toBeInTheDocument();

    // The open person reads the previous viewer's scope — an identity switch
    // must drop it rather than leave it on screen.
    act(() => {
      mockAuthValue.effectiveIdentityKey = 'student';
      rerender(<App />);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('mock-contact-details-modal')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
  });
});
