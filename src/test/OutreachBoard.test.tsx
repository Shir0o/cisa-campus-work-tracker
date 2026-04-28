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

describe('OutreachBoard FAB Accessibility and Responsiveness', () => {
  it('renders fixed "Add Stage" button with correct responsive positioning', async () => {
    render(<OutreachBoard />);
    
    // Use findByTitle to wait for loading to finish
    const addStageBtn = await screen.findByTitle(/Add New Stage/i);
    expect(addStageBtn).toBeInTheDocument();
    
    const container = addStageBtn.parentElement;
    expect(container).toHaveClass('fixed');
    
    // Verify responsive bottom spacing to avoid overlapping with bottom nav
    expect(container).toHaveClass('bottom-44');     // Default (mobile)
    expect(container).toHaveClass('sm:bottom-24');  // Small/Medium
    expect(container).toHaveClass('md:bottom-24');  // Medium
    expect(container).toHaveClass('lg:bottom-8');   // Large
  });

  it('Accessibility: "Add Stage" button has meaningful text for screen readers', async () => {
    render(<OutreachBoard />);
    const addStageBtn = await screen.findByTitle(/Add New Stage/i);
    
    // It should contain "Add Stage" text
    expect(addStageBtn).toHaveTextContent(/Add Stage/i);
  });
});
