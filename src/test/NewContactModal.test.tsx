import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc, getDocs } from 'firebase/firestore';
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

  it('lists every configured stage in the "Where they\'re at" select (#730)', async () => {
    // The mock firestore above returns a single stage labeled "Contacted".
    // Open the disclosure to reveal the stage select, then assert both
    // "Unassigned" and "Contacted" are present as options.
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    await user.click(screen.getByText(/\+ Add the rest/i));

    await waitFor(() => {
      const stageSelect = screen.getByRole('combobox', { name: 'Stage' }) as HTMLSelectElement;
      const optionLabels = Array.from(stageSelect.options).map((o) => o.text);
      expect(optionLabels).toContain('Unassigned');
      expect(optionLabels).toContain('Contacted');
    });
  });

  it('defaults stage to "Unassigned" when the stages collection is empty (#730)', async () => {
    (getDocs as any).mockResolvedValueOnce({ docs: [] });
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    await user.click(screen.getByText(/\+ Add the rest/i));

    await waitFor(() => {
      const stageSelect = screen.getByRole('combobox', { name: 'Stage' }) as HTMLSelectElement;
      expect(stageSelect.value).toBe('Unassigned');
      // No hardcoded "First Contact" fallback should appear.
      const optionLabels = Array.from(stageSelect.options).map((o) => o.text);
      expect(optionLabels).not.toContain('First Contact');
    });
  });
  it('does not render a "How we met" or "Address" field (#730)', async () => {
    // The new-contact form used to expose both fields (a fixed "How we met"
    // select and a freeform ADDRESS input). Both are gone.
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    // Open the full-fields disclosure to be sure no hidden field is tucked
    // behind it.
    await user.click(screen.getByText(/\+ Add the rest/i));

    expect(screen.queryByText('HOW WE MET')).not.toBeInTheDocument();
    expect(screen.queryByText('ADDRESS')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Miller Hall, off-campus/i)).not.toBeInTheDocument();
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
    expect(contactArg?.tags).toEqual(expect.arrayContaining(['Summer 2026']));
    // #730: the form no longer writes `metVia` or `location` to the new
    // contact doc. They may still be present in the type as undefined (we keep
    // the field on the schema for backward compat), but the form must not put
    // a value on them.
    expect(contactArg?.metVia ?? '').toBe('');
    expect(contactArg?.location ?? '').toBe('');
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

  // ── Tag suggestions and normalization ─────────────────────────────

  it('renders tag suggestion chips and adds tags on click', async () => {
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    // Expand full fields disclosure
    await user.click(screen.getByText(/\+ Add the rest/i));

    // Check that "+ Interested" and "+ Open" chips are present
    const interestedChip = await screen.findByRole('button', { name: /\+ Interested/i });
    const openChip = await screen.findByRole('button', { name: /\+ Open/i });
    expect(interestedChip).toBeInTheDocument();
    expect(openChip).toBeInTheDocument();

    // Click "+ Interested"
    await user.click(interestedChip);

    // "+ Interested" should now disappear from suggestions
    expect(screen.queryByRole('button', { name: /\+ Interested/i })).not.toBeInTheDocument();

    // A selected tag chip "Interested" with remove button should appear
    expect(screen.getByText('Interested')).toBeInTheDocument();
    expect(screen.getByTitle('Remove tag')).toBeInTheDocument();
  });

  it('normalizes tags upon submission', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    const firstName = await screen.findByPlaceholderText('First name is plenty');
    await user.type(firstName, 'Jane');

    // Expand rest of fields
    await user.click(screen.getByText(/\+ Add the rest/i));

    // Type a tag variant
    const tagInput = screen.getByPlaceholderText(/e\.g\. Gospel, Fall2023/i);
    await user.type(tagInput, "Fall '26, club-rush");

    // Click "+ Open" suggestion
    const openChip = await screen.findByRole('button', { name: /\+ Open/i });
    await user.click(openChip);

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Add Contact/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(vi.mocked(addDoc)).toHaveBeenCalled();
    });

    const contactArg = (addDoc as any).mock.calls.at(-1)?.[1];
    expect(contactArg?.tags).toContain('Fall 2026');
    expect(contactArg?.tags).toContain('Club Rush');
    expect(contactArg?.tags).toContain('Open');
  });

  // ── Modal not rendered when closed ─────────────────────────────────

  it('sends notification linking to /people/:id upon creation', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { sendNotification } = await import('../lib/firebase');
    render(<NewContactModal isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    const firstName = await screen.findByPlaceholderText('First name is plenty');
    await user.type(firstName, 'Jane');

    const submitBtn = screen.getByRole('button', { name: /Add Contact/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          link: expect.stringMatching(/^\/people\//),
        })
      );
    });
  });

  it('renders localized spiritual background options and placeholder without raw i18n keys', async () => {
    const user = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });

    await user.click(screen.getByText(/\+ Add the rest/i));

    await waitFor(() => {
      expect(screen.getByText('SPIRITUAL BACKGROUND')).toBeInTheDocument();
    });

    // Verify raw translation key is not rendered
    expect(screen.queryByText('modals.select_background')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Select background...' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Exploring Faith' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Christian' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Catholic' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Other Religion / Background' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'None' })).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<NewContactModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('New Contact')).not.toBeInTheDocument();
  });
});

