import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import * as firestore from 'firebase/firestore';
import { addThreadMessage } from '../lib/threads';
import { useAuth } from '../components/AuthProvider';
import { handleFirestoreError, logActivity } from '../lib/firebase';
import { Frecency, __resetFrecencyCache } from '../lib/frecency';

const hoisted = vi.hoisted(() => ({ messages: [] as any[] }));
vi.mock('../lib/threads', () => ({
  useThreads: () => hoisted.messages,
  threadsFor: (msgs: any[]) => msgs,
  countFor: (msgs: any[]) => msgs.length,
  repliesOf: (msgs: any[], pid: string) => msgs.filter((m) => m.parentId === pid),
  addThreadMessage: vi.fn(() => Promise.resolve()),
  toggleReaction: vi.fn(() => Promise.resolve()),
  THREAD_KINDS: { comment: { label: "Comment", tone: "teal", verb: "commented" } },
  THREAD_REACTIONS: ["🙏", "❤️", "🌱", "✅"],
}));

// Mock Auth
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// Mock Firestore
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db, ...parts) => ({ path: parts.join('/'), id: parts[parts.length - 1] })),
    doc: vi.fn((_db, ...parts) => ({ path: parts.join('/'), id: parts[parts.length - 1] })),
    updateDoc: vi.fn().mockResolvedValue(true),
    addDoc: vi.fn().mockResolvedValue({ id: 'mock-new-id' }),
    deleteDoc: vi.fn().mockResolvedValue(true),
    arrayUnion: vi.fn((...args) => args),
    arrayRemove: vi.fn((...args) => args),
    query: vi.fn((ref) => ref),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    onSnapshot: vi.fn((ref, callback) => {
      if (typeof callback === 'function') {
        try {
          callback({ docs: [] });
        } catch (e) {
          // ignore
        }
      }
      return () => {};
    }),
    getDocs: vi.fn().mockResolvedValue({ size: 0, docs: [] }),
    serverTimestamp: vi.fn(),
    Timestamp: class MockTimestamp {
      static now() { return new MockTimestamp(); }
      static fromDate(d) { return new MockTimestamp(); }
      toDate() { return new Date(); }
    },
  };
});

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE' },
  logActivity: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('motion/react', () => {
  const motion = new Proxy(
    {},
    {
      get: (target, prop) => {
        return ({ children, ...props }: any) => {
          const Tag = prop as any;
          return <Tag {...props}>{children}</Tag>;
        };
      },
    }
  );
  return {
    motion,
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

const mockContact = {
  id: 'contact-abc',
  name: 'John Doe',
  email: 'john.doe@example.com',
  phone: '555-1234',
  role: 'Student',
  location: 'Main Hall',
  stage: 'Regular',
  residenceHall: 'Miller Hall',
  spiritualBackground: 'Christian',
  tags: ['leadership', 'small-group'],
  lastSeen: '2026-06-16',
  notes: 'Some notes about John Doe.',
  initials: 'JD',
};

describe('ContactDetailsModal Component', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    __resetFrecencyCache();
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-123', displayName: 'Admin Tony' },
      isAdmin: true,
      role: 'admin',
    });
    // Restore sane default Firestore behaviours so per-test overrides never leak.
    (firestore.onSnapshot as any).mockImplementation((q: any, s: any) => {
      if (typeof s === 'function') {
        try {
          s({ docs: [] });
        } catch {
          // ignore
        }
      }
      return () => {};
    });
    (firestore.getDocs as any).mockResolvedValue({ size: 0, docs: [] });
    (firestore.addDoc as any).mockResolvedValue({ id: 'mock-new-id' });
    (firestore.updateDoc as any).mockResolvedValue(true);
  });

  const setupOnSnapshotMocks = (dataMap: Record<string, any[]>) => {
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      // Return appropriate array based on query info (we check dataMap keys)
      // For simplicity, we just use a generic mapping or call the callbacks immediately
      const queryName = q?.id || '';
      successCallback({
        docs: [],
      });
      return vi.fn();
    });
  };

  it('renders overview tab details correctly by default', () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Mock implementation for onSnapshot (normally set up in specific tests if needed)
    setupOnSnapshotMocks({});

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    // Location shows in the header meta and the aside — the design's duplication.
    expect(screen.getAllByText('Main Hall').length).toBeGreaterThan(0);
    expect(screen.getByText('Christian')).toBeInTheDocument();
  });

  it('renders as a full desktop page with a two-column aside, not a popup', () => {
    const { container } = render(
      <ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />,
    );

    expect(container.querySelector('.cd-page')).toBeTruthy();
    expect(container.querySelector('.cd-page-main')).toBeTruthy();
    expect(container.querySelector('.cd-page-aside')).toBeTruthy();
    // No popup chrome: no backdrop, no dialog role, no max-w-2xl card.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelector('.bg-black\\/40')).toBeNull();
    // The design's aside sections are all present.
    expect(screen.getByText('How to reach John')).toBeInTheDocument();
    expect(screen.getByText('Where they are')).toBeInTheDocument();
    expect(screen.getByText('Cared for by')).toBeInTheDocument();
    expect(screen.getByText('Who else can see them')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('allows clicking tabs and switching views', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // overview is active
    expect(screen.getByText('Some notes about John Doe.')).toBeInTheDocument();

    // Click Interactions tab (labeled "Interactions")
    const interactionsTab = screen.getByRole('button', { name: /Interactions/i });
    fireEvent.click(interactionsTab);
    expect(screen.getByText('Every conversation')).toBeInTheDocument();

    // Click Prayer tab
    const prayerTab = screen.getByRole('button', { name: /^Prayer\s*\d*$/ });
    fireEvent.click(prayerTab);
    expect(screen.getByText("Prayers we're holding")).toBeInTheDocument();

    // Click Discussion tab (labeled "Discussion")
    const commentsTab = screen.getByRole('button', { name: /Discussion/i });
    await act(async () => {
      fireEvent.click(commentsTab);
    });
    expect(await screen.findByPlaceholderText(/Add to the team's discussion…/i)).toBeInTheDocument();
  });

  it('allows adding a tag', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Click add tag button
    const addTagBtn = screen.getByRole('button', { name: /^add$/i });
    fireEvent.click(addTagBtn);

    // Type new tag
    const tagInput = screen.getByPlaceholderText(/new tag/i);
    fireEvent.change(tagInput, { target: { value: 'active-member' } });

    // Wait for the state update to propagate to the input value
    await waitFor(() => expect(screen.getByPlaceholderText(/new tag/i)).toHaveValue('active-member'));

    // Submit tag
    const currentTagInput = screen.getByPlaceholderText(/new tag/i);
    fireEvent.keyDown(currentTagInput, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tags: expect.arrayContaining(['leadership', 'small-group', 'active-member']),
        })
      );
    });
  });

  it('allows posting a comment', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Switch to Discussion tab
    const commentsTab = screen.getByRole('button', { name: /Discussion/i });
    await act(async () => {
      fireEvent.click(commentsTab);
    });

    // Type comment
    const commentInput = await screen.findByPlaceholderText(/Add to the team's discussion…/i);
    await act(async () => {
      fireEvent.change(commentInput, { target: { value: 'John is doing great!' } });
    });

    // Wait for React to flush state and enable the button by re-querying it
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Comment/i });
      expect(btn).not.toBeDisabled();
    });
    
    const submitBtn = screen.getByRole('button', { name: /Comment/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(addThreadMessage).toHaveBeenCalledWith(
        'contact-abc',
        expect.objectContaining({
          body: 'John is doing great!',
        }),
        expect.anything()
      );
    });
  });

  it('allows logging an interaction', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Click Log interaction button in the header
    const openLogBtn = screen.getByRole('button', { name: /^Log interaction$/i });
    fireEvent.click(openLogBtn);

    // Enter notes
    const notesInput = screen.getByPlaceholderText(/Describe the interaction\.\.\./i);
    fireEvent.change(notesInput, { target: { value: 'Met for coffee today.' } });

    // Wait for the submit button to be enabled
    await waitFor(() => {
      const currentForm = screen.getByPlaceholderText(/Describe the interaction\.\.\./i).closest('form')!;
      const btn = currentForm.querySelector('button[type="submit"]')!;
      expect(btn).not.toBeDisabled();
    });

    // Log it
    const form = screen.getByPlaceholderText(/Describe the interaction\.\.\./i).closest('form')!;
    const submitBtn = form.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          content: 'Met for coffee today.',
          type: 'interaction',
        })
      );
    });
  });

  it('allows holding a prayer', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Click Add prayer button in the header
    const openPrayerBtn = screen.getByRole('button', { name: /^Add prayer$/ });
    fireEvent.click(openPrayerBtn);

    // Fill burden
    const burdenInput = screen.getByPlaceholderText(/John's family back home/i);
    fireEvent.change(burdenInput, { target: { value: 'Pray for upcoming exams.' } });

    // Wait for the submit button to be enabled
    await waitFor(() => {
      const currentForm = screen.getByPlaceholderText(/John's family back home/i).closest('form')!;
      const btn = currentForm.querySelector('button[type="submit"]')!;
      expect(btn).not.toBeDisabled();
    });

    // Add prayer
    const form = screen.getByPlaceholderText(/John's family back home/i).closest('form')!;
    const submitBtn = form.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          burden: 'Pray for upcoming exams.',
          contactId: 'contact-abc',
        })
      );
    });
  });

  it('handles phone number formatting and error display on blur', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    
    // Wait for the modal to load the contact (i.e. useEffect runs and renders details)
    await screen.findByText('John Doe');

    // Click edit details
    const editBtn = screen.getByTitle('Edit details');
    fireEvent.click(editBtn);

    // Get phone input
    const getPhoneInput = () => screen.getByPlaceholderText('(555) 000-0000');
    
    // 1. Valid formatting on blur
    await act(async () => {
      fireEvent.change(getPhoneInput(), { target: { value: '1234567890' } });
    });
    await act(async () => {
      fireEvent.blur(getPhoneInput());
    });
    await waitFor(() => expect(getPhoneInput()).toHaveValue('(123) 456-7890'));
    expect(screen.queryByText(/Phone number too/i)).not.toBeInTheDocument();

    // 2. Short number error
    await act(async () => {
      fireEvent.change(getPhoneInput(), { target: { value: '123' } });
    });
    await act(async () => {
      fireEvent.blur(getPhoneInput());
    });
    await waitFor(() => expect(screen.getByText('Phone number too short (need 10 digits)')).toBeInTheDocument());

    // 3. Long number error
    await act(async () => {
      fireEvent.change(getPhoneInput(), { target: { value: '123456789012345' } });
    });
    await act(async () => {
      fireEvent.blur(getPhoneInput());
    });
    await waitFor(() => expect(screen.getByText('Phone number too long (need 10 digits)')).toBeInTheDocument());
  });

  it('allows updating contact details', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    
    // Click edit details
    const editBtn = screen.getByTitle('Edit details');
    fireEvent.click(editBtn);

    // Modify firstName, lastName, role, location, notes
    const firstNameInput = screen.getByPlaceholderText('First name is plenty');
    fireEvent.change(firstNameInput, { target: { value: 'Johnny' } });

    const roleInput = screen.getByPlaceholderText('e.g. Student, Faculty');
    fireEvent.change(roleInput, { target: { value: 'Staff' } });

    const notesInput = screen.getByPlaceholderText('Add some context about this contact...');
    fireEvent.change(notesInput, { target: { value: 'Updated notes.' } });

    // Submit form
    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Johnny Doe',
          role: 'Staff',
          notes: 'Updated notes.',
        })
      );
    });
  });

  it('edit form required fields conform to the add-contact form (only first name required)', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Click edit details
    const editBtn = screen.getByTitle('Edit details');
    fireEvent.click(editBtn);

    expect(screen.getByPlaceholderText('First name is plenty')).toBeRequired();
    expect(screen.getByPlaceholderText('alex@campus.edu')).not.toBeRequired();
    expect(screen.getByPlaceholderText('e.g. Student, Faculty')).not.toBeRequired();
    expect(screen.getByPlaceholderText('e.g. Miller Hall, off-campus')).not.toBeRequired();
    expect(screen.getByPlaceholderText('Add some context about this contact...')).not.toBeRequired();
  });

  it('allows deleting a contact', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Mock getDocs for subcollections inside handleDelete
    const mockGetDocs = vi.mocked(firestore.getDocs);
    mockGetDocs.mockResolvedValue({ size: 0, docs: [] } as any);

    const deleteBtn = screen.getAllByRole('button', { name: 'Delete Contact' })[0];
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this contact?');
    await waitFor(() => {
      expect(firestore.deleteDoc).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('allows removing a tag', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Click the close/X button on the 'leadership' tag
    const removeTagBtns = screen.getAllByTitle('Remove tag');
    fireEvent.click(removeTagBtns[0]); // Remove leadership tag

    await waitFor(() => {
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tags: ['small-group'],
        })
      );
    });
  });

  it('allows replying to a comment', async () => {
    hoisted.messages = [
      {
        id: 'comment-1',
        from: 'user-abc',
        fromName: 'Alice',
        body: 'Hello world',
        createdAt: new Date().toISOString(),
      },
    ];

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} initialTab="thread" />);

    // Click Reply on Alice's comment
    const replyBtn = screen.getByRole('button', { name: /^Reply$/ });
    fireEvent.click(replyBtn);

    // Type reply
    const replyInput = screen.getByPlaceholderText('Write a reply…');
    fireEvent.change(replyInput, { target: { value: 'This is a reply' } });

    // Submit reply (the submit button in reply form)
    const replyFormBtns = screen.getAllByRole('button', { name: /^Reply$/ });
    const submitBtn = replyFormBtns[replyFormBtns.length - 1];
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(addThreadMessage).toHaveBeenCalledWith(
        'contact-abc',
        expect.objectContaining({
          body: 'This is a reply',
          parentId: 'comment-1',
        }),
        expect.anything()
      );
    });
  });

  it('renders history tab with audit items', async () => {
    // Mock activities snapshot
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      if (q?.path === 'activities') {
        successCallback({
          docs: [
            {
              id: 'activity-1',
              data: () => ({
                action: 'created contact',
                targetId: 'contact-abc',
                targetName: 'John Doe',
                targetType: 'contact',
                type: 'create',
                userName: 'Admin Tony',
                createdAt: new Date().toISOString(),
                description: 'Initial creation',
              }),
            },
          ],
        });
      }
      return vi.fn();
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Click History tab
    const historyTab = screen.getByRole('button', { name: /History/i });
    fireEvent.click(historyTab);

    // Assert that history header and activity are displayed
    await waitFor(() => {
      expect(screen.getByText('Looking back')).toBeInTheDocument();
      expect(screen.getByText('Admin Tony')).toBeInTheDocument();
      expect(screen.getByText('created contact')).toBeInTheDocument();
    });
  });

  // ── handleUpdateInteraction ────────────────────────────────────────

  it('allows updating an existing interaction', async () => {
    // Mock interactions snapshot
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      if (q?.path?.includes('interactions')) {
        successCallback({
          docs: [
            {
              id: 'inter-1',
              data: () => ({
                userId: 'user-123',
                userName: 'Admin Tony',
                content: 'Old content',
                dateTime: '2026-06-15T08:00',
                type: 'interaction',
              }),
            },
          ],
        });
      }
      return vi.fn();
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Click Interactions tab
    const interactionsTab = screen.getByRole('button', { name: /Interactions/i });
    fireEvent.click(interactionsTab);

    await screen.findByText('Old content');

    // Click edit button for the interaction
    const editBtn = screen.getByRole('button', { name: /^Edit$/ });
    fireEvent.click(editBtn);

    // Update form is rendered, modify text
    const textareas = screen.getAllByRole('textbox');
    const textarea = textareas.find(ta => ta.innerHTML.includes('Old content') || (ta as any).value === 'Old content') || textareas[0];
    fireEvent.change(textarea, { target: { value: 'New updated content' } });

    // Submit
    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          content: 'New updated content',
        })
      );
    });
  });

  it('blocks contact details update when phone error is present', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    await screen.findByText('John Doe');

    // Click edit details
    const editBtn = screen.getByTitle('Edit details');
    await act(async () => {
      fireEvent.click(editBtn);
    });

    const getPhoneInput = () => screen.getByPlaceholderText('(555) 000-0000');

    // Set phone to a short number to trigger phone error
    await act(async () => {
      fireEvent.change(getPhoneInput(), { target: { value: '123' } });
    });
    await act(async () => {
      fireEvent.blur(getPhoneInput());
    });

    await screen.findByText('Phone number too short (need 10 digits)');

    // Save Changes button is not disabled, but clicking it should do nothing (since phoneError prevents submit)
    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(firestore.updateDoc).not.toHaveBeenCalled();
  });

  // ── Tag commit on blur ─────────────────────────────────────────────

  it('commits tag on blur of input', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    await screen.findByText('John Doe');

    // Click add tag button
    const addTagBtn = screen.getByRole('button', { name: /^add$/i });
    await act(async () => {
      fireEvent.click(addTagBtn);
    });

    const getTagInput = () => screen.getByPlaceholderText(/new tag/i);

    // Type tag
    await act(async () => {
      fireEvent.change(getTagInput(), { target: { value: 'blur-tag' } });
    });

    // Blur tag input
    await act(async () => {
      fireEvent.blur(getTagInput());
    });

    await waitFor(() => {
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tags: expect.arrayContaining(['blur-tag']),
        })
      );
    });
  });

  // ── Contact action buttons ─────────────────────────────────────────

  it('calls window.open for call/text/email buttons', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    const callBtn = screen.getByRole('button', { name: /Call/i });
    fireEvent.click(callBtn);
    expect(openSpy).toHaveBeenCalledWith(`tel:${mockContact.phone}`);

    const textBtn = screen.getByRole('button', { name: /Text/i });
    fireEvent.click(textBtn);
    expect(openSpy).toHaveBeenCalledWith(`sms:${mockContact.phone}`);

    const emailBtn = screen.getByRole('button', { name: /Email/i });
    fireEvent.click(emailBtn);
    expect(openSpy).toHaveBeenCalledWith(`mailto:${mockContact.email}`);
  });

  // ── Escape key closes modal ────────────────────────────────────────

  it('closes modal on Escape key press', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  // ── null contact guard ─────────────────────────────────────────────

  it('returns null and does not render when contact is null', () => {
    const { container } = render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={null} />);
    expect(container.firstChild).toBeNull();
  });

  // ── Comment Enter key shortcut ─────────────────────────────────────

  it('submits comment on Enter key press without Shift', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    await screen.findByText('John Doe');

    // Switch to Discussion tab
    const commentsTab = screen.getByRole('button', { name: /Discussion/i });
    fireEvent.click(commentsTab);

    const commentInput = await screen.findByPlaceholderText(/Add to the team's discussion…/i);

    // Type comment
    await act(async () => {
      fireEvent.change(commentInput, { target: { value: 'Enter key comment' } });
    });

    // Press Enter with Shift -> should NOT submit
    await act(async () => {
      fireEvent.keyDown(commentInput, { key: 'Enter', shiftKey: true });
    });
    expect(firestore.addDoc).not.toHaveBeenCalled();

    // Press Enter without Shift -> should submit
    await act(async () => {
      fireEvent.keyDown(commentInput, { key: 'Enter', shiftKey: false });
    });
  });

  // ── AuditActivityItem branches ─────────────────────────────────────

  it('renders various action texts in AuditActivityItem', async () => {
    const mockActivities = [
      {
        id: 'act-1',
        action: 'logged an interaction for',
        targetId: 'contact-abc',
        targetName: 'John Doe',
        targetType: 'contact',
        type: 'email',
        userName: 'User A',
        createdAt: new Date().toISOString(),
        description: 'Email desc',
      },
      {
        id: 'act-2',
        action: 'logged an interaction for',
        targetId: 'contact-abc',
        targetName: 'John Doe',
        targetType: 'contact',
        type: 'event',
        userName: 'User B',
        createdAt: new Date().toISOString(),
        description: 'Meeting desc',
      },
      {
        id: 'act-3',
        action: 'logged an interaction for',
        targetId: 'contact-abc',
        targetName: 'John Doe',
        targetType: 'contact',
        type: 'comment',
        userName: 'User C',
        createdAt: new Date().toISOString(),
        description: 'Comment desc',
      },
      {
        id: 'act-4',
        action: 'logged an interaction for',
        targetId: 'contact-abc',
        targetName: 'John Doe',
        targetType: 'contact',
        type: 'something-else',
        userName: 'User D',
        createdAt: new Date().toISOString(),
        description: 'Misc desc',
      },
      {
        id: 'act-5',
        action: 'updated details',
        targetId: 'contact-abc',
        targetName: 'John Doe',
        targetType: 'contact',
        type: 'edit',
        userName: 'User E',
        createdAt: new Date().toISOString(),
        description: 'notes updated\\nemail: updated',
      },
    ];

    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      if (q?.path === 'activities') {
        successCallback({
          docs: mockActivities.map(act => ({
            id: act.id,
            data: () => act,
          })),
        });
      }
      return vi.fn();
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    await screen.findByText('John Doe');

    // Click History tab
    const historyTab = screen.getByRole('button', { name: /History/i });
    fireEvent.click(historyTab);

    // Verify all custom action strings are rendered
    await waitFor(() => {
      expect(screen.getByText('emailed')).toBeInTheDocument();
      expect(screen.getByText('had a meeting with')).toBeInTheDocument();
      expect(screen.getByText('left a note for')).toBeInTheDocument();
      expect(screen.getByText('interacted with')).toBeInTheDocument();
      expect(screen.getByText('updated the Notes, Email for')).toBeInTheDocument();
    });
  });

  it('renders Access Restricted modal overlay when trainee cannot see contact', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-trainee', displayName: 'Trainee Bob' },
      isAdmin: false,
      role: 'manager',
    });

    const restrictedContact = {
      ...mockContact,
      createdBy: 'other-user',
      coCreators: [],
    };

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={restrictedContact} />);
    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    expect(screen.getByText('You do not have permission to view this contact record.')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('renders "contacted by" and "Created by" metadata when present', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-1', displayName: 'Admin User' },
      isAdmin: true,
      role: 'admin',
    });

    const contactWithMeta = {
      ...mockContact,
      createdAt: '2026-08-01T12:00:00Z',
      createdByName: 'Sarah Connor',
      lastContactedBy: 'Tony Wang',
      lastContactedDate: '2026-08-05T10:00:00Z',
    };

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={contactWithMeta} />);
    
    // Header since-line should include "contacted by Tony Wang"
    expect(screen.getAllByText(/contacted by Tony Wang/i).length).toBeGreaterThan(0);
    // The aside's "Cared for by" shows who added them (the name is emphasised).
    expect(screen.getByText(/Added by/i)).toBeInTheDocument();
    expect(screen.getAllByText('Sarah Connor').length).toBeGreaterThan(0);
  });

  it('allows adding and removing sharing permissions in desktop aside', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-123', displayName: 'Admin User' },
      isAdmin: true,
      role: 'admin',
    });

    const contactWithCoCreator = {
      ...mockContact,
      coCreators: ['user-456'],
    };

    // Mock team members
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      if (q?.path?.includes('users') || q?.type === 'users') {
        successCallback({
          docs: [
            { id: 'user-456', data: () => ({ name: 'Co Creator', role: 'Staff' }) },
            { id: 'user-789', data: () => ({ name: 'Other User', role: 'Trainee' }) },
          ],
        });
      } else {
        successCallback({ docs: [] });
      }
      return vi.fn();
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={contactWithCoCreator} />);
    await screen.findByText('John Doe');

    // Click "Add someone…" trigger button
    const addShareTrigger = screen.getByRole('button', { name: /add someone/i });
    fireEvent.click(addShareTrigger);

    // Select a new user to share with
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'user-789' } });

    await waitFor(() => {
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          coCreators: firestore.arrayUnion('user-789'),
        })
      );
    });

    // Remove share (x button)
    const removeBtns = screen.getAllByTitle('Remove access');
    fireEvent.click(removeBtns[0]);

    await waitFor(() => {
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          coCreators: firestore.arrayRemove('user-456'),
        })
      );
    });
  });

  it('deletes contact when Delete Contact button is clicked', async () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-123', displayName: 'Admin User' },
      isAdmin: true,
      role: 'admin',
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    await screen.findByText('John Doe');

    const deleteBtn = screen.getAllByRole('button', { name: /Delete Contact/i })[0];
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(firestore.deleteDoc).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('cancels edit mode when Cancel button in footer is pressed', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    await screen.findByText('John Doe');

    const editBtn = screen.getByTitle('Edit details');
    fireEvent.click(editBtn);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
  });

  // ── Error paths ───────────────────────────────────────────────────

  it('reports stages fetch failures through handleFirestoreError', async () => {
    (firestore.getDocs as any).mockRejectedValueOnce(new Error('no stages'));
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    await waitFor(() =>
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'LIST', 'stages'),
    );
  });

  it('reports snapshot failures for interactions, comments, activities and prayers', async () => {
    (firestore.onSnapshot as any).mockImplementation((q: any, s: any, e: any) => {
      if (typeof e === 'function') e(new Error('snapshot boom'));
      return vi.fn();
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    await waitFor(() => {
      expect(handleFirestoreError).toHaveBeenCalledWith(
        expect.any(Error),
        'LIST',
        'contacts/contact-abc/interactions',
      );
      expect(handleFirestoreError).toHaveBeenCalledWith(
        expect.any(Error),
        'LIST',
        'contacts/contact-abc/comments',
      );
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'LIST', 'activities');
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'LIST', 'prayers');
    });
  });

  // ── Overview: prayers, held days, journey ─────────────────────────

  it('renders open prayers with held-day counts and the aside journey', async () => {
    (firestore.getDocs as any).mockResolvedValue({
      size: 2,
      docs: [
        { id: 's1', data: () => ({ label: 'First', order: 0 }) },
        { id: 's2', data: () => ({ label: 'Regular', order: 1 }) },
      ],
    });
    (firestore.onSnapshot as any).mockImplementation((q: any, s: any) => {
      if (q?.path === 'prayers') {
        s({
          docs: [
            { id: 'p1', data: () => ({ contactId: 'contact-abc', burden: 'Pray for finals', status: 'pending', date: new Date().toISOString() }) },
            { id: 'p2', data: () => ({ contactId: 'contact-abc', burden: 'Bad date prayer', status: 'pending', date: 'not-a-date' }) },
          ],
        });
      } else if (q?.path === 'users') {
        s({ docs: [{ id: 'owner-1', data: () => ({ name: 'Owner Jane', role: 'admin' }) }] });
      } else {
        s({ docs: [] });
      }
      return vi.fn();
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    expect(screen.getAllByText('Pray for finals').length).toBeGreaterThan(0);
    expect(screen.getByText(/Held \d+ (day|days)/)).toBeInTheDocument();
    // The invalid-date prayer shows no held count.
    expect(screen.getByText('Bad date prayer')).toBeInTheDocument();
    // The aside journey marks the current stage as "here now".
    expect(await screen.findByText('here now')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
  });

  // ── Edit form edge cases ──────────────────────────────────────────

  it('splits a single-word name and applies capitalize on the last name', async () => {
    render(
      <ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={{ ...mockContact, name: 'Prince' }} />,
    );
    await screen.findByText('Prince');

    fireEvent.click(screen.getByTitle('Edit details'));
    const lastInput = screen.getByPlaceholderText('e.g. Johnson');
    fireEvent.change(lastInput, { target: { value: 'davies' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'Prince Davies' }),
      ),
    );
  });

  it('records email, residence-hall location, stage and spiritual background changes', async () => {
    (firestore.getDocs as any).mockResolvedValue({
      size: 2,
      docs: [
        { id: 's1', data: () => ({ label: 'First', order: 0 }) },
        { id: 's2', data: () => ({ label: 'Regular', order: 1 }) },
      ],
    });

    const contactWithHall = {
      ...mockContact,
      tags: ['New Sign Up'],
      spiritualBackground: '',
    };
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={contactWithHall} />);
    await screen.findByText('John Doe');

    fireEvent.click(screen.getByTitle('Edit details'));

    // HOW WE MET label reflects the fixed "How we met" vocabulary.
    expect(screen.getByText('HOW WE MET')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('alex@campus.edu'), {
      target: { value: 'john.new@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Miller Hall, off-campus'), {
      target: { value: 'West Hall' },
    });
    const stageSelect = screen.getByDisplayValue('Regular');
    fireEvent.change(stageSelect, { target: { value: 'First' } });
    fireEvent.change(screen.getByDisplayValue('Select background...'), {
      target: { value: 'Exploring' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          email: 'john.new@example.com',
          location: 'West Hall',
          stage: 'First',
          spiritualBackground: 'Exploring',
        }),
      ),
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('address'),
      }),
    );
  });

  it('parses comma-separated tags from the edit form', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    await screen.findByText('John Doe');

    fireEvent.click(screen.getByTitle('Edit details'));
    const tagsInput = screen.getByPlaceholderText('e.g. Lead, Fall2023');
    fireEvent.change(tagsInput, { target: { value: 'alpha, beta ,  gamma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ tags: ['alpha', 'beta', 'gamma'] }),
      ),
    );
  });

  it('clears the phone error when the phone field is emptied', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    await screen.findByText('John Doe');

    fireEvent.click(screen.getByTitle('Edit details'));
    const phoneInput = screen.getByPlaceholderText('(555) 000-0000');

    fireEvent.change(phoneInput, { target: { value: '123' } });
    fireEvent.blur(phoneInput);
    await screen.findByText('Phone number too short (need 10 digits)');

    fireEvent.change(phoneInput, { target: { value: '' } });
    fireEvent.blur(phoneInput);
    expect(screen.queryByText(/Phone number too/)).not.toBeInTheDocument();
  });

  it('aborts deletion when the confirmation dialog is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    fireEvent.click(screen.getAllByRole('button', { name: /Delete Contact/i })[0]);

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this contact?');
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  // ── Interaction form ──────────────────────────────────────────────

  it('ignores empty interaction submissions and toggles the inline form off', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    fireEvent.click(screen.getByRole('button', { name: /^Log interaction$/ }));
    const getForm = () =>
      screen.getByPlaceholderText(/Describe the interaction\.\.\./i).closest('form')!;

    // Type content but clear the date: the submit guard (empty dateTime) blocks it.
    fireEvent.change(screen.getByPlaceholderText(/Describe the interaction\.\.\./i), {
      target: { value: 'No date log' },
    });
    fireEvent.change(getForm().querySelector('input[type="datetime-local"]')!, {
      target: { value: '' },
    });
    fireEvent.click(getForm().querySelector('button[type="submit"]')!);
    expect(firestore.addDoc).not.toHaveBeenCalled();

    // With a date restored, the same submit works and closes the form.
    fireEvent.change(getForm().querySelector('input[type="datetime-local"]')!, {
      target: { value: '2026-06-16T10:00' },
    });
    fireEvent.click(getForm().querySelector('button[type="submit"]')!);
    await waitFor(() =>
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ content: 'No date log' }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/Describe the interaction\.\.\./i)).not.toBeInTheDocument(),
    );

    // The section header toggles the form back on and off.
    fireEvent.click(screen.getAllByRole('button', { name: /^Log interaction$/ })[1]);
    expect(screen.getByPlaceholderText(/Describe the interaction\.\.\./i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(screen.queryByPlaceholderText(/Describe the interaction\.\.\./i)).not.toBeInTheDocument();
  });

  it('reports interaction creation failures through handleFirestoreError', async () => {
    (firestore.addDoc as any).mockRejectedValueOnce(new Error('denied'));
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    fireEvent.click(screen.getByRole('button', { name: /^Log interaction$/ }));
    fireEvent.change(screen.getByPlaceholderText(/Describe the interaction\.\.\./i), {
      target: { value: 'A doomed log' },
    });
    const form = screen.getByPlaceholderText(/Describe the interaction\.\.\./i).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() =>
      expect(handleFirestoreError).toHaveBeenCalledWith(
        expect.any(Error),
        'CREATE',
        'contacts/contact-abc/interactions',
      ),
    );
  });

  it('guards and cancels the interaction edit form', async () => {
    (firestore.onSnapshot as any).mockImplementation((q: any, s: any) => {
      if (q?.path?.includes('interactions')) {
        s({
          docs: [
            {
              id: 'inter-1',
              data: () => ({
                userId: 'user-123',
                userName: 'Admin Tony',
                content: 'Old content',
                dateTime: '2026-06-15T08:00',
                type: 'interaction',
              }),
            },
          ],
        });
      } else {
        s({ docs: [] });
      }
      return vi.fn();
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    fireEvent.click(screen.getByRole('button', { name: /Interactions/i }));
    await screen.findByText('Old content');

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));

    // Change dateTime and type fields.
    const dateInput = screen.getByDisplayValue('2026-06-15T08:00');
    fireEvent.change(dateInput, { target: { value: '2026-06-16T09:30' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'meeting' } });

    // Empty content guard: Save does nothing.
    const textareas = screen.getAllByRole('textbox');
    const textarea = textareas.find((ta) => (ta as any).value === 'Old content') || textareas[0];
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(firestore.updateDoc).not.toHaveBeenCalled();

    // Cancel closes the edit form.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByDisplayValue('2026-06-16T09:30')).not.toBeInTheDocument();
  });

  // ── Prayer form ───────────────────────────────────────────────────

  it('guards, reports and cancels prayer creation', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    fireEvent.click(screen.getByRole('button', { name: /^Add prayer$/ }));

    // Failure path with context filled.
    (firestore.addDoc as any).mockRejectedValueOnce(new Error('denied'));
    fireEvent.change(screen.getByPlaceholderText(/John's family back home/i), {
      target: { value: 'Finals week' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Any background worth knowing/i), {
      target: { value: 'Three exams' },
    });
    await waitFor(() => {
      const form = screen.getByPlaceholderText(/John's family back home/i).closest('form')!;
      expect(form.querySelector('button[type="submit"]')!).not.toBeDisabled();
    });
    const form = screen.getByPlaceholderText(/John's family back home/i).closest('form')!;
    fireEvent.click(form.querySelector('button[type="submit"]')!);

    await waitFor(() =>
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'CREATE', 'prayers'),
    );

    // Toggle the form off.
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(screen.queryByPlaceholderText(/John's family back home/i)).not.toBeInTheDocument();
  });

  // ── Tag persistence failure ───────────────────────────────────────

  it('reverts the tag input when the tag write fails', async () => {
    (firestore.updateDoc as any).mockRejectedValueOnce(new Error('denied'));
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    await screen.findByText('John Doe');

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    fireEvent.change(screen.getByPlaceholderText(/new tag/i), {
      target: { value: 'bad-tag' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/new tag/i), { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(handleFirestoreError).toHaveBeenCalled());
    expect(screen.queryByText('bad-tag')).not.toBeInTheDocument();
  });

  // ── Aside metadata ────────────────────────────────────────────────

  it('derives the added-by name from the users snapshot when createdByName is missing', async () => {
    (firestore.onSnapshot as any).mockImplementation((q: any, s: any) => {
      if (q?.path === 'users') {
        s({ docs: [{ id: 'adder-1', data: () => ({ name: 'Grace Hopper', role: 'admin' }) }] });
      } else {
        s({ docs: [] });
      }
      return vi.fn();
    });

    const contactWithAddedBy = {
      ...mockContact,
      addedBy: 'adder-1',
      createdBy: undefined,
      createdByName: undefined,
    };
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={contactWithAddedBy} />);

    expect(await screen.findAllByText(/Grace Hopper/)).toHaveLength(2);
  });

  it('closes the share sheet with its Cancel button', async () => {
    (firestore.onSnapshot as any).mockImplementation((q: any, s: any) => {
      if (q?.path === 'users') {
        s({ docs: [{ id: 'user-789', data: () => ({ name: 'Other User', role: 'Trainee' }) }] });
      } else {
        s({ docs: [] });
      }
      return vi.fn();
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    await screen.findByText('John Doe');

    fireEvent.click(screen.getByRole('button', { name: /add someone/i }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  // ── Skeleton loading states ───────────────────────────────────────

  it('shows skeletons while interactions, prayers and activities are loading', async () => {
    (firestore.onSnapshot as any).mockImplementation(() => vi.fn());

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    fireEvent.click(screen.getByRole('button', { name: /Interactions/i }));
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /^Prayer\s*\d*$/ }));
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /History/i }));
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  // ── Mobile layout ─────────────────────────────────────────────────

  it('renders the mobile layout with dropdown switcher, edit header and tag chips', async () => {
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    try {
      render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

      // Mobile hero chips + Edit button.
      expect(screen.getAllByText('leadership').length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
      expect(screen.getByText('Edit details')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

      // Dropdown tab switcher.
      const select = document.querySelector('.cdm-select') as HTMLSelectElement;
      expect(select).toBeTruthy();
      fireEvent.change(select, { target: { value: 'interactions' } });
      expect(screen.getByText('Every conversation')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'matchMedia', { writable: true, value: original });
    }
  });

  // ── Audit hover ───────────────────────────────────────────────────

  it('toggles hover state on audit items', async () => {
    (firestore.onSnapshot as any).mockImplementation((q: any, s: any) => {
      if (q?.path === 'activities') {
        s({
          docs: [
            {
              id: 'act-1',
              data: () => ({
                action: 'created contact',
                targetId: 'contact-abc',
                targetName: 'John Doe',
                targetType: 'contact',
                type: 'create',
                userName: 'Admin Tony',
                createdAt: new Date().toISOString(),
              }),
            },
          ],
        });
      } else {
        s({ docs: [] });
      }
      return vi.fn();
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);
    fireEvent.click(screen.getByRole('button', { name: /History/i }));
    await screen.findByText('created contact');

    const item = screen.getByText('created contact').closest('.group')!;
    fireEvent.mouseEnter(item);
    fireEvent.mouseLeave(item);
    expect(item).toBeInTheDocument();
  });

  it('records frecency open on mount and records close demotion if quickly closed without action', async () => {
    const uid = 'user-123';
    const { unmount } = render(
      <ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />
    );

    // Initial mount records open
    const scoreAfterOpen = Frecency.getScore(uid, mockContact.id);
    expect(scoreAfterOpen).toBeGreaterThan(0);

    // Close immediately via close button
    const closeBtn = screen.getByTitle('Close');
    fireEvent.click(closeBtn);

    expect(mockOnClose).toHaveBeenCalled();
    const scoreAfterQuickClose = Frecency.getScore(uid, mockContact.id);
    // Score should be demoted due to quick close event
    expect(scoreAfterQuickClose).toBeLessThan(scoreAfterOpen);
  });

  it('updates sinceText and sinceBy when live interaction subcollection or contact snapshot updates', async () => {
    let interactionListener: any = null;
    (firestore.onSnapshot as any).mockImplementation((q: any, callback: any) => {
      if (q?.path?.includes('interactions')) {
        interactionListener = callback;
        callback({
          docs: [
            {
              id: 'inter-1',
              data: () => ({
                userId: 'user-1',
                userName: 'Sarah Chen',
                content: 'First interaction',
                dateTime: '2026-08-10T10:00:00Z',
                createdAt: '2026-08-10T10:00:00Z',
              }),
            },
          ],
        });
      } else {
        callback({ docs: [] });
      }
      return vi.fn();
    });

    render(
      <ContactDetailsModal
        isOpen={true}
        onClose={mockOnClose}
        contact={{
          ...mockContact,
          lastContactedDate: undefined,
          lastContactedBy: undefined,
        }}
      />
    );

    // Initial interaction is Sarah Chen on Aug 10
    expect(screen.getByText(/contacted by Sarah Chen/i)).toBeInTheDocument();

    // Now simulate a newer interaction logged by Tony Wang
    await act(async () => {
      if (interactionListener) {
        interactionListener({
          docs: [
            {
              id: 'inter-1',
              data: () => ({
                userId: 'user-1',
                userName: 'Sarah Chen',
                content: 'First interaction',
                dateTime: '2026-08-10T10:00:00Z',
                createdAt: '2026-08-10T10:00:00Z',
              }),
            },
            {
              id: 'inter-2',
              data: () => ({
                userId: 'user-2',
                userName: 'Tony Wang',
                content: 'Latest interaction',
                dateTime: '2026-08-19T14:00:00Z',
                createdAt: '2026-08-19T14:00:00Z',
              }),
            },
          ],
        });
      }
    });

    expect(screen.getByText(/contacted by Tony Wang/i)).toBeInTheDocument();
  });
});

