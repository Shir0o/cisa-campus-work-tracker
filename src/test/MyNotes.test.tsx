import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import MyNotes from '../views/MyNotes';
import { useAuth } from '../components/AuthProvider';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// The notes query goes through onSnapshot.
let noteDocs: any[] = [];
let notesError: unknown = null;
let notesSnapshotCallback: ((cb: any, onErr: any) => void) | null = null;

const asSnapshot = (docs: any[]) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d })),
  forEach: (fn: any) => docs.forEach((d) => fn({ id: d.id, data: () => d })),
});

vi.mock('firebase/firestore', () => ({
  collection: (_db: any, ...path: string[]) => ({ __path: path.join('/') }),
  query: (col: any) => ({ __path: col.__path }),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  doc: vi.fn(),
  onSnapshot: (q: any, cb: any, onErr: any) => {
    if (notesSnapshotCallback) {
      notesSnapshotCallback(cb, onErr);
    } else if (notesError) {
      onErr(notesError);
    } else {
      cb(asSnapshot(noteDocs));
    }
    return vi.fn();
  },
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { WRITE: 'WRITE' },
  logActivity: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: React.forwardRef(({ children, initial, animate, exit, transition, ...props }: any, ref: any) => (
      <div ref={ref} {...props}>{children}</div>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const signIn = (over: Record<string, unknown> = {}) => {
  (useAuth as any).mockReturnValue({
    user: {
      uid: 'u1',
      email: 'jane@test.com',
      displayName: 'Jane Student',
      getIdToken: vi.fn().mockResolvedValue('mock-token'),
    },
    role: 'manager',
    ownerViewRole: null,
    ...over,
  });
};

const NOTE = {
  id: 'n1',
  userId: 'u1',
  userName: 'Jane Student',
  type: 'enhancement',
  kind: 'idea',
  message: 'It would help if the roster remembered walk-ins.',
  status: 'in_progress',
  createdAt: '2026-09-01T12:00:00.000Z',
  githubIssueUrl: 'https://github.com/Shir0o/cisa-campus-work-tracker/issues/900',
};

describe('MyNotes — your reports and what came of them', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noteDocs = [];
    notesError = null;
    notesSnapshotCallback = null;
    signIn();
  });

  it('renders skeleton loaders while loading notes and does not flash empty state', () => {
    let fireSnapshot: ((snapshot: any) => void) | null = null;
    notesSnapshotCallback = (cb) => {
      fireSnapshot = cb;
    };

    render(<MyNotes />);

    expect(screen.getByTestId('my-notes-loading-skeletons')).toBeInTheDocument();
    expect(screen.queryByText(/haven't sent a report yet/i)).not.toBeInTheDocument();

    act(() => {
      fireSnapshot!(asSnapshot([]));
    });

    expect(screen.queryByTestId('my-notes-loading-skeletons')).not.toBeInTheDocument();
    expect(screen.getByText(/haven't sent a report yet/i)).toBeInTheDocument();
  });

  it('transitions from skeleton loaders to rendered note cards when data arrives', () => {
    let fireSnapshot: ((snapshot: any) => void) | null = null;
    notesSnapshotCallback = (cb) => {
      fireSnapshot = cb;
    };

    render(<MyNotes />);

    expect(screen.getByTestId('my-notes-loading-skeletons')).toBeInTheDocument();
    expect(screen.queryByText(NOTE.message)).not.toBeInTheDocument();

    act(() => {
      fireSnapshot!(asSnapshot([NOTE]));
    });

    expect(screen.queryByTestId('my-notes-loading-skeletons')).not.toBeInTheDocument();
    expect(screen.getByText(NOTE.message)).toBeInTheDocument();
  });

  it('renders the notes heading', () => {
    render(<MyNotes />);
    expect(screen.getByRole('heading', { name: 'Your reports' })).toBeInTheDocument();
  });

  it('is not a composer — there is no kind picker on the page', () => {
    noteDocs = [NOTE];
    render(<MyNotes />);
    expect(screen.queryByText('What kind of note is it?')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Tell us more/i })).not.toBeInTheDocument();
  });

  it('points a first-time visitor at the report button', () => {
    render(<MyNotes />);
    expect(screen.getByText(/haven't sent a report yet/i)).toBeInTheDocument();
  });

  it('says so when the notes query fails, instead of rendering nothing', () => {
    notesError = new Error('permission-denied');
    render(<MyNotes />);
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load your reports/i);
  });

  it('shows an open report as having no news rather than promising a resolution', () => {
    noteDocs = [NOTE];
    render(<MyNotes />);
    expect(screen.getByText('We have this — no news yet')).toBeInTheDocument();
  });

  // The fixed sentences are the guarantee that something always arrives. None
  // of them may be replaced by prose written in a pull request.
  const CANNED = [
    { outcome: 'shipped', copy: /This shipped! Thank you/ },
    { outcome: 'not-planned', copy: /aren't planning to build it right now/ },
    { outcome: 'already-there', copy: /already in the app/ },
  ] as const;

  it.each(CANNED)('shows the canned $outcome sentence', ({ outcome, copy }) => {
    noteDocs = [{ ...NOTE, outcome }];
    render(<MyNotes />);
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it.each(CANNED)(
    'never shows a PR-written $outcome sentence, even on a legacy note that carries one',
    ({ outcome, copy }) => {
      noteDocs = [
        {
          ...NOTE,
          outcome,
          outcomeMessage: 'A sentence a pull request wrote about this change.',
        },
      ];
      render(<MyNotes />);
      expect(screen.getByText(copy)).toBeInTheDocument();
      expect(
        screen.queryByText('A sentence a pull request wrote about this change.'),
      ).not.toBeInTheDocument();
    },
  );

  it('shows a not-planned note rather than hiding it, even when archived', () => {
    noteDocs = [{ ...NOTE, outcome: 'not-planned', archived: true }];
    render(<MyNotes />);
    expect(screen.getByText('Not planned')).toBeInTheDocument();
  });

  // Replies are cut (cut-or-keep §15): no Follow-up control, no thread, and no
  // reply state on the card.
  it('offers no follow-up thread or reply control', () => {
    noteDocs = [{ ...NOTE, awaitingReply: false, replyCount: 2 }];
    render(<MyNotes />);
    expect(screen.queryByRole('button', { name: /Replies/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Read the reply/i })).not.toBeInTheDocument();
    expect(screen.queryByText('The team replied')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // The owner view is cut with the admin console: the owner reads the same
  // canned sentence as everyone else.
  it('gives the owner the same canned sentence as a submitter', () => {
    signIn({
      user: { uid: 'u1', email: 'owner@test.com', displayName: 'Owner', getIdToken: vi.fn() },
      role: 'admin',
    });
    noteDocs = [{ ...NOTE, outcome: 'shipped', outcomeMessage: 'A PR-written sentence.' }];
    render(<MyNotes />);
    expect(screen.getByText(/This shipped! Thank you/)).toBeInTheDocument();
    expect(screen.queryByText('A PR-written sentence.')).not.toBeInTheDocument();
  });
});
