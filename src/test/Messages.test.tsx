import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
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
  handleFirestoreError: vi.fn(),
  sendNotification: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE' },
}));

// Mock Todos
vi.mock('../lib/todos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/todos')>();
  return {
    ...actual,
    setTodoDone: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock Asks
vi.mock('../lib/asks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/asks')>();
  return {
    ...actual,
    subscribeAsks: vi.fn((cb: any) => {
      cb([]);
      return () => {};
    }),
    subscribeMyAsks: vi.fn((_uid: any, cb: any) => {
      cb([]);
      return () => {};
    }),
  };
});

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
    updateDoc: vi.fn().mockResolvedValue(true),
    serverTimestamp: vi.fn(() => 'mock-server-time'),
  };
});

// Mock Chat Service
vi.mock('../services/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/chat')>();
  return {
    ...actual,
    sendMessage: vi.fn().mockResolvedValue(undefined),
    reactToMessage: vi.fn().mockResolvedValue(undefined),
    togglePinMessage: vi.fn().mockResolvedValue(undefined),
    removeMessageForEveryone: vi.fn().mockResolvedValue(undefined),
    deleteChatRoom: vi.fn().mockResolvedValue(undefined),
    canRemoveConvForEveryone: vi.fn().mockImplementation((r: any, uid: any, isAdmin: any) => Boolean(isAdmin || (r && r.createdById === uid))),
  };
});

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

    expect(screen.getByText('Pick a conversation')).toBeInTheDocument();
    expect(screen.getByText(/Or start a new one — everyone in the app is reachable from here/i)).toBeInTheDocument();
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
    const roomBtn = screen.getByText('Trainees Chat').closest('.msgs-item');
    expect(roomBtn).toBeTruthy();
    fireEvent.click(roomBtn!);

    // Verify chat messages rendered
    await waitFor(() => {
      const messagesStream = container.querySelector('.msgs-stream');
      expect(messagesStream).toBeTruthy();
      expect(within(messagesStream as HTMLElement).queryByText('Hello trainees')).not.toBeNull();
    });

    // Type a message in composer
    const textarea = screen.getByPlaceholderText(/Write a message/i);
    fireEvent.change(textarea, { target: { value: 'Welcome to the team!' } });

    // Wait for the send button to be enabled
    const sendButton = container.querySelector('.msgs-send');
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

    const roomBtn = screen.getByText('Trainees Chat').closest('.msgs-item');
    fireEvent.click(roomBtn!);

    await waitFor(() => {
      const messagesStream = container.querySelector('.msgs-stream');
      expect(messagesStream).toBeTruthy();
      expect(within(messagesStream as HTMLElement).queryByText('Hello trainees')).not.toBeNull();
    }, { timeout: 500 });

    const textarea = screen.getByPlaceholderText(/Write a message/i) as HTMLTextAreaElement;
    textarea.selectionStart = 1;
    textarea.selectionEnd = 1;
    fireEvent.change(textarea, { target: { value: '@' } });

    await waitFor(() => {
      const mentionDropdown = container.querySelector('.msgs-mention-pop');
      expect(mentionDropdown).toBeTruthy();
      expect(within(mentionDropdown as HTMLElement).queryByText('Alice')).not.toBeNull();
    }, { timeout: 500 });

    const mentionDropdown = container.querySelector('.msgs-mention-pop');
    fireEvent.click(within(mentionDropdown as HTMLElement).getByText('Alice'));
    expect(textarea.value).toBe('@Alice ');
  });

  it('handles attaching reference data cards and removing them', async () => {
    const { container } = render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    const roomBtn = screen.getByText('Trainees Chat').closest('.msgs-item');
    fireEvent.click(roomBtn!);

    await waitFor(() => {
      const messagesStream = container.querySelector('.msgs-stream');
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

  it('restricts room queries by membership for both admin and non-admin users', async () => {
    (useAuth as any).mockReturnValue({
      user: stableUser,
      role: 'admin',
    });

    const { unmount } = render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    expect(firestore.where).toHaveBeenCalledWith('memberIds', 'array-contains', 'u1');
    unmount();

    vi.clearAllMocks();

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
    expect(screen.getByText('Trainees Chat').closest('.msgs-item')?.querySelector('.msgs-unread-dot')).toBeTruthy();
    unmount();

    // Mark as read
    localStorage.setItem('chat_read_room1', (100006 * 1000).toString());

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    // Unread badge should not be present
    expect(screen.getByText('Trainees Chat').closest('.msgs-item')?.querySelector('.msgs-unread-dot')).toBeFalsy();
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

    fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);

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

    fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);

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

    fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);

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

    expect(screen.getByText('Pick a conversation')).toBeInTheDocument();
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

    fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
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

    fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
    const textarea = screen.getByPlaceholderText(/Write a message/i) as HTMLTextAreaElement;

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

    fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
    
    const textarea = screen.getByPlaceholderText(/Write a message/i);
    fireEvent.change(textarea, { target: { value: 'Press Enter message' } });

    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', charCode: 13, metaKey: true });

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

  it('triggers CreateChatModal from the rail New button in the empty state', async () => {
    (firestore.onSnapshot as any).mockImplementationOnce((q: any, successCallback: any) => {
      successCallback({ forEach: () => {} });
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTitle('Start Chat'));

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
      fireEvent.click(screen.getByText('Weekly notes').closest('.msgs-item')!);
    };

    it('names the room and lets a Full-timer post in it', async () => {
      renderWithAnnouncement();
      openTheRoom();

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Write a message/i)).toBeInTheDocument();
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
      expect(screen.queryByPlaceholderText(/Write a message/i)).not.toBeInTheDocument();
    });

    it('leaves the composer alone in a group room', async () => {
      (useAuth as any).mockReturnValue({ user: stableUser, role: 'operator' });
      render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Write a message/i)).toBeInTheDocument();
      });
    });

    it('scrolls the messages container to bottom without calling window.scrollTo or scrollIntoView on page load', async () => {
      const scrollIntoViewSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewSpy;

      const { container } = renderWithAnnouncement();

      const roomBtn = screen.getByText('Weekly notes').closest('.msgs-item');
      fireEvent.click(roomBtn!);

      await waitFor(() => {
        const messagesStream = container.querySelector('.msgs-stream');
        expect(messagesStream).toBeTruthy();
      });

      // Verify scrollIntoView was NOT called (preventing outer page jump)
      expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    });
  });

  // Field Notes desktop thread: quick-react, pin, and the ⋯ menu (hide from my
  // view / take back for everyone) are schema-backed acts on the message.
  describe('reactions, pin and the message menu', () => {
    const streamOf = (container: HTMLElement) => {
      const stream = container.querySelector('.msgs-stream');
      if (!stream) throw new Error('no .msgs-stream in container');
      return stream as HTMLElement;
    };

    it('reacts to a message from the hover picker', async () => {
      const { container } = render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
      await waitFor(() => expect(within(streamOf(container)).queryByText('Hello trainees')).not.toBeNull());

      const add = container.querySelector('.msgb-react-add');
      expect(add).toBeTruthy();
      fireEvent.click(add!);

      await waitFor(() => {
        expect(chatService.reactToMessage).toHaveBeenCalledWith(
          'room1', 'm1', 'u1', expect.any(String), []
        );
      });
    });

    it('pins a message from the hover tools', async () => {
      const { container } = render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
      await waitFor(() => expect(within(streamOf(container)).queryByText('Hello trainees')).not.toBeNull());

      const pin = container.querySelector('.msgb-pin-btn');
      expect(pin).toBeTruthy();
      fireEvent.click(pin!);

      await waitFor(() => {
        expect(chatService.togglePinMessage).toHaveBeenCalledWith('room1', 'm1', true);
      });
    });

    it('hides a message from my view via the ⋯ menu, and can bring it back', async () => {
      const { container } = render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
      await waitFor(() => expect(within(streamOf(container)).queryByText('Hello trainees')).not.toBeNull());

      fireEvent.click(container.querySelector('.msgb-menu-wrap button[title="More"]')!);
      fireEvent.click(screen.getByText('Hide from my view'));

      // The bubble is gone for this viewer and the hidden-note appears.
      await waitFor(() => {
        expect(within(streamOf(container)).queryByText('Hello trainees')).toBeNull();
        expect(screen.getByText(/One message is hidden from your view/i)).toBeInTheDocument();
      });

      // Bring it back.
      fireEvent.click(screen.getByText('Bring it back'));
      await waitFor(() => {
        expect(within(streamOf(container)).queryByText('Hello trainees')).not.toBeNull();
      });
    });

    it('turns a message into a to-do via the ⋯ menu (issue #336)', async () => {
      const { container } = render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
      await waitFor(() => expect(within(streamOf(container)).queryByText('Hello trainees')).not.toBeNull());

      fireEvent.click(container.querySelector('.msgb-menu-wrap button[title="More"]')!);
      fireEvent.click(screen.getByText('Make a to-do'));

      // The composer opens pre-filled with the message and the message as source.
      expect(screen.getByPlaceholderText('What needs doing?')).toHaveValue('Hello trainees');
      expect(screen.getByText('Message from Alice')).toBeInTheDocument();
    });

    it('triggers mention autocomplete when @ is typed and inserts selected user', async () => {
      const { container } = render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
      await waitFor(() => expect(within(streamOf(container)).queryByText('Hello trainees')).not.toBeNull());

      const composer = screen.getByPlaceholderText(/Write a message/i);
      fireEvent.change(composer, { target: { value: 'Hey @Al', selectionStart: 6 } });

      // Check if mention popup appears with Alice Green
      expect(await screen.findByText('Alice Green')).toBeInTheDocument();

      // Click Alice Green
      fireEvent.click(screen.getByText('Alice Green'));
      expect(composer).toHaveValue('Hey @Alice Green ');
    });

    it('renders system messages in the message stream', async () => {
      const mockRoomsWithSys = [
        {
          id: 'room1',
          type: 'group' as const,
          name: 'Trainees Chat',
          memberIds: ['u1', 'u2'],
          createdById: 'u1',
          createdByName: 'Current User',
          createdAt: { seconds: 100000 },
        },
      ];

      const mockSysMsg = [
        {
          id: 'sys1',
          roomId: 'room1',
          senderId: 'system',
          senderName: 'System',
          text: 'User Alice joined the group',
          type: 'system',
          createdAt: { seconds: 100001 },
        },
      ];

      (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
        const isMessages = q && q.path && q.path.includes('messages');
        const dataList = isMessages ? mockSysMsg : mockRoomsWithSys;
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

      fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
      expect(await screen.findByText('User Alice joined the group')).toBeInTheDocument();
    });

    it('renders direct chat header with avatar class and composer without li-textarea class', async () => {
      const mockDirectRooms = [
        {
          id: 'room-dm-header',
          type: 'direct' as const,
          memberIds: ['u1', 'u2'],
          createdAt: { seconds: 100000 },
          lastMessage: { text: 'Direct message', senderId: 'u2', senderName: 'Alice', timestamp: { seconds: 100005 } },
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
        data: () => ({ displayName: 'Alice Direct', photoURL: '' }),
      });

      const { container } = render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );

      // Verify root container flex classes
      const rootDiv = container.firstElementChild as HTMLElement;
      expect(rootDiv.className).toContain('page msgs flex flex-1 h-full min-h-0');

      const roomBtn = await screen.findByText('Alice Direct');
      fireEvent.click(roomBtn.closest('.msgs-item')!);

      // Verify direct chat header avatar container has 'avatar' class
      await waitFor(() => {
        const avatarEl = container.querySelector('.msgs-thread-head .avatar');
        expect(avatarEl).toBeTruthy();
      });

      // Verify composer textarea has msgs-ta li-input without li-textarea
      const textarea = screen.getByPlaceholderText(/Write a message/i);
      expect(textarea.className).toBe('msgs-ta li-input');
    });

    it('handles room hiding, unhiding via banner, and deleting room for everyone', async () => {
      const mockRooms = [
        {
          id: 'room-delete-test',
          type: 'group',
          name: 'Delete Test Group',
          memberIds: ['user123', 'user456'],
          createdById: 'user123',
          createdByName: 'Test User',
          createdAt: { seconds: 1600000000, nanoseconds: 0 },
          lastMessage: {
            text: 'Hello group',
            senderId: 'user123',
            senderName: 'Test User',
            timestamp: { seconds: 1600000000, nanoseconds: 0 },
          },
        },
      ];

      (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
        successCallback({
          forEach: (fn: any) => {
            mockRooms.forEach((item) => {
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

      const roomTitle = await screen.findByText('Delete Test Group');
      expect(roomTitle).toBeTruthy();

      // Open room ⋯ menu
      const moreBtn = screen.getByTitle('More options');
      fireEvent.click(moreBtn);

      // Hide from my list
      const hideBtn = screen.getByText('Hide from my list');
      fireEvent.click(hideBtn);

      // Room is hidden and banner appears
      await waitFor(() => {
        expect(screen.queryByText('Delete Test Group')).toBeNull();
        expect(screen.getByText(/One conversation is hidden from your list/i)).toBeTruthy();
      });

      // Bring it back
      const bringBackBtn = screen.getByText('Bring it back');
      fireEvent.click(bringBackBtn);

      await waitFor(() => {
        expect(screen.getByText('Delete Test Group')).toBeTruthy();
      });

      // Open menu again and test Delete for everyone
      const moreBtn2 = screen.getByTitle('More options');
      fireEvent.click(moreBtn2);

      const deleteForEveryoneBtn = screen.getByText('Delete for everyone');
      fireEvent.click(deleteForEveryoneBtn);

      // Confirmation prompt appears
      expect(screen.getByText(/Delete this conversation for everyone\?/i)).toBeTruthy();

      const confirmBtn = screen.getByText('Yes, delete it');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(chatService.deleteChatRoom).toHaveBeenCalledWith('room-delete-test');
      });
    });
  });

  // ── Removed messages, mentions, pinned jumps, send guards, rail filters ──
  describe('removed messages, mention highlighting and pinned jumps', () => {
    const renderWith = (msgs: any[], rooms: any[] = mockRooms) => {
      (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
        const isMessages = q && q.path && q.path.includes('messages');
        const dataList = isMessages ? msgs : rooms;
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
      const { container } = render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText(rooms[0].name).closest('.msgs-item')!);
      return container;
    };

    it('renders every taken-back label variant', async () => {
      const deletedMsgs = [
        { id: 'd1', roomId: 'room1', senderId: 'u1', senderName: 'Current User', text: 'x', type: 'text', deleted: { by: 'u1' } },
        { id: 'd2', roomId: 'room1', senderId: 'u2', senderName: 'Alice', text: 'x', type: 'text', deleted: { by: 'u1' } },
        { id: 'd3', roomId: 'room1', senderId: 'u2', senderName: 'Alice', text: 'x', type: 'text', deleted: { by: 'u2' } },
        { id: 'd4', roomId: 'room1', senderId: 'u2', senderName: 'Alice', text: 'x', type: 'text', deleted: { by: 'u3' } },
      ];
      renderWith(deletedMsgs);

      expect(await screen.findByText('You took this message back.')).toBeInTheDocument();
      expect(screen.getByText('You removed this message.')).toBeInTheDocument();
      expect(screen.getByText('Alice took this message back.')).toBeInTheDocument();
      expect(screen.getByText('Removed by u3.')).toBeInTheDocument();
    });

    it('highlights @mentions of room members in message text', async () => {
      const mentionMsgs = [
        { id: 'm2', roomId: 'room1', senderId: 'u2', senderName: 'Alice', text: '@Alice please call me', type: 'text' },
      ];
      const container = renderWith(mentionMsgs);

      await waitFor(() => {
        const hit = container.querySelector('.msgb-bubble .text-accent');
        expect(hit).toBeTruthy();
        expect(hit!.textContent).toBe('@Alice');
      });
    });

    it('jumps to a pinned message from the pinned strip', async () => {
      const pinnedMsgs = [
        { id: 'm1', roomId: 'room1', senderId: 'u2', senderName: 'Alice', text: 'Pinned note', type: 'text', pinned: true },
      ];
      const container = renderWith(pinnedMsgs);

      fireEvent.click(container.querySelector('button[title="Pinned messages"]')!);
      await waitFor(() => expect(container.querySelector('.msgs-pinned-strip')).toBeTruthy());

      fireEvent.click(container.querySelector('.msgs-pinned-row')!);
      await waitFor(() => expect(container.querySelector('.msgs-pinned-strip')).toBeNull());
    });

    it('takes the last message back for everyone and freshens the rail preview', async () => {
      const removeMsgs = [
        { id: 'm1', roomId: 'room1', senderId: 'u1', senderName: 'Current User', text: 'oops', type: 'text' },
      ];
      const container = renderWith(removeMsgs);

      await waitFor(() =>
        expect(within(container.querySelector('.msgs-stream') as HTMLElement).queryByText('oops')).not.toBeNull(),
      );

      fireEvent.click(container.querySelector('.msgb-menu-wrap button[title="More"]')!);
      fireEvent.click(screen.getByText('Take back for everyone'));
      fireEvent.click(screen.getByText('Yes, remove it'));

      await waitFor(() => {
        expect(chatService.removeMessageForEveryone).toHaveBeenCalledWith('room1', 'm1', 'u1');
      });
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'chatRooms/room1' }),
        expect.objectContaining({ lastMessage: expect.objectContaining({ text: 'Message removed' }) }),
      );
      expect(screen.queryByText('Take back for everyone')).not.toBeInTheDocument();
    });

    it('keeps the conversation when deletion is declined and closes the menu via the away click', async () => {
      const { container } = render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
      const moreBtn = screen.getByTitle('More options');
      fireEvent.click(moreBtn);

      fireEvent.click(screen.getByText('Delete for everyone'));
      expect(screen.getByText(/Delete this conversation for everyone\?/i)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Keep it'));
      expect(screen.queryByText(/Delete this conversation for everyone\?/i)).not.toBeInTheDocument();
      expect(chatService.deleteChatRoom).not.toHaveBeenCalled();

      fireEvent.click(container.querySelector('.msgb-menu-away')!);
      expect(screen.queryByText('Hide from my list')).not.toBeInTheDocument();
    });

    it('guards empty sends via Cmd+Enter and reports send failures', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const container = renderWith([...mockMessages]);

      await waitFor(() =>
        expect(within(container.querySelector('.msgs-stream') as HTMLElement).queryByText('Hello trainees')).not.toBeNull(),
      );

      // Cmd+Enter with an empty composer hits the send guard.
      const textarea = screen.getByPlaceholderText(/Write a message/i);
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
      expect(chatService.sendMessage).not.toHaveBeenCalled();

      // A rejected send is reported.
      (chatService.sendMessage as any).mockRejectedValueOnce(new Error('network down'));
      fireEvent.change(textarea, { target: { value: 'will fail' } });
      fireEvent.click(container.querySelector('.msgs-send')!);
      await waitFor(() =>
        expect(consoleSpy).toHaveBeenCalledWith('Failed to send message:', expect.any(Error)),
      );
      consoleSpy.mockRestore();
    });

    it('filters the rail by kind and search', async () => {
      localStorage.clear();
      const rooms = [
        {
          id: 'room1',
          type: 'group' as const,
          name: 'Trainees Chat',
          memberIds: ['u1', 'u2'],
          createdById: 'u2',
          createdByName: 'Alice',
          createdAt: { seconds: 100000 },
          lastMessage: { text: 'Hello', senderId: 'u2', senderName: 'Alice', timestamp: { seconds: 100005 } },
        },
        {
          id: 'room-ann',
          type: 'announcement' as const,
          name: 'Weekly notes',
          memberIds: ['u1', 'u2'],
          createdById: 'u2',
          createdByName: 'Mei',
          createdAt: { seconds: 100000 },
          lastMessage: { text: 'Notes', senderId: 'u2', senderName: 'Mei', timestamp: { seconds: 100006 } },
        },
      ];

      (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
        const isMessages = q && q.path && q.path.includes('messages');
        const dataList = isMessages ? mockMessages : rooms;
        successCallback({
          forEach: (fn: any) => {
            dataList.forEach((item) => {
              fn({ id: item.id, data: () => { const { id, ...rest } = item; return rest; } });
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
      await waitFor(() => expect(screen.getByText('Weekly notes')).toBeInTheDocument());

      // Groups pill.
      fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
      expect(screen.getByText('Trainees Chat')).toBeInTheDocument();
      expect(screen.queryByText('Weekly notes')).not.toBeInTheDocument();

      // Announcements pill.
      fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
      expect(screen.getByText('Weekly notes')).toBeInTheDocument();
      expect(screen.queryByText('Trainees Chat')).not.toBeInTheDocument();

      // Back to All, then search narrows the rail.
      fireEvent.click(screen.getByRole('button', { name: 'All' }));
      fireEvent.change(screen.getByPlaceholderText('Search messages…'), { target: { value: 'weekly' } });
      expect(screen.getByText('Weekly notes')).toBeInTheDocument();
      expect(screen.queryByText('Trainees Chat')).not.toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText('Search messages…'), { target: { value: '' } });

      // Unread pill respects localStorage read markers.
      localStorage.setItem('chat_read_u1_room1', '99999999999999');
      fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
      expect(screen.getByText('Weekly notes')).toBeInTheDocument();
      expect(screen.queryByText('Trainees Chat')).not.toBeInTheDocument();
    });

    it('reports member-details fetch failures', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (firestore.getDoc as any).mockRejectedValueOnce(new Error('no user doc'));

      const container = renderWith([...mockMessages]);
      await waitFor(() =>
        expect(within(container.querySelector('.msgs-stream') as HTMLElement).queryByText('Hello trainees')).not.toBeNull(),
      );

      await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error)));
      consoleSpy.mockRestore();
    });

    it('clears the active room when the user is no longer a member', async () => {
      let roomsCallback: any;
      (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
        const isMessages = q && q.path && q.path.includes('messages');
        if (isMessages) {
          successCallback({ forEach: (fn: any) => mockMessages.forEach((m) => fn({ id: m.id, data: () => { const { id, ...rest } = m; return rest; } })) });
        } else {
          roomsCallback = successCallback;
          successCallback({ forEach: (fn: any) => mockRooms.forEach((r) => fn({ id: r.id, data: () => { const { id, ...rest } = r; return rest; } })) });
        }
        return vi.fn();
      });

      render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
      await waitFor(() => expect(screen.getByPlaceholderText(/Write a message/i)).toBeInTheDocument());

      // The room list updates and no longer contains the active room.
      act(() => roomsCallback({ forEach: (fn: any) => {} }));
      await waitFor(() => expect(screen.getByText('Pick a conversation')).toBeInTheDocument());
    });

    it('reports attachment and todo failures and renders unknown attachment icons', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const attachMsgs = [
        {
          id: 'm-att-fail',
          roomId: 'room1',
          senderId: 'u2',
          senderName: 'Alice',
          text: 'Look at this',
          type: 'text',
          attachments: [
            { id: 'c1', type: 'contact', name: 'Missing Contact' },
            { id: 't1', type: 'todo', name: 'Todo item', status: 'pending' },
            { id: 'x1', type: 'weird', name: 'Odd link' },
          ],
        },
      ];
      const container = renderWith(attachMsgs);
      await waitFor(() => expect(container.querySelector('.msgs-stream')).toBeTruthy());

      // Unknown attachment type renders the Paperclip fallback without crashing.
      expect(screen.getByText('Odd link')).toBeInTheDocument();

      // Contact attachment read failure is reported.
      (firestore.getDoc as any).mockRejectedValueOnce(new Error('no contact'));
      fireEvent.click(screen.getByText('Missing Contact'));
      await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error)));

      // Todo toggle failure is reported.
      (setTodoDone as any).mockRejectedValueOnce(new Error('no todo'));
      fireEvent.click(screen.getByText('Todo item').closest('div')!.parentElement!.querySelector('input[type="checkbox"]')!);
      await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error)));
      consoleSpy.mockRestore();
    });

    it('backs out of a chat room via the mobile back button and the browser popstate', async () => {
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
        const { container } = render(
          <MemoryRouter>
            <Messages />
          </MemoryRouter>
        );
        fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
        await waitFor(() => expect(screen.getByPlaceholderText(/Write a message/i)).toBeInTheDocument());

        // The mobile back button closes the room.
        fireEvent.click(container.querySelector('.msgs-thread-head .icon-btn')!);
        await waitFor(() => expect(screen.getByText('Pick a conversation')).toBeInTheDocument());

        // Re-open and pop the browser history entry.
        fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
        await waitFor(() => expect(screen.getByPlaceholderText(/Write a message/i)).toBeInTheDocument());
        window.dispatchEvent(new PopStateEvent('popstate'));
        await waitFor(() => expect(screen.getByText('Pick a conversation')).toBeInTheDocument());
      } finally {
        Object.defineProperty(window, 'matchMedia', { writable: true, value: original });
      }
    });

    it('opens the Questions for the team channel from the sidebar rail (#563)', async () => {
      render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );

      const askRow = screen.getByText('Questions for the team');
      expect(askRow).toBeInTheDocument();
      fireEvent.click(askRow);

      await waitFor(() => {
        expect(screen.getByText('Someone asked me')).toBeInTheDocument();
      });
    });

    it('opens Slack-style message thread when Reply in thread is clicked (#563)', async () => {
      render(
        <MemoryRouter>
          <Messages />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByText('Trainees Chat').closest('.msgs-item')!);
      await waitFor(() => expect(screen.getByPlaceholderText(/Write a message/i)).toBeInTheDocument());

      // Look for Reply in thread button
      const threadBtns = screen.getAllByTitle('Reply in thread');
      if (threadBtns.length > 0) {
        fireEvent.click(threadBtns[0]);
        await waitFor(() => {
          expect(screen.getByText('Thread')).toBeInTheDocument();
        });
      }
    });
  });
});


