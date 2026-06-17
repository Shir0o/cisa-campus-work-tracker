import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NotificationCenter from '../components/layout/NotificationCenter';
import * as firestore from 'firebase/firestore';
import { auth } from '../lib/firebase';

// Mock Auth
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({ role: 'admin' }),
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

describe('NotificationCenter Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('marks notification read on item click', async () => {
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

    const item = screen.getByText('New Prayer Request');
    fireEvent.click(item);

    // Should call updateDoc
    expect(firestore.updateDoc).toHaveBeenCalled();
  });
});
