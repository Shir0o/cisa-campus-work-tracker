import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import OutreachBoard from '../views/OutreachBoard';

// Mock Auth
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: '123' },
    isAdmin: true,
    role: 'admin',
    isApproved: true,
    loading: false,
  }),
}));

// Mock Firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn() })),
  onSnapshot: vi.fn((q, callback) => {
    // Immediately call callback with empty data to trigger loading=false
    callback({
      docs: []
    });
    return vi.fn(); // Unsubscribe
  }),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  limit: vi.fn(),
  getFirestore: vi.fn(() => ({})),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

// Mock useLayout from App
vi.mock('../App', () => ({
  useLayout: () => ({
    isSidebarCollapsed: false,
    setIsSidebarCollapsed: vi.fn(),
    setSelectedContact: vi.fn(),
    openNewContact: vi.fn(),
  }),
}));

// Mock Firebase hooks or state if needed
// Assuming stages are fetched via some hook or state. 
// For now, I'll mock components that might break.

describe('OutreachBoard Features', () => {
  it('renders the "The Journey" header', async () => {
    render(<OutreachBoard />);
    expect(await screen.findByRole('heading', { name: /The Journey/i, level: 1 })).toBeInTheDocument();
  });

  it('renders search input with correct placeholder', async () => {
    render(<OutreachBoard />);
    const searchInput = await screen.findByPlaceholderText(/Find someone/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('shows the empty journey state when no stages exist', async () => {
    render(<OutreachBoard />);
    // Initial state from mock is empty docs
    expect(await screen.findByText(/journey hasn't been mapped yet/i)).toBeInTheDocument();
  });

  it('shows the "Shape the journey" button for admin users', async () => {
    render(<OutreachBoard />);
    const shapeBtn = await screen.findByRole('button', { name: /Shape the journey/i });
    expect(shapeBtn).toBeInTheDocument();
  });
});
