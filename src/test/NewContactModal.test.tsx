import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc } from 'firebase/firestore';
import NewContactModal from '../components/modals/NewContactModal';
import { useAuth } from '../components/AuthProvider';
import { applyPartners, partnersTermKey } from '../lib/partners';
import React from 'react';

// Mock dependencies
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'test-doc-id' }),
  serverTimestamp: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({
    docs: [
      { id: 'stage-1', data: () => ({ label: 'Contacted', order: 1 }) }
    ]
  }),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE' },
  logActivity: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('../lib/seasons', async () => {
  const actual = await vi.importActual<typeof import('../lib/seasons')>('../lib/seasons');
  return {
    ...actual,
    useSeason: () => ({
      autoId: 'summer',
      activeId: 'summer',
      active: { id: 'summer', label: 'Summer', tone: 'amber', blurb: '' },
      isAuto: true,
      clubRush: false,
      label: "Summer '26",
      tags: ["Summer '26"],
      setSeason: vi.fn(),
      resetSeason: vi.fn(),
      toggleClubRush: vi.fn(),
    }),
  };
});

describe('NewContactModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-id', displayName: 'Test User' },
      role: 'operator',
    });
  });

  it('renders modal when isOpen is true', async () => {
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
      expect(screen.getByText("Tagged for this season's cohort")).toBeInTheDocument();
    });
  });

  it('prefills the stage select from initialStage (e.g. "Add to {stage}")', async () => {
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} initialStage="Unassigned" />);
    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    // Reveal full fields disclosure
    await user.click(screen.getByText(/\+ Add the rest/i));

    await waitFor(() => {
      const stageSelect = screen.getByRole('combobox', { name: 'Stage' }) as HTMLSelectElement;
      expect(stageSelect.value).toBe('Unassigned');
    });
  });

  it('defaults the stage to the first stage when no initialStage is given', async () => {
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    await user.click(screen.getByText(/\+ Add the rest/i));

    await waitFor(() => {
      const stageSelect = screen.getByRole('combobox', { name: 'Stage' }) as HTMLSelectElement;
      expect(stageSelect.value).toBe('Contacted');
    });
  });

  it('falls back to the first stage when initialStage is not a valid option', async () => {
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} initialStage="Nonexistent" />);
    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    await user.click(screen.getByText(/\+ Add the rest/i));

    await waitFor(() => {
      const stageSelect = screen.getByRole('combobox', { name: 'Stage' }) as HTMLSelectElement;
      expect(stageSelect.value).toBe('Contacted');
    });
  });

  it('allows adding a contact with only first name (2-field light intake)', async () => {
    const onClose = vi.fn();
    const mockUserAct = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={onClose} />);

    const firstName = await screen.findByPlaceholderText('First name is plenty');
    await mockUserAct.type(firstName, 'John');

    // Submit without phone or disclosures
    const submitBtn = screen.getByRole('button', { name: /Add Contact/i });
    await mockUserAct.click(submitBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(vi.mocked(addDoc)).toHaveBeenCalled();
    });
  });

  it('submits correctly when full fields are provided via disclosure', async () => {
    const onClose = vi.fn();
    const mockUserAct = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={onClose} />);

    // Fill in 2 primary fields
    const firstName = await screen.findByPlaceholderText('First name is plenty');
    await mockUserAct.type(firstName, 'John');

    const phone = await screen.findByPlaceholderText('(555) 000-0000');
    await mockUserAct.type(phone, '5551234567');

    // Expand rest of fields
    await mockUserAct.click(screen.getByText(/\+ Add the rest/i));

    const role = await screen.findByPlaceholderText('e.g. Student, Faculty');
    await mockUserAct.type(role, 'Student');

    const location = await screen.findByPlaceholderText('e.g. Miller Hall, off-campus');
    await mockUserAct.type(location, 'Campus Coffee');

    const email = await screen.findByPlaceholderText('alex@campus.edu');
    await mockUserAct.type(email, 'john@example.com');
    
    const notes = await screen.findByPlaceholderText('Add some context about this contact...');
    await mockUserAct.type(notes, 'Nice guy');

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Add Contact/i });
    await mockUserAct.click(submitBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(vi.mocked(addDoc)).toHaveBeenCalled();
    });

    const contactArg = (addDoc as any).mock.calls.at(-1)?.[1];
    expect(contactArg?.tags).toEqual(expect.arrayContaining(["Summer '26"]));
  });

  it('stamps the adder’s partner as a co-creator when they are paired', async () => {
    const onClose = vi.fn();
    const mockUserAct = userEvent.setup();
    applyPartners({ [partnersTermKey()]: [['user-id', 'partner-id']] });
    render(<NewContactModal isOpen={true} onClose={onClose} />);

    const firstName = await screen.findByPlaceholderText('First name is plenty');
    await mockUserAct.type(firstName, 'John');
    const submitBtn = screen.getByRole('button', { name: /Add Contact/i });
    await mockUserAct.click(submitBtn);

    await waitFor(() => {
      expect(vi.mocked(addDoc)).toHaveBeenCalled();
    });
    const contactArg = (addDoc as any).mock.calls.at(-1)?.[1];
    expect(contactArg?.coCreators).toEqual(['partner-id']);
    applyPartners({});
  });

  // ── Viewer role guard ──────────────────────────────────────────────

  it('returns null for viewer role', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-id', displayName: 'Test User' },
      role: 'viewer',
    });
    const { container } = render(<NewContactModal isOpen={true} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  // ── Escape key closes modal ────────────────────────────────────────

  it('closes modal on Escape key press', async () => {
    const onClose = vi.fn();
    render(<NewContactModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalled();
  });

  // ── Phone validation branches ──────────────────────────────────────

  it('shows "Phone number too short" for short phone numbers', async () => {
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    const phoneInput = screen.getByPlaceholderText('(555) 000-0000');
    await user.type(phoneInput, '12345');
    // Trigger blur to run validation
    phoneInput.blur();

    await waitFor(() => {
      expect(screen.getByText(/Phone number too short/)).toBeInTheDocument();
    });
  });

  it('shows "Phone number too long" for long phone numbers', async () => {
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    const phoneInput = screen.getByPlaceholderText('(555) 000-0000');
    await user.type(phoneInput, '123456789012345');
    phoneInput.blur();

    await waitFor(() => {
      expect(screen.getByText(/Phone number too long/)).toBeInTheDocument();
    });
  });

  it('clears phone error when phone is empty', async () => {
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    const phoneInput = screen.getByPlaceholderText('(555) 000-0000');
    // Type and then clear
    await user.type(phoneInput, '123');
    phoneInput.blur();
    await waitFor(() => {
      expect(screen.getByText(/Phone number too short/)).toBeInTheDocument();
    });

    await user.clear(phoneInput);
    phoneInput.blur();
    await waitFor(() => {
      expect(screen.queryByText(/Phone number too short/)).not.toBeInTheDocument();
    });
  });

  // ── phoneError blocks submission ───────────────────────────────────

  it('does not submit form when phoneError exists', async () => {
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    // Fill in a name
    const firstName = await screen.findByPlaceholderText('First name is plenty');
    await user.type(firstName, 'John');

    // Create a phone error
    const phoneInput = screen.getByPlaceholderText('(555) 000-0000');
    await user.type(phoneInput, '123');
    phoneInput.blur();

    await waitFor(() => {
      expect(screen.getByText(/Phone number too short/)).toBeInTheDocument();
    });

    // Try to submit
    const submitBtn = screen.getByRole('button', { name: /Add Contact/i });
    await user.click(submitBtn);

    // addDoc should NOT have been called
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled();
  });

  // ── Cancel and backdrop close ──────────────────────────────────────

  it('cancel button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  // ── Modal not rendered when closed ─────────────────────────────────

  it('does not render when isOpen is false', () => {
    const { container } = render(<NewContactModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('New Contact')).not.toBeInTheDocument();
  });
});
