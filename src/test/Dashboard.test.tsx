import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import Dashboard from '../views/Dashboard';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import React from 'react';

// Mock dependencies
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../App', () => ({
  useLayout: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn((_, callback) => {
    callback({
      docs: [],
      size: 0,
    });
    return vi.fn();
  }),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  collectionGroup: vi.fn(),
  where: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST' },
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default: callback fires immediately so loading resolves
    vi.mocked(onSnapshot).mockImplementation((_, callback: any) => {
      callback({ docs: [], size: 0 });
      return vi.fn();
    });
    (useAuth as any).mockReturnValue({
      user: { displayName: 'Test User' },
    });
    (useLayout as any).mockReturnValue({
      isSidebarCollapsed: false,
    });
  });

  it('renders loading state initially by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn()); // Don't call callback → stays loading

    render(<Dashboard />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders dashboard with greeted user', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText(/Good/)).toBeInTheDocument();
      expect(screen.getByText(/Test/)).toBeInTheDocument();
      expect(screen.getByText('Total Contacts')).toBeInTheDocument();
      expect(screen.getByText('Recent Follow-ups')).toBeInTheDocument();
      expect(screen.getByText('Contact Log')).toBeInTheDocument();
    });
  });

  it('shows no recent activity when empty', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('No recent activity to show.')).toBeInTheDocument();
      expect(screen.getByText('No pending tasks.')).toBeInTheDocument();
    });
  });
});
