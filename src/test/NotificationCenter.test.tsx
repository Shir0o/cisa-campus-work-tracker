import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NotificationCenter from '../components/layout/NotificationCenter';
import * as firestore from 'firebase/firestore';
import { auth, handleFirestoreError } from '../lib/firebase';

// Mock Auth
const mockUseAuth = vi.fn().mockReturnValue({ role: 'admin' });
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock Router Navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock Firestore
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    onSnapshot: vi.fn(),
    doc: vi.fn().mockReturnValue({ id: 'mock-doc-id' }),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn().mockResolvedValue(true),
    arrayUnion: vi.fn((val) => ({ __firestore_mock_type: 'arrayUnion', value: val })),
    writeBatch: vi.fn().mockReturnValue({
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(true),
    }),
  };
});

// Mock Firebase Library
vi.mock('../lib/firebase', () => {
  return {
    db: {},
    auth: {
      currentUser: { uid: 'mock-user-id' },
    },
    handleFirestoreError: vi.fn(),
    OperationType: { LIST: 'LIST', UPDATE: 'UPDATE' },
  };
});

// Mock Motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock web push
vi.mock('../lib/webPush', () => ({
  showWebPushNotification: vi.fn(),
}));

import { showWebPushNotification } from '../lib/webPush';

describe('NotificationCenter Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ role: 'admin' });
    (auth as any).currentUser = { uid: 'mock-user-id' };
  });

  const triggerOnSnapshotCallbacks = (notificationsData: any[]) => {
    // onSnapshot is called twice: once for personal, once for global
    let callCount = 0;
    (firestore.onSnapshot as any).mockImplementation((q: any, callback: any) => {
      callCount++;
      if (callCount === 1) {
        // Personal notifications snap
        callback({
          docs: notificationsData
            .filter((n) => n.userId === 'mock-user-id')
            .map((n) => ({
              id: n.id,
              data: () => n,
            })),
        });
      } else {
        // Global notifications snap
        callback({
          docs: notificationsData
            .filter((n) => n.userId === 'ALL_ADMINS')
            .map((n) => ({
              id: n.id,
              data: () => n,
            })),
        });
      }
      return vi.fn(); // Unsubscribe
    });
  };

  it('renders correctly with 0 unread notifications', async () => {
    triggerOnSnapshotCallbacks([]);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    const bellBtn = screen.getByLabelText(/notifications/i);
    expect(bellBtn).toBeInTheDocument();
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
  });

  it('displays correct unread badge count and list elements', async () => {
    const mockNotifs = [
      {
        id: 'n1',
        userId: 'mock-user-id',
        title: 'New Prayer Request',
        body: 'Please pray for Bob',
        type: 'success',
        read: false,
        createdAt: { toDate: () => new Date() },
      },
      {
        id: 'n2',
        userId: 'ALL_ADMINS',
        title: 'New Event Created',
        body: 'Weekly Gathering is up',
        type: 'event',
        readBy: [],
        createdAt: { toDate: () => new Date() },
      },
    ];

    triggerOnSnapshotCallbacks(mockNotifs);

    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    // Unread count should be 2
    const badge = screen.getByText('2');
    expect(badge).toBeInTheDocument();

    // Open notifications panel
    const bellBtn = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellBtn);

    // Verify header and notifications are rendered
    expect(screen.getByText("What's stirring")).toBeInTheDocument();
    expect(screen.getByText('New Prayer Request')).toBeInTheDocument();
    expect(screen.getByText('New Event Created')).toBeInTheDocument();
  });

  it('calls writeBatch and marks all as read when clicking Mark All Read', async () => {
    const mockNotifs = [
      {
        id: 'n1',
        userId: 'mock-user-id',
        title: 'New Prayer Request',
        body: 'Please pray for Bob',
        type: 'success',
        read: false,
        createdAt: { toDate: () => new Date() },
      },
    ];

    triggerOnSnapshotCallbacks(mockNotifs);

    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    // Open panel
    fireEvent.click(screen.getByLabelText(/notifications/i));

    const markAllBtn = screen.getByRole('button', { name: /Mark all read/i });
    fireEvent.click(markAllBtn);

    expect(firestore.writeBatch).toHaveBeenCalled();
  });

  it('navigates on footer button click', async () => {
    const mockNotifs = [
      {
        id: 'n1',
        userId: 'mock-user-id',
        title: 'New Prayer Request',
        body: 'Please pray for Bob',
        type: 'success',
        read: false,
        createdAt: { toDate: () => new Date() },
      },
    ];

    triggerOnSnapshotCallbacks(mockNotifs);

    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    // Open panel
    fireEvent.click(screen.getByLabelText(/notifications/i));

    const footerBtn = screen.getByRole('button', { name: /See the whole record in History/i });
    fireEvent.click(footerBtn);

    // Should navigate to history
    expect(mockNavigate).toHaveBeenCalledWith('/history');
  });

  it('marks notification read and navigates to link on item click', async () => {
    const mockNotifs = [
      {
        id: 'n1',
        userId: 'mock-user-id',
        title: 'New message',
        message: 'User One: hello',
        type: 'info',
        read: false,
        link: '/messages/room_123',
        createdAt: { toDate: () => new Date() },
      },
    ];

    triggerOnSnapshotCallbacks(mockNotifs);

    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    // Open panel
    fireEvent.click(screen.getByLabelText(/notifications/i));

    const item = screen.getByText('New message');
    fireEvent.click(item);

    // Should call updateDoc and navigate to link
    expect(firestore.updateDoc).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/messages/room_123');
  });

  // ── Empty panel state ──────────────────────────────────────────────

  it('shows "Nothing needs you right now" when panel open with no notifications', () => {
    triggerOnSnapshotCallbacks([]);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    expect(screen.getByText('Nothing needs you right now')).toBeInTheDocument();
  });

  // ── Escape key closes panel ────────────────────────────────────────

  it('closes panel on Escape key press', async () => {
    const mockNotifs = [
      {
        id: 'n1',
        userId: 'mock-user-id',
        title: 'Test',
        body: 'Test body',
        type: 'success',
        read: false,
        createdAt: { toDate: () => new Date() },
      },
    ];
    triggerOnSnapshotCallbacks(mockNotifs);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    expect(screen.getByText("What's stirring")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText("What's stirring")).not.toBeInTheDocument();
    });
  });

  // ── Click outside closes panel ─────────────────────────────────────

  it('closes panel on click outside', async () => {
    const mockNotifs = [
      {
        id: 'n1',
        userId: 'mock-user-id',
        title: 'Test',
        body: 'Test body',
        type: 'success',
        read: false,
        createdAt: { toDate: () => new Date() },
      },
    ];
    triggerOnSnapshotCallbacks(mockNotifs);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    expect(screen.getByText("What's stirring")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByText("What's stirring")).not.toBeInTheDocument();
    });
  });

  // ── Bell toggle closes when already open ───────────────────────────

  it('toggles panel closed when bell is clicked while open', async () => {
    const mockNotifs = [
      {
        id: 'n1',
        userId: 'mock-user-id',
        title: 'Test',
        body: 'body',
        type: 'success',
        read: false,
        createdAt: { toDate: () => new Date() },
      },
    ];
    triggerOnSnapshotCallbacks(mockNotifs);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    const bell = screen.getByLabelText(/notifications/i);
    fireEvent.click(bell);
    expect(screen.getByText("What's stirring")).toBeInTheDocument();

    // Click bell again to close
    fireEvent.click(bell);
    await waitFor(() => {
      expect(screen.queryByText("What's stirring")).not.toBeInTheDocument();
    });
  });

  // ── 9+ badge ──────────────────────────────────────────────────────

  it('displays 9+ badge when unread count exceeds 9', () => {
    const mockNotifs = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      userId: 'mock-user-id',
      title: `Notification ${i}`,
      body: 'body',
      type: 'success' as const,
      read: false,
      createdAt: { toDate: () => new Date(Date.now() - i * 60000) },
    }));

    triggerOnSnapshotCallbacks(mockNotifs);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  // ── Earlier section for read notifications ─────────────────────────

  it('renders "Earlier" section for read notifications', () => {
    const mockNotifs = [
      {
        id: 'n-unread',
        userId: 'mock-user-id',
        title: 'Unread Item',
        body: 'new stuff',
        type: 'success',
        read: false,
        createdAt: { toDate: () => new Date() },
      },
      {
        id: 'n-read',
        userId: 'mock-user-id',
        title: 'Read Item',
        body: 'old stuff',
        type: 'event',
        read: true,
        createdAt: { toDate: () => new Date(Date.now() - 86400000) },
      },
    ];

    triggerOnSnapshotCallbacks(mockNotifs);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    expect(screen.getByText('Worth a look')).toBeInTheDocument();
    expect(screen.getByText('Earlier')).toBeInTheDocument();
    expect(screen.getByText('Unread Item')).toBeInTheDocument();
    expect(screen.getByText('Read Item')).toBeInTheDocument();
  });

  // ── setAside personal vs global ────────────────────────────────────

  it('dismisses personal notification via deleteDoc', async () => {
    const mockNotifs = [
      {
        id: 'n-personal',
        userId: 'mock-user-id',
        title: 'Personal Note',
        body: 'body',
        type: 'success',
        read: false,
        createdAt: { toDate: () => new Date() },
      },
    ];

    triggerOnSnapshotCallbacks(mockNotifs);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    const setAsideBtn = screen.getByLabelText('Set aside');
    fireEvent.click(setAsideBtn);

    await waitFor(() => {
      expect(firestore.deleteDoc).toHaveBeenCalled();
    });
  });

  it('dismisses global notification via arrayUnion dismissedBy', async () => {
    const mockNotifs = [
      {
        id: 'n-global',
        userId: 'ALL_ADMINS',
        title: 'Global Note',
        body: 'body',
        type: 'event',
        readBy: [],
        createdAt: { toDate: () => new Date() },
      },
    ];

    triggerOnSnapshotCallbacks(mockNotifs);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    const setAsideBtn = screen.getByLabelText('Set aside');
    fireEvent.click(setAsideBtn);

    await waitFor(() => {
      expect(firestore.updateDoc).toHaveBeenCalled();
      expect(firestore.arrayUnion).toHaveBeenCalledWith('mock-user-id');
    });
  });

  // ── Non-staff footer ───────────────────────────────────────────────

  it('non-staff user sees "Open Prayer" footer and navigates to /prayer', () => {
    mockUseAuth.mockReturnValue({ role: 'operator' });

    const mockNotifs = [
      {
        id: 'n1',
        userId: 'mock-user-id',
        title: 'Test',
        body: 'body',
        type: 'success',
        read: false,
        createdAt: { toDate: () => new Date() },
      },
    ];

    triggerOnSnapshotCallbacks(mockNotifs);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    const footerBtn = screen.getByRole('button', { name: /Open Prayer/i });
    fireEvent.click(footerBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/prayer');
  });

  // ── Type/tonal icon coverage ───────────────────────────────────────

  it('renders tonal icons for assignment, warning, error, and custom tones', () => {
    const mockNotifs = [
      { id: 'a1', userId: 'mock-user-id', title: 'Assignment', type: 'assignment', read: true, createdAt: { toDate: () => new Date() } },
      { id: 'w1', userId: 'mock-user-id', title: 'Warning', type: 'warning', read: true, createdAt: { toDate: () => new Date() } },
      { id: 'e1', userId: 'mock-user-id', title: 'Error', type: 'error', read: true, createdAt: { toDate: () => new Date() } },
      { id: 'i1', userId: 'mock-user-id', title: 'Info', type: 'info', read: true, createdAt: { toDate: () => new Date() } },
      { id: 'v1', userId: 'mock-user-id', title: 'Violet', type: 'info', tone: 'violet', read: true, createdAt: { toDate: () => new Date() } },
    ];
    triggerOnSnapshotCallbacks(mockNotifs);
    const { container } = render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    expect(container.querySelector('.lucide-users')).toBeInTheDocument();
    expect(container.querySelector('.lucide-circle-alert')).toBeInTheDocument();
    expect(container.querySelector('.lucide-heart')).toBeInTheDocument();
    expect(container.querySelector('.lucide-sparkles')).toBeInTheDocument();
  });

  // ── Web push on newly added notification ───────────────────────────

  it('fires a web push notification for a newly added unread personal notification', async () => {
    let personalCb: any;
    (firestore.onSnapshot as any).mockImplementation((q: any, cb: any) => {
      if (!personalCb) personalCb = cb;
      cb({ docs: [], docChanges: () => [] });
      return vi.fn();
    });
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    personalCb({
      docs: [],
      docChanges: () => [
        {
          type: 'added',
          doc: {
            id: 'new1',
            data: () => ({
              userId: 'mock-user-id',
              title: 'Brand new',
              message: 'fresh off the wire',
              link: '/myday',
              targetId: 't1',
              readBy: [],
            }),
          },
        },
      ],
    });

    await waitFor(() => {
      expect(showWebPushNotification).toHaveBeenCalledWith('Brand new', {
        body: 'fresh off the wire',
        data: { link: '/myday', targetId: 't1' },
      });
    });
  });

  // ── Snapshot error paths ───────────────────────────────────────────

  it('reports personal snapshot errors via handleFirestoreError', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (firestore.onSnapshot as any).mockImplementation((q: any, cb: any, err: any) => {
      err(new Error('denied'));
      return vi.fn();
    });
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'LIST', 'notifications');
    });
    errSpy.mockRestore();
  });

  it('reports global snapshot errors via handleFirestoreError', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let callCount = 0;
    (firestore.onSnapshot as any).mockImplementation((q: any, cb: any, err: any) => {
      callCount++;
      if (callCount === 2) err(new Error('denied'));
      return vi.fn();
    });
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(handleFirestoreError).toHaveBeenCalledTimes(1);
    });
    errSpy.mockRestore();
  });

  // ── No signed-in user: all mutations become no-ops ─────────────────

  it('skips markAsRead, markAllAsRead, and setAside when there is no current user', async () => {
    (auth as any).currentUser = null;
    mockUseAuth.mockReturnValue({ role: 'admin', effectiveUserId: 'uid-1' });

    let calls = 0;
    (firestore.onSnapshot as any).mockImplementation((q: any, cb: any) => {
      calls++;
      if (calls === 1) {
        cb({
          docs: [
            {
              id: 'n1',
              data: () => ({
                userId: 'uid-1',
                title: 'Solo',
                body: 'b',
                type: 'success',
                read: false,
                createdAt: { toDate: () => new Date() },
              }),
            },
          ],
        });
      } else {
        cb({ docs: [] });
      }
      return vi.fn();
    });
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    await screen.findByText('Solo');
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/i }));
    fireEvent.click(screen.getByLabelText('Set aside'));
    fireEvent.click(screen.getByText('Solo'));

    expect(firestore.updateDoc).not.toHaveBeenCalled();
    expect(firestore.writeBatch).not.toHaveBeenCalled();
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
  });

  // ── Failure handling on markAsRead / setAside ──────────────────────

  it('logs when marking a notification read fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (firestore.updateDoc as any).mockRejectedValueOnce(new Error('write fail'));
    triggerOnSnapshotCallbacks([
      { id: 'n1', userId: 'mock-user-id', title: 'Doomed', body: 'b', type: 'success', read: false, createdAt: { toDate: () => new Date() } },
    ]);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    fireEvent.click(screen.getByText('Doomed'));

    await waitFor(() => {
      expect(errSpy).toHaveBeenCalledWith('Error marking as read:', expect.any(Error));
    });
    errSpy.mockRestore();
  });

  it('logs when setting aside a global notification fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (firestore.updateDoc as any).mockRejectedValueOnce(new Error('write fail'));
    triggerOnSnapshotCallbacks([
      { id: 'n-global', userId: 'ALL_ADMINS', title: 'Global', body: 'b', type: 'event', readBy: [], createdAt: { toDate: () => new Date() } },
    ]);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    fireEvent.click(screen.getByLabelText('Set aside'));

    await waitFor(() => {
      expect(errSpy).toHaveBeenCalledWith('Error setting aside:', expect.any(Error));
    });
    errSpy.mockRestore();
  });

  // ── targetId navigation ────────────────────────────────────────────

  it('navigates to /coordination for an assignment without a link', () => {
    triggerOnSnapshotCallbacks([
      { id: 'n1', userId: 'mock-user-id', title: 'New buddy', body: 'b', type: 'assignment', targetId: 'c1', read: true, createdAt: { toDate: () => new Date() } },
    ]);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    fireEvent.click(screen.getByText('New buddy'));
    expect(mockNavigate).toHaveBeenCalledWith('/coordination');
  });

  it('navigates to the message thread for a targetId without a link', () => {
    triggerOnSnapshotCallbacks([
      { id: 'n1', userId: 'mock-user-id', title: 'New note', body: 'b', type: 'info', targetId: 'room_9', read: true, createdAt: { toDate: () => new Date() } },
    ]);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    fireEvent.click(screen.getByText('New note'));
    expect(mockNavigate).toHaveBeenCalledWith('/messages/room_9');
  });

  // ── Enter key opens a notification ─────────────────────────────────

  it('selects a notification when Enter is pressed', () => {
    triggerOnSnapshotCallbacks([
      { id: 'n1', userId: 'mock-user-id', title: 'Key item', body: 'b', type: 'success', link: '/myday', read: true, createdAt: { toDate: () => new Date() } },
    ]);
    render(
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/notifications/i));
    const item = screen.getByText('Key item').closest('[role="button"]')!;
    fireEvent.keyDown(item, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/myday');
  });
});
