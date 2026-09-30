import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import MyNotes from '../views/MyNotes';
import { useAuth } from '../components/AuthProvider';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// The notes query and each Follow-up thread both go through onSnapshot; the
// mock routes on the collection path so a test can seed them independently.
let noteDocs: any[] = [];
let replyDocs: any[] = [];
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
    if (q.__path === 'feedback') {
      if (notesSnapshotCallback) {
        notesSnapshotCallback(cb, onErr);
      } else {
        if (notesError) onErr(notesError);
        else cb(asSnapshot(noteDocs));
      }
    } else {
      cb(asSnapshot(replyDocs));
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
    role: 'operator',
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

describe('MyNotes — your own notes and their follow-ups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noteDocs = [];
    replyDocs = [];
    notesError = null;
    notesSnapshotCallback = null;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, mirroredToGitHub: true }),
    });
    signIn();
  });

  it('renders skeleton loaders while loading notes and does not flash empty state', () => {
    let fireSnapshot: ((snapshot: any) => void) | null = null;
    notesSnapshotCallback = (cb) => {
      fireSnapshot = cb;
    };

    render(<MyNotes />);

    expect(screen.getByTestId('my-notes-loading-skeletons')).toBeInTheDocument();
    expect(screen.queryByText(/haven't left a note yet/i)).not.toBeInTheDocument();

    // Now resolve with empty notes
    act(() => {
      fireSnapshot!(asSnapshot([]));
    });

    expect(screen.queryByTestId('my-notes-loading-skeletons')).not.toBeInTheDocument();
    expect(screen.getByText(/haven't left a note yet/i)).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: 'Your notes' })).toBeInTheDocument();
  });

  it('is no longer a composer — there is no kind picker on the page', () => {
    noteDocs = [NOTE];
    render(<MyNotes />);
    expect(screen.queryByText('What kind of note is it?')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Tell us more/i })).not.toBeInTheDocument();
  });

  it('points a first-time visitor at the note button', () => {
    render(<MyNotes />);
    expect(screen.getByText(/haven't left a note yet/i)).toBeInTheDocument();
  });

  it('says so when the notes query fails, instead of rendering nothing', () => {
    notesError = new Error('permission-denied');
    render(<MyNotes />);
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load your notes/i);
  });

  it('shows an open note as having no news rather than promising a resolution', () => {
    noteDocs = [NOTE];
    render(<MyNotes />);
    expect(screen.getByText('We have this — no news yet')).toBeInTheDocument();
  });

  it('prefers the message written at close over the canned sentence', () => {
    noteDocs = [{ ...NOTE, outcome: 'shipped', outcomeMessage: 'The roster now keeps walk-ins after you close it.' }];
    render(<MyNotes />);
    expect(screen.getByText('The roster now keeps walk-ins after you close it.')).toBeInTheDocument();
    expect(screen.queryByText(/This shipped! Thank you/)).not.toBeInTheDocument();
  });

  it('falls back to the canned sentence when no close message was written', () => {
    noteDocs = [{ ...NOTE, outcome: 'shipped' }];
    render(<MyNotes />);
    expect(screen.getByText(/This shipped! Thank you/)).toBeInTheDocument();
  });

  it('shows a not-planned note rather than hiding it, even when archived', () => {
    noteDocs = [{ ...NOTE, outcome: 'not-planned', archived: true }];
    render(<MyNotes />);
    expect(screen.getByText('Not planned')).toBeInTheDocument();
    expect(screen.getByText(/aren't planning to build it right now/)).toBeInTheDocument();
  });

  describe('the owner', () => {
    const ownerNote = {
      ...NOTE,
      outcome: 'shipped' as const,
      outcomeMessage: 'The roster now keeps walk-ins.',
    };

    it('reads the canned line in full owner view', () => {
      signIn({ user: { uid: 'u1', email: 'yilongwang05@gmail.com', displayName: 'Tony Wang', getIdToken: vi.fn() }, role: 'admin', ownerViewRole: null });
      noteDocs = [ownerNote];
      render(<MyNotes />);
      expect(screen.getByText(/This shipped! Thank you/)).toBeInTheDocument();
    });

    it('sees what a submitter sees once switched into owner view', () => {
      signIn({ user: { uid: 'u1', email: 'yilongwang05@gmail.com', displayName: 'Tony Wang', getIdToken: vi.fn() }, role: 'admin', ownerViewRole: 'viewer' });
      noteDocs = [ownerNote];
      render(<MyNotes />);
      expect(screen.getByText('The roster now keeps walk-ins.')).toBeInTheDocument();
    });

    it('reads a relayed comment raw, and its restatement under owner view', async () => {
      const relayed = {
        id: 'r1',
        authorRole: 'team',
        body: 'Superseded by #917, which specifies the toolbar fix.',
        launderedBody: "We're handling this as part of a toolbar fix.",
        relayed: true,
        createdAt: '2026-09-02T12:00:00.000Z',
      };
      replyDocs = [relayed];
      noteDocs = [ownerNote];

      signIn({ user: { uid: 'u1', email: 'yilongwang05@gmail.com', displayName: 'Tony Wang', getIdToken: vi.fn() }, role: 'admin', ownerViewRole: null });
      const { unmount } = render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      expect(screen.getByText(/Superseded by #917/)).toBeInTheDocument();
      unmount();

      signIn({ user: { uid: 'u1', email: 'yilongwang05@gmail.com', displayName: 'Tony Wang', getIdToken: vi.fn() }, role: 'admin', ownerViewRole: 'viewer' });
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      expect(screen.getByText("We're handling this as part of a toolbar fix.")).toBeInTheDocument();
      expect(screen.queryByText(/Superseded by #917/)).not.toBeInTheDocument();
    });
  });

  describe('follow-ups', () => {
    beforeEach(() => {
      noteDocs = [NOTE];
    });

    it('opens the thread and warns that a reply is public before anything is typed', async () => {
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      expect(screen.getByText(/posted to our public issue tracker/i)).toBeInTheDocument();
    });

    it('keeps Send disabled until there is something to send', async () => {
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      expect(screen.getByRole('button', { name: /^Send$/i })).toBeDisabled();
    });

    it('posts a follow-up through the server route, which is the only write path', async () => {
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      await userEvent.type(screen.getByRole('textbox'), 'Which screen is it on?');
      await userEvent.click(screen.getByRole('button', { name: /^Send$/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/feedback/reply',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ id: 'n1', body: 'Which screen is it on?' }),
          })
        );
      });
    });

    it('surfaces a failure instead of losing the reply silently', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      await userEvent.type(screen.getByRole('textbox'), 'Any news?');
      await userEvent.click(screen.getByRole('button', { name: /^Send$/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/didn't send/i);
      });
    });

    it('labels who said what', async () => {
      replyDocs = [
        { id: 'r1', authorRole: 'submitter', authorName: 'Jane Student', body: 'Any news?', createdAt: '2026-09-02T12:00:00.000Z' },
        { id: 'r2', authorRole: 'team', authorName: 'Tony Wang', body: 'Shipping this week.', createdAt: '2026-09-03T12:00:00.000Z' },
      ];
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      // Rows, not bubbles: your own name shows (never "You"), and the team
      // is "The team" rather than whoever on it happened to write.
      expect(screen.queryByText('You')).not.toBeInTheDocument();
      expect(screen.getByText('Jane Student')).toBeInTheDocument();
      expect(screen.getByText('The team')).toBeInTheDocument();
      expect(screen.queryByText('Tony Wang')).not.toBeInTheDocument();
    });

    it('draws them as stream rows: a burst continues, and days are divided', async () => {
      replyDocs = [
        { id: 'r1', authorRole: 'submitter', authorId: 'u1', authorName: 'Jane Student', body: 'First thought', createdAt: '2026-09-02T12:00:00.000Z' },
        { id: 'r2', authorRole: 'submitter', authorId: 'u1', authorName: 'Jane Student', body: 'And another', createdAt: '2026-09-02T12:02:00.000Z' },
        { id: 'r3', authorRole: 'team', authorName: 'Tony Wang', body: 'Shipping this week.', createdAt: '2026-09-03T12:00:00.000Z' },
      ];
      const { container } = render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      expect(container.querySelectorAll('[data-stream-row]')).toHaveLength(3);
      // The second message within five minutes drops the name.
      expect(screen.getAllByText('Jane Student')).toHaveLength(1);
      expect(screen.getAllByRole('separator')).toHaveLength(2);
    });

    it('says Edited on a follow-up that has been edited, and only on that one', async () => {
      replyDocs = [
        { id: 'r1', authorRole: 'submitter', authorId: 'u1', authorName: 'Jane Student', body: 'Any news?', createdAt: '2026-09-02T12:00:00.000Z', editedAt: '2026-09-02T13:00:00.000Z' },
        { id: 'r2', authorRole: 'team', body: 'Shipping this week.', createdAt: '2026-09-03T12:00:00.000Z' },
      ];
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      expect(screen.getAllByText('Edited')).toHaveLength(1);
    });

    it('keeps the public-tracker line under the composer', async () => {
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      const box = screen.getByRole('textbox');
      const line = screen.getByText(/posted to our public issue tracker/i);
      expect(box.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('keeps what you typed when the send fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      await userEvent.type(screen.getByRole('textbox'), 'Any news?');
      await userEvent.click(screen.getByRole('button', { name: /^Send$/i }));
      await screen.findByRole('alert');
      expect(screen.getByRole('textbox')).toHaveValue('Any news?');
    });

    it('offers no @-mention button, thread reply or delete on a follow-up', async () => {
      replyDocs = [
        { id: 'r1', authorRole: 'submitter', authorId: 'u1', authorName: 'Jane Student', body: 'Any news?', createdAt: '2026-09-02T12:00:00.000Z' },
      ];
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      expect(screen.queryByRole('button', { name: /mention/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reply in thread/i })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
      expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('offers to edit only the author\'s own submitter replies', async () => {
      replyDocs = [
        { id: 'r1', authorRole: 'submitter', authorId: 'u1', authorName: 'Jane Student', body: 'Any news?', createdAt: '2026-09-02T12:00:00.000Z' },
        { id: 'r2', authorRole: 'team', authorName: 'Tony Wang', body: 'Shipping this week.', createdAt: '2026-09-03T12:00:00.000Z' },
        { id: 'r3', authorRole: 'submitter', authorId: 'u2', authorName: 'Somebody Else', body: 'Not mine.', createdAt: '2026-09-04T12:00:00.000Z' },
      ];
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      expect(screen.getAllByRole('button', { name: /edit/i })).toHaveLength(1);
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    });

    it('never offers to edit a relayed reply, even on the author\'s own note', async () => {
      replyDocs = [
        { id: 'r1', authorRole: 'team', authorName: 'Tony Wang', body: 'Superseded by #917.', launderedBody: 'Handled.', relayed: true, createdAt: '2026-09-02T12:00:00.000Z' },
      ];
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    });

    it('saves an edit through the server route, which is the only write path', async () => {
      replyDocs = [
        { id: 'r1', authorRole: 'submitter', authorId: 'u1', authorName: 'Jane Student', body: 'Any news?', createdAt: '2026-09-02T12:00:00.000Z' },
      ];
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      await userEvent.click(screen.getByRole('button', { name: /edit/i }));
      const editor = screen.getByRole('textbox', { name: /edit your follow-up/i });
      await userEvent.clear(editor);
      await userEvent.type(editor, 'Changed my question');
      await userEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/feedback/reply/edit',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ id: 'n1', replyId: 'r1', body: 'Changed my question' }),
          })
        );
      });
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Save$/i })).not.toBeInTheDocument());
    });

    it('cancel leaves the reply untouched and never calls the server', async () => {
      replyDocs = [
        { id: 'r1', authorRole: 'submitter', authorId: 'u1', authorName: 'Jane Student', body: 'Any news?', createdAt: '2026-09-02T12:00:00.000Z' },
      ];
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      await userEvent.click(screen.getByRole('button', { name: /edit/i }));
      const editor = screen.getByRole('textbox', { name: /edit your follow-up/i });
      await userEvent.clear(editor);
      await userEvent.type(editor, 'Should not persist');
      await userEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByText('Any news?')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Save$/i })).not.toBeInTheDocument();
    });

    it('surfaces a failure instead of losing the edit silently', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });
      replyDocs = [
        { id: 'r1', authorRole: 'submitter', authorId: 'u1', authorName: 'Jane Student', body: 'Any news?', createdAt: '2026-09-02T12:00:00.000Z' },
      ];
      render(<MyNotes />);
      await userEvent.click(screen.getByRole('button', { name: /Follow-ups/i }));
      await userEvent.click(screen.getByRole('button', { name: /edit/i }));
      await userEvent.clear(screen.getByRole('textbox', { name: /edit your follow-up/i }));
      await userEvent.type(screen.getByRole('textbox', { name: /edit your follow-up/i }), 'Changed');
      await userEvent.click(screen.getByRole('button', { name: /^Save$/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/didn't save/i);
      });
    });
  });
});
