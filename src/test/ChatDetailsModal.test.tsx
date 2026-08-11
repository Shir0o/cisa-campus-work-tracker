import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChatDetailsModal from '../components/modals/ChatDetailsModal';
import * as firestore from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';
import * as chatService from '../services/chat';
import { useLayout } from '../App';

// Mock Auth
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// Mock Layout
vi.mock('../App', () => ({
  useLayout: vi.fn(),
}));

// Mock Firebase
vi.mock('../lib/firebase', () => ({
  db: 'mock-db',
}));

// Mock Firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn().mockReturnValue('mock-collection'),
  query: vi.fn().mockReturnValue('mock-query'),
  where: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  doc: vi.fn().mockReturnValue('mock-doc'),
  onSnapshot: vi.fn(),
}));

// Mock Chat Service
vi.mock('../services/chat', () => ({
  inviteToGroup: vi.fn().mockResolvedValue(undefined),
  leaveGroup: vi.fn().mockResolvedValue(undefined),
  deleteChatRoom: vi.fn().mockResolvedValue(undefined),
  canRemoveConvForEveryone: vi.fn().mockImplementation((r: any, uid: any, isAdmin: any) => Boolean(isAdmin || (r && r.createdById === uid))),
}));

// Mock motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockGroupRoom = {
  id: 'room-g1',
  type: 'group' as const,
  name: 'Youth Bible Study',
  memberIds: ['u1', 'u2'],
  createdById: 'u1',
  createdByName: 'User One',
  createdAt: { seconds: 123456 },
};

const mockDirectRoom = {
  id: 'room-d1',
  type: 'direct' as const,
  memberIds: ['u1', 'u2'],
  createdById: 'u1',
  createdByName: 'User One',
  createdAt: { seconds: 123456 },
};

const mockUsers = [
  { uid: 'u1', displayName: 'User One', email: 'user1@example.com', role: 'admin', approved: true },
  { uid: 'u2', displayName: 'Alice Green', email: 'alice@example.com', role: 'operator', approved: true },
  { uid: 'u3', displayName: 'Bob Brown', email: 'bob@example.com', role: 'viewer', approved: true },
];

describe('ChatDetailsModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnLeftGroup = vi.fn();
  const mockSetSelectedContact = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { uid: 'u1', displayName: 'User One' },
      role: 'admin',
    });
    (useLayout as any).mockReturnValue({
      setSelectedContact: mockSetSelectedContact,
    });
  });

  const setupOnSnapshot = (usersData: any[]) => {
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      successCallback({
        forEach: (fn: any) => {
          usersData.forEach((u) => {
            fn({
              id: u.uid,
              data: () => {
                const { uid, ...rest } = u;
                return rest;
              },
            });
          });
        },
      });
      return vi.fn(); // Unsubscribe
    });
  };

  it('renders group details, members lists, and leaving option correctly', async () => {
    setupOnSnapshot(mockUsers);
    render(
      <ChatDetailsModal
        isOpen={true}
        onClose={mockOnClose}
        room={mockGroupRoom}
        onLeftGroup={mockOnLeftGroup}
      />
    );

    expect(screen.getByText('Group Details')).toBeInTheDocument();
    expect(screen.getByText('Youth Bible Study')).toBeInTheDocument();
    expect(screen.getByText('User One')).toBeInTheDocument();
    expect(screen.getByText('Alice Green')).toBeInTheDocument();
    expect(screen.getByText('Leave Group')).toBeInTheDocument();
  });

  it('allows inviting new members not already in the group', async () => {
    setupOnSnapshot(mockUsers);
    render(
      <ChatDetailsModal
        isOpen={true}
        onClose={mockOnClose}
        room={mockGroupRoom}
        onLeftGroup={mockOnLeftGroup}
      />
    );

    // Expand Invite section
    const inviteToggle = screen.getByRole('button', { name: /Invite new members/i });
    fireEvent.click(inviteToggle);

    // Select Bob Brown
    const bobCheckboxContainer = screen.getByText('Bob Brown').closest('div');
    expect(bobCheckboxContainer).toBeTruthy();
    fireEvent.click(bobCheckboxContainer!);

    // Click Add Selected
    const addBtn = screen.getByRole('button', { name: /Add Selected/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(chatService.inviteToGroup).toHaveBeenCalledWith(
        'room-g1',
        ['u3'],
        ['Bob Brown'],
        'User One'
      );
    });
  });

  it('calls leaveGroup and closes modal when Leave Group is clicked and confirmed', async () => {
    setupOnSnapshot(mockUsers);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

    render(
      <ChatDetailsModal
        isOpen={true}
        onClose={mockOnClose}
        room={mockGroupRoom}
        onLeftGroup={mockOnLeftGroup}
      />
    );

    const leaveBtn = screen.getByRole('button', { name: /Leave Group/i });
    fireEvent.click(leaveBtn);

    await waitFor(() => {
      expect(chatService.leaveGroup).toHaveBeenCalledWith('room-g1', { uid: 'u1', displayName: 'User One' });
      expect(mockOnLeftGroup).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('renders direct chat details correctly', async () => {
    setupOnSnapshot(mockUsers);
    (firestore.getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ email: 'alice@example.com' }),
    });
    (firestore.getDocs as any).mockResolvedValueOnce({
      empty: false,
      docs: [{
        id: 'contact-c2',
        data: () => ({ name: 'Alice Green', email: 'alice@example.com' }),
      }],
    });

    render(
      <ChatDetailsModal
        isOpen={true}
        onClose={mockOnClose}
        room={mockDirectRoom}
        onLeftGroup={mockOnLeftGroup}
      />
    );

    expect(screen.getByText('Conversation Details')).toBeInTheDocument();
    expect(await screen.findByText('View Directory Contact Profile')).toBeInTheDocument();

    const viewProfileBtn = screen.getByText('View Directory Contact Profile');
    fireEvent.click(viewProfileBtn);

    expect(mockSetSelectedContact).toHaveBeenCalledWith({
      id: 'contact-c2',
      name: 'Alice Green',
      email: 'alice@example.com',
    });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('filters out cisa-* test accounts from members listing', async () => {
    const usersWithTest = [
      ...mockUsers,
      { uid: 'u4', displayName: 'cisa-test-user', email: 'cisa-test@example.com', role: 'viewer', approved: true },
    ];
    setupOnSnapshot(usersWithTest);
    render(
      <ChatDetailsModal
        isOpen={true}
        onClose={mockOnClose}
        room={mockGroupRoom}
        onLeftGroup={mockOnLeftGroup}
      />
    );

    expect(screen.getByText('Alice Green')).toBeInTheDocument();
    expect(screen.queryByText('cisa-test-user')).not.toBeInTheDocument();
  });
});
