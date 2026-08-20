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
  doc: vi.fn().mockImplementation((_db, _coll, id) => ({ id })),
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
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, id: 'test-feedback-id' }),
    });
  });

  describe('FeedbackFAB', () => {
    beforeEach(() => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'user-123', email: 'test@campus.edu', displayName: 'Jane Student', getIdToken: vi.fn().mockResolvedValue('mock-id-token') },
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

    it('returns null when user is not authenticated', () => {
      (useAuth as any).mockReturnValue({
        user: null,
        role: null,
        isAdmin: false,
      });
      const { container } = render(<FeedbackFAB />);
      expect(container.innerHTML).toBe('');
    });

    it('Send button is disabled when message is empty', async () => {
      const userAct = userEvent.setup();
      render(<FeedbackFAB />);
      await userAct.click(screen.getByTitle('Leave a note for the team'));

      const sendBtn = screen.getByRole('button', { name: 'Send' });
      expect(sendBtn).toBeDisabled();
    });

    it('toggles aria-expanded attribute when FAB is clicked', async () => {
      const userAct = userEvent.setup();
      render(<FeedbackFAB />);

      const fabBtn = screen.getByTitle('Leave a note for the team');
      expect(fabBtn).toHaveAttribute('aria-expanded', 'false');

      await userAct.click(fabBtn);
      // After opening, the button label changes
      const closeBtn = screen.getByTitle('Close');
      expect(closeBtn).toHaveAttribute('aria-expanded', 'true');
    });

    it('displays loading indication and keeps fab button visible while submitting', async () => {
      let resolveFetch: (val: any) => void = () => {};
      (global.fetch as any).mockImplementationOnce(
        () => new Promise((resolve) => { resolveFetch = resolve; })
      );

      const userAct = userEvent.setup();
      render(<FeedbackFAB />);

      const fabBtn = document.querySelector('#feedback-fab-btn') as HTMLElement;
      expect(fabBtn).toBeInTheDocument();

      await userAct.click(screen.getByTitle('Leave a note for the team'));
      const textarea = screen.getByRole('textbox', { name: /Your note/i });
      await userAct.type(textarea, 'Testing loading indication');

      const sendBtn = screen.getByRole('button', { name: 'Send' });
      await userAct.click(sendBtn);

      // FAB button remains visible (not hidden via inline style)
      expect(fabBtn.style.visibility).not.toBe('hidden');

      // Loading state visible
      expect(screen.getByText('Sending…')).toBeInTheDocument();

      // Resolve API call
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await waitFor(() => {
        expect(screen.getByText('We got your note.')).toBeInTheDocument();
      });
    });

    it('keeps panel in idle phase when API returns error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const userAct = userEvent.setup();
      render(<FeedbackFAB />);

      await userAct.click(screen.getByTitle('Leave a note for the team'));
      const textarea = screen.getByRole('textbox', { name: /Your note/i });
      await userAct.type(textarea, 'This will fail');
      await userAct.click(screen.getByRole('button', { name: 'Send' }));

      // Should NOT show success — should stay on form
      await waitFor(() => {
        expect(screen.queryByText('We got your note.')).not.toBeInTheDocument();
        // Send button should be enabled again (phase reset to idle)
        expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
      });
    });

    it('closes panel when scrim is clicked', async () => {
      const userAct = userEvent.setup();
      render(<FeedbackFAB />);

      await userAct.click(screen.getByTitle('Leave a note for the team'));
      expect(screen.getByText('Leave a note')).toBeInTheDocument();

      // Click the scrim (the overlay div with aria-hidden)
      const scrim = document.querySelector('[aria-hidden="true"]');
      expect(scrim).not.toBeNull();
      await userAct.click(scrim!);

      // Panel should close — FAB title goes back to "Leave a note for the team"
      await waitFor(() => {
        expect(screen.getByTitle('Leave a note for the team')).toBeInTheDocument();
      });
    });

    it('downscales an oversized screenshot before sending', async () => {
      const html2canvas = vi.mocked((await import('html2canvas-pro')).default);
      html2canvas.mockResolvedValueOnce({
        width: 2000,
        height: 2000,
        toDataURL: () => 'data:image/jpeg;base64,' + 'a'.repeat(400),
      } as any);
      const drawImage = vi.fn();
      const realCreateElement = document.createElement.bind(document);
      (document.createElement as any) = vi.fn((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage }),
            toDataURL: () => 'data:image/jpeg;base64,resized',
          };
        }
        return realCreateElement(tag);
      });

      const userAct = userEvent.setup();
      render(<FeedbackFAB />);
      await userAct.click(screen.getByTitle('Leave a note for the team'));
      await userAct.type(screen.getByRole('textbox', { name: /Your note/i }), 'resize me');
      await userAct.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/feedback',
          expect.objectContaining({ body: expect.stringContaining('resized') }),
        );
      });
      expect(drawImage).toHaveBeenCalled();
      document.createElement = realCreateElement;
    });

    it('continues without a screenshot when capture fails', async () => {
      const html2canvas = vi.mocked((await import('html2canvas-pro')).default);
      html2canvas.mockRejectedValueOnce(new Error('canvas blocked'));

      const userAct = userEvent.setup();
      render(<FeedbackFAB />);
      await userAct.click(screen.getByTitle('Leave a note for the team'));
      await userAct.type(screen.getByRole('textbox', { name: /Your note/i }), 'no screenshot');
      await userAct.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/feedback',
          expect.objectContaining({ body: expect.stringContaining('"screenshot":""') }),
        );
      });
    });

    it('still submits when the ID token cannot be acquired', async () => {
      (useAuth as any).mockReturnValue({
        user: {
          uid: 'user-123',
          email: 'test@campus.edu',
          displayName: 'Jane Student',
          getIdToken: vi.fn().mockRejectedValue(new Error('token denied')),
        },
        role: 'operator',
        isAdmin: false,
      });
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const userAct = userEvent.setup();
      render(<FeedbackFAB />);
      await userAct.click(screen.getByTitle('Leave a note for the team'));
      await userAct.type(screen.getByRole('textbox', { name: /Your note/i }), 'no token');
      await userAct.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => {
        expect(screen.getByText('We got your note.')).toBeInTheDocument();
      });
      expect(errSpy).toHaveBeenCalledWith('Failed to get Firebase ID token:', expect.any(Error));
      errSpy.mockRestore();
    });

    it('shows success even when the follow-up activity log fails', async () => {
      const { logActivity } = await import('../lib/firebase');
      (logActivity as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('log denied'));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const userAct = userEvent.setup();
      render(<FeedbackFAB />);
      await userAct.click(screen.getByTitle('Leave a note for the team'));
      await userAct.type(screen.getByRole('textbox', { name: /Your note/i }), 'log fails');
      await userAct.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => {
        expect(screen.getByText('We got your note.')).toBeInTheDocument();
      });
      expect(errSpy).toHaveBeenCalledWith('Feedback saved, but follow-up log failed:', expect.any(Error));
      errSpy.mockRestore();
    });

    it('lets the user send another note from the success state', async () => {
      const userAct = userEvent.setup();
      render(<FeedbackFAB />);

      await userAct.click(screen.getByTitle('Leave a note for the team'));
      await userAct.type(screen.getByRole('textbox', { name: /Your note/i }), 'first note');
      await userAct.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => {
        expect(screen.getByText('We got your note.')).toBeInTheDocument();
      });

      await userAct.click(screen.getByRole('button', { name: 'Send another' }));

      // The panel stays open and the form is ready for a second note.
      expect(screen.getByText('Leave a note')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /Your note/i })).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });
  });

  describe('FeedbackList (Admin View)', () => {
    it('blocks access to non-admin users', () => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'user-123', email: 'test@campus.edu', displayName: 'Jane', getIdToken: vi.fn().mockResolvedValue('mock-id-token') },
        isAdmin: false,
      });

      render(<FeedbackList />);
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.queryByText('All Items')).not.toBeInTheDocument();
    });

    it('registers submissions and permits access to administrators', async () => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'admin-123', email: 'admin@campus.edu', displayName: 'Admin Hub', getIdToken: vi.fn().mockResolvedValue('mock-id-token') },
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

    it('displays "Create Issue" and "Link" buttons when no githubIssueUrl is present', async () => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'admin-123', email: 'admin@campus.edu', displayName: 'Admin Hub', getIdToken: vi.fn().mockResolvedValue('mock-id-token') },
        isAdmin: true,
      });

      render(<FeedbackList />);

      await waitFor(() => {
        expect(screen.getByTitle('Create prefilled GitHub Issue')).toBeInTheDocument();
        expect(screen.getByTitle('Link existing GitHub Issue')).toBeInTheDocument();
      });
    });
    it('clicking "Create Issue" opens window and updates status', async () => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'admin-123', email: 'admin@campus.edu', displayName: 'Admin Hub', getIdToken: vi.fn().mockResolvedValue('mock-id-token') },
        isAdmin: true,
      });

      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => ({}) as any);

      const userAct = userEvent.setup();
      render(<FeedbackList />);

      await waitFor(async () => {
        const createBtn = screen.getByTitle('Create prefilled GitHub Issue');
        await userAct.click(createBtn);
      });

      expect(windowOpenSpy).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/feedback/update',
        expect.objectContaining({
          body: JSON.stringify({ id: 'test-f-1', status: 'in_progress' })
        })
      );
      
      windowOpenSpy.mockRestore();
    });

    it('clicking "Link" opens inline input and saves the link', async () => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'admin-123', email: 'admin@campus.edu', displayName: 'Admin Hub', getIdToken: vi.fn().mockResolvedValue('mock-id-token') },
        isAdmin: true,
      });

      const userAct = userEvent.setup();
      render(<FeedbackList />);

      await waitFor(async () => {
        const linkBtn = screen.getByTitle('Link existing GitHub Issue');
        await userAct.click(linkBtn);
      });

      const input = screen.getByPlaceholderText('Paste issue URL or #number...');
      expect(input).toBeInTheDocument();

      await userAct.type(input, '105{enter}');

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/feedback/update',
          expect.objectContaining({
            body: JSON.stringify({
              id: 'test-f-1',
              githubIssueUrl: 'https://github.com/Shir0o/cisa-campus-work-traker/issues/105'
            })
          })
        );
      });
    });
    it('displays linked issue with issue number when githubIssueUrl is present', async () => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'admin-123', email: 'admin@campus.edu', displayName: 'Admin Hub', getIdToken: vi.fn().mockResolvedValue('mock-id-token') },
        isAdmin: true,
      });

      const { onSnapshot } = await import('firebase/firestore');
      (onSnapshot as any).mockImplementationOnce((_, callback: any) => {
        callback({
          forEach: (snapCallback: any) => {
            snapCallback({
              id: 'test-f-2',
              data: () => ({
                userId: 'user-id-123',
                userEmail: 'user@campus.edu',
                userName: 'Test Undergrad',
                type: 'bug',
                message: 'Screen flickers on sidebar slide',
                status: 'in_progress',
                createdAt: '2026-05-26T18:11:00Z',
                githubIssueUrl: 'https://github.com/Shir0o/cisa-campus-work-traker/issues/42',
              }),
            });
          },
        });
        return vi.fn();
      });

      render(<FeedbackList />);

      await waitFor(() => {
        expect(screen.getByText('#42')).toBeInTheDocument();
        expect(screen.getByTitle('View GitHub Issue')).toBeInTheDocument();
        expect(screen.getByTitle('Edit GitHub Link')).toBeInTheDocument();
        expect(screen.getByTitle('Unlink GitHub Issue')).toBeInTheDocument();
      });
    });
  });

  describe('SubmitFeedback (Dedicated Page Form)', () => {
    beforeEach(() => {
      (useAuth as any).mockReturnValue({
        user: { uid: 'user-123', email: 'test@campus.edu', displayName: 'Jane Student', getIdToken: vi.fn().mockResolvedValue('mock-id-token') },
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
