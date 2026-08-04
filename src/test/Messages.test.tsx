import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Messages from '../views/Messages';
import * as firestore from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import * as chatService from '../services/chat';
import { MemoryRouter } from 'react-router-dom';
import { setTodoDone } from '../lib/todos';

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

// Mock Todos
vi.mock('../lib/todos', () => ({
  setTodoDone: vi.fn().mockResolvedValue(undefined),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock Firestore
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db: any, ...paths: string[]) => ({ path: paths.join('/') })),
    query: vi.fn((col: any) => col),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    where: vi.fn(),
    doc: vi.fn((_db: any, ...paths: string[]) => ({ path: paths.join('/') })),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: 'Alice', photoURL: '' }),
    }),
  };
});

// Mock Chat Service
vi.mock('../services/chat', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

// Mock modals to support full callback interaction
vi.mock('../components/modals/CreateChatModal', () => ({
  default: ({ isOpen, onClose, onSelectRoom }: any) => isOpen ? (
    <div data-testid="create-chat-modal">
      <button onClick={() => { onSelectRoom('room2'); onClose(); }}>Select Room 2</button>
      <button onClick={onClose}>Close</button>
    </div>
  ) : null,
}));
vi.mock('../components/modals/ChatDetailsModal', () => ({
  default: ({ isOpen, onClose, onLeftGroup }: any) => isOpen ? (
    <div data-testid="chat-details-modal">
      <button onClick={() => { onLeftGroup(); onClose(); }}>Leave Group</button>
      <button onClick={onClose}>Close</button>
    </div>
  ) : null,
}));
vi.mock('../components/modals/AttachDataModal', () => ({
  default: ({ isOpen, onClose, onAttach }: any) => isOpen ? (
    <div data-testid="attach-data-modal">
      <button onClick={() => onAttach({ type: 'contact', id: 'c1', name: 'Alice' })}>Attach</button>
      <button onClick={onClose}>Close</button>
    </div>
  ) : null,
}));

// Mock motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockRooms = [
  {
    id: 'room1',
    type: 'group' as const,
    name: 'Trainees Chat',
    memberIds: ['u1', 'u2'],
    createdById: 'u2',
    createdByName: 'Alice',
    createdAt: { seconds: 100000 },
    lastMessage: { text: 'Hello trainees', senderId: 'u2', senderName: 'Alice', timestamp: { seconds: 100005 } },
  },
];

const mockMessages = [
  {
    id: 'm1',
    roomId: 'room1',
    text: 'Hello trainees',
    senderId: 'u2',
    senderName: 'Alice',
    timestamp: { seconds: 100005 },
    type: 'text' as const,
  },
];

const stableUser = { uid: 'u1', displayName: 'Current User', photoURL: 'photo-url' };
const stableAuthValue = {
  user: stableUser,
  role: 'admin',
};

describe('Messages View Component', () => {
  const mockSetSelectedContact = vi.fn();
  const mockOpenLogInteraction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue(stableAuthValue);
    (useLayout as any).mockReturnValue({
      setSelectedContact: mockSetSelectedContact,
      openLogInteraction: mockOpenLogInteraction,
    });

    // Default dynamic path-aware onSnapshot mock
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      const isMessages = q && q.path && q.path.includes('messages');
      const dataList = isMessages ? mockMessages : mockRooms;
      successCallback({
        forEach: (fn: any) => {
          dataList.forEach((item) => {
            fn({
              id: item.id,
              data: () => {
                const { id, ...rest } = item;
                return rest;
              },
            });
          });
        },
      });
      return vi.fn(); // Unsubscribe
    });
  });

  it('renders empty state when no active chat room is selected', async () => {
    (firestore.onSnapshot as any).mockImplementationOnce((q: any, successCallback: any) => {
      successCallback({
        forEach: (fn: any) => {}
      });
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    expect(screen.getByText('Fellowship Messaging')).toBeInTheDocument();
    expect(screen.getByText(/Connect with the team in real-time/i)).toBeInTheDocument();
  });

  it('renders chat list and messages, and handles composing a new message', async () => {
    const { container } = render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    // Verify rooms sidebar rendered
    expect(screen.getByText('Trainees Chat')).toBeInTheDocument();
    
    // Select the first room
    const roomBtn = screen.getByText('Trainees Chat').closest('button');
    expect(roomBtn).toBeTruthy();
    fireEvent.click(roomBtn!);

    // Verify chat messages rendered
    await waitFor(() => {
      const messagesStream = container.querySelector('.overflow-y-auto.p-6');
      expect(messagesStream).toBeTruthy();
      expect(within(messagesStream as HTMLElement).queryByText('Hello trainees')).not.toBeNull();
    });

    // Type a message in composer
    const textarea = screen.getByPlaceholderText(/Type a message/i);
    fireEvent.change(textarea, { target: { value: 'Welcome to the team!' } });

    // Wait for the send button to be enabled
    const sendButton = container.querySelector('button[type="submit"]');
    expect(sendButton).toBeTruthy();
    await waitFor(() => {
      expect(sendButton).not.toHaveAttribute('disabled');
    });

    // Click Send
    fireEvent.click(sendButton!);

    await waitFor(() => {
      expect(chatService.sendMessage).toHaveBeenCalledWith(
        'room1',
        'Welcome to the team!',
        { uid: 'u1', displayName: 'Current User', photoURL: 'photo-url' },
        [],
        ['u1', 'u2']
      );
    });
  });

  it('opens CreateChatModal when New Chat button is clicked', async () => {
    (firestore.onSnapshot as any).mockImplementationOnce((q: any, successCallback: any) => {
      successCallback({
        forEach: (fn: any) => {}
      });
      return vi.fn();
    });
    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    const newChatBtn = screen.getByTitle('Start Chat');
    fireEvent.click(newChatBtn);

    expect(screen.getByTestId('create-chat-modal')).toBeInTheDocument();
  });

  it('supports autocomplete mentions when typing @ symbol', async () => {
    const { container } = render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    const roomBtn = screen.getByText('Trainees Chat').closest('button');
    fireEvent.click(roomBtn!);

    await waitFor(() => {
      const messagesStream = container.querySelector('.overflow-y-auto.p-6');
      expect(messagesStream).toBeTruthy();
      expect(within(messagesStream as HTMLElement).queryByText('Hello trainees')).not.toBeNull();
    }, { timeout: 500 });

    const textarea = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement;
    textarea.selectionStart = 1;
    textarea.selectionEnd = 1;
    fireEvent.change(textarea, { target: { value: '@' } });

    await waitFor(() => {
      const mentionDropdown = container.querySelector('.absolute.bottom-full');
      expect(mentionDropdown).toBeTruthy();
      expect(within(mentionDropdown as HTMLElement).queryByText('Alice')).not.toBeNull();
    }, { timeout: 500 });

    const mentionDropdown = container.querySelector('.absolute.bottom-full');
    fireEvent.click(within(mentionDropdown as HTMLElement).getByText('Alice'));
    expect(textarea.value).toBe('@Alice ');
  });

  it('handles attaching reference data cards and removing them', async () => {
    const { container } = render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    const roomBtn = screen.getByText('Trainees Chat').closest('button');
    fireEvent.click(roomBtn!);

    await waitFor(() => {
      const messagesStream = container.querySelector('.overflow-y-auto.p-6');
      expect(messagesStream).toBeTruthy();
      expect(within(messagesStream as HTMLElement).queryByText('Hello trainees')).not.toBeNull();
    }, { timeout: 500 });

    const attachTrigger = screen.getByTitle('Attach reference data');
    fireEvent.click(attachTrigger);

    await waitFor(() => {
      expect(screen.queryByText('Attach')).not.toBeNull();
    }, { timeout: 500 });
    fireEvent.click(screen.getByText('Attach'));

    await waitFor(() => {
      const attachTray = container.querySelector('.flex.flex-wrap.gap-2.py-2');
      expect(attachTray).toBeTruthy();
      expect(within(attachTray as HTMLElement).queryByText('Alice')).not.toBeNull();
    }, { timeout: 500 });

    const removeCardBtn = container.querySelector('.flex.flex-wrap.gap-2.py-2 button');
    expect(removeCardBtn).toBeTruthy();
    fireEvent.click(removeCardBtn!);

    await waitFor(() => {
      const attachTray = container.querySelector('.flex.flex-wrap.gap-2.py-2');
      expect(attachTray).toBeNull();
    }, { timeout: 500 });
  });

  it('handles non-admin users query (roles restriction)', async () => {
    (useAuth as any).mockReturnValue({
      user: stableUser,
      role: 'operator',
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    expect(firestore.where).toHaveBeenCalledWith('memberIds', 'array-contains', 'u1');
  });

  it('handles direct message rooms and fetches other member details from firestore if not cached', async () => {
    const mockDirectRooms = [
      {
        id: 'room-dm',
        type: 'direct' as const,
        memberIds: ['u1', 'u3'],
        createdAt: { seconds: 100000 },
        lastMessage: { text: 'Hey there', senderId: 'u3', senderName: 'Bob', timestamp: { seconds: 100005 } },
      },
    ];

    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      const isMessages = q && q.path && q.path.includes('messages');
      const dataList = isMessages ? [] : mockDirectRooms;
      successCallback({
        forEach: (fn: any) => {
          dataList.forEach((item) => {
            fn({
              id: item.id,
              data: () => {
                const { id, ...rest } = item;
                return rest;
              },
            });
          });
        },
      });
      return vi.fn();
    });

    (firestore.getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: 'Bob Ross', photoURL: 'bob-photo' }),
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    // Verify it loads other member profile details and shows the name
    expect(await screen.findByText('Bob Ross')).toBeInTheDocument();
  });

  it('deduplicates multiple direct message channels for the same recipient in the sidebar', async () => {
    const mockDuplicateDirectRooms = [
      {
        id: 'room-dm-1',
        type: 'direct' as const,
        memberIds: ['u1', 'u3'],
        createdAt: { seconds: 100000 },
        lastMessage: { text: 'Latest message', senderId: 'u3', senderName: 'Bob', timestamp: { seconds: 100010 } },
      },
      {
        id: 'room-dm-2',
        type: 'direct' as const,
        memberIds: ['u1', 'u3'],
        createdAt: { seconds: 90000 },
        lastMessage: { text: 'Older message', senderId: 'u3', senderName: 'Bob', timestamp: { seconds: 90005 } },
      },
    ];

    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      const isMessages = q && q.path && q.path.includes('messages');
      const dataList = isMessages ? [] : mockDuplicateDirectRooms;
      successCallback({
        forEach: (fn: any) => {
          dataList.forEach((item) => {
            fn({
              id: item.id,
              data: () => {
                const { id, ...rest } = item;
                return rest;
              },
            });
          });
        },
      });
      return vi.fn();
    });

    (firestore.getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: 'Bob Ross', photoURL: 'bob-photo' }),
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    // Verify Bob Ross only appears ONCE in the sidebar
    const bobElements = await screen.findAllByText('Bob Ross');
    expect(bobElements).toHaveLength(1);
    expect(screen.getByText('Latest message')).toBeInTheDocument();
    expect(screen.queryByText('Older message')).not.toBeInTheDocument();
  });

  it('handles unread indicators correctly based on localStorage', async () => {
    localStorage.removeItem('chat_read_room1');

    const { unmount } = render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    // Unread badge should exist
    expect(screen.getByText('Trainees Chat').closest('button')?.querySelector('.bg-error')).toBeTruthy();
    unmount();

    // Mark as read
    localStorage.setItem('chat_read_room1', (100006 * 1000).toString());

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    // Unread badge should not be present
    expect(screen.getByText('Trainees Chat').closest('button')?.querySelector('.bg-error')).toBeFalsy();
  });

  it('handles clicking different attachment cards to trigger navigation/detail actions', async () => {
    const mockMessagesWithAttachments = [
      {
        id: 'm-attachments',
        roomId: 'room1',
        text: 'Rich data cards',
        senderId: 'u2',
        senderName: 'Alice',
        timestamp: { seconds: 100005 },
        type: 'text' as const,
        attachments: [
          { type: 'contact', id: 'c-1', name: 'Contact Attachment', subtitle: 'Developer' },
          { type: 'interaction', id: 'i-1', name: 'Interaction Attachment', subtitle: 'Phone Call' },
          { type: 'todo', id: 't-1', name: 'Todo Attachment', subtitle: 'Pending', status: 'pending' },
          { type: 'event', id: 'e-1', name: 'Event Attachment', subtitle: '2026-07-01' },
          { type: 'prayer', id: 'p-1', name: 'Prayer Attachment', subtitle: 'Burdens' },
          { type: 'note', id: 'n-1', name: 'Note Attachment', subtitle: 'Coordination' },
          { type: 'feedback', id: 'f-1', name: 'Feedback Attachment', subtitle: 'Feature Request' },
        ],
      },
    ];

    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      const isMessages = q && q.path && q.path.includes('messages');
      const dataList = isMessages ? mockMessagesWithAttachments : mockRooms;
      successCallback({
        forEach: (fn: any) => {
          dataList.forEach((item) => {
            fn({
              id: item.id,
              data: () => {
                const { id, ...rest } = item;
                return rest;
              },
            });
          });
        },
      });
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Trainees Chat').closest('button')!);

    expect(await screen.findByText('Contact Attachment')).toBeInTheDocument();

    // 1. Contact attachment click
    const contactBtn = screen.getByText('Contact Attachment').closest('.rounded-xl');
    expect(contactBtn).toBeTruthy();

    (firestore.getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      id: 'c-1',
      data: () => ({ name: 'Contact Attachment', role: 'Developer' }),
    });

    fireEvent.click(contactBtn!);
    await waitFor(() => {
      expect(mockSetSelectedContact).toHaveBeenCalledWith({
        id: 'c-1',
        name: 'Contact Attachment',
        role: 'Developer',
      });
    });

    // 2. Interaction attachment click
    const interactionBtn = screen.getByText('Interaction Attachment').closest('.rounded-xl');
    fireEvent.click(interactionBtn!);
    expect(mockNavigate).toHaveBeenCalledWith('/history');

    // 3. Event attachment click
    const eventBtn = screen.getByText('Event Attachment').closest('.rounded-xl');
    fireEvent.click(eventBtn!);
    expect(mockNavigate).toHaveBeenCalledWith('/attendance');

    // 4. Prayer attachment click
    const prayerBtn = screen.getByText('Prayer Attachment').closest('.rounded-xl');
    fireEvent.click(prayerBtn!);
    expect(mockNavigate).toHaveBeenCalledWith('/prayer');

    // 5. Note attachment click
    const noteBtn = screen.getByText('Note Attachment').closest('.rounded-xl');
    fireEvent.click(noteBtn!);
    expect(mockNavigate).toHaveBeenCalledWith('/coordination');

    // 6. Feedback attachment click
    const feedbackBtn = screen.getByText('Feedback Attachment').closest('.rounded-xl');
    fireEvent.click(feedbackBtn!);
    expect(mockNavigate).toHaveBeenCalledWith('/admin/feedback');
  });

  it('handles checking/toggling a todo attachment', async () => {
    const mockMessagesWithTodo = [
      {
        id: 'm-todo',
        roomId: 'room1',
        text: 'Todo check',
        senderId: 'u2',
        senderName: 'Alice',
        timestamp: { seconds: 100005 },
        type: 'text' as const,
        attachments: [
          { type: 'todo', id: 'todo-1', name: 'Todo Attachment', subtitle: 'Pending', status: 'pending' },
        ],
      },
    ];

    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      const isMessages = q && q.path && q.path.includes('messages');
      const dataList = isMessages ? mockMessagesWithTodo : mockRooms;
      successCallback({
        forEach: (fn: any) => {
          dataList.forEach((item) => {
            fn({
              id: item.id,
              data: () => {
                const { id, ...rest } = item;
                return rest;
              },
            });
          });
        },
      });
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Trainees Chat').closest('button')!);

    expect(await screen.findByText('Todo Attachment')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    expect(setTodoDone).toHaveBeenCalledWith('todo-1', true);
  });

  it('handles room leaving callback from ChatDetailsModal', async () => {
    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Trainees Chat').closest('button')!);

    await waitFor(() => {
      expect(screen.getByTitle('Group details')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Group details'));

    await waitFor(() => {
      expect(screen.getByTestId('chat-details-modal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Leave Group'));

    await waitFor(() => {
      expect(screen.queryByTestId('chat-details-modal')).toBeNull();
    });

    expect(screen.getByText('Fellowship Messaging')).toBeInTheDocument();
  });

  it('handles room selection from CreateChatModal', async () => {
    const mockRoomsWithRoom2 = [
      ...mockRooms,
      {
        id: 'room2',
        type: 'group' as const,
        name: 'Second Chat Room',
        memberIds: ['u1', 'u2'],
        createdById: 'u1',
        createdByName: 'Current User',
        createdAt: { seconds: 100006 },
      }
    ];

    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      const isMessages = q && q.path && q.path.includes('messages');
      const dataList = isMessages ? [] : mockRoomsWithRoom2;
      successCallback({
        forEach: (fn: any) => {
          dataList.forEach((item) => {
            fn({
              id: item.id,
              data: () => {
                const { id, ...rest } = item;
                return rest;
              },
            });
          });
        },
      });
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTitle('Start Chat'));
    expect(screen.getByTestId('create-chat-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Select Room 2'));

    await waitFor(() => {
      expect(screen.queryByTestId('create-chat-modal')).toBeNull();
    });
    expect(await screen.findByText('No messages yet. Send a message to start the conversation!')).toBeInTheDocument();
  });

  it('handles errors when fetching rooms', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock rooms onSnapshot error
    (firestore.onSnapshot as any).mockImplementationOnce((q: any, successCallback: any, errorCallback: any) => {
      errorCallback(new Error('Mock onSnapshot room fetch error'));
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching rooms:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('handles errors when fetching messages', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock messages onSnapshot error
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any, errorCallback: any) => {
      const isMessages = q && q.path && q.path.includes('messages');
      if (isMessages) {
        errorCallback(new Error('Mock onSnapshot message fetch error'));
      } else {
        successCallback({
          forEach: (fn: any) => {
            mockRooms.forEach(item => fn({ id: item.id, data: () => item }));
          }
        });
      }
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Trainees Chat').closest('button')!);
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching messages:', expect.any(Error));
    });

    consoleErrorSpy.mockRestore();
  });

  it('handles input change edge cases for autocomplete mentions', async () => {
    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Trainees Chat').closest('button')!);
    const textarea = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement;

    // Typing with space after @ should not trigger mention
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    fireEvent.change(textarea, { target: { value: '@ ' } });
    expect(screen.queryByText('Mention member')).toBeNull();

    // Typing @Alice but clearing search
    textarea.selectionStart = 6;
    textarea.selectionEnd = 6;
    fireEvent.change(textarea, { target: { value: '@Alice' } });
    fireEvent.change(textarea, { target: { value: 'regular text' } });
    expect(screen.queryByText('Mention member')).toBeNull();
  });

  it('sends message on Enter key press without shift key', async () => {
    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Trainees Chat').closest('button')!);
    
    const textarea = screen.getByPlaceholderText(/Type a message/i);
    fireEvent.change(textarea, { target: { value: 'Press Enter message' } });

    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => {
      expect(chatService.sendMessage).toHaveBeenCalledWith(
        'room1',
        'Press Enter message',
        expect.any(Object),
        [],
        ['u1', 'u2']
      );
    });
  });

  it('triggers CreateChatModal when New Conversation is clicked in empty state', async () => {
    (firestore.onSnapshot as any).mockImplementationOnce((q: any, successCallback: any) => {
      successCallback({ forEach: () => {} });
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    const newConversationBtn = screen.getByText('New Conversation');
    fireEvent.click(newConversationBtn);

    expect(screen.getByTestId('create-chat-modal')).toBeInTheDocument();
  });

  it('filters out direct chat rooms with cisa-* test accounts', async () => {
    const mockDirectRooms = [
      {
        id: 'room-normal',
        type: 'direct' as const,
        memberIds: ['u1', 'u2'],
        createdById: 'u1',
        createdByName: 'User One',
        createdAt: { seconds: 123456 },
      },
      {
        id: 'room-cisa',
        type: 'direct' as const,
        memberIds: ['u1', 'u-cisa'],
        createdById: 'u1',
        createdByName: 'User One',
        createdAt: { seconds: 123456 },
      },
    ];

    // Mock direct users info in firestore
    (firestore.getDoc as any).mockImplementation((docRef: any) => {
      const path = docRef._path || (docRef.path as string) || '';
      if (path && path.includes('users/u2')) {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ displayName: 'Alice Green', email: 'alice@example.com' }),
        });
      }
      if (path && path.includes('users/u-cisa')) {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ displayName: 'cisa-test-account', email: 'cisa-test@example.com' }),
        });
      }
      return Promise.resolve({ exists: () => false });
    });

    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      // Return rooms list
      successCallback({
        forEach: (fn: any) => {
          mockDirectRooms.forEach(item => fn({ id: item.id, data: () => item }));
        }
      });
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    // Verify Alice Green direct room is rendered
    expect(await screen.findByText('Alice Green')).toBeInTheDocument();
    // Verify cisa-* test account direct room is NOT rendered
    expect(screen.queryByText('cisa-test-account')).not.toBeInTheDocument();
  });

  // Announcement rooms — everyone reads, only Full-timers post. The composer
  // has to disappear for everyone else, or the send fails at the rules layer
  // with no explanation.
  describe('announcement rooms', () => {
    const announcementRoom = {
      id: 'room-ann',
      type: 'announcement' as const,
      name: 'Weekly notes',
      memberIds: ['u1', 'u2'],
      createdById: 'u2',
      createdByName: 'Mei',
      createdAt: { seconds: 100000 },
      lastMessage: {
        text: 'Reading week is coming',
        senderId: 'u2',
        senderName: 'Mei',
        timestamp: { seconds: 100005 },
      },
    };

    const renderWithAnnouncement = () => {
      (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
        const isMessages = q && q.path && q.path.includes('messages');
        const dataList = isMessages ? mockMessages : [announcementRoom];
        successCallback({
          forEach: (fn: any) => {
            dataList.forEach((item) => {
              fn({
                id: item.id,
                data: () => {
                  const { id, ...rest } = item as any;
                  return rest;
                },
              });
            });
          },
        });
        return vi.fn();
      });
      return render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
    };

    const openTheRoom = () => {
      fireEvent.click(screen.getByText('Weekly notes').closest('button')!);
    };

    it('names the room and lets a Full-timer post in it', async () => {
      renderWithAnnouncement();
      openTheRoom();

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/replies go to the team directly/i)).not.toBeInTheDocument();
    });

    it('replaces the composer with the reason for everyone else', async () => {
      (useAuth as any).mockReturnValue({ user: stableUser, role: 'operator' });
      renderWithAnnouncement();
      openTheRoom();

      await waitFor(() => {
        expect(screen.getByText(/replies go to the team directly/i)).toBeInTheDocument();
      });
      expect(screen.queryByPlaceholderText(/Type a message/i)).not.toBeInTheDocument();
    });

    it('leaves the composer alone in a group room', async () => {
      (useAuth as any).mockReturnValue({ user: stableUser, role: 'operator' });
      render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText('Trainees Chat').closest('button')!);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
      });
    });
  });
});
