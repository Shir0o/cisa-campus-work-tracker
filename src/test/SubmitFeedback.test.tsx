import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SubmitFeedback from '../views/SubmitFeedback';
import { useAuth } from '../components/AuthProvider';

const mockNavigate = vi.fn();

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'new-id' }),
  serverTimestamp: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { WRITE: 'WRITE' },
  logActivity: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: React.forwardRef(({ children, initial, animate, exit, transition, ...props }: any, ref: any) => (
      <div ref={ref} {...props}>{children}</div>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('SubmitFeedback (Dedicated Page Form)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, id: 'fb-id' }),
    });
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u1',
        email: 'jane@test.com',
        displayName: 'Jane Student',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      },
      role: 'operator',
    });
  });

  it('renders the form heading and kind buttons', () => {
    render(<SubmitFeedback />);
    expect(screen.getByRole('heading', { name: 'Leave a note' })).toBeInTheDocument();
    expect(screen.getByText('A thought')).toBeInTheDocument();
    expect(screen.getByText('An idea')).toBeInTheDocument();
    expect(screen.getByText("Something's off")).toBeInTheDocument();
    expect(screen.getByText('A request')).toBeInTheDocument();
  });

  it('clicking different kind buttons updates selection', async () => {
    const user = userEvent.setup();
    render(<SubmitFeedback />);

    // "A thought" is selected by default — click "An idea"
    const ideaBtn = screen.getByText('An idea');
    await user.click(ideaBtn);

    // The placeholder should now reflect the "idea" kind
    const textarea = screen.getByRole('textbox', { name: /Tell us more/i });
    expect(textarea).toHaveAttribute('placeholder', 'What if we tried…');
  });

  it('submit button is disabled when message is empty', () => {
    render(<SubmitFeedback />);
    const sendBtn = screen.getByRole('button', { name: /Send/i });
    expect(sendBtn).toBeDisabled();
  });

  it('submits via Ctrl+Enter keyboard shortcut', async () => {
    const user = userEvent.setup();
    render(<SubmitFeedback />);

    const textarea = screen.getByRole('textbox', { name: /Tell us more/i });
    await user.type(textarea, 'Keyboard shortcut test');

    // Fire Ctrl+Enter
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({ method: 'POST' }));
    });
  });

  it('"Back" button navigates back', async () => {
    const user = userEvent.setup();
    render(<SubmitFeedback />);
    const backBtn = screen.getByRole('button', { name: 'Back' });
    await user.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('"Send another" resets the form after successful submission', async () => {
    const user = userEvent.setup();
    render(<SubmitFeedback />);

    const textarea = screen.getByRole('textbox', { name: /Tell us more/i });
    await user.type(textarea, 'A great suggestion');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText('We got your note.')).toBeInTheDocument();
    });

    // Click "Send another"
    await user.click(screen.getByText('Send another'));

    // Should go back to the form
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Leave a note' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /Tell us more/i })).toBeInTheDocument();
    });
  });

  it('"Go to Dashboard" navigates to /', async () => {
    const user = userEvent.setup();
    render(<SubmitFeedback />);

    const textarea = screen.getByRole('textbox', { name: /Tell us more/i });
    await user.type(textarea, 'Some feedback');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText('We got your note.')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Go to Dashboard'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('uses "friend" when displayName is undefined', () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u1',
        email: 'anon@test.com',
        displayName: undefined,
        getIdToken: vi.fn().mockResolvedValue('token'),
      },
      role: 'operator',
    });
    render(<SubmitFeedback />);
    // The form should still render without error
    expect(screen.getByRole('heading', { name: 'Leave a note' })).toBeInTheDocument();
    // "You" fallback in the footer
    expect(screen.getByText(/You · /)).toBeInTheDocument();
  });

  it('handles API error without crashing', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });

    const user = userEvent.setup();
    render(<SubmitFeedback />);

    const textarea = screen.getByRole('textbox', { name: /Tell us more/i });
    await user.type(textarea, 'Trigger error');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    // Should NOT show success
    await waitFor(() => {
      expect(screen.queryByText('We got your note.')).not.toBeInTheDocument();
    });

    // handleFirestoreError should have been called as fallback
    const { handleFirestoreError } = await import('../lib/firebase');
    expect(handleFirestoreError).toHaveBeenCalled();
  });

  it('handles token acquisition failure gracefully', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        uid: 'u1',
        email: 'test@test.com',
        displayName: 'Test',
        getIdToken: vi.fn().mockRejectedValue(new Error('Token error')),
      },
      role: 'operator',
    });

    const user = userEvent.setup();
    render(<SubmitFeedback />);

    const textarea = screen.getByRole('textbox', { name: /Tell us more/i });
    await user.type(textarea, 'Test without token');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    // Should still succeed (token is optional)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Verify no Authorization header was set
    const fetchCall = (global.fetch as any).mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('does not submit when message is empty and form is submitted', async () => {
    render(<SubmitFeedback />);
    // The button is disabled, but also test the handleSubmit early-return
    const form = screen.getByRole('textbox', { name: /Tell us more/i }).closest('form')!;
    fireEvent.submit(form);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
