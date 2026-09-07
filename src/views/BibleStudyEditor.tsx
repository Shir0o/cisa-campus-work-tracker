import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { db } from '../lib/firebase';
import {
  parseMeeting,
  type Meeting,
  type Section,
  type EntryPoint,
} from '../lib/bibleStudy';
import {
  saveMeeting,
  setMeetingPublished,
  subscribeMeeting,
  subscribeEntryPoints,
} from '../lib/data/bibleStudy';
import { entryPointUrl } from '../lib/publicUrl';
import { format } from 'date-fns';

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
  const [saving, setSaving] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark');

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
        setActiveSectionIndex(0);
      }
    });
  }, [meetingId]);

  const sections: Section[] = parseMeeting(markdown);
  const activeSection = sections[activeSectionIndex] || sections[0];

  const handleSave = async (publishStatus = published) => {
    if (!meeting) return;
    setSaving(true);
    try {
      await saveMeeting(
        db,
        {
          id: meeting.id,
          studyId: meeting.studyId,
          date,
          title,
          sections: parseMeeting(markdown),
          published: publishStatus,
          md: markdown,
        },
        user?.uid,
      );
      setPublished(publishStatus);
    } catch (e) {
      console.error('Failed to save meeting', e);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    const nextState = !published;
    await handleSave(nextState);
  };

  const insertTextAtCursor = (before: string, after = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = el.value;
    const selected = current.substring(start, end);
    const replacement = `${before}${selected}${after}`;
    const nextVal = current.substring(0, start) + replacement + current.substring(end);
    setMarkdown(nextVal);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };



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
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-2xl lg:text-3xl font-serif font-bold text-on-surface bg-transparent border-0 outline-none focus:ring-0 p-0"
            placeholder="Meeting title"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 rounded-full border border-outline-variant bg-surface text-xs font-medium text-on-surface outline-none"
          />
          <button
            onClick={() => handleSave(published)}
            disabled={saving}
            className="px-4 py-2 rounded-full border border-outline-variant bg-surface text-xs font-semibold text-on-surface hover:bg-surface-variant transition-colors"
          >
            {saving ? 'Saving...' : 'Save draft'}
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
            {sections.map((sec, idx) => (
              <button
                key={sec.id || idx}
                onClick={() => setActiveSectionIndex(idx)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center gap-2.5 transition-colors ${
                  activeSectionIndex === idx
                    ? 'bg-surface-variant font-semibold text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-variant/50'
                }`}
              >
                <span className="font-serif font-bold text-[10px] w-4 opacity-70">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className="truncate flex-1">{sec.title}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => insertTextAtCursor('\n\n## New Section\n- ')}
            className="mt-2 w-full py-2 rounded-xl border border-dashed border-outline-variant text-xs font-medium text-on-surface-variant hover:bg-surface-variant flex items-center justify-center gap-1 transition-colors"
          >
            + Add section
          </button>
        </div>

        {/* Center Pane: Markdown Editor */}
        <div className="flex flex-col min-h-0 bg-surface border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
          {/* Toolbar */}
          <div className="flex items-center gap-1.5 p-2.5 border-b border-outline-variant bg-surface-variant/30 flex-wrap">
            <button
              onClick={() => insertTextAtCursor('\n## ')}
              className="px-2.5 py-1 rounded-full bg-surface border border-outline-variant text-xs font-medium hover:bg-surface-variant"
            >
              Section
            </button>
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
            onChange={(e) => setMarkdown(e.target.value)}
            className="flex-1 w-full p-4 font-mono text-sm leading-relaxed bg-transparent border-0 outline-none resize-none custom-scrollbar"
            placeholder="Write meeting markdown here..."
          />
        </div>

        {/* Right Pane: Live Phone Preview & QR */}
        <div className="hidden lg:flex flex-col min-h-0 bg-surface border border-outline-variant rounded-2xl p-4 overflow-y-auto custom-scrollbar gap-4">
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

          {/* Mini phone frame */}
          <div
            className={`w-[320px] h-[520px] rounded-[28px] mx-auto p-5 flex flex-col justify-between overflow-hidden shadow-xl border border-outline-variant ${
              previewTheme === 'dark' ? 'bg-[#0A0A0B] text-[#FAFAFA]' : 'bg-white text-[#0A0A0B]'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-semibold text-neutral-400 tracking-wider uppercase">
              <span>{title || 'Title'}</span>
              <span className="tabular-nums">
                {String(activeSectionIndex + 1).padStart(2, '0')} / {String(sections.length).padStart(2, '0')}
              </span>
            </div>

            <div className="flex-1 my-auto flex flex-col justify-center gap-3.5 py-2 overflow-hidden">
              <h3 className="font-serif font-bold text-2xl leading-tight">
                {activeSection?.title || 'Section Heading'}
              </h3>
              {activeSection?.points && activeSection.points.length > 0 && (
                <div className="space-y-1.5 text-xs text-neutral-400">
                  {activeSection.points.map((pt, i) => (
                    <div key={i}>
                      {pt.before}
                      {'word' in pt && (
                        <span className="inline-block px-1 bg-[oklch(0.82_0.14_145/0.20)] rounded mx-0.5 text-white">
                          {pt.word}
                        </span>
                      )}
                      {'after' in pt && pt.after}
                    </div>
                  ))}
                </div>
              )}
              {activeSection?.passage && (
                <div className="pt-2 border-t border-neutral-800 text-xs italic">
                  <p className="m-0 leading-relaxed text-neutral-200">
                    {activeSection.passage.before}
                    {'word' in activeSection.passage && (
                      <span className="underline decoration-dotted">{activeSection.passage.word}</span>
                    )}
                    {'after' in activeSection.passage && activeSection.passage.after}
                  </p>
                  {activeSection.ref && (
                    <div className="mt-1 text-[9px] font-semibold tracking-wider uppercase text-neutral-500">
                      {activeSection.ref}
                    </div>
                  )}
                </div>
              )}
              {activeSection?.prompt && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-2.5 text-xs">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-[oklch(0.82_0.14_145)] mb-1">
                    {activeSection.prompt.kind}
                  </div>
                  <div className="text-neutral-300 leading-snug">{activeSection.prompt.text}</div>
                </div>
              )}
            </div>

            <div className="flex gap-1 pt-1">
              {sections.map((_, i) => (
                <div
                  key={i}
                  className={`h-0.5 flex-1 rounded-full ${
                    i <= activeSectionIndex ? 'bg-white' : 'bg-neutral-800'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-on-surface-variant justify-center opacity-60">
            <span className="h-px bg-outline-variant flex-1" />
            <span>Screen ends here</span>
            <span className="h-px bg-outline-variant flex-1" />
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
