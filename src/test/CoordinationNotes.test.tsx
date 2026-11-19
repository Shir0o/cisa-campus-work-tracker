import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, setDoc, deleteDoc, updateDoc, addDoc, where } from 'firebase/firestore';
import CoordinationNotes from '../views/CoordinationNotes';
import { useAuth } from '../components/AuthProvider';
import { LanguageProvider } from '../components/LanguageProvider';
import { logActivity } from '../lib/firebase';
import { todayISO } from '../lib/board';

// ── Auth mock ────────────────────────────────────────────────────────────────
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// ── Router seam (the view reads location.state for the My Day deep-link) ──────
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: null }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../lib/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}));

// ── TipTap (thin seam) ──────────────────────────────────────────────────────
const mockChain: any = {};
['focus', 'deleteSelection', 'insertContent', 'run'].forEach((m) => {
  mockChain[m] = vi.fn(() => mockChain);
});

const mockEditor = {
  chain: () => mockChain,
  commands: {
    setContent: vi.fn(),
    setTextSelection: vi.fn(),
  },
  isEmpty: false,
  isFocused: false,
  // Enough ProseMirror surface for the caret-preserving Markdown push and the
  // task-sync walk; a doc with no task nodes means the walk finds nothing to patch.
  state: {
    selection: { from: 0, to: 0 },
    doc: { content: { size: 0 }, descendants: () => {} },
  },
  view: { dispatch: vi.fn() },
  storage: {
    markdown: {
      getMarkdown: () => '# Team standup\n- [x] Review goals',
      parser: {
        parse: (md: string) => `<div>${md}</div>`,
      }
    }
  },
  isActive: vi.fn(() => false),
  on: vi.fn(),
  off: vi.fn(),
};

let mockActiveEditor: any = null;

vi.mock('@tiptap/react', () => ({
  useEditor: () => mockActiveEditor,
  EditorContent: () => <div data-testid="tiptap-editor">Editor</div>,
}));
vi.mock('@tiptap/starter-kit', () => ({
  StarterKit: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-collaboration', () => ({
  Collaboration: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-collaboration-caret', () => ({
  CollaborationCaret: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-task-list', () => ({
  TaskList: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-task-item', () => ({
  TaskItem: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-placeholder', () => ({
  Placeholder: { configure: () => ({}) },
}));
vi.mock('tiptap-markdown', () => ({
  Markdown: { configure: () => ({}) },
}));

// ── Yjs (thin seam) ─────────────────────────────────────────────────────────
vi.mock('yjs', () => {
  class MockDoc {
    getText() {
      return { toJSON: () => '', observe: vi.fn(), toString: () => '' };
    }
    destroy() {}
    on() {}
    off() {}
  }
  return { Doc: MockDoc };
});
vi.mock('y-protocols/awareness', () => {
  class MockAwareness {
    setLocalStateField() {}
    on() {}
    off() {}
    destroy() {}
    getStates() {
      return new Map();
    }
    get clientID() {
      return 1;
    }
  }
  return { Awareness: MockAwareness };
});
vi.mock('../lib/yjsRtdbProvider', () => {
  return {
    RtdbYjsProvider: class MockRtdbYjsProvider {
      destroy = vi.fn();
      awareness = {
        setLocalStateField: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        getStates: () => new Map(),
      };
      claimSeed = vi.fn().mockResolvedValue(true);
    }
  };
});

// ── Firestore ────────────────────────────────────────────────────────────────
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  onSnapshot: vi.fn((_ref: unknown, _cb: unknown) => vi.fn()),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  doc: vi.fn((_db: unknown, coll: string, id?: string) => ({
    path: id ? `${coll}/${id}` : coll,
    id: id || 'auto-id',
  })),
  setDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'mock-doc-id' })),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  remove: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  rtdb: {},
  handleFirestoreError: vi.fn(),
  OperationType: {
    LIST: 'LIST',
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
  },
  logActivity: vi.fn(),
}));

// ── Fixture data ─────────────────────────────────────────────────────────────
// The local date, the same clock the page's sessionStatus/today chip uses.
const today = todayISO();

const mockDocs = [
  {
    id: `doc-${today}`,
    data: () => ({
      title: `${today} — Monday`,
      date: today,
      weekday: 'Monday',
      md: '# Team standup\n- [x] Review goals',
      createdBy: 'u-admin',
      updatedAt: 'mock-ts',
    }),
  },
  {
    id: 'doc-2026-06-10',
    data: () => ({
      title: '2026-06-10 — Wednesday',
      date: '2026-06-10',
      weekday: 'Wednesday',
      md: '# Earlier meeting\n- discuss plans',
      createdBy: 'u-admin',
      updatedAt: 'mock-ts',
    }),
  },
];

const mockNotes = [
  {
    id: 'note-1',
    data: () => ({
      type: 'record',
      series: 'Weekly sync',
      title: 'Sprint planning',
      body: 'Discussed roadmap items',
      tags: ['planning', 'q3'],
      date: today,
      contributorIds: ['u-admin'],
      createdBy: 'u-admin',
    }),
  },
  {
    id: 'note-2',
    data: () => ({
      type: 'learning',
      series: 'Devotionals',
      title: 'Morning reflection',
      body: 'Grateful for the team',
      tags: [],
      date: '2026-06-10',
      contributorIds: [],
      createdBy: 'u-admin',
    }),
  },
];

const mockTeam = [
  {
    id: 'u-admin',
    data: () => ({
      uid: 'u-admin',
      displayName: 'Tony Wang',
      email: 'yilongwang05@gmail.com',
      approved: true,
      role: 'admin',
    }),
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const adminAuth = {
  user: {
    uid: 'u-admin',
    email: 'yilongwang05@gmail.com',
    displayName: 'Tony Wang',
  },
  isAdmin: true,
  role: 'admin',
  isApproved: true,
  loading: false,
};

const nonAdminAuth = {
  user: {
    uid: 'u-other',
    email: 'someone@test.com',
    displayName: 'Someone Else',
  },
  isAdmin: false,
  role: 'volunteer',
  isApproved: true,
  loading: false,
};

// A Trainee (manager) reads a role-scoped, read-only Board.
const traineeAuth = {
  user: { uid: 'u-trainee', email: 'zion@test.com', displayName: 'Zion Park' },
  isAdmin: false,
  role: 'manager',
  isApproved: true,
  loading: false,
};

/**
 * Configure path-routing onSnapshot so each collection gets its own data.
 * The callback can be skipped entirely (for loading tests) by passing `neverFire`.
 */
function setupSnapshots(
  opts: {
    docs?: typeof mockDocs;
    notes?: typeof mockNotes;
    team?: typeof mockTeam;
    contacts?: any[];
    tasks?: any[];
    neverFire?: boolean;
  } = {},
) {
  const { docs = [], notes = [], team = [], contacts = [], tasks = [], neverFire = false } = opts;
  (onSnapshot as ReturnType<typeof vi.fn>).mockImplementation(
    (ref: { path?: string }, callback: (snap: unknown) => void) => {
      if (neverFire) return vi.fn();
      const path = ref?.path || '';
      if (path === 'board_docs') {
        callback({ docs: docs, size: docs.length });
      } else if (path === 'board_notes') {
        callback({ docs: notes, size: notes.length });
      } else if (path === 'users') {
        callback({ docs: team, size: team.length });
      } else if (path === 'tasks') {
        const mappedTasks = tasks.map((t: any) => ({
          id: t.id,
          data: () => t,
        }));
        callback({ docs: mappedTasks, size: mappedTasks.length });
      } else if (path === 'contacts') {
        const mappedContacts = contacts.map((c) => ({
          id: c.id,
          data: () => c,
        }));
        callback({ docs: mappedContacts, size: mappedContacts.length });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    },
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('CoordinationNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveEditor = null;
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(adminAuth);
    setupSnapshots();
  });

  // ── 1. Access gate ────────────────────────────────────────────────────────
  describe('access gate', () => {
    it('shows access-denied message for non-admin, non-owner users', () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(nonAdminAuth);
      render(<CoordinationNotes />);

      expect(
        screen.getByRole('heading', { name: /a space for the team/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/this is where the team coordinates/i),
      ).toBeInTheDocument();
      // Main content should NOT be present
      expect(screen.queryByRole('heading', { name: /coordination notes/i, level: 1 })).not.toBeInTheDocument();
    });
  });

  // Notes & learnings is cut (cut-or-keep §19): the page is the dated pages
  // and the team's to-dos, and nothing subscribes to board_notes any more.
  describe('notes & learnings is cut', () => {
    it('renders no notes archive and never reads board_notes', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText(`${today} — Monday`);
      expect(screen.queryByText('Notes & learnings')).not.toBeInTheDocument();
      expect(screen.queryByText('Sprint planning')).not.toBeInTheDocument();
      const paths = (onSnapshot as ReturnType<typeof vi.fn>).mock.calls.map(
        ([ref]) => (ref as { path?: string })?.path,
      );
      expect(paths).not.toContain('board_notes');
    });
  });

  // ── 1b. Role-based access (Session 3) ──────────────────────────────────────
  describe('role-based access', () => {
    const audDocs = [
      {
        id: `doc-${today}`,
        data: () => ({
          title: 'Friday run of show',
          date: today,
          weekday: 'Friday',
          md: '# Friday\n\n- [ ] Greeters',
          audience: 'everyone',
          createdBy: 'u-admin',
          updatedAt: 'mock-ts',
        }),
      },
      {
        id: 'doc-trainees',
        data: () => ({
          title: 'Trainee huddle',
          date: '2026-06-10',
          weekday: 'Wednesday',
          md: '# Huddle',
          audience: 'trainees',
          createdBy: 'u-admin',
          updatedAt: 'mock-ts',
        }),
      },
    ];

    it('a Trainee gets no Board at all (cut-or-keep §19)', () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(traineeAuth);
      setupSnapshots({ docs: audDocs, team: mockTeam });
      render(<CoordinationNotes />);

      // The route is admin-only and the view guards too: no pages, no editor.
      expect(screen.getByRole('heading', { name: /a space for the team/i })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /coordination notes/i, level: 1 })).not.toBeInTheDocument();
      expect(screen.queryByTestId('tiptap-editor')).not.toBeInTheDocument();
      expect(where).not.toHaveBeenCalled();
    });

    it('full-timer (admin) reads every page unconstrained (no audience filter)', () => {
      setupSnapshots({ docs: audDocs, team: mockTeam });
      render(<CoordinationNotes />);
      expect(where).not.toHaveBeenCalled();
      // Header "New page" + the Pages-list "+" are both present for full-timers.
      expect(screen.getAllByRole('button', { name: /new page/i }).length).toBeGreaterThan(0);
    });
  });

  // ── 1c. Title field (#1852) ────────────────────────────────────────────────
  describe('the page title field (#1852)', () => {
    it('names the page title field rather than leaning on its placeholder (#1852)', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const title = await screen.findByPlaceholderText('Untitled page');

      // A screen reader used to announce "Untitled page" as the name of a
      // field that already holds "Monday kickoff — week 9".
      expect(title).toHaveAccessibleName('Page title');
      expect(title.id).not.toBe('');

      // The name reaches the field through a real <label>, hidden visually.
      const label = screen.getByText('Page title', { selector: 'label' });
      expect(label).toHaveClass('sr-only');
      expect(label).toHaveAttribute('for', title.id);

      // The placeholder stays as the sighted hint; it just stops being the name.
      expect(title).toHaveAttribute('placeholder', 'Untitled page');
    });
  });

  // ── 2. Loading state ──────────────────────────────────────────────────────
  describe('loading state', () => {
    it('renders skeleton elements when onSnapshot has not yet fired', () => {
      setupSnapshots({ neverFire: true });
      render(<CoordinationNotes />);

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 3. Empty state ────────────────────────────────────────────────────────
  describe('empty state', () => {
    it('shows empty-docs message when no documents exist', () => {
      setupSnapshots({ docs: [], team: mockTeam });
      render(<CoordinationNotes />);

      expect(screen.getByText(/no pages yet/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /start a page/i }),
      ).toBeInTheDocument();
    });
  });

  // ── 4. Document list rendering ────────────────────────────────────────────
  describe('document list rendering', () => {
    it('renders doc titles in the sidebar', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByText(`${today} — Monday`)).toBeInTheDocument();
        expect(screen.getByText('2026-06-10 — Wednesday')).toBeInTheDocument();
      });
    });

    it('renders the main header "Coordination Notes"', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      expect(
        screen.getByRole('heading', { name: /coordination notes/i, level: 1 }),
      ).toBeInTheDocument();
    });
  });

  // ── 5. Create new doc ─────────────────────────────────────────────────────
  describe('create new doc', () => {
    it('calls setDoc when clicking the header "New page" button', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const newPageBtns = screen.getAllByRole('button', { name: /new page/i });
      fireEvent.click(newPageBtns[0]);

      await waitFor(() => {
        expect(setDoc).toHaveBeenCalled();
      });
    });

    it('calls setDoc when clicking "Start a page" in empty state', async () => {
      setupSnapshots({ docs: [], notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const btn = screen.getByRole('button', { name: /start a page/i });
      fireEvent.click(btn);

      await waitFor(() => {
        expect(setDoc).toHaveBeenCalled();
      });
    });
  });

  // ── 6. Delete doc ─────────────────────────────────────────────────────────
  describe('delete doc', () => {
    it('soft-deletes (sets deletedAt) immediately when clicking delete, with no confirm, and shows an Undo snackbar', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm');
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      // The delete button is inside the DocEditor area (title="Delete this page")
      await waitFor(() => {
        const deleteBtn = screen.getByTitle('Delete this page');
        expect(deleteBtn).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete this page'));

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deletedAt: 'mock-timestamp' }));
      });
      expect(deleteDoc).not.toHaveBeenCalled();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(await screen.findByText('Page moved to Trash')).toBeInTheDocument();
    });

    it('restores the page (sets deletedAt: null) when clicking Undo on the snackbar', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByTitle('Delete this page')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete this page'));

      await screen.findByText('Page moved to Trash');
      const undoBtn = await screen.findByRole('button', { name: 'Undo' });
      fireEvent.click(undoBtn);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { deletedAt: null });
      });
    });
  });

  // ── 6b. Pin to top ────────────────────────────────────────────────────────
  describe('pin doc', () => {
    it('pins an unpinned page when clicking its pin toggle', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const pinButtons = await screen.findAllByTitle('Pin to top');
      fireEvent.click(pinButtons[0]);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pinned: true }));
      });
    });

    it('renders a pinned page in its own Pinned section at the top of the Pages rail', async () => {
      const pinnedTodayDoc = {
        id: 'doc-pinned',
        data: () => ({
          title: 'Pinned today doc',
          date: today,
          weekday: 'Monday',
          md: '',
          pinned: true,
          createdBy: 'u-admin',
          updatedAt: 'mock-ts',
        }),
      };
      setupSnapshots({ docs: [mockDocs[0], pinnedTodayDoc], notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText('Pinned today doc');
      expect(screen.getByText('Pinned')).toBeInTheDocument();
      const titles = screen.getAllByText(/Pinned today doc|— Monday/).map((el) => el.textContent);
      expect(titles[0]).toBe('Pinned today doc');
    });

    it('unpins a pinned page when clicking its pin toggle', async () => {
      const pinnedTodayDoc = {
        id: 'doc-pinned',
        data: () => ({
          title: 'Pinned today doc',
          date: today,
          weekday: 'Monday',
          md: '',
          pinned: true,
          createdBy: 'u-admin',
          updatedAt: 'mock-ts',
        }),
      };
      setupSnapshots({ docs: [pinnedTodayDoc], notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const unpinButton = await screen.findByTitle('Unpin');
      fireEvent.click(unpinButton);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pinned: false, pinnedOrder: null }));
      });
    });

    it('shows no Board at all to a Trainee, so no pin toggle', async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(traineeAuth);
      setupSnapshots({ docs: mockDocs, team: mockTeam });
      render(<CoordinationNotes />);

      expect(await screen.findByRole('heading', { name: /a space for the team/i })).toBeInTheDocument();
      expect(screen.queryByTitle('Pin to top')).not.toBeInTheDocument();
    });
  });

  // ── 6c. Trash entry point ────────────────────────────────────────────────
  describe('Trash link', () => {
    it('shows a Trash link for admins, pointing at /coordination/trash', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const trashLink = await screen.findByTitle('Trash');
      expect(trashLink).toHaveAttribute('href', '/coordination/trash');
    });

    it('hides the Trash link from a Trainee (no Board at all)', async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(traineeAuth);
      setupSnapshots({ docs: mockDocs, team: mockTeam });
      render(<CoordinationNotes />);

      expect(await screen.findByRole('heading', { name: /a space for the team/i })).toBeInTheDocument();
      expect(screen.queryByTitle('Trash')).not.toBeInTheDocument();
    });
  });

  // ── 7. Notes section renders ──────────────────────────────────────────────
  describe('Firestore query listener error handling', () => {
    it('handles firestore errors when fetching board_docs', async () => {
      const { handleFirestoreError } = await import('../lib/firebase');
      const mockError = new Error('Permission denied');

      (useAuth as any).mockReturnValue(adminAuth);

      (onSnapshot as any).mockImplementation(
        (ref: { path?: string }, callback: any, errorCallback?: any) => {
          if (ref?.path === 'board_docs' && errorCallback) {
            errorCallback(mockError);
          }
          return vi.fn();
        }
      );

      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(handleFirestoreError).toHaveBeenCalledWith(
          mockError,
          'LIST',
          'board_docs'
        );
      });
    });
  });

  // ── 14. Additional Coverage ──────────────────────────────────────────────
  describe('additional coverage for CoordinationNotes', () => {
    it('renders DocRow "Today" badge and unchecked tasks badge correctly', async () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayDate = `${yyyy}-${mm}-${dd}`;
      const customDocs = [
        {
          id: `doc-${todayDate}`,
          data: () => ({
            title: 'Today Doc',
            date: todayDate,
            weekday: 'Monday',
            md: '- [ ] Todo 1\n- [ ] Todo 2\n- [x] Done task',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
      ];
      setupSnapshots({ docs: customDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText('Today Doc');
      expect(screen.getAllByText('Today')[0]).toBeInTheDocument();
      expect(screen.getByText('2 to do')).toBeInTheDocument();
    });

    it('keeps the head chip and date in English by default', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const head = await screen.findByTestId('coordination-doc-hold');
      await waitFor(() => expect(within(head).getByText('Today')).toBeInTheDocument());
      expect(within(head).queryByText(/Hoy|sábado/)).not.toBeInTheDocument();
    });

    it('auto-selects today first when present', () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayDate = `${yyyy}-${mm}-${dd}`;

      const docsList = [
        {
          id: 'doc-past',
          data: () => ({
            title: 'Past Doc',
            date: '2026-06-01',
            weekday: 'Monday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
        {
          id: 'doc-today',
          data: () => ({
            title: 'Today Doc',
            date: todayDate,
            weekday: 'Tuesday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
        {
          id: 'doc-upcoming',
          data: () => ({
            title: 'Upcoming Doc',
            date: '2026-12-31',
            weekday: 'Thursday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
      ];
      setupSnapshots({ docs: docsList, notes: [], team: mockTeam });
      render(<CoordinationNotes />);
      expect(screen.getByPlaceholderText('Untitled page')).toHaveValue('Today Doc');
    });

    it('auto-selects soonest upcoming when no today is present', () => {
      const docsList = [
        {
          id: 'doc-past',
          data: () => ({
            title: 'Past Doc',
            date: '2026-06-01',
            weekday: 'Monday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
        {
          id: 'doc-upcoming',
          data: () => ({
            title: 'Upcoming Doc',
            date: '2026-12-31',
            weekday: 'Thursday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
      ];
      setupSnapshots({ docs: docsList, notes: [], team: mockTeam });
      render(<CoordinationNotes />);
      expect(screen.getByPlaceholderText('Untitled page')).toHaveValue('Upcoming Doc');
    });

    it('auto-selects most recent past when no today/upcoming is present', () => {
      const docsList = [
        {
          id: 'doc-past-old',
          data: () => ({
            title: 'Older Past Doc',
            date: '2026-05-01',
            weekday: 'Monday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
        {
          id: 'doc-past-new',
          data: () => ({
            title: 'Newer Past Doc',
            date: '2026-06-01',
            weekday: 'Tuesday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
      ];
      setupSnapshots({ docs: docsList, notes: [], team: mockTeam });
      render(<CoordinationNotes />);
      expect(screen.getByPlaceholderText('Untitled page')).toHaveValue('Newer Past Doc');
    });

    it('supports markdown toggle and title edits with save status indicator', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText(`${today} — Monday`);

      vi.useFakeTimers();
      // Type new title in input
      const titleInput = screen.getByPlaceholderText('Untitled page');
      fireEvent.change(titleInput, { target: { value: 'New Doc Title' } });

      act(() => {
        vi.advanceTimersByTime(800);
      });

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ title: 'New Doc Title' })
      );
      vi.useRealTimers();

      // Toggle Markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);
      // Textarea source view should appear
      const textarea = screen.getByTitle('Markdown source view');
      expect(textarea).toBeInTheDocument();
      expect(textarea).not.toHaveAttribute('readonly');
    });
  });

  // ── Stored / Generated Short Summary in Sidebar ──────────────────────────────
  describe('Stored / Generated Short Summary in Sidebar', () => {
    it('renders stored summary or generated summary under document title in sidebar', async () => {
      const docsWithSummary = [
        {
          ...mockDocs[0],
          data: () => ({
            ...mockDocs[0].data(),
            summary: 'Stored summary for testing',
          }),
        },
        mockDocs[1],
      ];
      setupSnapshots({ docs: docsWithSummary, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      expect(await screen.findByText('Stored summary for testing')).toBeInTheDocument();
    });
  });

    it('allows editing markdown source and automatically renumbers ordered lists', async () => {
      mockActiveEditor = mockEditor;
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();

      vi.useFakeTimers();
      // Type some out-of-order list markdown
      const outOfOrderMarkdown = `1. Apple\n1. Orange\n1. Banana`;
      fireEvent.change(textarea, { target: { value: outOfOrderMarkdown } });

      // Textarea should contain renumbered markdown
      expect(textarea.value).toBe(`1. Apple\n2. Orange\n3. Banana`);
      
      // Close the view while timer is active to cover immediate setContent and active timer cleanup on close
      fireEvent.click(markdownBtn);
      expect(textarea).not.toBeInTheDocument();
      
      // Editor setContent should have been called immediately on close
      expect(mockEditor.commands.setContent).toHaveBeenCalledWith(
        `1. Apple\n2. Orange\n3. Banana`
      );
      vi.useRealTimers();
    });

    it('clears markdownSyncTimer on unmount if active', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      const { unmount } = render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();

      vi.useFakeTimers();
      fireEvent.change(textarea, { target: { value: 'Something' } });

      // Unmount while timer is active to cover active timer cleanup on unmount
      unmount();
      vi.useRealTimers();
    });

    it('handles Tab key press to indent text', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      
      textarea.focus();
      textarea.value = 'Hello';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      fireEvent.keyDown(textarea, { key: 'Tab' });
      expect(textarea.value).toBe('Hello  ');
    });

    it('handles Shift-Tab key press to outdent text', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      
      // Test Shift+Tab with indentation
      textarea.focus();
      textarea.value = '  Hello';
      textarea.selectionStart = 7;
      textarea.selectionEnd = 7;
      fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });
      expect(textarea.value).toBe('Hello');

      // Test Shift+Tab without indentation
      textarea.value = 'Hello';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;
      fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });
      expect(textarea.value).toBe('Hello');
    });

    it('handles Enter key press to auto-indent new line', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      
      textarea.focus();
      textarea.value = '  Hello';
      textarea.selectionStart = 7;
      textarea.selectionEnd = 7;

      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(textarea.value).toBe('  Hello\n  ');
    });

    it('does not intercept key down for other keys', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      
      textarea.focus();
      textarea.value = 'Hello';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      fireEvent.keyDown(textarea, { key: 'a' });
      expect(textarea.value).toBe('Hello');
    });
  });
  // ── Team to-dos ("What we're carrying") ─────────────────────────────────────
  describe('What we\'re carrying — team to-dos', () => {
    const mockTasks = [
      {
        id: 'td-1',
        title: 'Call the venue',
        status: 'pending',
        priority: 'medium',
        dueDate: today,
        assigneeId: 'u-admin',
        createdById: 'u-admin',
        createdByName: 'Tony Wang',
        sourceDocId: null,
        sourceDocTitle: null,
      },
      {
        id: 'td-2',
        title: 'Order supplies',
        status: 'completed',
        priority: 'medium',
        dueDate: null,
        assigneeId: 'u-admin',
        createdById: 'u-admin',
        createdByName: 'Tony Wang',
        sourceDocId: null,
        sourceDocTitle: null,
      },
    ];

    it('renders the section header with open count', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      // #1772: this section holds the team's to-dos, not its prayers.
      expect(screen.getByText(/what we're holding/i)).toBeInTheDocument();
      expect(screen.getByText(/every to-do the team is carrying/i)).toBeInTheDocument();
      expect(screen.getByText(/1 still open/i)).toBeInTheDocument();
    });

    it('renders pending to-do titles in the list', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      // Pending to-do visible, completed hidden by default
      expect(screen.getByText('Call the venue')).toBeInTheDocument();
      expect(screen.queryByText('Order supplies')).not.toBeInTheDocument();
    });

    it('shows completed todos when "Show done" is toggled', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      fireEvent.click(screen.getByText('Show done'));
      expect(screen.getByText('Order supplies')).toBeInTheDocument();
    });

    it('shows empty state when there are no to-dos', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
    });

    it('shows the "Add to-do" button', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      expect(screen.getByText(/add to-do/i)).toBeInTheDocument();
    });

    it('renders the "Everyone" filter pill and per-person filter pills', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      expect(screen.getByText('Everyone')).toBeInTheDocument();
      // Team member first name should appear as a filter pill
      expect(screen.getAllByText(/Tony/).length).toBeGreaterThan(0);
    });

    it('shows "all clear" when all todos are completed', () => {
      const allDone = [{ ...mockTasks[1] }]; // only the completed one
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: allDone });
      render(<CoordinationNotes />);

      expect(screen.getByText(/all clear/i)).toBeInTheDocument();
    });

    it('handles toggling a to-do status and logs activity', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      // Find the checkbox button for "Call the venue" todo
      const checkbox = screen.getAllByTitle('Mark done')[0];
      fireEvent.click(checkbox);

      // Verify updateDoc is called
      expect(updateDoc).toHaveBeenCalled();
      // Verify logActivity is called
      await waitFor(() => {
        expect(logActivity).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'completed task',
            targetName: 'Call the venue',
          })
        );
      });
    });

    it('handles deleting a to-do and logs activity', async () => {
      // Stub window.confirm to return true
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      // Find the delete button for "Call the venue"
      const deleteBtn = screen.getAllByTitle('Delete to-do')[0];
      fireEvent.click(deleteBtn);

      expect(deleteDoc).toHaveBeenCalled();
      await waitFor(() => {
        expect(logActivity).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'deleted task',
            targetName: 'Call the venue',
          })
        );
      });

      confirmSpy.mockRestore();
    });

    it('filters out cisa-* test accounts from the team list', () => {
      const teamWithTestUser = [
        ...mockTeam,
        {
          id: 'u-test-cisa',
          data: () => ({
            uid: 'u-test-cisa',
            displayName: 'cisa-test-account',
            email: 'cisa-test@example.com',
            approved: true,
            role: 'manager',
          }),
        },
      ];
      setupSnapshots({ docs: mockDocs, notes: [], team: teamWithTestUser, tasks: mockTasks });
      render(<CoordinationNotes />);

      // Verify the normal team members are present
      expect(screen.getByText('Tony')).toBeInTheDocument();
      // Verify cisa-* test user is NOT in the document
      expect(screen.queryByText('cisa-test-account')).not.toBeInTheDocument();
    });
  });

  // ── 7. Selection popover menu & NoteComposer ──────────────────────────────
  describe('text selection popover menu', () => {
    it('shows the floating bubble menu without a note action', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };

      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Assigned task text',
        removeAllRanges: vi.fn(),
      };

      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;
      fireEvent.mouseUp(editor);

      // To-do, link and assign stay; the Notes & learnings action is cut
      // (cut-or-keep §19).
      expect(await screen.findByText('Todo')).toBeInTheDocument();
      expect(screen.getByText('Link')).toBeInTheDocument();
      expect(screen.getByText('Assign')).toBeInTheDocument();
      expect(screen.queryByText('Note/Learning')).not.toBeInTheDocument();

      getSelectionSpy.mockRestore();
    });

    it('allows direct task assignment to team member from menu', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };
      
      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Task from highlight',
        removeAllRanges: vi.fn(),
      };
      
      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);

      // Click "Assign" button to open member dropdown
      fireEvent.click(await screen.findByText('Assign'));

      // Click on team member "Tony Wang"
      const memberBtn = screen.getByText('Tony Wang');
      fireEvent.click(memberBtn);

      // Verify direct assignment calls addDoc to create task (addTodo is a firebase addDoc call)
      await waitFor(() => {
        expect(addDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            title: 'Task from highlight',
            assigneeId: 'u-admin',
            status: 'pending',
          })
        );
      });

      getSelectionSpy.mockRestore();
    });

    it('parses natural language dates when directly assigning selected text from menu', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };

      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Submit report by tomorrow',
        removeAllRanges: vi.fn(),
      };

      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);

      // Click "Assign" button to open member dropdown
      fireEvent.click(await screen.findByText('Assign'));

      // Click on team member "Tony Wang"
      const memberBtn = screen.getByText('Tony Wang');
      fireEvent.click(memberBtn);

      // Verify direct assignment extracts date and sets dueDate
      await waitFor(() => {
        expect(addDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            title: 'Submit report by tomorrow',
            assigneeId: 'u-admin',
            dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          })
        );
      });

      getSelectionSpy.mockRestore();
    });

    it('parses selection task list hierarchy correctly', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };
      
      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Parent Task\n  - Sub Task A\n  - Sub Task B\nParent Task 2\n  Sub Task C',
        removeAllRanges: vi.fn(),
      };
      
      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);

      // Verify bubble menu shows Todo
      const todoBtn = await screen.findByText('Todo');
      expect(todoBtn).toBeInTheDocument();
      fireEvent.click(todoBtn);

      // Verify that TodoComposer popover opens and parses the 3 tasks
      expect(await screen.findByText('New to-dos (3)')).toBeInTheDocument();

      getSelectionSpy.mockRestore();
    });

    it('handles direct assignment via @ button in selection menu', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };
      
      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Directly assigned task text',
        removeAllRanges: vi.fn(),
      };
      
      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);

      const assignMenuBtn = await screen.findByText('Assign');
      expect(assignMenuBtn).toBeInTheDocument();
      fireEvent.click(assignMenuBtn);

      const assignUserBtn = await screen.findByText('Tony Wang');
      expect(assignUserBtn).toBeInTheDocument();
      fireEvent.click(assignUserBtn);

      await waitFor(() => expect(addDoc).toHaveBeenCalled());

      getSelectionSpy.mockRestore();
    });

    it('creates a to-do from the Todo composer without rewriting the page', async () => {
      mockActiveEditor = mockEditor;
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };

      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Call the venue',
        removeAllRanges: vi.fn(),
      };

      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);
      fireEvent.click(await screen.findByText('Todo'));

      const composer = screen.getByText('New to-do').closest('.bg-surface') as HTMLElement;
      fireEvent.click(within(composer).getByRole('button', { name: /Tony/ }));
      fireEvent.click(within(composer).getByRole('button', { name: /add to-do/i }));

      await waitFor(() => {
        expect(addDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            title: 'Call the venue',
            assigneeId: 'u-admin',
            sourceDocId: `doc-${today}`,
          })
        );
      });

      expect(mockChain.deleteSelection).not.toHaveBeenCalled();
      expect(mockChain.insertContent).not.toHaveBeenCalled();

      getSelectionSpy.mockRestore();
    });

    it('assigns highlighted text without rewriting the page', async () => {
      mockActiveEditor = mockEditor;
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };

      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Task from highlight',
        removeAllRanges: vi.fn(),
      };

      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);
      fireEvent.click(await screen.findByText('Assign'));
      fireEvent.click(screen.getByText('Tony Wang'));

      await waitFor(() => {
        expect(addDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            title: 'Task from highlight',
            assigneeId: 'u-admin',
            sourceDocId: `doc-${today}`,
          })
        );
      });

      expect(mockChain.deleteSelection).not.toHaveBeenCalled();
      expect(mockChain.insertContent).not.toHaveBeenCalled();

      getSelectionSpy.mockRestore();
    });

    it('creates one assigned to-do per highlighted line without rewriting the page', async () => {
      mockActiveEditor = mockEditor;
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };

      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Task A\nTask B',
        removeAllRanges: vi.fn(),
      };

      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);
      fireEvent.click(await screen.findByText('Assign'));
      fireEvent.click(screen.getByText('Tony Wang'));

      await waitFor(() => expect(addDoc).toHaveBeenCalled());
      const createdTitles = (addDoc as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .map((c) => (c[1] as { title?: string } | undefined)?.title)
        .filter((t): t is string => t === 'Task A' || t === 'Task B');
      expect(createdTitles.sort()).toEqual(['Task A', 'Task B']);
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ title: 'Task A', sourceDocId: `doc-${today}` })
      );
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ title: 'Task B', sourceDocId: `doc-${today}` })
      );

      expect(mockChain.deleteSelection).not.toHaveBeenCalled();
      expect(mockChain.insertContent).not.toHaveBeenCalled();

      getSelectionSpy.mockRestore();
    });
  });

  // ── Full screen mode ────────────────────────────────────────────────────────
  describe('full screen mode', () => {
    it('renders full screen toggle button and toggles workspace full screen mode', async () => {
      const mockDocs = [
        {
          id: 'doc-1',
          data: () => ({
            title: 'Weekly Meeting',
            date: today,
            weekday: 'Monday',
            time: '14:00',
            place: 'Room A',
            audience: 'team',
            md: 'Meeting content',
            pinned: false,
            createdBy: 'u-1',
            updatedAt: today,
          }),
        },
      ];

      setupSnapshots({ docs: mockDocs });
      render(<CoordinationNotes />);

      const fullScreenBtn = await screen.findByRole('button', { name: /full screen/i });
      expect(fullScreenBtn).toBeInTheDocument();

      const workspace = screen.getByTestId('coordination-notes-workspace');
      expect(workspace).not.toHaveClass('fixed');
      const hold = screen.getByTestId('coordination-doc-hold');
      // Every full-screen rule is keyed on `.bdoc-fs-hold.is-fs` — without the
      // base class `is-fs` matches nothing and the whole feature is inert.
      expect(hold).toHaveClass('bdoc-fs-hold');
      expect(hold).not.toHaveClass('is-fs');

      // Click to enter full screen
      fireEvent.click(fullScreenBtn);

      const exitFullScreenBtn = await screen.findByRole('button', { name: /close full screen|back to board|exit full screen/i });
      expect(exitFullScreenBtn).toBeInTheDocument();
      // Full screen pins the OPEN PAGE hold (design `.bdoc-hold.is-fs`), not the whole workspace grid
      expect(hold).toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');

      // Click to exit full screen
      fireEvent.click(exitFullScreenBtn);

      expect(screen.getByRole('button', { name: /full screen/i })).toBeInTheDocument();
      expect(hold).not.toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');
    });

    it('exits full screen mode when pressing Escape key', async () => {
      const mockDocs = [
        {
          id: 'doc-1',
          data: () => ({
            title: 'Weekly Meeting',
            date: today,
            weekday: 'Monday',
            time: '14:00',
            place: 'Room A',
            audience: 'team',
            md: 'Meeting content',
            pinned: false,
            createdBy: 'u-1',
            updatedAt: today,
          }),
        },
      ];

      setupSnapshots({ docs: mockDocs });
      render(<CoordinationNotes />);

      const fullScreenBtn = await screen.findByRole('button', { name: /full screen/i });
      fireEvent.click(fullScreenBtn);

      const workspace = screen.getByTestId('coordination-notes-workspace');
      const hold = screen.getByTestId('coordination-doc-hold');
      expect(hold).toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');

      // Press Escape key
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(hold).not.toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');
      expect(screen.getByRole('button', { name: /full screen/i })).toBeInTheDocument();
    });

    it('handles fullscreenchange event and the document full screen toggle', async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(adminAuth);
      const mockDocs = [
        {
          id: 'doc-1',
          data: () => ({
            title: 'Monday Meeting',
            date: today,
            weekday: 'Monday',
            time: '14:00',
            place: 'Room B',
            audience: 'team',
            md: 'Meeting content',
            pinned: false,
            createdBy: 'u-1',
            updatedAt: today,
          }),
        },
      ];

      setupSnapshots({ docs: mockDocs });
      render(<CoordinationNotes />);

      const fullScreenBtn = await screen.findByRole('button', { name: /full screen/i });
      expect(fullScreenBtn).toBeInTheDocument();

      fireEvent.click(fullScreenBtn);
      const workspace = screen.getByTestId('coordination-notes-workspace');
      const hold = screen.getByTestId('coordination-doc-hold');
      expect(hold).toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');

      // Trigger fullscreenchange when no element is in fullscreen
      fireEvent(document, new Event('fullscreenchange'));
      expect(hold).toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');
    });
  });

  describe('Pinned pages & reordering', () => {
    it('lands on the top pinned document when opening /coordination', async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(adminAuth);
      const mockDocs = [
        {
          id: 'doc-today',
          data: () => ({
            title: 'Unpinned Today Meeting',
            date: today,
            weekday: 'Wednesday',
            audience: 'team',
            md: 'Content today',
            pinned: false,
            createdBy: 'u-1',
            updatedAt: today,
          }),
        },
        {
          id: 'doc-pinned-1',
          data: () => ({
            title: 'Top Pinned Page',
            date: '2026-06-01',
            weekday: 'Monday',
            audience: 'team',
            md: 'Content pinned 1',
            pinned: true,
            pinnedOrder: 0,
            createdBy: 'u-1',
            updatedAt: '2026-06-01',
          }),
        },
        {
          id: 'doc-pinned-2',
          data: () => ({
            title: 'Second Pinned Page',
            date: '2026-06-02',
            weekday: 'Tuesday',
            audience: 'team',
            md: 'Content pinned 2',
            pinned: true,
            pinnedOrder: 1,
            createdBy: 'u-1',
            updatedAt: '2026-06-02',
          }),
        },
      ];

      setupSnapshots({ docs: mockDocs });
      render(<CoordinationNotes />);

      // Top pinned doc should be active on load
      await waitFor(() => {
        expect(screen.getByDisplayValue('Top Pinned Page')).toBeInTheDocument();
      });
    });

    it('renders drag handles for pinned pages when editing enabled', async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(adminAuth);
      const mockDocs = [
        {
          id: 'pinned-1',
          data: () => ({
            title: 'Pinned Doc A',
            date: '2026-06-01',
            weekday: 'Monday',
            audience: 'team',
            md: 'Content A',
            pinned: true,
            pinnedOrder: 0,
            createdBy: 'u-1',
            updatedAt: '2026-06-01',
          }),
        },
        {
          id: 'pinned-2',
          data: () => ({
            title: 'Pinned Doc B',
            date: '2026-06-02',
            weekday: 'Tuesday',
            audience: 'team',
            md: 'Content B',
            pinned: true,
            pinnedOrder: 1,
            createdBy: 'u-1',
            updatedAt: '2026-06-02',
          }),
        },
      ];

      setupSnapshots({ docs: mockDocs });
      render(<CoordinationNotes />);

      const dragBtnA = await screen.findByRole('button', { name: /drag to reorder pinned doc a/i });
      expect(dragBtnA).toBeInTheDocument();
    });

    describe('Coordination Doc view and note form', () => {
      it('renders editable title and editor in English mode without toggle button (#1664)', async () => {
        const docsList = [
          {
            id: 'doc-en',
            data: () => ({
              title: 'Wednesday care',
              date: todayISO(),
              weekday: 'Wednesday',
              md: '# hi\n\nNotes for team',
              createdBy: 'u-admin',
              updatedAt: 'mock-ts',
            }),
          },
        ];
        setupSnapshots({ docs: docsList as any, notes: [], team: mockTeam as any });

        render(
          <LanguageProvider>
            <CoordinationNotes />
          </LanguageProvider>
        );

        await waitFor(() => {
          expect(screen.getByPlaceholderText(/untitled page|página sin título/i)).toHaveValue('Wednesday care');
        });

        // No in-header edit/view translation toggle button (#1664)
        expect(screen.queryByRole('button', { name: /^edit$|^editar$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /view translation|ver traducción/i })).not.toBeInTheDocument();

        // Markdown button works
        const mdBtn = screen.getByRole('button', { name: /view markdown source|código markdown|markdown/i });
        fireEvent.click(mdBtn);
        expect(document.getElementById('markdown-source-textarea')).toBeInTheDocument();
      });
    });
  });



