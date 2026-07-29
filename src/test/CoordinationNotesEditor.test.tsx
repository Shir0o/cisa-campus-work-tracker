import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import CoordinationNotes from '../views/CoordinationNotes';
import { useAuth } from '../components/AuthProvider';

// This suite renders The Board with a *functional* TipTap seam so the editor's
// config callbacks actually run — covering rich-paste normalization (#67) and
// the live Pages-list preview (#66), which the null-editor suite can't reach.

// Captured editor config + the fake editor instance, shared with the mock factory.
// `tr` holds the last transaction the component built, so the task-sync tests can
// inspect exactly what it patched.
const h = vi.hoisted(() => ({ config: null as any, editor: null as any, chain: null as any, tr: null as any }));

// The one checklist line the fake document contains, at node position 4.
const TASK_NODE_POS = 4;
const taskNodeText = 'Review PRs (@Bob) <!-- task:task-1 assignee:u-bob -->';

vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: null }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@tiptap/react', () => ({
  // Real TipTap's useEditor returns a stable editor instance across
  // re-renders (only recreating it if its deps change) — mirror that here
  // by reusing h.editor/h.chain once created, instead of minting a fresh
  // pair (and losing prior mock-call history / state.selection overrides)
  // on every render. Reset h.editor to null in beforeEach for a clean editor
  // per test.
  useEditor: (config: any) => {
    if (!h.editor) {
      const chain: any = {};
      [
        'focus',
        'toggleHeading',
        'setParagraph',
        'toggleBold',
        'toggleItalic',
        'toggleStrike',
        'toggleBulletList',
        'toggleOrderedList',
        'toggleTaskList',
        'toggleBlockquote',
        'extendMarkRange',
        'setLink',
        'deleteSelection',
        'insertContent',
        'run',
      ].forEach((m) => {
        chain[m] = vi.fn(() => chain);
      });
      // One taskItem node, the shape the task-sync walk reads: a paragraph child
      // holding the line's text, and a `checked` attr for the checkbox.
      const taskNode = {
        type: { name: 'taskItem' },
        attrs: { checked: false },
        firstChild: {
          isTextblock: true,
          content: { size: taskNodeText.length },
          textContent: taskNodeText,
        },
      };
      h.editor = {
        isActive: () => false,
        isEmpty: true,
        isFocused: false,
        on: () => {},
        off: () => {},
        commands: { setContent: vi.fn(), setTextSelection: vi.fn() },
        chain: () => chain,
        view: { dispatch: vi.fn() },
        state: {
          selection: { from: 0, to: 0, empty: true },
          schema: { text: (value: string) => ({ text: value }) },
          doc: {
            textBetween: () => '',
            content: { size: 200 },
            descendants: (fn: (node: unknown, pos: number) => void) => fn(taskNode, TASK_NODE_POS),
          },
          // A recording stand-in for a ProseMirror transaction.
          get tr() {
            const tr: any = {
              docChanged: false,
              meta: {} as Record<string, unknown>,
              steps: [] as any[],
              mapping: { map: (p: number) => p },
              doc: { nodeAt: () => taskNode },
              replaceWith(from: number, to: number, node: { text: string }) {
                tr.steps.push({ kind: 'replaceWith', from, to, value: node.text });
                tr.docChanged = true;
                return tr;
              },
              setNodeMarkup(pos: number, _type: unknown, attrs: Record<string, unknown>) {
                tr.steps.push({ kind: 'setNodeMarkup', pos, attrs });
                tr.docChanged = true;
                return tr;
              },
              setMeta(key: string, value: unknown) {
                tr.meta[key] = value;
                return tr;
              },
            };
            h.tr = tr;
            return tr;
          },
        },
        storage: {
          markdown: {
            // Distinct from the seeded doc so the live update is observable.
            getMarkdown: () => '# Live heading\n\n- [ ] one\n- [ ] two',
            parser: { parse: (md: string) => `PARSED::${md}` },
          },
        },
      };
      h.chain = chain;
    }
    config.onCreate?.({ editor: h.editor });
    h.config = config;
    return h.editor;
  },
  EditorContent: () => <div data-testid="tiptap-editor">Editor</div>,
}));
vi.mock('@tiptap/starter-kit', () => ({ StarterKit: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-collaboration', () => ({ Collaboration: { configure: () => ({}) } }));
let caretConfig: { user?: { uid?: string; name?: string; color?: string } } | null = null;
vi.mock('@tiptap/extension-collaboration-caret', () => ({
  CollaborationCaret: {
    configure: (cfg: { user?: { uid?: string; name?: string; color?: string } }) => {
      caretConfig = cfg;
      return {};
    },
  },
}));
vi.mock('@tiptap/extension-task-list', () => ({ TaskList: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-task-item', () => ({ TaskItem: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-placeholder', () => ({ Placeholder: { configure: () => ({}) } }));
vi.mock('tiptap-markdown', () => ({ Markdown: { configure: () => ({}) } }));

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
// Peers a test wants "in the room"; keyed by Yjs clientID, as awareness is.
const awarenessStates = new Map<number, { user?: { uid?: string; name?: string; color?: string } }>();
vi.mock('y-protocols/awareness', () => {
  class MockAwareness {
    setLocalStateField() {}
    on() {}
    off() {}
    destroy() {}
    getStates() {
      return awarenessStates;
    }
    get clientID() {
      return 1;
    }
  }
  return { Awareness: MockAwareness };
});
vi.mock('../lib/yjsRtdbProvider', () => {
  class RtdbYjsProvider {
    destroy = vi.fn();
    claimSeed = vi.fn().mockResolvedValue(false);
    awareness = { setLocalStateField: vi.fn(), on: vi.fn(), off: vi.fn(), getStates: () => new Map() };
  }
  return { RtdbYjsProvider };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  onSnapshot: vi.fn((_ref: unknown, _cb: unknown) => vi.fn()),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  doc: vi.fn((_db: unknown, coll: string, id?: string) => ({ path: id ? `${coll}/${id}` : coll, id: id || 'auto-id' })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));
vi.mock('firebase/database', () => ({ ref: vi.fn(), remove: vi.fn(() => Promise.resolve()) }));
vi.mock('../lib/firebase', () => ({
  db: {},
  rtdb: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

const today = new Date().toISOString().slice(0, 10);

// A single page, dated today so it auto-focuses; its stored md has zero open tasks.
const docsFixture = [
  {
    id: `doc-${today}`,
    data: () => ({
      title: `${today} — Today`,
      date: today,
      weekday: 'Monday',
      md: '# Standup\n\nReview the goals',
      createdBy: 'u-admin',
      updatedAt: 'mock-ts',
    }),
  },
];

const teamFixture = [
  {
    id: 'u-admin',
    data: () => ({ uid: 'u-admin', displayName: 'Tony Wang', email: 'yilongwang05@gmail.com', approved: true, role: 'admin' }),
  },
  // The assignee named in the fake document's checklist line.
  {
    id: 'u-bob',
    data: () => ({ uid: 'u-bob', displayName: 'Bob Smith', email: 'bob@example.com', approved: true, role: 'operator' }),
  },
];

const adminAuth = {
  user: { uid: 'u-admin', email: 'yilongwang05@gmail.com', displayName: 'Tony Wang' },
  isAdmin: true,
  role: 'admin',
  isApproved: true,
  loading: false,
};

// The `tasks` snapshot a test wants the page to receive; empty by default.
let tasksFixture: { id: string; data: () => object }[] = [];

function setupSnapshots() {
  (onSnapshot as ReturnType<typeof vi.fn>).mockImplementation((ref: { path?: string }, callback: (snap: unknown) => void) => {
    const path = ref?.path || '';
    if (path === 'board_docs') callback({ docs: docsFixture, size: docsFixture.length });
    else if (path === 'users') callback({ docs: teamFixture, size: teamFixture.length });
    else if (path === 'tasks') callback({ docs: tasksFixture, size: tasksFixture.length });
    else callback({ docs: [], size: 0 });
    return vi.fn();
  });
}

describe('CoordinationNotes — live editor behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.config = null;
    h.editor = null;
    h.chain = null;
    h.tr = null;
    tasksFixture = [];
    awarenessStates.clear();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(adminAuth);
    setupSnapshots();
  });

  // ── duplicate presence avatars ─────────────────────────────────────────────
  describe('live presence stack', () => {
    const kevin = { uid: 'u-kevin', name: 'Kevin Munga', color: '#b5503f' };

    it('shows one avatar per person however many sessions they hold', async () => {
      // A clientID is minted per editor mount, so one person routinely holds several.
      awarenessStates.set(2, { user: kevin });
      awarenessStates.set(3, { user: kevin });
      awarenessStates.set(4, { user: kevin });
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      expect(screen.getAllByTitle('Kevin Munga')).toHaveLength(1);
      expect(screen.getByTitle('1 other editing')).toBeInTheDocument();
    });

    it('leaves you out of the stack even when your own second tab is present', async () => {
      awarenessStates.set(5, { user: { uid: 'u-admin', name: 'Tony Wang', color: '#7d5a86' } });
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      // The stack renders only when there is someone else; your own name still
      // appears elsewhere on the page as a team-member avatar, so assert on the stack.
      expect(screen.queryByTitle(/other(s)? editing/)).not.toBeInTheDocument();
    });

    it('publishes the uid alongside the caret name so peers can be told apart', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      expect(caretConfig).toMatchObject({ user: { uid: 'u-admin', name: 'Tony Wang' } });
    });
  });

  // ── task changes made elsewhere never rebuild the document ─────────────────
  // Rebuilding it dropped the caret at the bottom of the page, lost the selection,
  // and buried real edits under whole-doc entries in the Yjs undo stack (#174).
  describe('external task sync', () => {
    const task = (over: object = {}) => [
      { id: 'task-1', data: () => ({ title: 'Review PRs', status: 'open', assigneeId: 'u-bob', ...over }) },
    ];

    it('patches the stale checkbox instead of replacing the whole document', async () => {
      tasksFixture = task({ status: 'completed' });
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      expect(h.editor.commands.setContent).not.toHaveBeenCalled();
      expect(h.editor.view.dispatch).toHaveBeenCalledTimes(1);
      expect(h.tr.steps).toEqual([{ kind: 'setNodeMarkup', pos: TASK_NODE_POS, attrs: { checked: true } }]);
    });

    it('keeps someone else’s change out of your undo stack', async () => {
      tasksFixture = task({ status: 'completed' });
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.editor.view.dispatch).toHaveBeenCalled());

      expect(h.tr.meta.addToHistory).toBe(false);
    });

    it('rewrites only the renamed line, leaving the rest of the page alone', async () => {
      tasksFixture = task({ title: 'Review all PRs' });
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.editor.view.dispatch).toHaveBeenCalled());

      expect(h.editor.commands.setContent).not.toHaveBeenCalled();
      expect(h.tr.steps).toEqual([
        {
          kind: 'replaceWith',
          from: TASK_NODE_POS + 2,
          to: TASK_NODE_POS + 2 + taskNodeText.length,
          value: 'Review all PRs (@Bob) <!-- task:task-1 assignee:u-bob -->',
        },
      ]);
    });

    it('touches nothing when the page already agrees with the to-dos', async () => {
      tasksFixture = task();
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      expect(h.editor.view.dispatch).not.toHaveBeenCalled();
      expect(h.editor.commands.setContent).not.toHaveBeenCalled();
    });

    it('leaves the line alone while your caret is inside it', async () => {
      tasksFixture = task({ status: 'completed' });
      h.editor = null; // rebuilt below with the caret parked in the task line
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());
      h.editor.isFocused = true;
      h.editor.state.selection = { from: TASK_NODE_POS + 5, to: TASK_NODE_POS + 5, empty: true };
      h.editor.view.dispatch.mockClear();

      // A later snapshot (a second person's edit) must not rewrite the line you're in.
      tasksFixture = task({ status: 'completed', title: 'Review all PRs' });
      act(() => setupSnapshots());
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      expect(h.editor.view.dispatch).not.toHaveBeenCalled();
    });
  });

  // ── #67 — rich (HTML) paste is normalized through Markdown ─────────────────
  describe('rich paste normalization (#67)', () => {
    it('routes pasted HTML through turndown → the editor markdown parser', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      // turndown('<h1>Hello world</h1>') === '# Hello world'; the fake parser echoes it.
      const out = h.config.editorProps.transformPastedHTML('<h1>Hello world</h1>');
      expect(out).toBe('PARSED::# Hello world');
    });

    it('converts Google-Docs style-based bold rather than dropping it', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      const out = h.config.editorProps.transformPastedHTML('<p>hi <span style="font-weight:700">there</span></p>');
      expect(out).toBe('PARSED::hi **there**');
    });

    it('converts pasted HTML tables to GFM Markdown tables and parses them', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      const htmlTable = '<table><thead><tr><th>H1</th></tr></thead><tbody><tr><td>C1</td></tr></tbody></table>';
      const out = h.config.editorProps.transformPastedHTML(htmlTable);
      expect(out).toBe('PARSED::| H1 |\n| --- |\n| C1 |');
    });

    it('leaves internal editor copy/paste (data-pm-slice) untouched', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      const internal = '<p data-pm-slice="1 1 []">copied within the editor</p>';
      expect(h.config.editorProps.transformPastedHTML(internal)).toBe(internal);
    });
  });

  // ── #66 — the page's Pages-list row reflects live edits ────────────────────
  describe('live Pages-list preview (#66)', () => {
    it('updates the active row preview + "to do" count as you type, without waiting for save', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      // Stored md has no open tasks, so the row shows neither a count nor the live text yet.
      expect(screen.queryByText('2 to do')).not.toBeInTheDocument();
      expect(screen.queryByText('one two')).not.toBeInTheDocument();

      // Simulate a live edit; the throttled push lands after 300ms.
      vi.useFakeTimers();
      act(() => {
        h.config.onUpdate({ editor: h.editor, transaction: { docChanged: true } });
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      vi.useRealTimers();

      expect(screen.getByText('2 to do')).toBeInTheDocument();
      expect(screen.getByText('one two')).toBeInTheDocument();
    });

    it('ignores transactions that do not change the document', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      vi.useFakeTimers();
      act(() => {
        h.config.onUpdate({ editor: h.editor, transaction: { docChanged: false } });
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      vi.useRealTimers();

      expect(screen.queryByText('2 to do')).not.toBeInTheDocument();
    });
  });

  // ── Insert link with custom display text ────────────────────────────────────
  describe('insert link', () => {
    it('opens the link composer from the toolbar Link button', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      fireEvent.click(screen.getByTitle('Link'));

      expect(screen.getByRole('heading', { name: 'Insert link' })).toBeInTheDocument();
    });

    it('inserts new linked text at the cursor when nothing is selected', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());
      h.editor.state.selection = { from: 0, to: 0, empty: true };

      fireEvent.click(screen.getByTitle('Link'));
      fireEvent.change(screen.getByPlaceholderText('Text to display'), { target: { value: 'my page' } });
      fireEvent.change(screen.getByPlaceholderText('https://example.com'), { target: { value: 'example.com' } });
      // Clicking "Insert link" also closes the composer, which re-renders
      // DocEditor and (per the mocked useEditor) mints a brand-new chain/editor —
      // capture the chain in use *before* that click so we inspect the one the
      // insert actually ran on, not the fresh post-close replacement.
      const chainUsed = h.chain;
      fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));

      expect(chainUsed.deleteSelection).not.toHaveBeenCalled();
      expect(chainUsed.insertContent).toHaveBeenCalledWith({
        type: 'text',
        text: 'my page',
        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
      });
    });

    it('applies the link to the existing selection when the display text is unchanged', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());
      h.editor.state.selection = { from: 0, to: 5, empty: false };
      h.editor.state.doc.textBetween = () => 'Hello';

      fireEvent.click(screen.getByTitle('Link'));
      // The Display Text field is prefilled with the selection ("Hello") — left untouched.
      fireEvent.change(screen.getByPlaceholderText('https://example.com'), { target: { value: 'example.com' } });
      const chainUsed = h.chain;
      fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));

      expect(chainUsed.extendMarkRange).toHaveBeenCalledWith('link');
      expect(chainUsed.setLink).toHaveBeenCalledWith({ href: 'https://example.com' });
      expect(chainUsed.deleteSelection).not.toHaveBeenCalled();
    });

    it('replaces the selection when the display text is edited', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());
      h.editor.state.selection = { from: 0, to: 5, empty: false };
      h.editor.state.doc.textBetween = () => 'Hello';

      fireEvent.click(screen.getByTitle('Link'));
      fireEvent.change(screen.getByPlaceholderText('Text to display'), { target: { value: 'Goodbye' } });
      fireEvent.change(screen.getByPlaceholderText('https://example.com'), { target: { value: 'example.com' } });
      const chainUsed = h.chain;
      fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));

      expect(chainUsed.deleteSelection).toHaveBeenCalled();
      expect(chainUsed.insertContent).toHaveBeenCalledWith({
        type: 'text',
        text: 'Goodbye',
        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
      });
    });
  });

  describe('Toolbar formatting controls', () => {
    it('triggers toggleStrike when Strikethrough toolbar button is clicked', async () => {
      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      const strikeBtn = screen.getByTitle('Strikethrough');
      expect(strikeBtn).toBeInTheDocument();

      fireEvent.click(strikeBtn);
      expect(h.chain.toggleStrike).toHaveBeenCalled();
    });
  });
});
