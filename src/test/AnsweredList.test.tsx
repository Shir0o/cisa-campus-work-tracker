import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import AnsweredList from '../views/AnsweredList';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  query: vi.fn((ref) => ref),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: {
    LIST: 'list',
  },
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../components/modals/ContactDetailsModal', () => ({
  default: ({ isOpen, onClose, contact }: any) =>
    isOpen ? (
      <div data-testid="contact-modal">
        Contact Modal for {contact?.name}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
}));

const mockContacts = [
  {
    id: 'c1',
    data: () => ({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      role: 'Student',
      stage: 'Lead',
      avatar: 'http://example.com/alice.jpg',
    }),
  },
  {
    id: 'c2',
    data: () => ({
      name: 'Bob Smith',
      email: 'bob@example.com',
      role: 'Leader',
      stage: 'Regular',
      avatar: 'http://example.com/bob.jpg',
    }),
  },
];

const mockPrayers = [
  {
    id: 'p1',
    data: () => ({
      contactId: 'c1',
      burden: 'Strength for finals',
      date: '2026-06-10T00:00:00.000Z',
      status: 'answered',
      answer: 'Passed with high grades!',
      answeredAt: 'Jul 5, 2026',
    }),
  },
  {
    id: 'p2',
    data: () => ({
      contactId: 'c2',
      burden: 'Health and recovery',
      date: '2026-06-11T00:00:00.000Z',
      status: 'answered',
      answer: 'Fully recovered and back to school.',
      answeredAt: 'Jan 2, 2025',
    }),
  },
  {
    id: 'p3',
    data: () => ({
      contactId: null,
      burden: 'Personal unanswered prayer',
      date: '2026-06-12T00:00:00.000Z',
      status: 'pending',
    }),
  },
  {
    id: 'p4',
    data: () => ({
      contactId: 'c1',
      burden: 'Wisdom for decisions',
      date: '2026-06-08T00:00:00.000Z',
      status: 'answered',
      answer: 'Decided on career path.',
      answeredAt: 'Jul 4, 2026',
    }),
  },
  {
    id: 'p5',
    data: () => ({
      contactId: 'c1',
      burden: 'Invalid date prayer',
      date: '2026-06-12T00:00:00.000Z',
      status: 'answered',
      answer: 'Passed with issues',
      answeredAt: '',
      updatedAt: 'invalid-date',
    }),
  },
  {
    id: 'p6',
    data: () => ({
      contactId: null,
      burden: 'Team prayer',
      date: '2026-06-08T00:00:00.000Z',
      status: 'answered',
      answer: 'Team was blessed',
      answeredAt: 'Jul 3, 2026',
    }),
  },
  {
    id: 'p7',
    data: () => ({
      contactId: null,
      burden: 'Past team prayer',
      date: '2026-06-12T00:00:00.000Z',
      status: 'answered',
      answer: 'Past blessing',
      answeredAt: 'Jan 1, 2025',
    }),
  },
  {
    id: 'p8',
    data: () => ({
      contactId: 'c1',
      burden: 'Fallback date prayer',
      date: '2026-06-05T00:00:00.000Z',
      status: 'answered',
      answer: 'Passed fallback',
      answeredAt: '',
      updatedAt: '',
    }),
  },
];

describe('AnsweredList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      if (ref?.path === 'contacts') {
        callback({ docs: mockContacts, size: 2 });
      } else {
        callback({ docs: mockPrayers, size: 8 });
      }
      return vi.fn();
    });

    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
    });
  });

  it('renders initial loading state', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());
    render(<AnsweredList />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders answered list and groups testimonies by date', async () => {
    render(<AnsweredList />);

    await waitFor(() => {
      expect(screen.getAllByText('Answered').length).toBeGreaterThan(0);
      // Testimonies should render
      expect(screen.getByText('Passed with high grades!')).toBeInTheDocument();
      expect(screen.getByText('Fully recovered and back to school.')).toBeInTheDocument();
      expect(screen.getByText('Passed with issues')).toBeInTheDocument();
      // Contact names should match
      expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThan(0);
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      // Sections should render
      expect(screen.getByText('Recent answers')).toBeInTheDocument();
      expect(screen.getByText('Earlier this year')).toBeInTheDocument();
      // Unanswered date formatted to "Recently" should render
      expect(screen.getAllByText(/answered Recently/i).length).toBeGreaterThan(0);
      // Whole Team fallback should render
      expect(screen.getAllByText('Whole Team').length).toBeGreaterThan(1);
      expect(screen.getByText('Team was blessed')).toBeInTheDocument();
      expect(screen.getByText('Past blessing')).toBeInTheDocument();
      expect(screen.getByText('Passed fallback')).toBeInTheDocument();
      // Avatar image should be in the document
      const avatars = screen.getAllByRole('img');
      expect(avatars.length).toBeGreaterThan(0);
      expect(avatars[0]).toHaveAttribute('src', 'http://example.com/alice.jpg');
      // Unanswered prayer should NOT render
      expect(screen.queryByText('Personal unanswered prayer')).not.toBeInTheDocument();
    });
  });

  it('handles navigation toggle to active prayers', async () => {
    render(<AnsweredList />);

    await waitFor(() => {
      expect(screen.getByText('On our hearts')).toBeInTheDocument();
    });

    const activeToggle = screen.getByRole('button', { name: 'On our hearts' });
    fireEvent.click(activeToggle);
    expect(mockNavigate).toHaveBeenCalledWith('/prayer');
  });

  it('allows opening and closing contact details modal', async () => {
    render(<AnsweredList />);

    await waitFor(() => {
      expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThan(0);
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    // Click on Alice card/name
    const contactTrigger = screen.getAllByText('Alice Johnson')[0];
    fireEvent.click(contactTrigger);

    // Modal should open
    expect(screen.getByTestId('contact-modal')).toBeInTheDocument();
    expect(screen.getByText('Contact Modal for Alice Johnson')).toBeInTheDocument();

    // Close modal
    let closeBtn = screen.getByText('Close');
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('contact-modal')).not.toBeInTheDocument();

    // Click on Bob card/name (earlier section)
    const earlierContactTrigger = screen.getByText('Bob Smith');
    fireEvent.click(earlierContactTrigger);

    expect(screen.getByTestId('contact-modal')).toBeInTheDocument();
    expect(screen.getByText('Contact Modal for Bob Smith')).toBeInTheDocument();

    closeBtn = screen.getByText('Close');
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('contact-modal')).not.toBeInTheDocument();
  });

  it('surfaces load error when snapshot listener fails', async () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, onError?: any) => {
      onError?.(new Error('Permission denied'));
      return vi.fn();
    });

    render(<AnsweredList />);

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load/i)).toBeInTheDocument();
    });
  });
});
