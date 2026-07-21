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
const h = vi.hoisted(() => ({ config: null as any, editor: null as any, chain: null as any }));

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
      h.editor = {
        isActive: () => false,
        isEmpty: true,
        on: () => {},
        off: () => {},
        commands: { setContent: () => {} },
        chain: () => chain,
        state: {
          selection: { from: 0, to: 0, empty: true },
          doc: { textBetween: () => '' },
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
vi.mock('@tiptap/extension-collaboration-caret', () => ({ CollaborationCaret: { configure: () => ({}) } }));
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
];

const adminAuth = {
  user: { uid: 'u-admin', email: 'yilongwang05@gmail.com', displayName: 'Tony Wang' },
  isAdmin: true,
  role: 'admin',
  isApproved: true,
  loading: false,
};

function setupSnapshots() {
  (onSnapshot as ReturnType<typeof vi.fn>).mockImplementation((ref: { path?: string }, callback: (snap: unknown) => void) => {
    const path = ref?.path || '';
    if (path === 'board_docs') callback({ docs: docsFixture, size: docsFixture.length });
    else if (path === 'users') callback({ docs: teamFixture, size: teamFixture.length });
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
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(adminAuth);
    setupSnapshots();
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
      expect(screen.queryByText('one')).not.toBeInTheDocument();

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
      expect(screen.getByText('one')).toBeInTheDocument();
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

  // ── "AI Insights" — /api/analyze-notes is admin-only server-side; the client
  // must attach the caller's Firebase ID token so the server can verify it.
  describe('AI Insights auth token', () => {
    it('attaches a Bearer token from the signed-in admin to /api/analyze-notes', async () => {
      const getIdToken = vi.fn().mockResolvedValue('mock-id-token');
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        ...adminAuth,
        user: { ...adminAuth.user, getIdToken },
      });

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, updatedMarkdown: '# Live heading', suggestedTasks: [] }),
      } as Response);

      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      fireEvent.click(screen.getByRole('button', { name: /AI Insights/i }));

      await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
        '/api/analyze-notes',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer mock-id-token' }),
        }),
      ));

      fetchSpy.mockRestore();
    });

    it('still sends the request without a token when getIdToken fails', async () => {
      const getIdToken = vi.fn().mockRejectedValue(new Error('token fetch failed'));
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        ...adminAuth,
        user: { ...adminAuth.user, getIdToken },
      });

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, updatedMarkdown: '# Live heading', suggestedTasks: [] }),
      } as Response);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<CoordinationNotes />);
      await waitFor(() => expect(h.config).not.toBeNull());

      fireEvent.click(screen.getByRole('button', { name: /AI Insights/i }));

      await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
        '/api/analyze-notes',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      ));

      fetchSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
