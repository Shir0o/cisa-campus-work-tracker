import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BibleStudyEditor from '../views/BibleStudyEditor';
import * as bibleData from '../lib/data/bibleStudy';
import * as auth from '../components/AuthProvider';
import type { Meeting } from '../lib/bibleStudy';

vi.mock('../lib/data/bibleStudy', () => ({
  subscribeMeeting: vi.fn(),
  subscribeEntryPoints: vi.fn(),
  saveMeeting: vi.fn().mockResolvedValue('meeting-123'),
  setMeetingPublished: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// Tier 1 collab rides on the realtime backend; null rtdb keeps the Tier 0
// single-user autosave these tests already pin. Collab cases flip this.
let mockRtdb: unknown = null;
vi.mock('../lib/firebase', () => ({
  db: {},
  get rtdb() {
    return mockRtdb;
  },
}));
vi.mock('../lib/meetingCollab', () => ({
  MeetingCollab: class {
    doc = { on: vi.fn(), off: vi.fn() };
    text = {
      toString: () => textValue,
      get length() {
        return textValue.length;
      },
    };
    applyLocalEdit = (start: number, end: number, value: string) => {
      textValue = textValue.substring(0, start) + value + textValue.substring(end);
    };
    awareness = {
      on: vi.fn(),
      off: vi.fn(),
      getStates: () =>
        new Map([[4242, { user: { uid: 'u-peer', name: 'Bob', color: '#3a5a82' } }]]),
      clientID: 7,
    };
    destroy = vi.fn(() => {
      collabInstance = null;
    });
    constructor(_doc: unknown, opts: { storedMd: string; onStatus?: (s: { live: boolean; degraded: boolean }) => void }) {
      textValue = opts.storedMd;
      statusSink = opts.onStatus ?? null;
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- the mock must hand the instance to the test scope
      collabInstance = this;
    }
  },
}));
// The collab mock's state lives at module scope: vi.mock factories hoist,
// so the fake class must reach these through the outer scope, not a describe.
let collabInstance: {
  doc: { on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> };
  text: { toString: () => string; length: number };
  applyLocalEdit: (start: number, end: number, value: string) => void;
  awareness: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    getStates: () => Map<number, { user?: { uid: string; name: string; color: string } }>;
    clientID: number;
  };
  destroy: ReturnType<typeof vi.fn>;
} | null;
let textValue: string;
let statusSink: ((s: { live: boolean; degraded: boolean }) => void) | null;

describe('BibleStudyEditor view', () => {
  const mockUser = { uid: 'u-admin-1' };

  // The editor's md fixture, shared by the #890 outline/append cases.
  const MEETING_MD = '## Section 1\n- Point 1\n\n## Section 2\n- Point 2';

  const MEETING: Meeting = {
    id: 'meeting-1',

    studyId: 'romans-fall26',
    title: 'Initial Meeting',
    date: '2026-09-01',
    published: false,
    md: '## Section 1\n- Point 1\n\n## Section 2\n- Point 2',
    sections: [
      { id: 'sec-1', title: 'Section 1', content: [], points: [{ before: 'Point 1' }] },
      { id: 'sec-2', title: 'Section 2', content: [], points: [{ before: 'Point 2' }] },
    ],
  };

  function renderAt(path = '/bible-study/meeting-1') {
    // The unsaved-changes guard operates on the real history, so these tests
    // run against BrowserRouter rather than MemoryRouter.
    window.history.replaceState(null, '', path);
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/bible-study/:meetingId" element={<BibleStudyEditor />} />
          <Route path="/bible-study" element={<div>Weeks index</div>} />
        </Routes>
      </BrowserRouter>,
    );
  }

  // The preview IS the reader (#890, ADR 0014), and the reader mirrors the
  // visible panel through an IntersectionObserver (#914). The global jsdom
  // stub in setup.ts is inert, so these tests install the same per-test
  // stub StudyReaderView.test.tsx uses — the counter is the read model, so
  // firing the observer is how a test asserts which Section the preview is
  // actually showing.
  function stubIntersectionObserver() {
    let callback: IntersectionObserverCallback | null = null;
    const observed: Element[] = [];
    class StubObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', StubObserver);
    return {
      observed,
      fire: (target: Element, isIntersecting: boolean) => {
        act(() => {
          callback?.(
            [{ target, isIntersecting } as IntersectionObserverEntry],
            {} as IntersectionObserver,
          );
        });
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.useAuth).mockReturnValue({
      user: mockUser,
      isAdmin: true,
    } as ReturnType<typeof auth.useAuth>);
    vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
      cb(MEETING);
      return () => {};
    });
    vi.mocked(bibleData.subscribeEntryPoints).mockImplementation((_db, cb) => {
      cb([]);
      return () => {};
    });
  });


  it('renders authoring panes, loads the addressed meeting, and allows selecting sections', async () => {
    renderAt();

    expect(await screen.findByDisplayValue('Initial Meeting')).toBeInTheDocument();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('Present mode')).toBeInTheDocument();

    // Click section in the left gutter
    const secButtons = screen.getAllByText('Section 2');
    fireEvent.click(secButtons[0]);

    // Save — it targets the addressed meeting, never a new document
    const saveBtn = screen.getByRole('button', { name: /^Save$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'meeting-1', studyId: 'romans-fall26' }),
        mockUser.uid,
      );
    });
  });

  it('saves with ⌘S / Ctrl+S while dirty and never publishes', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });

    fireEvent.keyDown(document, { key: 's', metaKey: true });

    await waitFor(() => {
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'meeting-1', title: 'Edited title', published: false }),
        mockUser.uid,
      );
    });
  });

  it('⌘S with nothing unsaved saves nothing', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');
    fireEvent.keyDown(document, { key: 's', metaKey: true });

    // Give any wrongly-dispatched save room to fail the test.
    await vi.waitFor(
      () => expect(bibleData.saveMeeting).not.toHaveBeenCalled(),
      { timeout: 50, interval: 10 },
    );
  });

  it('handles toolbar insertions into markdown textarea', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');

    const blankBtn = screen.getByRole('button', { name: /Blank/i });
    fireEvent.click(blankBtn);

    const questionBtn = screen.getByRole('button', { name: /Question/i });
    fireEvent.click(questionBtn);

    const passageBtn = screen.getByRole('button', { name: /Passage/i });
    fireEvent.click(passageBtn);

    const discussBtn = screen.getByRole('button', { name: /Discuss/i });
    fireEvent.click(discussBtn);

    const activityBtn = screen.getByRole('button', { name: /Activity/i });
    fireEvent.click(activityBtn);
    const addSecBtn = screen.getByRole('button', { name: /\+ Add section/i });
    fireEvent.click(addSecBtn);
    // #890: "+ Add section" appends at the END of the document even when the
    // textarea has never been focused (the reported bug — insert-at-cursor
    // wrote to offset 0, the top), and the caret lands after the hashes.
    const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
    const endMd = area.value;
    expect(endMd.endsWith('## ')).toBe(true);
    expect(area.selectionStart).toBe(endMd.length);
    expect(area.selectionEnd).toBe(endMd.length);

    // The list inserters land their starter templates at the end of the
    // caret's Section (#921), never at the cursor.
    const numBtn = screen.getByRole('button', { name: /Numbered list/i });
    fireEvent.click(numBtn);

    const bulletBtn = screen.getByRole('button', { name: /Bullet list/i });
    fireEvent.click(bulletBtn);

    const md = (screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement).value;
    expect(md).toContain('1. ');
    expect(md).toContain('2. ');
    expect(md).toContain('3. ');
    expect(md).toContain('- ');
  });

  // #917 — a toolbar click must not throw the author back to the top. The
  // mousedown focus shift blurs the textarea, so the value replacement lands
  // on an unfocused field and the browser resets its scroll; the deferred
  // refocus restores the caret but not the scroll. The toolbar buttons
  // preventDefault on mousedown (the standard formatting-toolbar
  // arrangement) so the field never blurs, and the shared edit path captures
  // the scroll offset before the value changes and restores it after the
  // selection is set. jsdom has no layout — it reports a scroll offset of
  // zero — so these tests pin the wiring (mousedown suppression, capture
  // before the value change, restore after the selection) and the pure
  // scroll decision lives in editorScroll.test.ts; the browser verification
  // is recorded on the issue.
  describe('toolbar clicks keep the author in place (#917)', () => {
    it('suppresses the mousedown focus shift on every toolbar button', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      expect(document.activeElement).toBe(area);

      // A real mousedown on a toolbar button must not move focus: the
      // textarea stays active through the whole click sequence.
      const passage = screen.getByRole('button', { name: /Passage/i });
      fireEvent.mouseDown(passage);
      expect(document.activeElement).toBe(area);
      fireEvent.mouseUp(passage);
      fireEvent.click(passage);
      expect(document.activeElement).toBe(area);
    });

    it('captures the scroll offset before the value changes and restores it after the selection is set', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      area.setSelectionRange(0, 0);
      area.scrollTop = 1234;

      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      // The insertion landed at the end of the caret's Section (#921) and
      // the caret sits after the blockquote marker (the deferred selection
      // callback runs on the next tick). Section 1's content ends at offset
      // 22 (its trailing blank line trimmed), so the caret lands at
      // 22 + '\n\n' + '> ' = 26.
      await waitFor(() => {
        expect(area.value).toContain('\n\n> ');
        expect(area.selectionStart).toBe(26);
      });
      // The captured offset was restored — the author stays where they were.
      expect(area.scrollTop).toBe(1234);
    });

    it('keeps a selected run selected between wrapping markers', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      const start = MEETING_MD.indexOf('Point 1');
      area.setSelectionRange(start, start + 'Point 1'.length);

      fireEvent.click(screen.getByRole('button', { name: /Bold/i }));

      await waitFor(() => {
        expect(area.selectionStart).toBe(start + 2);
        expect(area.selectionEnd).toBe(start + 2 + 'Point 1'.length);
      });
      expect(area.value.substring(area.selectionStart, area.selectionEnd)).toBe('Point 1');
    });

    it('keeps the outline highlighting the caret\'s Section after an insertion', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      // Caret inside Section 2's body — an insertion there must not move
      // the outline highlight off the caret's Section.
      area.setSelectionRange(MEETING_MD.indexOf('Point 2'), MEETING_MD.indexOf('Point 2'));

      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      // The caret-section sync runs in the deferred selection callback.
      await waitFor(() => {
        const sec2 = screen.getAllByText('Section 2')[0].closest('button')!;
        expect(sec2.className).toContain('font-semibold');
      });
    });

    it('still schedules autosave after a toolbar insertion', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      vi.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      await act(async () => { vi.advanceTimersByTime(1200); });
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'meeting-1' }),
        mockUser.uid,
      );
      vi.useRealTimers();
    });
  });

  // #921 — block inserters land at the end of the caret's Section, never at
  // the caret. A Prompt, a Passage and a Verse all live INSIDE a Section, so
  // appending to the document end would file them under the last Section
  // while the author writes the second; the end of the caret's Section
  // delivers the request without that silent misplacement. Inline inserters
  // — bold, italic, Blank — are unchanged and keep wrapping at the caret.
  describe('block inserters land in the caret\'s Section (#921)', () => {
    it('Passage inserts a bare quote with no reference line', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      area.setSelectionRange(0, 0);

      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      await waitFor(() => {
        expect(area.value).toContain('\n\n> ');
      });
      // No placeholder reference the author would have to delete.
      expect(area.value).not.toContain('Reference');
    });

    it('appends to the end of the caret\'s Section, not the document, when the caret is in an early Section', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      // Caret inside Section 1's body.
      area.setSelectionRange(3, 3);

      fireEvent.click(screen.getByRole('button', { name: /Discuss/i }));

      await waitFor(() => {
        // The Discuss line lands at the end of Section 1, before Section 2's
        // heading — never at the end of the document.
        expect(area.value).toBe(
          '## Section 1\n- Point 1\n\nDiscuss: \n\n## Section 2\n- Point 2',
        );
      });
    });

    it('separates the inserted block from the preceding content by exactly one blank line', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      area.setSelectionRange(3, 3);

      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      await waitFor(() => {
        expect(area.value).toBe(
          '## Section 1\n- Point 1\n\n> \n\n## Section 2\n- Point 2',
        );
      });
    });

    it('normalises the separation when the document ends without a trailing blank line', async () => {
      vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
        cb({ ...MEETING, md: '## Section 1\n- Point 1', sections: [] });
        return () => {};
      });
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      area.setSelectionRange(3, 3);

      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      await waitFor(() => {
        expect(area.value).toBe('## Section 1\n- Point 1\n\n> ');
      });
    });

    it('never splits the line the caret is in', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      // Caret mid-line inside Section 1's point.
      const mid = MEETING_MD.indexOf('Point 1') + 3;
      area.setSelectionRange(mid, mid);

      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      await waitFor(() => {
        // The caret's line is untouched — the block lands at the Section's
        // end, not at the caret.
        expect(area.value).toBe(
          '## Section 1\n- Point 1\n\n> \n\n## Section 2\n- Point 2',
        );
      });
    });

    it('falls back to the end of the document when the caret is in no Section', async () => {
      vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
        cb({ ...MEETING, md: 'Just prose, no headings.', sections: [] });
        return () => {};
      });
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      area.setSelectionRange(2, 2);

      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      await waitFor(() => {
        expect(area.value).toBe('Just prose, no headings.\n\n> ');
      });
    });

    it('lands at the end of the leading untitled Section when prose opens the document', async () => {
      vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
        cb({ ...MEETING, md: 'Intro prose\n\n## Alpha\n- point', sections: [] });
        return () => {};
      });
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      // Caret inside the leading untitled Section (prose before the first
      // heading) — the block belongs at the end of THAT Section, before the
      // first heading, never at the document end under the last Section.
      area.setSelectionRange(2, 2);

      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      await waitFor(() => {
        expect(area.value).toBe('Intro prose\n\n> \n\n## Alpha\n- point');
      });
    });

    it('scrolls to the insertion and leaves the caret ready to type', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      area.setSelectionRange(3, 3);

      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      await waitFor(() => {
        // The caret lands right after the blockquote marker, ready to type
        // the quote — the same "ready to type" contract "+ Add section" has.
        expect(area.selectionStart).toBe(26);
        expect(area.selectionEnd).toBe(26);
      });
      expect(document.activeElement).toBe(area);
    });

    it('keeps inline inserters wrapping at the caret', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      const start = MEETING_MD.indexOf('Point 1');
      area.setSelectionRange(start, start + 'Point 1'.length);

      fireEvent.click(screen.getByRole('button', { name: /Bold/i }));

      await waitFor(() => {
        expect(area.selectionStart).toBe(start + 2);
        expect(area.selectionEnd).toBe(start + 2 + 'Point 1'.length);
      });
      expect(area.value.substring(area.selectionStart, area.selectionEnd)).toBe('Point 1');
    });
  });

  // #890 — the editor becomes a document with an operating index.
  it('offers no Section button in the toolbar — adding a Section has one home', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    expect(screen.queryByRole('button', { name: /^Section$/i })).toBeNull();
    // The intra-Section inserters stay.
    expect(screen.getByRole('button', { name: /Passage/i })).toBeInTheDocument();
  });

  it('offers Verse alongside Passage in the toolbar (#918)', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
    area.focus();
    area.setSelectionRange(3, 3);

    fireEvent.click(screen.getByRole('button', { name: /Verse/i }));

    await waitFor(() => {
      // The Verse line lands at the end of the caret's Section, ready to
      // type the reference — the same "ready to type" contract the other
      // block inserters have.
      expect(area.value).toBe(
        '## Section 1\n- Point 1\n\nVerse: \n\n## Section 2\n- Point 2',
      );
    });
    expect(area.selectionStart).toBe(area.value.indexOf('Verse: ') + 'Verse: '.length);
  });

  it('offers Apply alongside Question, Discuss and Activity in the toolbar (#919)', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    // The toolbar offers all four Prompt kinds.
    expect(screen.getByRole('button', { name: /Question/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Discuss/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Activity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply/i })).toBeInTheDocument();

    const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
    area.focus();
    area.setSelectionRange(3, 3);

    fireEvent.click(screen.getByRole('button', { name: /Apply/i }));

    await waitFor(() => {
      // The Apply line lands at the end of the caret's Section, ready to
      // type the move the room will make — the same "ready to type"
      // contract the other block inserters have.
      expect(area.value).toBe(
        '## Section 1\n- Point 1\n\nApply: \n\n## Section 2\n- Point 2',
      );
    });
    expect(area.selectionStart).toBe(area.value.indexOf('Apply: ') + 'Apply: '.length);
  });

  it('clicking an outline row moves the textarea caret to that heading', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
    const expected = MEETING_MD.indexOf('## Section 2');
    const secButtons = screen.getAllByText('Section 2');
    fireEvent.click(secButtons[0]);

    expect(area.selectionStart).toBe(expected);
    expect(area.selectionEnd).toBe(expected);
  });

  it('highlights the outline row the caret sits in', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
    // Caret into Section 2's heading offset.
    fireEvent.select(area, { target: { selectionStart: MEETING_MD.indexOf('## Section 2') } });

    const sec2 = screen.getAllByText('Section 2')[0].closest('button')!;
    expect(sec2.className).toContain('font-semibold');
  });

  it('updates the outline live when a `##` splits a Section mid-body', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
    fireEvent.change(area, {
      target: { value: MEETING_MD + '\n\n## Brand new' },
    });

    expect(screen.getAllByText('Brand new').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Sections \(3\)/)).toBeInTheDocument();
  });

  it('toggles publish state and preview theme', async () => {
    renderAt();

    await screen.findByDisplayValue('Initial Meeting');

    // Toggle publish
    const pubBtn = screen.getByRole('button', { name: /Publish/i });
    fireEvent.click(pubBtn);

    await waitFor(() => {
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'meeting-1', published: true }),
        mockUser.uid,
      );
    });

    // Toggle theme (#937): the host carries the app's own `light`/`dark`
    // class plus the theme attribute, so the reader inside it resolves the
    // chosen palette even when the app window is in the other theme.
    const frame = screen.getByTestId('preview-frame');
    const phone = frame.firstElementChild as HTMLElement;

    const lightBtn = screen.getByRole('button', { name: /Light/i });
    fireEvent.click(lightBtn);
    expect(phone.dataset.theme).toBe('light');
    expect(phone.className).toMatch(/(^|\s)light(\s|$)/);

    const darkBtn = screen.getByRole('button', { name: /Dark/i });
    fireEvent.click(darkBtn);
    expect(phone.dataset.theme).toBe('dark');
    expect(phone.className).toMatch(/(^|\s)dark(\s|$)/);
  });

  // #916 — the preview frame's layout box matches its painted size. A CSS
  // transform is paint-only, so the outer box is pre-scaled (phone × scale)
  // while the inner box keeps true phone dimensions and scales from its
  // top-left corner; the bezel, border and shadow live on the outer box, the
  // one that matches the picture. jsdom has no layout, so the ResizeObserver
  // is inert and the scale sits at the legibility floor — the inline styles
  // are the contract, asserted from the rendered DOM.
  it('sizes the preview frame to the scaled phone, not the unscaled one', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    const frame = screen.getByTestId('preview-frame');
    // The outer box is pre-scaled: 390×0.5 by 844×0.5 (the floor, since
    // jsdom never fires the ResizeObserver).
    expect(frame.style.width).toBe('195px');
    expect(frame.style.height).toBe('422px');
    // The bezel, border and shadow hug the box that matches the picture.
    // The frame clips with `overflow: clip`, not `hidden`: an overflow-
    // hidden box is still programmatically scrollable, and the reader's
    // caret-follow jump scrolled it, sliding the phone up under its bezel
    // and slicing the sticky header off at the top.
    expect(frame.className).toMatch(/overflow-clip/);
    expect(frame.className).not.toMatch(/overflow-hidden/);
    expect(frame.className).toMatch(/border/);
    expect(frame.className).toMatch(/shadow/);

    // The inner box keeps true phone dimensions, scaled from the top-left.
    const phone = frame.firstElementChild as HTMLElement;
    expect(phone.style.width).toBe('390px');
    expect(phone.style.height).toBe('844px');
    expect(phone.style.transform).toBe('scale(0.5)');
    expect(phone.style.transformOrigin).toBe('top left');
  });

  it('shows a handled state for a week that does not exist', async () => {
    vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
      cb(null);
      return () => {};
    });

    renderAt('/bible-study/missing-week');

    expect(await screen.findByText("This week doesn't exist.")).toBeInTheDocument();
    expect(screen.getByText('All weeks')).toBeInTheDocument();
  });

  // #920 — the preview follows the caret's Section instead of restarting.
  // The reader is keyed on the caret's Section index, so React discards and
  // rebuilds it on every caret move: a fresh reducer starting at the first
  // Section, a fresh scroll container at the top, an empty Blank map. These
  // tests assert the observable state at this seam — the reader's counter
  // (its read model), a revealed Blank staying revealed, the textarea's
  // selection, and the preview's rendered content — never render counts.
  describe('preview follows the caret (#920)', () => {
    // A Blank in Section 1's first point, so a reveal key is deterministic
    // and an edit elsewhere in the document leaves the Section intact.
    const BLANK_MD = '## Section 1\n- Peace with God is a [[standing]], not a mood.\n\n## Section 2\n- Point 2';

    it('scrolls the preview to the caret\'s Section, not to the first one', async () => {
      vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
        cb({ ...MEETING, md: BLANK_MD, sections: [] });
        return () => {};
      });
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      // The preview starts at Section 1 — the counter's read model says so.
      const header = screen.getByTestId('reader-header');
      expect(within(header).getByText('01 / 02')).toBeInTheDocument();

      // Move the caret into Section 2. The follow path is the same jump the
      // Section index uses, so the read model moves with it — no observer
      // fire needed. A keyed reader would instead be discarded and rebuilt
      // here, its fresh reducer back at the first Section.
      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      fireEvent.select(area, {
        target: { selectionStart: BLANK_MD.indexOf('## Section 2') },
      });

      expect(within(screen.getByTestId('reader-header')).getByText('02 / 02')).toBeInTheDocument();
    });

    it('keeps a revealed Blank revealed after an edit elsewhere in the document', async () => {
      vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
        cb({ ...MEETING, md: BLANK_MD, sections: [] });
        return () => {};
      });
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      // Reveal the Blank in the preview.
      fireEvent.click(screen.getByRole('button', { name: 'Blank, tap to reveal' }));
      expect(screen.getByRole('button', { name: 'standing' })).toBeInTheDocument();

      // Move the caret into Section 2 — the keyed reader used to be
      // discarded and rebuilt here, wiping the reveal — then edit there.
      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      fireEvent.select(area, {
        target: { selectionStart: BLANK_MD.indexOf('## Section 2') },
      });
      fireEvent.change(area, {
        target: { value: BLANK_MD + '\n- typed in Section 2' },
      });

      expect(screen.getByRole('button', { name: 'standing' })).toBeInTheDocument();
    });

    it('keeps a revealed Blank revealed across a theme change', async () => {
      // #937 — toggling the preview's theme must not remount the reader: the
      // host's class and data-theme swap, the reader instance stays, so its
      // reducer state (revealed Blanks, scroll position) survives. A reader
      // keyed on the preview theme would discard and rebuild here.
      vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
        cb({ ...MEETING, md: BLANK_MD, sections: [] });
        return () => {};
      });
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      fireEvent.click(screen.getByRole('button', { name: 'Blank, tap to reveal' }));
      expect(screen.getByRole('button', { name: 'standing' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Light/i }));

      expect(screen.getByRole('button', { name: 'standing' })).toBeInTheDocument();
      expect(within(screen.getByTestId('reader-header')).getByText('01 / 02')).toBeInTheDocument();
    });

    it('keeps the preview\'s scroll position across an edit', async () => {
      vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
        cb({ ...MEETING, md: BLANK_MD, sections: [] });
        return () => {};
      });
      const io = stubIntersectionObserver();
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      // Scroll the preview to Section 2 — the deck's own scroll position.
      const deck = screen.getByTestId('reader-deck');
      deck.scrollTop = 120;
      const panel2 = io.observed.find(
        (el) => (el as HTMLElement).dataset.sectionPanel === '1',
      );
      expect(panel2, 'Section 2 panel should be observed').toBeDefined();
      io.fire(panel2!, true);
      expect(within(screen.getByTestId('reader-header')).getByText('02 / 02')).toBeInTheDocument();

      // An edit that moves the caret into another Section must not reset the
      // preview to the top: the reader is not remounted, so the deck node —
      // and its scroll position — survives.
      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      fireEvent.select(area, {
        target: { selectionStart: BLANK_MD.indexOf('## Section 2') },
      });
      fireEvent.change(area, {
        target: { value: BLANK_MD + '\n- typed in Section 2' },
      });

      expect(screen.getByTestId('reader-deck').scrollTop).toBe(120);
    });

    it('never moves the textarea\'s selection when the preview scrolls', async () => {
      vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
        cb({ ...MEETING, md: BLANK_MD, sections: [] });
        return () => {};
      });
      const io = stubIntersectionObserver();
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      // The caret sits in Section 1.
      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      fireEvent.select(area, { target: { selectionStart: 0 } });
      expect(area.selectionStart).toBe(0);

      // Scroll the preview to Section 2 — the textarea's selection must not
      // follow. Tracking is strictly one-way: the reader mirrors the visible
      // panel into its own read model and never writes back to the editor.
      const panel2 = io.observed.find(
        (el) => (el as HTMLElement).dataset.sectionPanel === '1',
      );
      expect(panel2, 'Section 2 panel should be observed').toBeDefined();
      io.fire(panel2!, true);
      expect(within(screen.getByTestId('reader-header')).getByText('02 / 02')).toBeInTheDocument();

      expect(area.selectionStart).toBe(0);
      expect(area.selectionEnd).toBe(0);
    });

    it('still reflects markdown typed but not saved', async () => {
      vi.mocked(bibleData.subscribeMeeting).mockImplementation((_db, _meetingId, cb) => {
        cb({ ...MEETING, md: BLANK_MD, sections: [] });
        return () => {};
      });
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      fireEvent.change(area, {
        target: { value: BLANK_MD + '\n\n## Brand new\n- typed but not saved' },
      });

      // The preview renders the unsaved Section; nothing was saved.
      expect(screen.getAllByText('Brand new').length).toBeGreaterThanOrEqual(1);
      expect(bibleData.saveMeeting).not.toHaveBeenCalled();
    });
  });

  afterEach(() => {
    // A failed assertion must not leak fake timers into the next test.
    vi.useRealTimers();
  });

  it('shows an honest save state: Saving…, then Saved · just now', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    // ⌘S exercises the same write path autosave uses; the state line reads
    // it the same way.
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });
    expect(screen.getByText('Saving…')).toBeInTheDocument();

    await screen.findByText('Saved · just now');
  });

  it('autosaves the body ~1.2s after typing stops, without any Save click', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText(/markdown/i), {
      target: { value: '## Section 1\n- Typed point' },
    });

    // Not yet: the body debounce is ~1.2s. The save chain is async, so the
    // advances await inside act to let the fired timer's promise settle.
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect(bibleData.saveMeeting).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(100); });
    expect(bibleData.saveMeeting).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'meeting-1',
        md: '## Section 1\n- Typed point',
        // Derived Sections are written with the markdown, and publish is
        // never flipped by autosave.
        sections: expect.anything(),
        published: false,
      }),
      mockUser.uid,
    );
    vi.useRealTimers();
  });

  it('autosaves title and date on their own shorter ~0.8s debounce', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });

    await act(async () => { vi.advanceTimersByTime(800); });
    expect(bibleData.saveMeeting).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'meeting-1', title: 'Edited title', published: false }),
      mockUser.uid,
    );
    vi.useRealTimers();
  });

  it('shows "Couldn\'t save" when a write fails, and retries on the next edit', async () => {
    vi.mocked(bibleData.saveMeeting)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('meeting-123');
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });
    await screen.findByText("Couldn't save");

    // The next edit retries the write.
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title again' },
    });
    await screen.findByText('Saved · just now');
    expect(bibleData.saveMeeting).toHaveBeenCalledTimes(2);
  });

  it('never prompts about unsaved changes, even mid-debounce', async () => {
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText('Meeting title'), {
      target: { value: 'Edited title' },
    });
    // Navigation before the debounce fires — no prompt, and the pending edit
    // is flushed rather than dropped.
    fireEvent.click(screen.getByText('All weeks'));
    vi.useRealTimers();

    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
    expect(await screen.findByText('Weeks index')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/bible-study');
  });

  describe('with live collab', () => {
    beforeEach(() => {
      mockRtdb = {} as unknown;
      textValue = '';
      statusSink = null;
      // A display name gives the presence chip a person, not an email.
      vi.mocked(auth.useAuth).mockReturnValue({
        user: { uid: 'u-admin-1', displayName: 'Ana', email: 'ana@example.com' },
        isAdmin: true,
      } as ReturnType<typeof auth.useAuth>);
    });

    afterEach(() => {
      mockRtdb = null;
      collabInstance = null;
    });

    it('routes body edits through the collaborative Y.Text and shows peer chips', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');
      statusSink?.({ live: true, degraded: false });
      await waitFor(() => expect(collabInstance).not.toBeNull());

      // A peer shows up as a name chip from awareness.
      expect(await screen.findByTitle('Bob')).toBeInTheDocument();

      // Typing goes through the collab channel, not a bare setState.
      const area = screen.getByPlaceholderText(/markdown/i);
      fireEvent.change(area, { target: { value: '## Seed\n- Typed point' } });
      await waitFor(() => expect(textValue).toBe('## Seed\n- Typed point'));
    });

    it('keeps autosave projecting the merged document to Firestore', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');
      statusSink?.({ live: true, degraded: false });
      await waitFor(() => expect(collabInstance).not.toBeNull());

      vi.useFakeTimers();
      fireEvent.change(screen.getByPlaceholderText(/markdown/i), {
        target: { value: '## Merged\n- both wrote this' },
      });
      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
      expect(bibleData.saveMeeting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'meeting-1', md: '## Merged\n- both wrote this' }),
        mockUser.uid,
      );
      vi.useRealTimers();
    });

    // #917 — the scroll capture/restore lives on the shared edit path, so a
    // toolbar click behaves identically with live collab: the insertion
    // routes through the Y.Text, the textarea keeps focus, and the captured
    // offset is restored.
    it('keeps the author in place on a toolbar click with live collab', async () => {
      renderAt();
      await screen.findByDisplayValue('Initial Meeting');
      statusSink?.({ live: true, degraded: false });
      await waitFor(() => expect(collabInstance).not.toBeNull());

      const area = screen.getByPlaceholderText(/markdown/i) as HTMLTextAreaElement;
      area.focus();
      area.setSelectionRange(0, 0);
      area.scrollTop = 1234;

      fireEvent.click(screen.getByRole('button', { name: /Passage/i }));

      // The insertion went through the collaborative channel, landing at the
      // end of the caret's Section (#921).
      await waitFor(() => expect(textValue).toContain('\n\n> '));
      // The textarea kept focus and the captured offset was restored.
      expect(document.activeElement).toBe(area);
      expect(area.scrollTop).toBe(1234);
    });
  });

  // A degraded transport must be invisible to the writer: same autosave, no
  // error noise (ADR 0012 §4). The hoisted collab mock reports degraded and
  // never marks live, so the editor must behave exactly like Tier 0.
  it('degrades to single-user autosave without error noise when collab reports degraded', async () => {
    mockRtdb = {} as unknown;
    renderAt();
    await screen.findByDisplayValue('Initial Meeting');
    statusSink?.({ live: false, degraded: true });

    // Typing still autosaves through the plain Firestore path…
    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText(/markdown/i), {
      target: { value: 'typed while degraded' },
    });
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.queryByText("Couldn't save")).not.toBeInTheDocument();
    expect(bibleData.saveMeeting).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'meeting-1', md: 'typed while degraded' }),
      mockUser.uid,
    );
    mockRtdb = null;
  });
});
