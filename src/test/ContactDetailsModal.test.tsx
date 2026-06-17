import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import * as firestore from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';

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
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-123', displayName: 'Admin Tony' },
      isAdmin: true,
    });
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
    expect(screen.getByText('Main Hall')).toBeInTheDocument();
    expect(screen.getByText('Christian')).toBeInTheDocument();
  });

  it('allows clicking tabs and switching views', async () => {
    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // overview is active
    expect(screen.getByText('Some notes about John Doe.')).toBeInTheDocument();

    // Click Conversations tab (labeled "Conversations")
    const interactionsTab = screen.getByRole('button', { name: /Conversations/i });
    fireEvent.click(interactionsTab);
    expect(screen.getByText('Every conversation')).toBeInTheDocument();

    // Click Prayer tab
    const prayerTab = screen.getByRole('button', { name: /^Prayer\s*\d*$/ });
    fireEvent.click(prayerTab);
    expect(screen.getByText("Prayers we're carrying")).toBeInTheDocument();

    // Click Discussion tab (labeled "Discussion")
    const commentsTab = screen.getByRole('button', { name: /Discussion/i });
    fireEvent.click(commentsTab);
    expect(screen.getByPlaceholderText(/Add a comment to the discussion\.\.\./i)).toBeInTheDocument();
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
    fireEvent.click(commentsTab);

    // Type comment
    const commentInput = screen.getByPlaceholderText(/Add a comment to the discussion\.\.\./i);
    fireEvent.change(commentInput, { target: { value: 'John is doing great!' } });

    // Wait for React to flush state and enable the button by re-querying it
    await waitFor(() => {
      const currentForm = screen.getByPlaceholderText(/Add a comment to the discussion\.\.\./i).closest('form')!;
      const btn = currentForm.querySelector('button[type="submit"]')!;
      expect(btn).not.toBeDisabled();
    });
    
    const submitBtn = screen.getByPlaceholderText(/Add a comment to the discussion\.\.\./i).closest('form')!.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          text: 'John is doing great!',
        })
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

  it('allows carrying a prayer', async () => {
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
    const firstNameInput = screen.getByPlaceholderText('e.g. Alex');
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
    // We need some initial comments for comments snapshot
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      // If querying comments subcollection
      if (q?.path?.includes('comments')) {
        successCallback({
          docs: [
            {
              id: 'comment-1',
              data: () => ({
                userId: 'user-abc',
                userName: 'Alice',
                text: 'Hello world',
                createdAt: new Date().toISOString(),
              }),
            },
          ],
        });
      }
      return vi.fn();
    });

    render(<ContactDetailsModal isOpen={true} onClose={mockOnClose} contact={mockContact} />);

    // Click Discussion tab
    const commentsTab = screen.getByRole('button', { name: /Discussion/i });
    fireEvent.click(commentsTab);

    // Click Reply on Alice's comment
    const replyBtn = screen.getByRole('button', { name: /Reply/i });
    fireEvent.click(replyBtn);

    // Type reply
    const replyInput = screen.getByPlaceholderText('Type your reply...');
    fireEvent.change(replyInput, { target: { value: 'This is a reply' } });

    // Submit reply
    const submitBtn = screen.getByPlaceholderText('Type your reply...').closest('form')!.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          text: 'This is a reply',
          parentId: 'comment-1',
        })
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
});
