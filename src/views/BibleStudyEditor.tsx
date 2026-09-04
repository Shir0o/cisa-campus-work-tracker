import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import { db } from '../lib/firebase';
import {
  parseMeeting,
  type Meeting,
  type Section,
} from '../lib/bibleStudy';
import {
  saveMeeting,
  setMeetingPublished,
  subscribeStudyMeetings,
} from '../lib/data/bibleStudy';
import { format } from 'date-fns';

export default function BibleStudyEditor() {
  const { user, isAdmin } = useAuth();
  const [studyId, setStudyId] = useState('romans-fall26');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('');
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  const [title, setTitle] = useState('Peace that holds');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [markdown, setMarkdown] = useState(`## Where peace starts
- Peace with God is a [[standing]], not a mood.
- The access we have was [[given]], never earned.
- What we stand in now is what we will stand in at the end.

> Being therefore justified by faith, we have peace with God through our Lord Jesus Christ; through whom we also have our access by faith into this grace in which we stand.
> Romans 5:1–2 · WEB

Discuss: Where do you catch yourself treating peace with God as a feeling that comes and goes?

## What suffering is doing
- Suffering is not the opposite of hope — it is the [[road]] to it.
- Character is not given. It is [[produced]].

> We also rejoice in our sufferings, knowing that suffering produces perseverance; and perseverance, proven character; and proven character, [[hope]].
> Romans 5:3–4 · WEB

Activity: In pairs, two minutes each. Name one thing you are enduring, and one thing it has already produced in you.
`);
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to study meetings
  useEffect(() => {
    if (!studyId) return;
    const unsub = subscribeStudyMeetings(db, studyId, (fetched) => {
      setMeetings(fetched);
      if (fetched.length > 0 && !selectedMeetingId) {
        const first = fetched[0];
        setSelectedMeetingId(first.id);
        setTitle(first.title);
        setDate(first.date);
        setPublished(first.published);
        if (first.md) setMarkdown(first.md);
      }
    });
    return () => unsub();
  }, [studyId]);

  const sections: Section[] = parseMeeting(markdown);
  const activeSection = sections[activeSectionIndex] || sections[0];

  const handleSelectMeeting = (m: Meeting) => {
    setSelectedMeetingId(m.id);
    setTitle(m.title);
    setDate(m.date);
    setPublished(m.published);
    if (m.md) setMarkdown(m.md);
    setActiveSectionIndex(0);
  };

  const handleSave = async (publishStatus = published) => {
    setSaving(true);
    try {
      const parsedSections = parseMeeting(markdown);
      const meetingId = await saveMeeting(
        db,
        {
          id: selectedMeetingId || undefined,
          studyId,
          date,
          title,
          sections: parsedSections,
          published: publishStatus,
          md: markdown,
        },
        user?.uid,
      );
      setSelectedMeetingId(meetingId);
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

  const qrUrl = `https://cisa.app/s/${studyId}/${date}`;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full p-4 lg:p-6 overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 shrink-0 border-b border-outline-variant">
        <div>
          <div className="text-xs text-on-surface-variant font-medium">
            Study: {studyId} · {published ? 'Published' : 'Draft'}
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

          {/* QR Code container */}
          <div className="bg-surface border border-outline-variant rounded-xl p-3 flex items-center gap-3">
            <svg width="42" height="42" viewBox="0 0 21 21" shapeRendering="crispEdges" aria-hidden="true">
              <rect width="21" height="21" fill="#FFFFFF" />
              <g fill="#0A0A0B">
                <path d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0z" />
              </g>
              <g fill="#FFFFFF">
                <path d="M1 1h5v5H1zM15 1h5v5h-5zM1 15h5v5H1z" />
              </g>
              <g fill="#0A0A0B">
                <path d="M2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2z" />
                <path d="M9 0h1v2H9zM11 1h1v1h-1zM9 3h2v1H9zM12 3h1v2h-1zM8 5h2v1H8zM10 6h2v1h-2z" />
                <path d="M0 9h2v1H0zM3 9h1v1H3zM5 9h2v1H5zM1 11h1v1H1zM3 11h2v1H3zM6 11h1v1H6zM0 12h1v1H0zM2 12h1v1H2zM4 12h1v1H4z" />
                <path d="M9 9h2v2H9zM12 9h1v1h-1zM14 9h2v1h-2zM17 9h1v1h-1zM19 10h2v1h-2zM9 12h1v1H9zM11 12h2v1h-2zM14 12h1v1h-1zM16 12h2v1h-2zM19 12h1v1h-1z" />
                <path d="M9 14h1v2H9zM11 14h2v1h-2zM14 14h1v1h-1zM16 15h2v1h-2zM19 14h1v2h-1zM9 17h2v1H9zM12 17h1v1h-1zM14 17h2v1h-2zM17 18h2v1h-2zM9 19h1v2H9zM11 19h2v1h-2zM14 19h1v2h-1zM16 20h3v1h-3zM19 19h1v1h-1z" />
                <path d="M12 6h1v1h-1zM14 5h1v1h-1zM17 6h2v1h-2z" />
              </g>
            </svg>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-on-surface">QR Code Link</div>
              <div className="text-[11px] text-on-surface-variant truncate font-mono">{qrUrl}</div>
            </div>
            <a
              href={`/s/${encodeURIComponent(studyId)}/${encodeURIComponent(date)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 bg-surface-variant rounded-full text-xs font-medium text-on-surface hover:opacity-80"
            >
              Open
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
