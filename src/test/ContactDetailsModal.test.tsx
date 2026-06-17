import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    collection: vi.fn().mockReturnValue({ id: 'mock-collection-id' }),
    doc: vi.fn().mockReturnValue({ id: 'mock-doc-id' }),
    updateDoc: vi.fn().mockResolvedValue(true),
    addDoc: vi.fn().mockResolvedValue({ id: 'mock-new-id' }),
    deleteDoc: vi.fn().mockResolvedValue(true),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    onSnapshot: vi.fn((...args: any[]) => {
      const cb = args[1];
      if (typeof cb === 'function') {
        try {
          cb({ docs: [] });
        } catch (e) {
          // ignore
        }
      }
      return () => {};
    }),
    serverTimestamp: vi.fn(),
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
});
