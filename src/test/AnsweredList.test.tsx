import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom';
import AnsweredList from '../views/AnsweredList';
import { parsePrayerDate } from '../views/AnsweredList';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';
import { LanguageProvider } from '../components/LanguageProvider';

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

/** Where the reader is, so a route change is assertable. */
function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="from">{(location.state as { from?: string } | null)?.from ?? ''}</div>
    </>
  );
}

/** Stand-in for the real person page the shell renders at `/people/:contactId`. */
function PersonPage() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  return (
    <div data-testid="person-page">
      Person {contactId}
      <button type="button" onClick={() => navigate(-1)}>
        Browser back
      </button>
    </div>
  );
}

/**
 * The Answered wall sits inside the app shell's router: opening a person is a
 * route push, so the phone's Back button returns to the wall (#1823).
 */
function renderList() {
  return render(
    <MemoryRouter initialEntries={['/answered']}>
      <LocationProbe />
      <Routes>
        <Route path="/answered" element={<AnsweredList />} />
        <Route path="/prayer" element={<div data-testid="prayer-page" />} />
        <Route path="/people/:contactId" element={<PersonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

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

// Fixtures are anchored to a fixed "now" so the component's rolling 90-day
// "Recent answers" window never ages out. `recent` offsets stay well inside the
// window; `earlier` offsets stay well outside it.
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

const mockPrayers = [
  {
    id: 'p1',
    data: () => ({
      contactId: 'c1',
      burden: 'Strength for finals',
      date: daysAgo(120),
      status: 'answered',
      answer: 'Passed with high grades!',
      answeredAt: daysAgo(10),
    }),
  },
  {
    id: 'p2',
    data: () => ({
      contactId: 'c2',
      burden: 'Health and recovery',
      date: daysAgo(260),
      status: 'answered',
      answer: 'Fully recovered and back to school.',
      answeredAt: daysAgo(200),
    }),
  },
  {
    id: 'p3',
    data: () => ({
      contactId: null,
      burden: 'Personal unanswered prayer',
      date: daysAgo(120),
      status: 'pending',
    }),
  },
  {
    id: 'p4',
    data: () => ({
      contactId: 'c1',
      burden: 'Wisdom for decisions',
      date: daysAgo(120),
      status: 'answered',
      answer: 'Decided on career path.',
      answeredAt: daysAgo(12),
    }),
  },
  {
    id: 'p5',
    data: () => ({
      contactId: 'c1',
      burden: 'Invalid date prayer',
      date: daysAgo(120),
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
      date: daysAgo(120),
      status: 'answered',
      answer: 'Team was blessed',
      answeredAt: daysAgo(15),
    }),
  },
  {
    id: 'p7',
    data: () => ({
      contactId: null,
      burden: 'Past team prayer',
      date: daysAgo(260),
      status: 'answered',
      answer: 'Past blessing',
      answeredAt: daysAgo(210),
    }),
  },
  {
    id: 'p8',
    data: () => ({
      contactId: 'c1',
      burden: 'Fallback date prayer',
      date: daysAgo(200),
      status: 'answered',
      answer: 'Passed fallback',
      answeredAt: '',
      updatedAt: '',
    }),
  },
];

describe('parsePrayerDate', () => {
  it('reads a stored display date in the current year', () => {
    expect(parsePrayerDate('Oct 18', new Date('2026-10-24T12:00:00'))!.getFullYear()).toBe(2026);
  });

  it('rolls a December answer back to last year when read in January', () => {
    expect(parsePrayerDate('Dec 28', new Date('2026-01-03T12:00:00'))!.getFullYear()).toBe(2025);
  });

  it('reads a date-only ISO string as local midnight, not UTC', () => {
    const day = parsePrayerDate('2026-10-20')!;
    expect(day.getDate()).toBe(20);
    expect(day.getHours()).toBe(0);
  });

  it('returns null for a value with no date in it', () => {
    expect(parsePrayerDate('invalid-date')).toBeNull();
    expect(parsePrayerDate('')).toBeNull();
    expect(parsePrayerDate(null)).toBeNull();
  });
});

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
    localStorage.setItem('cisa_language', 'en');
  });

  it('renders initial loading state', () => {
    vi.mocked(onSnapshot).mockImplementation(() => vi.fn());
    renderList();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders answered list and groups testimonies by date', async () => {
    renderList();

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
      expect(screen.getByText('Earlier answers')).toBeInTheDocument();
      // An unparseable answeredAt falls back to the prayer's own date rather
      // than printing a broken string.
      expect(screen.getAllByText(/answered ([A-Z][a-z]{2} \d{1,2}|Recently)/).length).toBeGreaterThan(0);
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

  it('renders answer photos on recent and earlier answered prayers (#1690)', async () => {
    const withPhotos = [
      {
        id: 'recent-photo',
        data: () => ({
          contactId: 'c1',
          burden: 'Argentina trip',
          date: daysAgo(140),
          status: 'answered',
          answer: 'Sent to Argentina!',
          answeredAt: daysAgo(5),
          answeredPhotos: [
            {
              path: 'photos/argentina-1.jpg',
              url: 'http://example.com/argentina-1.jpg',
              name: 'Argentina trip',
            },
          ],
        }),
      },
      {
        id: 'earlier-photo',
        data: () => ({
          contactId: 'c2',
          burden: 'Old burden',
          date: daysAgo(300),
          status: 'answered',
          answer: 'Answered long ago',
          answeredAt: daysAgo(180),
          answeredPhotos: [
            {
              path: 'photos/argentina-2.jpg',
              url: 'http://example.com/argentina-2.jpg',
              name: 'Argentina team',
            },
            // No download URL: renders as an icon placeholder, not an <img>.
            { path: 'photos/pending.jpg', name: 'Pending photo' },
          ],
        }),
      },
      {
        id: 'recent-no-photos',
        data: () => ({
          contactId: 'c1',
          burden: 'Empty photo list',
          date: daysAgo(120),
          status: 'answered',
          answer: 'Answered without a photo',
          answeredAt: daysAgo(7),
          answeredPhotos: [],
        }),
      },
      {
        id: 'earlier-no-photos',
        data: () => ({
          contactId: 'c2',
          burden: 'Legacy testimony',
          date: daysAgo(240),
          status: 'answered',
          answer: 'Answered before photos existed',
          answeredAt: daysAgo(200),
        }),
      },
    ];

    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      callback({
        docs: ref?.path === 'contacts' ? mockContacts : withPhotos,
        size: withPhotos.length,
      });
      return vi.fn();
    });

    renderList();

    await waitFor(() => {
      expect(screen.getByText('Sent to Argentina!')).toBeInTheDocument();
    });

    const recentCard = screen.getByText('Sent to Argentina!').closest('article')!;
    expect(within(recentCard).getByAltText('Argentina trip')).toHaveAttribute(
      'src',
      'http://example.com/argentina-1.jpg'
    );

    const earlierCard = screen.getByText('Answered long ago').closest('article')!;
    expect(within(earlierCard).getByAltText('Argentina team')).toHaveAttribute(
      'src',
      'http://example.com/argentina-2.jpg'
    );
    expect(within(earlierCard).getByTitle('Pending photo')).toBeInTheDocument();

    // No photos (empty array and legacy record): only the contact avatar renders.
    const emptyCard = screen.getByText('Answered without a photo').closest('article')!;
    expect(within(emptyCard).getAllByRole('img')).toHaveLength(1);
    const legacyCard = screen.getByText('Answered before photos existed').closest('article')!;
    expect(within(legacyCard).getAllByRole('img')).toHaveLength(1);
  });

  it('handles navigation toggle to active prayers', async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText('On our hearts')).toBeInTheDocument();
    });

    const activeToggle = screen.getByRole('button', { name: 'On our hearts' });
    fireEvent.click(activeToggle);
    await waitFor(() => expect(screen.getByTestId('pathname')).toHaveTextContent('/prayer'));
  });

  it('opens a person on their own URL, and Back returns to the wall (#1823)', async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThan(0);
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    // Tapping a card must push the person's own URL: the wall is replaced by a
    // page, not covered by a modal that leaves the reader on `/answered`.
    fireEvent.click(screen.getAllByText('Alice Johnson')[0]);

    await waitFor(() => expect(screen.getByTestId('pathname')).toHaveTextContent('/people/c1'));
    expect(screen.getByTestId('person-page')).toHaveTextContent('c1');
    // The person page's trail says where they came from, so "back to Answered"
    // is a real destination rather than the directory.
    expect(screen.getByTestId('from')).toHaveTextContent('/answered');

    // The phone's Back button: back to the wall you were reading (same person,
    // same list), not out to home.
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    await waitFor(() => expect(screen.getByTestId('pathname')).toHaveTextContent('/answered'));
    expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThan(0);
    expect(screen.getByText('Passed with high grades!')).toBeInTheDocument();
  });

  it("opens the earlier section's person by route too (#1823)", async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Bob Smith'));

    await waitFor(() => expect(screen.getByTestId('pathname')).toHaveTextContent('/people/c2'));
    expect(screen.getByTestId('person-page')).toHaveTextContent('c2');
  });

  it('files an answer stored as a display date under Recent answers and counts it this year (#1766)', async () => {
    // The prayer controls write `answeredAt` as a display string ("Oct 18"), so
    // `new Date()` reads it as 2001 and the answer falls out of "this year".
    const stored = [
      {
        id: 'p-stored',
        data: () => ({
          contactId: 'c1',
          burden: 'Wisdom for the placement interview',
          date: daysAgo(20),
          status: 'answered',
          answer: 'She got the placement.',
          answeredAt: 'Oct 18',
        }),
      },
    ];
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      callback({ docs: ref?.path === 'contacts' ? mockContacts : stored, size: stored.length });
      return vi.fn();
    });

    const { container } = renderList();

    await waitFor(() => {
      expect(screen.getByText('She got the placement.')).toBeInTheDocument();
    });

    const recent = screen.getByText('Recent answers').closest('section')!;
    expect(within(recent).getByText('She got the placement.')).toBeInTheDocument();
    expect(container.querySelector('.ans-count-n')?.textContent).toBe('1');
    expect(screen.getByText(/answered Oct 18/)).toBeInTheDocument();
    expect(screen.queryByText(/2001/)).not.toBeInTheDocument();
  });

  it('formats the answer date in the reader language (#1766)', async () => {
    const stored = [
      {
        id: 'p-es',
        data: () => ({
          contactId: 'c1',
          burden: 'Sabiduría para la entrevista',
          date: daysAgo(20),
          status: 'answered',
          answer: 'Consiguió la plaza.',
          answeredAt: 'Oct 18',
        }),
      },
    ];
    vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
      callback({ docs: ref?.path === 'contacts' ? mockContacts : stored, size: stored.length });
      return vi.fn();
    });
    localStorage.setItem('cisa_language', 'es');

    render(
      <MemoryRouter initialEntries={['/answered']}>
        <LanguageProvider>
          <AnsweredList />
        </LanguageProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/18 oct/)).toBeInTheDocument();
    });
  });

  it('offers a keyboard-reachable control that opens the person from a card (#1766)', async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThan(0);
    });

    const openers = screen.getAllByRole('button', { name: 'Alice Johnson' });
    expect(openers.length).toBeGreaterThan(0);
    fireEvent.click(openers[0]);
    await waitFor(() => expect(screen.getByTestId('pathname')).toHaveTextContent('/people/c1'));
  });

  it('surfaces load error when snapshot listener fails', async () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, onError?: any) => {
      onError?.(new Error('Permission denied'));
      return vi.fn();
    });

    renderList();

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load/i)).toBeInTheDocument();
    });
  });
});
