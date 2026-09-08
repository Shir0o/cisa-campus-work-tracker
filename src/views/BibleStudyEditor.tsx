import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { db, rtdb } from '../lib/firebase';
import {
  parseMeeting,
  isMeetingDirty,
  appendSection,
  sectionOffsets,
  sectionIndexAtOffset,
  previewScale,
  PREVIEW_PHONE_WIDTH,
  PREVIEW_PHONE_HEIGHT,
  type Meeting,
  type MeetingForm,
  type Section,
  type EntryPoint,
} from '../lib/bibleStudy';
import { useCommand } from '../lib/commands';
import {
  saveMeeting,
  setMeetingPublished,
  subscribeMeeting,
  subscribeEntryPoints,
} from '../lib/data/bibleStudy';
import { entryPointUrl } from '../lib/publicUrl';
import { format } from 'date-fns';
import { getUserInitials } from '../lib/utils';
import * as Y from 'yjs';
import { MeetingCollab } from '../lib/meetingCollab';
import { peersFromAwareness, type Peer } from '../lib/presence';
import StudyReaderView from '../components/bibleStudy/StudyReaderView';

export default function BibleStudyEditor() {
  const { meetingId = '' } = useParams<{ meetingId: string }>();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  // The form is the editable copy; it initializes once per meeting from the
  // first snapshot, so live updates never clobber what is being written.
  const initializedFor = useRef<string>('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [markdown, setMarkdown] = useState('');
  const [published, setPublished] = useState(false);
  const [saved, setSaved] = useState<MeetingForm | null>(null);
  const [saving, setSaving] = useState(false);
  // Honest save state (ADR 0012 §6): Saving… while a write is in flight,
  // Saved · just now after one lands, Couldn't save when a write fails. A
  // failed write retries on the next edit — autosave that says "Saved"
  // during a failed write is precisely the data loss this exists to prevent.
  const [saveError, setSaveError] = useState(false);
  // A save has landed this session; the badge may now say "Saved · just
  // now". Before any edit the freshly loaded doc needs no badge at all.
  const [everSaved, setEverSaved] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark');

  // The preview pane's measured size (#916). The phone is CSS-scaled into
  // the pane, so the scale must come from the pane's real box — a fixed
  // constant fits no pane correctly. jsdom has no layout, so the ResizeObserver
  // is inert in tests; the browser supplies the truth. The effect is keyed to
  // `loaded` because the pane only exists once the meeting has loaded — a
  // mount-time effect would find the ref null and never re-run.
  const [paneSize, setPaneSize] = useState<{ width: number; height: number } | null>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pane = previewPaneRef.current;
    if (!pane || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setPaneSize({ width, height });
    });
    observer.observe(pane);
    return () => observer.disconnect();
  }, [loaded]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The entry point pointing at this study — its URL is where a published
  // week goes, and present mode is how the room sees it.
  const [entryPoints, setEntryPoints] = useState<EntryPoint[]>([]);
  useEffect(() => subscribeEntryPoints(db, setEntryPoints), []);
  const entryPoint = entryPoints.find((ep) => ep.activeStudyId === meeting?.studyId);

  useEffect(() => {
    initializedFor.current = '';
    setMeeting(null);
    setLoaded(false);
    return subscribeMeeting(db, meetingId, (m) => {
      setMeeting(m);
      setLoaded(true);
      if (m && initializedFor.current !== meetingId) {
        initializedFor.current = meetingId;
        setTitle(m.title);
        setDate(m.date);
        setPublished(m.published);
        setMarkdown(m.md ?? '');
        setSaved({ title: m.title, date: m.date, markdown: m.md ?? '', published: m.published });
        setActiveSectionIndex(0);
      }
    }, () => {
      // A snapshot error must land on the not-found state, not spin forever.
      setMeeting(null);
      setLoaded(true);
    });
  }, [meetingId]);

  // ── Live collaboration (Tier 1, ADR 0012 §2/§3/§7) ────────────────────────
  // When the realtime backend exists, the body markdown is a Y.Text replicated
  // over `bible_study_meetings_rtdb/{meetingId}`; concurrent edits merge
  // instead of clobbering, and presence name chips come from awareness.
  // Null/absent/degraded transport → single-user autosave on the same state,
  // exactly the Tier 0 behavior, with no error surfaced.
  const [collab, setCollab] = useState<MeetingCollab | null>(null);
  const [collabStatus, setCollabStatus] = useState<{ live: boolean; degraded: boolean }>({
    live: false,
    degraded: false,
  });
  const [peers, setPeers] = useState<Peer[]>([]);
  const ydocRef = useRef<Y.Doc | null>(null);

  useEffect(() => {
    if (!meeting || !rtdb || collab) return;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const c = new MeetingCollab(ydoc, {
      meetingId,
      rtdb,
      me: {
        uid: user?.uid || '',
        name: user?.displayName || user?.email?.split('@')[0] || 'Someone',
      },
      storedMd: initializedFor.current === meetingId ? (meeting.md ?? '') : '',
      onStatus: setCollabStatus,
    });
    setCollab(c);
    // Awareness → name chips, collapsing one person's several tabs to one
    // entry and leaving self out — the same helper The Board uses.
    const updatePeers = () =>
      setPeers(peersFromAwareness(c.awareness.getStates(), c.awareness.clientID, user?.uid || ''));
    c.awareness.on('change', updatePeers);
    updatePeers();
    // Reflect the seeded/synced text into the form's markdown state.
    const reflectText = () => setMarkdown(c.text.toString());
    c.doc.on('update', reflectText);
    reflectText();
    return () => {
      c.awareness.off('change', updatePeers);
      c.doc.off('update', reflectText);
      c.destroy();
      ydoc.destroy();
      ydocRef.current = null;
      setCollab(null);
    };
    // The collab session is per meeting: one per editor mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, meeting?.id]);

  // The remote peer's edit lands in `markdown` through reflectText; the local
  // peer's edit goes textarea → Y.Text → the same state. Either way the form
  // state is the merged document, and autosave projects it as before.
  const collabRef = useRef<MeetingCollab | null>(null);
  useEffect(() => {
    collabRef.current = collab;
  }, [collab]);

  const sections: Section[] = parseMeeting(markdown);
  const offsets = sectionOffsets(markdown);
  // The caret's Section is what the outline highlights and the preview
  // follows; the preview scroll never moves the caret (one-way tracking).
  const [caretSectionIndex, setCaretSectionIndex] = useState(0);
  const syncCaretSection = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      setCaretSectionIndex(sectionIndexAtOffset(el.value, el.selectionStart ?? 0));
    },
    [],
  );
  // The preview Meeting is built from the author's unsaved markdown — the
  // literal "preview renders what I approve is what the room gets" path.
  const previewMeeting: Meeting = {
    id: meetingId || 'preview',
    studyId: meeting?.studyId ?? '',
    date,
    title: title || meeting?.title || '',
    sections,
    published: false,
  };

  // The one write path, shared by autosave and ⌘S. Resolves only once the
  // snapshot is accepted; a failure raises saveError for the state line and
  // leaves `saved` untouched, so the next edit (or reconnect-triggered edit)
  // retries. Never publishes: publish is a deliberate manual toggle.
  const pendingWrite = useRef<Promise<void>>(Promise.resolve());
  // The timer fires from a render that has already happened, so it reads the
  // form through a ref that every render refreshes — never a stale closure.
  const formRef = useRef({ title, date, markdown, published });
  formRef.current = { title, date, markdown, published };
  const handleSave = async (publishStatus = published) => {
    if (!meeting) return;
    const form = formRef.current;
    setSaveError(false);
    setSaving(true);
    const run = async () => {
      await saveMeeting(
        db,
        {
          id: meeting.id,
          studyId: meeting.studyId,
          date: form.date,
          title: form.title,
          sections: parseMeeting(form.markdown),
          published: publishStatus,
          md: form.markdown,
        },
        user?.uid,
      );
      setPublished(publishStatus);
      setSaved({ title: form.title, date: form.date, markdown: form.markdown, published: publishStatus });
      setEverSaved(true);
    };
    const write = pendingWrite.current.then(run);
    // The chain carries on after a failure; the rejection belongs to this
    // write's caller alone. Otherwise one failed write would poison every
    // write queued after it and a retry could never land.
    pendingWrite.current = write.catch(() => {});
    try {
      await write;
    } catch (e) {
      console.error('Failed to save meeting', e);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  // Debounced autosave (ADR 0012 §5, mirroring RtdbYjsProvider's Pages
  // cadence): body ~1.2s, title/date ~0.8s. One debounce serves both — an
  // edit resets whichever channel fired, so the latest form always wins and
  // only one write is ever pending (the chain in handleSave serializes).
  const saveTimer = useRef<number | null>(null);
  const autosave = (delay: number, publishStatus: boolean) => {
    clearTimeout(saveTimer.current ?? undefined);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void handleSave(publishStatus);
    }, delay);
  };

  // Leaving the editor cancels the debounce; unmount's own cleanup below
  // keeps a late fire from writing after the next editor opens.
  useEffect(() => () => {
    clearTimeout(saveTimer.current ?? undefined);
  }, []);

  const dirty = !!saved && isMeetingDirty({ title, date, markdown, published }, saved);
  // ⌘S / Ctrl+S ≡ the Save button: never publishes, no-ops when clean. The
  // command always matches so the browser's own Save-page dialog never fires.
  useCommand({
    id: 'biblestudy.save',
    scope: 'compose',
    description: 'Save the meeting',
    shortcut: { key: 's', mod: true },
    minRole: 'admin',
    when: (e) => !e.defaultPrevented,
    handler: () => {
      if (dirty) void handleSave(published);
    },
  });

  const handleTogglePublish = async () => {
    const nextState = !published;
    await handleSave(nextState);
  };

  // One edit path for the body: live collab routes the delta through the
  // Y.Text (so it replicates and merges), single-user writes state directly.
  // `selection` keeps the caret where a toolbar insertion expects it.
  const editMarkdown = (start: number, end: number, value: string) => {
    const c = collabRef.current;
    if (c && collabStatus.live) {
      c.applyLocalEdit(start, end, value);
      setMarkdown(c.text.toString());
    } else {
      const current = formRef.current.markdown;
      setMarkdown(current.substring(0, start) + value + current.substring(end));
    }
    autosave(1200, published);
  };

  const insertTextAtCursor = (before: string, after = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = el.value;
    const selected = current.substring(start, end);
    const replacement = `${before}${selected}${after}`;
    editMarkdown(start, end, replacement);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  // The one Section mutation (#890): appends `\n\n## ` at the END of the
  // document — never at the cursor, which is offset 0 in a textarea that has
  // never been focused, the exact bug where the heading landed at the top
  // while the author watched the bottom — scrolls there, and leaves the caret
  // after the hashes so the author immediately types the name.
  const handleAddSection = () => {
    const el = textareaRef.current;
    const { md: next, caret } = appendSection(formRef.current.markdown);
    editMarkdown(0, formRef.current.markdown.length, next);
    if (el) {
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
        syncCaretSection(el);
        el.scrollTop = el.scrollHeight;
      }, 0);
    }
  };

  // Clicking an outline row navigates — it never mutates: focus the textarea,
  // set the selection to that heading's offset, and scroll it into view.
  const handleOutlineClick = (offset: number) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(offset, offset);
    syncCaretSection(el);
  };

  // The phone is CSS-scaled into the pane (#916): the scale comes from the
  // pane's measured size, never a fixed constant. Before the first
  // ResizeObserver tick (and in jsdom, which has no layout) the pane size is
  // unknown, so the scale sits at the legibility floor — previewScale(0, 0)
  // clamps to it.
  const scale = previewScale(paneSize?.width ?? 0, paneSize?.height ?? 0);

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="animate-pulse text-sm text-on-surface-variant">Loading week…</div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-background text-center p-6">
        <p className="text-sm text-on-surface-variant">This week doesn't exist.</p>
        <Link to="/bible-study" className="text-xs font-semibold text-primary hover:underline">
          All weeks
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full p-4 lg:p-6 overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 shrink-0 border-b border-outline-variant">
        <div className="min-w-0">
          <div className="text-xs text-on-surface-variant font-medium flex items-center gap-1.5">
            <Link to="/bible-study" className="font-semibold text-primary hover:underline shrink-0">
              All weeks
            </Link>
            <span aria-hidden="true">·</span>
            <span className="truncate">Study: {meeting.studyId}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{published ? 'Published' : 'Draft'}</span>
            {(everSaved || dirty || saving || saveError) && (
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-surface-variant text-[10px] font-semibold text-on-surface-variant">
                {saveError ? "Couldn't save" : dirty || saving ? 'Saving…' : 'Saved · just now'}
              </span>
            )}
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              autosave(800, published);
            }}
            className="text-2xl lg:text-3xl font-serif font-bold text-on-surface bg-transparent border-0 outline-none focus:ring-0 p-0"
            placeholder="Meeting title"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              autosave(800, published);
            }}
            className="px-3 py-1.5 rounded-full border border-outline-variant bg-surface text-xs font-medium text-on-surface outline-none"
          />
          <button
            onClick={() => handleSave(published)}
            disabled={saving}
            className="px-4 py-2 rounded-full border border-outline-variant bg-surface text-xs font-semibold text-on-surface hover:bg-surface-variant transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleTogglePublish}
            disabled={saving}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
              published
                ? 'bg-[var(--t-sage-soft)] text-on-surface border border-[var(--t-sage)]'
                : 'bg-primary text-on-primary hover:opacity-90'
            }`}
          >
            {published ? 'Unpublish' : 'Publish week'}
          </button>
        </div>
      </div>

      {/* 3-Pane Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[200px_minmax(400px,1fr)_380px] gap-4 pt-4 overflow-hidden">
        {/* Left Pane: Sections Gutter */}
        <div className="hidden lg:flex flex-col min-h-0 bg-surface border border-outline-variant rounded-2xl p-3">
          <div className="text-[11px] font-bold tracking-wider uppercase text-on-surface-variant px-2 py-1 mb-2">
            Sections ({sections.length})
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
            {sections.map((sec, idx) => {
              const offset = offsets[idx] ?? 0;
              const isCaretRow = caretSectionIndex === idx;
              return (
                <button
                  key={`${offset}-${sec.id || idx}`}
                  onClick={() => handleOutlineClick(offset)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center gap-2.5 transition-colors ${
                    isCaretRow
                      ? 'bg-surface-variant font-semibold text-on-surface'
                      : 'text-on-surface-variant hover:bg-surface-variant/50'
                  }`}
                >
                  <span className="font-serif font-bold text-[10px] w-4 opacity-70">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate flex-1">{sec.title}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleAddSection}
            className="mt-2 w-full py-2 rounded-xl border border-dashed border-outline-variant text-xs font-medium text-on-surface-variant hover:bg-surface-variant flex items-center justify-center gap-1 transition-colors"
          >
            + Add section
          </button>
        </div>

        {/* Center Pane: Markdown Editor */}
        <div className="flex flex-col min-h-0 bg-surface border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
          {/* #890: the toolbar holds only what goes INSIDE a Section —
              the Section itself is created by "+ Add section" in the
              outline, never from a second place here. */}
          <div className="flex items-center gap-1.5 p-2.5 border-b border-outline-variant bg-surface-variant/30 flex-wrap">
            <button
              onClick={() => insertTextAtCursor('\n> ', '\n> Reference · Version')}
              className="px-2.5 py-1 rounded-full bg-surface border border-outline-variant text-xs font-medium hover:bg-surface-variant"
            >
              Passage
            </button>
            <button
              onClick={() => insertTextAtCursor('[[', ']]')}
              className="px-2.5 py-1 rounded-full bg-surface border border-outline-variant text-xs font-medium hover:bg-surface-variant text-[var(--t-sage)]"
            >
              Blank
            </button>
            <div className="w-px h-4 bg-outline-variant mx-1" />
            <button
              onClick={() => insertTextAtCursor('**', '**')}
              className="px-2.5 py-1 rounded-full bg-surface border border-outline-variant text-xs font-bold hover:bg-surface-variant"
              aria-label="Bold"
            >
              B
            </button>
            <button
              onClick={() => insertTextAtCursor('*', '*')}
              className="px-2.5 py-1 rounded-full bg-surface border border-outline-variant text-xs italic hover:bg-surface-variant"
              aria-label="Italic"
            >
              I
            </button>
            <button
              onClick={() => insertTextAtCursor('\n1. ', '\n2. \n3. ')}
              className="px-2.5 py-1 rounded-full bg-surface border border-outline-variant text-xs font-medium hover:bg-surface-variant tabular-nums"
              aria-label="Numbered list"
            >
              1.
            </button>
            <button
              onClick={() => insertTextAtCursor('\n- ')}
              className="px-2.5 py-1 rounded-full bg-surface border border-outline-variant text-xs font-medium hover:bg-surface-variant"
              aria-label="Bullet list"
            >
              •
            </button>

            <button
              onClick={() => insertTextAtCursor('\nQuestion: ')}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--t-slate-soft)] text-on-surface"
            >
              Question
            </button>
            <button
              onClick={() => insertTextAtCursor('\nDiscuss: ')}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--t-sage-soft)] text-on-surface"
            >
              Discuss
            </button>
            <button
              onClick={() => insertTextAtCursor('\nActivity: ')}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--t-clay-soft)] text-on-surface"
            >
              Activity
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={(e) => {
              const el = e.target;
              // Derive the replaced range from the textarea's own previous
              // value: React re-renders with `value` already applied, so
              // selectionStart/End alone can't recover what was deleted.
              const prev = markdown;
              const next = el.value;
              let start = 0;
              while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
              let endPrev = prev.length;
              let endNext = next.length;
              while (
                endPrev > start &&
                endNext > start &&
                prev[endPrev - 1] === next[endNext - 1]
              ) {
                endPrev--;
                endNext--;
              }
              editMarkdown(start, endPrev, next.substring(start, endNext));
            }}
            onSelect={(e) => syncCaretSection(e.target as HTMLTextAreaElement)}
            onKeyUp={(e) => syncCaretSection(e.target as HTMLTextAreaElement)}
            onClick={(e) => syncCaretSection(e.target as HTMLTextAreaElement)}
            className="flex-1 w-full p-4 font-mono text-sm leading-relaxed bg-transparent border-0 outline-none resize-none custom-scrollbar"
            placeholder="Write meeting markdown here..."
          />

          {/* Who else is in the document (ADR 0012 §7) — name chips from
              awareness, one per person, self excluded. */}
          {peers.length > 0 && (
            <div className="flex items-center gap-2 px-3 pb-2 text-[11px] text-on-surface-variant">
              <span className="shrink-0">Also editing:</span>
              <div className="flex -space-x-1.5">
                {peers.slice(0, 4).map((p) => (
                  <span
                    key={p.key}
                    className="w-6 h-6 rounded-full ring-2 ring-surface text-white text-[10px] font-semibold grid place-items-center"
                    style={{ background: p.color }}
                    title={p.name}
                  >
                    {getUserInitials(p.name)}
                  </span>
                ))}
              </div>
              {peers.length > 4 && <span>+{peers.length - 4}</span>}
            </div>
          )}
        </div>

        {/* Right Pane: Live Phone Preview & QR. The pane itself never
            scrolls (#916): the phone takes the height genuinely available
            and the Present mode panel sits beneath it as a row — the only
            scroller in the preview is the reader's own deck, the thing
            under test. */}
        <div className="hidden lg:flex flex-col min-h-0 bg-surface border border-outline-variant rounded-2xl p-4 gap-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-on-surface-variant">Live Preview</div>
            <div className="flex bg-surface-variant rounded-full p-0.5 text-[11px]">
              <button
                onClick={() => setPreviewTheme('dark')}
                className={`px-2.5 py-0.5 rounded-full ${
                  previewTheme === 'dark' ? 'bg-surface text-on-surface font-medium' : 'text-on-surface-variant'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => setPreviewTheme('light')}
                className={`px-2.5 py-0.5 rounded-full ${
                  previewTheme === 'light' ? 'bg-surface text-on-surface font-medium' : 'text-on-surface-variant'
                }`}
              >
                Light
              </button>
            </div>
          </div>

          {/* The preview IS the reader (#890, #920, ADR 0014): the same
              StudyReaderView the public route renders, at true phone
              dimensions (390×844) and CSS-scaled to fit the pane — the old
              hand-built 320×520 frame with overflow-hidden showed LESS than
              the real phone. It renders the unsaved markdown, follows the
              caret's Section one-way, and Blanks reveal for real.

              The reader is never remounted on a caret move: it accepts the
              Section the preview should be showing and scrolls to that
              panel through the same jump the Section index uses, so its
              state — scroll position, revealed Blanks — survives edits.
              Tracking stays strictly one-way: nothing in the reader writes
              back to the editor's selection.

              Two boxes, on purpose (#916): a CSS transform is paint-only,
              so the inner box keeps true phone dimensions and is scaled
              from its top-left corner, while the OUTER box is pre-scaled —
              its width and height are the phone's dimensions times the
              scale. That makes the layout box match the painted size;
              sizing the outer box to the unscaled phone is exactly the bug
              that left the dead band inside the bezel, the side slivers,
              and the frame overflowing a narrow pane. The bezel, border
              and shadow live on the outer box, the one that matches the
              picture. */}
          <div
            ref={previewPaneRef}
            className="flex-1 min-h-0 flex items-center justify-center"
          >
            <div
              data-testid="preview-frame"
              className="overflow-hidden shadow-xl border border-outline-variant"
              style={{
                width: PREVIEW_PHONE_WIDTH * scale,
                height: PREVIEW_PHONE_HEIGHT * scale,
                borderRadius: Math.round(28 * scale),
              }}
            >
              <div
                className={previewTheme === 'dark' ? 'bg-[#0A0A0B] text-[#FAFAFA]' : 'bg-white text-[#0A0A0B]'}
                style={{
                  width: PREVIEW_PHONE_WIDTH,
                  height: PREVIEW_PHONE_HEIGHT,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
                data-theme={previewTheme === 'dark' ? 'dark' : 'light'}
              >
                <StudyReaderView
                  meeting={previewMeeting}
                  staleDateLabel={null}
                  followSectionIndex={Math.max(0, caretSectionIndex)}
                />
              </div>
            </div>
          </div>

          {/* Present handoff — the old decorative SVG encoded nothing; the
              real code lives in present mode, generated from local state at
              the entry point's durable URL. */}
          <div className="bg-surface border border-outline-variant rounded-xl p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-on-surface">Present mode</div>
              <div className="text-[11px] text-on-surface-variant truncate font-mono">
                {entryPoint ? entryPointUrl(entryPoint.slug) : 'No entry point points at this study yet'}
              </div>
            </div>
            {entryPoint && (
              <Link
                to={`/bible-study/present?ep=${entryPoint.slug}`}
                className="px-3 py-1 bg-surface-variant rounded-full text-xs font-medium text-on-surface hover:opacity-80 whitespace-nowrap"
              >
                Show QR
              </Link>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
