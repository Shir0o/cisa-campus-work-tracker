import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import FeedbackFAB from '../components/FeedbackFAB';
import FeedbackList from '../views/FeedbackList';
import SubmitFeedback from '../views/SubmitFeedback';
import { useAuth } from '../components/AuthProvider';

// Mock dependencies
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'test-feedback-id' }),
  serverTimestamp: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((_, callback) => {
    callback({
      forEach: (snapCallback: any) => {
        snapCallback({
          id: 'test-f-1',
          data: () => ({
            userId: 'user-id-123',
            userEmail: 'user@campus.edu',
            userName: 'Test Undergrad',
            type: 'bug',
            message: 'Screen flickers on sidebar slide',
            status: 'new',
            createdAt: '2026-05-26T18:11:00Z',
          }),
        });
      },
    });
    return vi.fn();
  }),
  doc: vi.fn(),
  updateDoc: vi.fn().mockResolvedValue(true),
  deleteDoc: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { WRITE: 'WRITE', LIST: 'LIST' },
  logActivity: vi.fn(),
  sendNotification: vi.fn(),
}));

describe('User Feedback Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FeedbackFAB', () => {
    beforeEach(() => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'user-123', email: 'test@campus.edu', displayName: 'Jane Student' },
        role: 'operator',
        isAdmin: false,
      });
    });

    it('renders the feedback FAB button', () => {
      render(<FeedbackFAB />);
      const fabBtn = document.querySelector('#feedback-fab-btn');
      expect(fabBtn).toBeInTheDocument();
    });

    it('opens the warm panel on FAB click and can enter a note', async () => {
      const userAct = userEvent.setup();
      render(<FeedbackFAB />);

      const fabBtn = screen.getByTitle('Leave a note for the team');
      await userAct.click(fabBtn);

      // Verify the warm panel + kind pills are displayed
      expect(screen.getByText('Leave a note')).toBeInTheDocument();
      expect(screen.getByText('A thought')).toBeInTheDocument();
      expect(screen.getByText("Something's off")).toBeInTheDocument();

      // Enter the note
      const textarea = screen.getByRole('textbox', { name: /Your note/i });
      await userAct.type(textarea, 'Database connection is showing delay during sync');

      // Send it
      const sendBtn = screen.getByRole('button', { name: 'Send' });
      await userAct.click(sendBtn);

      // The in-panel success state appears
      await waitFor(() => {
        expect(screen.getByText('We got your note.')).toBeInTheDocument();
      });
    });
  });

  describe('FeedbackList (Admin View)', () => {
    it('blocks access to non-admin users', () => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'user-123', email: 'test@campus.edu', displayName: 'Jane' },
        isAdmin: false,
      });

      render(<FeedbackList />);
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.queryByText('All Items')).not.toBeInTheDocument();
    });

    it('registers submissions and permits access to administrators', async () => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'admin-123', email: 'admin@campus.edu', displayName: 'Admin Hub' },
        isAdmin: true,
      });

      render(<FeedbackList />);
      expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
      expect(screen.getByText('User Feedback')).toBeInTheDocument();
      expect(screen.getByText('All Items')).toBeInTheDocument();

      // Should display the mocked feedback item
      await waitFor(() => {
        expect(screen.getByText('Test Undergrad')).toBeInTheDocument();
        expect(screen.getByText('Screen flickers on sidebar slide')).toBeInTheDocument();
      });
    });
  });

  describe('SubmitFeedback (Dedicated Page Form)', () => {
    beforeEach(() => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'user-123', email: 'test@campus.edu', displayName: 'Jane Student' },
        role: 'operator',
        isAdmin: false,
      });
    });

    it('renders the dedicated feedback form elements', () => {
      render(<SubmitFeedback />);
      expect(screen.getByRole('heading', { name: 'Leave a note' })).toBeInTheDocument();
      expect(screen.getByText('A thought')).toBeInTheDocument();
      expect(screen.getByText('An idea')).toBeInTheDocument();
      expect(screen.getByText('A request')).toBeInTheDocument();
    });

    it('submits the form successfully and displays the confirmation screen', async () => {
      const userAct = userEvent.setup();
      render(<SubmitFeedback />);

      // Fill message
      const textarea = screen.getByRole('textbox', { name: /Tell us more/i });
      await userAct.type(textarea, 'This is a premium suggestion for Google Material Design');

      // Send it
      const sendBtn = screen.getByRole('button', { name: 'Send' });
      await userAct.click(sendBtn);

      // Verify the success text is displayed
      await waitFor(() => {
        expect(screen.getByText('We got your note.')).toBeInTheDocument();
      });
    });
  });
});
