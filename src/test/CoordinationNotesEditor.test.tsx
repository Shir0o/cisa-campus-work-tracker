import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import CoordinationNotes from '../views/CoordinationNotes';
import { useAuth } from '../components/AuthProvider';

// This suite renders The Board with a *functional* TipTap seam so the editor's
// config callbacks actually run — covering rich-paste normalization (#67) and
// the live Pages-list preview (#66), which the null-editor suite can't reach.

// Captured editor config + the fake editor instance, shared with the mock factory.
const h = vi.hoisted(() => ({ config: null as any, editor: null as any }));

vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));

vi.mock('@tiptap/react', () => ({
  useEditor: (config: any) => {
    const chain: any = {};
    ['focus', 'toggleHeading', 'setParagraph', 'toggleBold', 'toggleItalic', 'toggleBulletList', 'toggleOrderedList', 'toggleTaskList', 'toggleBlockquote', 'run'].forEach(
      (m) => {
        chain[m] = () => chain;
      },
    );
    const editor = {
      isActive: () => false,
      isEmpty: true,
      on: () => {},
      off: () => {},
      commands: { setContent: () => {} },
      chain: () => chain,
      storage: {
        markdown: {
          // Distinct from the seeded doc so the live update is observable.
          getMarkdown: () => '# Live heading\n\n- [ ] one\n- [ ] two',
          parser: { parse: (md: string) => `PARSED::${md}` },
        },
      },
    };
    config.onCreate?.({ editor });
    h.config = config;
    h.editor = editor;
    return editor;
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
});
