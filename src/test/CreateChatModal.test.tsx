import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CreateChatModal from '../components/modals/CreateChatModal';
import * as firestore from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';
import * as chatService from '../services/chat';

// Mock Auth
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// Mock Firebase
vi.mock('../lib/firebase', () => ({
  db: 'mock-db',
}));

// Mock Firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn().mockReturnValue('mock-collection'),
  query: vi.fn().mockReturnValue('mock-query'),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  doc: vi.fn().mockReturnValue('mock-doc'),
}));

// Mock Chat Service
vi.mock('../services/chat', () => ({
  getOrCreateDirectChat: vi.fn().mockResolvedValue('direct-room-id'),
  createGroupChat: vi.fn().mockResolvedValue('group-room-id'),
  createAnnouncementRoom: vi.fn().mockResolvedValue('announcement-room-id'),
}));

// Mock motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockUsers = [
  { uid: 'u2', displayName: 'Alice Green', email: 'alice@example.com', approved: true },
  { uid: 'u3', displayName: 'Bob Brown', email: 'bob@example.com', approved: true },
];

describe('CreateChatModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSelectRoom = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { uid: 'u1', displayName: 'Current User' },
      role: 'manager',
    });
  });

  const asFullTimer = () =>
    (useAuth as any).mockReturnValue({
      user: { uid: 'u1', displayName: 'Current User' },
      role: 'admin',
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

  it('renders tab buttons and user list correctly in Direct Message tab', async () => {
    setupOnSnapshot(mockUsers);
    render(
      <CreateChatModal
        isOpen={true}
        onClose={mockOnClose}
        onSelectRoom={mockOnSelectRoom}
      />
    );

    expect(screen.getByText('Start Conversation')).toBeInTheDocument();
    expect(screen.getByText('Alice Green')).toBeInTheDocument();
    expect(screen.getByText('Bob Brown')).toBeInTheDocument();
  });

  it('filters users list by search input', async () => {
    setupOnSnapshot(mockUsers);
    render(
      <CreateChatModal
        isOpen={true}
        onClose={mockOnClose}
        onSelectRoom={mockOnSelectRoom}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search users by name or email/i);
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    expect(screen.getByText('Alice Green')).toBeInTheDocument();
    expect(screen.queryByText('Bob Brown')).not.toBeInTheDocument();
  });

  it('creates direct chat and selects room when a user is clicked', async () => {
    setupOnSnapshot(mockUsers);
    render(
      <CreateChatModal
        isOpen={true}
        onClose={mockOnClose}
        onSelectRoom={mockOnSelectRoom}
      />
    );

    const userButton = screen.getByText('Alice Green');
    fireEvent.click(userButton);

    await waitFor(() => {
      expect(chatService.getOrCreateDirectChat).toHaveBeenCalledWith(
        { uid: 'u1', displayName: 'Current User' },
        { uid: 'u2', displayName: 'Alice Green' }
      );
      expect(mockOnSelectRoom).toHaveBeenCalledWith('direct-room-id');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('allows creating a group chat with multiple selected users', async () => {
    setupOnSnapshot(mockUsers);
    render(
      <CreateChatModal
        isOpen={true}
        onClose={mockOnClose}
        onSelectRoom={mockOnSelectRoom}
      />
    );

    // Switch to Group Chat tab
    const groupTabButton = screen.getByRole('button', { name: /New Group/i });
    fireEvent.click(groupTabButton);

    // Enter group name
    const groupNameInput = screen.getByPlaceholderText(/e.g. Outreach Team/i);
    fireEvent.change(groupNameInput, { target: { value: 'My Group Chat' } });

    // Select Alice Green
    const aliceCheckboxContainer = screen.getByText('Alice Green').closest('div');
    expect(aliceCheckboxContainer).toBeTruthy();
    fireEvent.click(aliceCheckboxContainer!);

    // Submit form
    const createButton = screen.getByRole('button', { name: /Create Group/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(chatService.createGroupChat).toHaveBeenCalledWith(
        'My Group Chat',
        ['u2'],
        { uid: 'u1', displayName: 'Current User' }
      );
      expect(mockOnSelectRoom).toHaveBeenCalledWith('group-room-id');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  // Announcements — a room the whole audience reads and only Full-timers post
  // to. The tab mirrors the firestore.rules gate on creating one.
  it('offers the Announcement tab only to a Full-timer', async () => {
    setupOnSnapshot(mockUsers);
    const { unmount } = render(
      <CreateChatModal isOpen={true} onClose={mockOnClose} onSelectRoom={mockOnSelectRoom} />
    );
    expect(screen.queryByRole('button', { name: /Announcement/i })).not.toBeInTheDocument();
    unmount();

    asFullTimer();
    render(<CreateChatModal isOpen={true} onClose={mockOnClose} onSelectRoom={mockOnSelectRoom} />);
    expect(screen.getByRole('button', { name: /Announcement/i })).toBeInTheDocument();
  });

  it('creates an announcement room, and says who can post in it', async () => {
    asFullTimer();
    setupOnSnapshot(mockUsers);
    render(<CreateChatModal isOpen={true} onClose={mockOnClose} onSelectRoom={mockOnSelectRoom} />);

    fireEvent.click(screen.getByRole('button', { name: /^Announcement$/i }));
    expect(screen.getByText(/only Full-timers can post/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/e.g. Weekly notes/i), {
      target: { value: 'Weekly notes' },
    });
    fireEvent.click(screen.getByText('Alice Green').closest('div')!);
    fireEvent.click(screen.getByRole('button', { name: /Create Announcement/i }));

    await waitFor(() => {
      expect(chatService.createAnnouncementRoom).toHaveBeenCalledWith('Weekly notes', ['u2'], {
        uid: 'u1',
        displayName: 'Current User',
      });
      expect(chatService.createGroupChat).not.toHaveBeenCalled();
      expect(mockOnSelectRoom).toHaveBeenCalledWith('announcement-room-id');
    });
  });

  it('filters out cisa-* test accounts from user list', async () => {
    const usersWithTest = [
      ...mockUsers,
      { uid: 'u4', displayName: 'cisa-test-user', email: 'cisa-test@example.com', approved: true },
    ];
    setupOnSnapshot(usersWithTest);
    render(
      <CreateChatModal
        isOpen={true}
        onClose={mockOnClose}
        onSelectRoom={mockOnSelectRoom}
      />
    );

    expect(screen.getByText('Alice Green')).toBeInTheDocument();
    expect(screen.queryByText('cisa-test-user')).not.toBeInTheDocument();
  });
});
