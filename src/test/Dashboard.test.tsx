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
      openNewContact: vi.fn(),
    });
  });

  it('renders loading state initially by mocking onSnapshot delay', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn()); // Don't call callback → stays loading

    render(<Dashboard />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders the warm greeting, care sections and quiet figures footer', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening), Test\./)).toBeInTheDocument();
      expect(screen.getByText('People to reach out to')).toBeInTheDocument();
      expect(screen.getByText('New faces')).toBeInTheDocument();
      expect(screen.getByText('This week')).toBeInTheDocument();
      expect(screen.getByText("Prayers we're carrying")).toBeInTheDocument();
      expect(
        screen.getByText('Numbers are just a way of noticing people.'),
      ).toBeInTheDocument();
    });
  });

  it('does not surface KPI cards, sparklines or DB ids', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('People to reach out to')).toBeInTheDocument();
    });
    expect(screen.queryByText('Total Contacts')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Follow-ups')).not.toBeInTheDocument();
    expect(screen.queryByText('Contact Log')).not.toBeInTheDocument();
  });

  it('shows warm empty states when there is no data', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(
        screen.getByText("No one's overdue for a hello — you're all caught up."),
      ).toBeInTheDocument();
      expect(screen.getByText('No new faces in the last two weeks.')).toBeInTheDocument();
      expect(screen.getByText('Nothing on the calendar this week yet.')).toBeInTheDocument();
      expect(screen.getByText('No open prayers right now.')).toBeInTheDocument();
    });
  });
});
