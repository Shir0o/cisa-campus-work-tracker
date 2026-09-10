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
  blockInsertionPoint,
  previewScale,
  PREVIEW_PHONE_WIDTH,
  PREVIEW_PHONE_HEIGHT,
  type Meeting,
  type MeetingForm,
  type Section,
  type EntryPoint,
} from '../lib/bibleStudy';
import { useCommand } from '../lib/commands';
import { restoreScrollAfterEdit } from '../lib/editorScroll';
import {
  saveMeeting,
  setMeetingPublished,
  subscribeMeeting,
  subscribeEntryPoints,
} from '../lib/data/bibleStudy';
import { entryPointUrl } from '../lib/publicUrl';
import { format } from 'date-fns';
import { getUserInitials } from '../lib/utils';
import { useLanguage } from '../components/LanguageProvider';
import * as Y from 'yjs';
import { MeetingCollab } from '../lib/meetingCollab';
import { peersFromAwareness, type Peer } from '../lib/presence';
import StudyReaderView from '../components/bibleStudy/StudyReaderView';
import ToolbarMenu from '../components/ui/ToolbarMenu';

export default function BibleStudyEditor() {
  const { meetingId = '' } = useParams<{ meetingId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
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
    // #917: capture the scroll offset before the value changes. A toolbar
    // click blurs the textarea (mousedown focus shift — suppressed below),
    // and a value replacement on an unfocused textarea resets its scroll;
    // the deferred refocus restores the caret but not the scroll. Capturing
    // here and restoring after the selection is set keeps the author in
    // place, and scrolls to the caret when the insertion is off screen.
    const capturedScrollTop = el.scrollTop;
    editMarkdown(start, end, replacement);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
      syncCaretSection(el);
      restoreScrollAfterEdit(el, capturedScrollTop, start + before.length);
    }, 0);
  };

  // Block inserters (#921): a Prompt, a Passage, etc. all live INSIDE
  // a Section, so the block lands at the END of the caret's Section — never
  // at the caret, which would split the line the author is mid-way through —
  // separated from what came before by exactly one blank line whatever the
  // document was terminated with (Verse sits in the flow and inserts at
  // cursor #946). With the caret in no Section, the block falls back to the
  // end of the document. The editor scrolls to the insertion and leaves the
  // caret ready to type, as "+ Add section" does.
  const insertBlockAtSectionEnd = (block: string, caretInBlock: number) => {
    const el = textareaRef.current;
    if (!el) return;
    const current = formRef.current.markdown;
    const { offset } = blockInsertionPoint(current, el.selectionStart ?? 0);
    const next = `${current.slice(0, offset)}\n\n${block}${current.slice(offset)}`;
    const caret = offset + 2 + caretInBlock;
    // #917: capture the scroll offset before the value changes — a toolbar
    // click blurs the textarea (mousedown focus shift — suppressed below),
    // and a value replacement on an unfocused textarea resets its scroll.
    const capturedScrollTop = el.scrollTop;
    editMarkdown(0, current.length, next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
      syncCaretSection(el);
      restoreScrollAfterEdit(el, capturedScrollTop, caret);
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

  // The phone fits the pane on BOTH axes and keeps its ratio: on a short
  // window it shrinks to stay whole rather than scrolling the preview
  // column, so the reader's sticky chrome stays in view and the Present
  // card below never falls out of reach. In jsdom (no layout) the pane
  // size stays unknown and the scale sits at the legibility floor —
  // previewScale(0, 0) clamps to it.
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
        <div className="min-w-0 flex-1">
          <div className="text-xs text-on-surface-variant font-medium flex items-center gap-1.5">
            <Link to="/bible-study" className="font-semibold text-primary hover:underline shrink-0">
              All weeks
            </Link>
            <span aria-hidden="true">·</span>
            {/* #946: always present, not threaded through a return param. It
                closes the fix-during-study loop from whichever direction you
                came — the reader's Edit chip, Present mode's pencil, the index,
                a bookmark — and it targets This week's study rather than the
                raw `/s/` URL so there is a way back out again. The entry point
                is the one already resolved for the Present card. */}
            {entryPoint && (
              <>
                <Link
                  to={`/bible-study/read?ep=${entryPoint.slug}`}
                  className="font-semibold text-primary hover:underline shrink-0"
                >
                  Open the study
                </Link>
                <span aria-hidden="true">·</span>
              </>
            )}
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
            // #946: the input carried no width, so it sat at the browser's
            // intrinsic ~20ch and clipped titles that had room to spare. It
            // now takes the header's remaining width. An input cannot wrap,
            // so a title longer than the field scrolls inside it rather than
            // pushing the 3-pane grid down a line.
            className="w-full text-2xl lg:text-3xl font-serif font-bold text-on-surface bg-transparent border-0 outline-none focus:ring-0 p-0"
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
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[200px_minmax(400px,1fr)_minmax(380px,422px)] gap-4 pt-4 overflow-hidden">
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
              outline, never from a second place here.

              The block inserters live in two labelled dropdowns — Insert
              (the blocks that build the week's structure) and Prompts (the
              four kinds a Section puts to the room). B and I are inline
              emphasis and belong to neither group, so they stay visible
              beside the menus — near the cursor's work without pretending
              to be inserters. The menus open on click, focus, or a short
              hover; every button suppresses the mousedown focus shift
              (#917) so the author's caret and scroll survive the pick. */}
          <div className="flex items-center gap-1.5 p-2.5 border-b border-outline-variant bg-surface-variant/30">
            <ToolbarMenu
              label="Insert"
              items={[
                {
                  id: 'passage',
                  label: 'Passage',
                  onSelect: () => insertBlockAtSectionEnd('> ', 2),
                },
                {
                  id: 'verse',
                  label: 'Verse',
                  onSelect: () => insertTextAtCursor('Verse: '),
                },
                {
                  id: 'blank',
                  label: 'Blank',
                  onSelect: () => insertTextAtCursor('[[', ']]'),
                },
                {
                  id: 'numbered-list',
                  label: t('study.numbered_list'),
                  onSelect: () => insertBlockAtSectionEnd('1. \n2. \n3. ', 3),
                },
                {
                  id: 'bullet-list',
                  label: t('study.bullet_list'),
                  onSelect: () => insertBlockAtSectionEnd('- ', 2),
                },
              ]}
            />
            <ToolbarMenu
              label="Prompts"
              items={[
                {
                  id: 'question',
                  label: 'Question',
                  onSelect: () => insertBlockAtSectionEnd('Question: ', 10),
                },
                {
                  id: 'discuss',
                  label: 'Discuss',
                  onSelect: () => insertBlockAtSectionEnd('Discuss: ', 9),
                },
                {
                  id: 'activity',
                  label: 'Activity',
                  onSelect: () => insertBlockAtSectionEnd('Activity: ', 10),
                },
                {
                  id: 'apply',
                  label: 'Apply',
                  onSelect: () => insertBlockAtSectionEnd('Apply: ', 7),
                },
              ]}
            />
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              <button
                onClick={() => insertTextAtCursor('**', '**')}
                onMouseDown={(e) => e.preventDefault()}
                className="w-6 h-6 rounded-full bg-surface border border-outline-variant text-[11px] font-bold hover:bg-surface-variant"
                aria-label={t('study.bold')}
              >
                B
              </button>
              <button
                onClick={() => insertTextAtCursor('*', '*')}
                onMouseDown={(e) => e.preventDefault()}
                className="w-6 h-6 rounded-full bg-surface border border-outline-variant text-[11px] italic hover:bg-surface-variant"
                aria-label={t('study.italic')}
              >
                I
              </button>
            </div>
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

        {/* Right Pane: Live Phone Preview & QR. The phone fits the pane on
            BOTH axes (#916, #937) — it shrinks to stay whole instead of
            making the preview column scroll — so the reader's sticky chrome
            (meeting title, section count, text-size control) is never out
            of sight, and the Present card below the phone is a pinned,
            separate card that never needs scrolling to reach. */}
        <div className="hidden lg:flex flex-col min-h-0 bg-surface border border-outline-variant rounded-2xl p-4 overflow-hidden">
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
              dimensions (390×844) and CSS-scaled into the pane — it renders
              the unsaved markdown, follows the caret's Section one-way, and
              Blanks reveal for real.

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
              picture. The outer box clips with `overflow: clip`, not
              `hidden`: an overflow-hidden box is still programmatically
              scrollable, and the reader's caret-follow jump (scrollIntoView)
              scrolls every scrollable ancestor — a scrolled frame slid the
              whole phone up under its own bezel and sliced the sticky
              header off at the top. `clip` paints identically but can never
              be scrolled.

              The frame themes the phone independently of the app's own
              theme (#937): the inner box carries the `light`/`dark` class
              the app's theme provider puts on the document root — so the
              reader resolves the chosen palette's values — plus a
              host-local data-theme attribute that the reader-card theme
              mapping is keyed on. Neither the class nor the attribute
              collides with the app root's own theme marker, so the phone
              renders the chosen theme even when the app window is in the
              other theme.

              The phone is centred by the two flex spacers; because it never
              exceeds the pane the column is not a scroller — the reader's
              deck is the only scroller in the preview, and the Present card
              sits pinned below the scroller as its own card. */}
          <div
            ref={previewPaneRef}
            data-testid="preview-scroll"
            // #946: overflow-clip, not overflow-y-auto — and deliberately
            // not overflow-hidden. previewScale now guarantees the frame fits
            // on both axes with the pane's fractional dimensions floored, so
            // this can never NEED to scroll, and clipping also swallows the
            // brief pre-measurement frame (true size, before the
            // ResizeObserver fires) instead of flashing a scrollbar.
            //
            // `hidden` would not have been enough, for the same reason the
            // phone frame below uses `clip`: an overflow-hidden box is still
            // programmatically scrollable, and the reader's caret-follow
            // jump (scrollIntoView) scrolls every scrollable ancestor. That
            // is the #939 bug — a scrolled container slides the phone up
            // under its own bezel and slices the sticky header off the top —
            // and `hidden` here would simply have moved it one level out.
            // `clip` paints identically and can never be scrolled by either
            // scrollTop or scrollIntoView.
            //
            // The testid keeps its name; this is the preview's box, no
            // longer a scroller.
            className="mt-4 flex-1 min-h-0 overflow-clip"
          >
            <div className="min-h-full flex flex-col">
              <div className="flex-1 min-h-0" />
              <div className="flex justify-center shrink-0">
                <div
                  data-testid="preview-frame"
                  className="overflow-clip shadow-xl border border-outline-variant"
                  style={{
                    // Floored: the scale already fits, but a fractional
                    // layout box rounds up and re-creates the sub-pixel
                    // overflow this is meant to eliminate (#946).
                    width: Math.floor(PREVIEW_PHONE_WIDTH * scale),
                    height: Math.floor(PREVIEW_PHONE_HEIGHT * scale),
                    borderRadius: Math.round(28 * scale),
                  }}
                >
                  <div
                    className={
                      previewTheme === 'dark'
                        ? 'dark bg-[#0A0A0B] text-[#FAFAFA]'
                        : 'light bg-white text-[#0A0A0B]'
                    }
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
              <div className="flex-1 min-h-0" />
            </div>
          </div>

          {/* Present handoff — the old decorative SVG encoded nothing; the
              real code lives in present mode, generated from local state at
              the entry point's durable URL. Pinned BELOW the preview
              scroller as its own card, so Present mode and the URL never
              require scrolling the phone out of the way. */}
          <div
            data-testid="present-card"
            // #946: its own ground. Sharing bg-surface with the pane made a
            // separate, differently-purposed card read as the bottom strip of
            // the preview.
            className="mt-4 bg-surface-variant border border-outline-variant rounded-xl p-3 flex items-center gap-3 shrink-0"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-on-surface">Present mode</div>
              <div className="text-[11px] text-on-surface-variant truncate font-mono">
                {entryPoint ? entryPointUrl(entryPoint.slug) : 'No entry point points at this study yet'}
              </div>
            </div>
            {entryPoint && (
              <Link
                to={`/bible-study/present?ep=${entryPoint.slug}&meeting=${meetingId}`}
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
