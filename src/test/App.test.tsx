import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { useAuth } from '../components/AuthProvider';

// Mock all views to keep tests isolated and fast
vi.mock('../views/Dashboard', () => ({ default: () => <div data-testid="dashboard-view">Dashboard View</div> }));
vi.mock('../views/MyDay', () => ({ default: () => <div data-testid="myday-view">MyDay View</div> }));
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

// Mock auth provider
const mockSignIn = vi.fn();
const mockLogOut = vi.fn();
const mockSignInWithEmail = vi.fn();

const mockAuthValue = {
  user: null as any,
  isApproved: false,
  loading: false,
  role: 'viewer' as any,
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

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthValue.user = null;
    mockAuthValue.isApproved = false;
    mockAuthValue.loading = false;
    mockAuthValue.role = 'viewer';
    window.location.hash = '';
    window.location.pathname = '/';
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
});
