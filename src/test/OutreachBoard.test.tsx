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
  query: vi.fn(),
  orderBy: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
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

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
}));

// Mock useLayout from App
vi.mock('../App', () => ({
  useLayout: () => ({
    isSidebarCollapsed: false,
    setIsSidebarCollapsed: vi.fn(),
  }),
}));

// Mock Firebase hooks or state if needed
// Assuming stages are fetched via some hook or state. 
// For now, I'll mock components that might break.

describe('OutreachBoard Features', () => {
  it('renders "Stage" header and description', async () => {
    render(<OutreachBoard />);
    expect(await screen.findByRole('heading', { name: /Stage/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Manage contact progression and relationship stages/i)).toBeInTheDocument();
  });

  it('renders search input with correct placeholder', async () => {
    render(<OutreachBoard />);
    const searchInput = await screen.findByPlaceholderText(/Search board/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('shows "No stages configured" when no stages exist', async () => {
    render(<OutreachBoard />);
    // Initial state from mock is empty docs
    expect(await screen.findByText(/No stages configured/i)).toBeInTheDocument();
  });

  it('shows "Add Stage" button for admin users', async () => {
    render(<OutreachBoard />);
    const addStageBtn = await screen.findByRole('button', { name: /Add Stage/i });
    expect(addStageBtn).toBeInTheDocument();
  });
});
