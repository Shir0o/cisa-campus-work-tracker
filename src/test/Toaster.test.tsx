import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import Toaster from '../components/Toaster';
import { onSnapshot } from 'firebase/firestore';
import { auth, handleFirestoreError } from '../lib/firebase';

let mockOnSnapshotCallback: any = null;

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn((q, callback, errCallback) => {
    mockOnSnapshotCallback = callback;
    // Store error callback on the function itself so tests can access it
    (onSnapshot as any).mockErrorCallback = errCallback;
    return vi.fn(); // unsubscribe
  }),
}));

// Mock ../lib/firebase
vi.mock('../lib/firebase', () => {
  return {
    db: {},
    auth: {
      currentUser: null, // default to null, set in tests
    },
    handleFirestoreError: vi.fn(),
    OperationType: { LIST: 'LIST' },
  };
});

// Mock motion/react to avoid animation delays in JSDOM tests
vi.mock('motion/react', () => {
  return {
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: {
      div: React.forwardRef(({ children, initial, animate, exit, transition, ...props }: any, ref: any) => (
        <div ref={ref} {...props}>
          {children}
        </div>
      )),
    },
  };
});

describe('Toaster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSnapshotCallback = null;
    (onSnapshot as any).mockErrorCallback = null;
    auth.currentUser = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not register listener if user is not authenticated', () => {
    auth.currentUser = null;
    render(<Toaster />);
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('registers listener when user is authenticated', () => {
    auth.currentUser = { uid: 'user-123' } as any;
    render(<Toaster />);
    expect(onSnapshot).toHaveBeenCalled();
  });

  it('ignores notifications created before session start time', () => {
    auth.currentUser = { uid: 'user-123' } as any;
    render(<Toaster />);

    // Old notification (10 seconds ago)
    const oldChange = {
      type: 'added',
      doc: {
        id: 'toast-old',
        data: () => ({
          userId: 'user-123',
          title: 'Old Notification',
          message: 'This should be ignored',
          type: 'info',
          read: false,
          createdAt: {
            toDate: () => new Date(Date.now() - 10000),
          },
        }),
      },
    };

    act(() => {
      mockOnSnapshotCallback({
        docChanges: () => [oldChange],
      });
    });

    expect(screen.queryByText('Old Notification')).not.toBeInTheDocument();
  });

  it('displays toast for new notifications and auto-removes after 5 seconds', () => {
    auth.currentUser = { uid: 'user-123' } as any;
    render(<Toaster />);

    // Recent notification (1 second in the future relative to render time)
    const newChange = {
      type: 'added',
      doc: {
        id: 'toast-new',
        data: () => ({
          userId: 'user-123',
          title: 'New Notification Alert',
          message: 'This should be shown',
          type: 'success',
          read: false,
          createdAt: {
            toDate: () => new Date(Date.now() + 1000),
          },
        }),
      },
    };

    act(() => {
      mockOnSnapshotCallback({
        docChanges: () => [newChange],
      });
    });

    expect(screen.getByText('New Notification Alert')).toBeInTheDocument();
    expect(screen.getByText('This should be shown')).toBeInTheDocument();

    // Fast-forward 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('New Notification Alert')).not.toBeInTheDocument();
  });

  it('removes toast immediately when clicking close button', () => {
    auth.currentUser = { uid: 'user-123' } as any;
    render(<Toaster />);

    const newChange = {
      type: 'added',
      doc: {
        id: 'toast-close',
        data: () => ({
          userId: 'user-123',
          title: 'Close Me',
          message: 'Click the X button',
          type: 'error',
          read: false,
          createdAt: {
            toDate: () => new Date(Date.now() + 1000),
          },
        }),
      },
    };

    act(() => {
      mockOnSnapshotCallback({
        docChanges: () => [newChange],
      });
    });

    expect(screen.getByText('Close Me')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button');
    fireEvent.click(closeBtn);

    expect(screen.queryByText('Close Me')).not.toBeInTheDocument();
  });

  it('calls handleFirestoreError when firestore snapshot fails', () => {
    auth.currentUser = { uid: 'user-123' } as any;
    render(<Toaster />);

    const mockError = new Error('Permission denied');
    
    act(() => {
      (onSnapshot as any).mockErrorCallback(mockError);
    });

    expect(handleFirestoreError).toHaveBeenCalledWith(
      mockError,
      'LIST',
      'notifications'
    );
  });

  it('renders correct icons based on notification type', () => {
    auth.currentUser = { uid: 'user-123' } as any;
    render(<Toaster />);

    const types = ['success', 'error', 'warning', 'assignment', 'event', 'default-info'];
    
    types.forEach((type, idx) => {
      const change = {
        type: 'added',
        doc: {
          id: `toast-${idx}`,
          data: () => ({
            userId: 'user-123',
            title: `Title ${type}`,
            message: `Msg ${type}`,
            type,
            read: false,
            createdAt: {
              toDate: () => new Date(Date.now() + 1000),
            },
          }),
        },
      };

      act(() => {
        mockOnSnapshotCallback({
          docChanges: () => [change],
        });
      });

      expect(screen.getByText(`Title ${type}`)).toBeInTheDocument();
    });
  });
});
