import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import {
  MEETING_SKELETON_MD,
  nextMeetingDate,
  resolveScan,
  type EntryPoint,
  type Meeting,
  type Study,
} from '../lib/bibleStudy';
import {
  deleteMeeting,
  saveMeeting,
  setMeetingPublished,
  subscribeEntryPoints,
  subscribeStudy,
  subscribeStudyMeetings,
} from '../lib/data/bibleStudy';
import { useAuth } from '../components/AuthProvider';
import { staffPermalinkUrl } from '../lib/publicUrl';
import { format, parseISO } from 'date-fns';

/**
 * The weeks index at /bible-study (ADR 0011, `Main` / `IndexPhone`
 * artboards). Two columns that answer different questions: the left is what
 * exists; the right is what a student scanning right now would actually see.
 * The newest draft can sit at the top of the list while an older week carries
 * the live mark — the gap stays legible without arithmetic.
 */
export default function BibleStudyIndex() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [entryPoints, setEntryPoints] = useState<EntryPoint[]>([]);
  const [entryPointsLoaded, setEntryPointsLoaded] = useState(false);
  const entryPoint = entryPoints[0] ?? null;

  useEffect(() => {
    return subscribeEntryPoints(db, (list) => {
      setEntryPoints(list);
      setEntryPointsLoaded(true);
    });
  }, []);

  const studyId = entryPoint?.activeStudyId ?? null;
  const [study, setStudy] = useState<Study | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);

  useEffect(() => {
    setStudy(null);
    setMeetings([]);
    setMeetingsLoaded(false);
    if (!studyId) return;
    const unsubStudy = subscribeStudy(db, studyId, setStudy, () => {
      setStudy(null);
      setMeetingsLoaded(true);
    });
    const unsubMeetings = subscribeStudyMeetings(db, studyId, (m) => {
      setMeetings(m);
      setMeetingsLoaded(true);
    }, () => {
      setMeetings([]);
      setMeetingsLoaded(true);
    });
    return () => {
      unsubStudy();
      unsubMeetings();
    };
  }, [studyId]);

  const today = new Date().toISOString().slice(0, 10);
  const resolution = resolveScan(entryPoint, study, meetings, today);
  const liveMeetingId = resolution.kind === 'meeting' ? resolution.meeting.id : null;
  const newest = meetings[0] ?? null;
  const newestDraftHidesLive = !!newest && !newest.published && newest.id !== liveMeetingId;
  const loaded = entryPointsLoaded && (!!studyId ? meetingsLoaded : true);

  const handleNewWeek = async () => {
    if (!study || !user) return;
    const date = nextMeetingDate(meetings, today);
    const draft: Meeting = {
      id: `${study.id}-${date}`,
      studyId: study.id,
      date,
      title: '',
      sections: [],
      published: false,
      md: MEETING_SKELETON_MD,
    };
    const id = await saveMeeting(db, draft, user.uid);
    // Optimistic: closes the stale-subscription window a rapid second click
    // would otherwise collide through.
    setMeetings((cur) => (cur.some((m) => m.id === draft.id) ? cur : [draft, ...cur]));
    navigate(`/bible-study/${id}`);
  };

  // ── Row actions (issue #864) ──────────────────────────────────────────
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Meeting | null>(null);

  const handleDuplicate = async (m: Meeting) => {
    if (!user) return;
    const date = nextMeetingDate(meetings, today);
    const copy: Meeting = {
      id: `${m.studyId}-${date}`,
      studyId: m.studyId,
      date,
      title: m.title,
      sections: m.sections,
      published: false,
      md: m.md ?? '',
    };
    await saveMeeting(db, copy, user.uid);
    setMeetings((cur) => (cur.some((x) => x.id === copy.id) ? cur : [copy, ...cur]));
    setMenuFor(null);
  };

  const handleCopyStaffLink = (m: Meeting) => {
    void navigator.clipboard?.writeText(staffPermalinkUrl(m.studyId, m.date));
    setCopiedId(m.id);
    setTimeout(() => setCopiedId((cur) => (cur === m.id ? null : cur)), 1500);
    setMenuFor(null);
  };

  const handleUnpublish = async (m: Meeting) => {
    await setMeetingPublished(db, m.id, false);
    setMenuFor(null);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteCandidate) return;
    await deleteMeeting(db, deleteCandidate.id);
    setDeleteCandidate(null);
    setMenuFor(null);
  };

  const formatDay = (date: string) => {
    try {
      return format(parseISO(date), 'EEE, MMM d');
    } catch {
      return date;
    }
  };

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto p-4 lg:p-6 bg-background">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Weeks — what exists */}
        <section className="order-2 lg:order-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold tracking-wider uppercase text-on-surface-variant px-1">
              Weeks{loaded && study ? ` · ${meetings.length}` : ''}
            </h2>
            <button
              onClick={handleNewWeek}
              disabled={!study}
              className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none"
            >
              New week
            </button>
          </div>

          <div className="bg-surface border border-outline-variant rounded-2xl divide-y divide-outline-variant/60 overflow-hidden">
            {loaded && meetings.length === 0 && (
              <div className="p-6 text-center text-sm text-on-surface-variant">
                No weeks yet — start the first one.
              </div>
            )}
            {meetings.map((m, i) => (
              <div key={m.id} className="flex items-center gap-1 pr-1.5">
                <button
                  onClick={() => navigate(`/bible-study/${m.id}`)}
                  className="flex-1 min-w-0 text-left flex items-center gap-3 px-3 lg:px-4 py-2.5 min-h-[44px] hover:bg-surface-variant/50 transition-colors"
                >
                  <span className="font-serif font-bold text-[10px] w-5 shrink-0 opacity-50 tabular-nums">
                    {String(meetings.length - i).padStart(2, '0')}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-on-surface truncate">
                      {m.title || 'Untitled week'}
                    </span>
                    <span className="block text-[11px] text-on-surface-variant truncate">
                      {formatDay(m.date)} · {m.sections.length}{' '}
                      {m.sections.length === 1 ? 'section' : 'sections'} ·{' '}
                      {m.published ? 'published' : 'not published'}
                    </span>
                  </span>
                  {m.id === liveMeetingId ? (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--t-sage-soft)] text-on-surface">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--t-sage)]" />
                      Live now
                    </span>
                  ) : !m.published ? (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-variant text-on-surface-variant">
                      Draft
                    </span>
                  ) : null}
                </button>

                {/* Row actions — duplicate, copy staff link, unpublish, delete */}
                <div className="relative shrink-0">
                  <button
                    aria-label={`Week actions for ${m.title || 'untitled week'}`}
                    aria-expanded={menuFor === m.id}
                    onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>
                  {menuFor === m.id && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />
                      <div
                        role="menu"
                        aria-label={`Actions for ${m.title || 'untitled week'}`}
                        className="absolute right-0 top-9 z-30 w-64 bg-surface border border-outline-variant rounded-2xl shadow-xl p-1.5"
                      >
                        <button
                          role="menuitem"
                          onClick={() => void handleDuplicate(m)}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                        >
                          Duplicate into a new week
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => handleCopyStaffLink(m)}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                        >
                          {copiedId === m.id ? 'Copied' : 'Copy staff link'}
                        </button>
                        {m.published && (
                          <button
                            role="menuitem"
                            onClick={() => void handleUnpublish(m)}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                          >
                            Unpublish
                          </button>
                        )}
                        <button
                          role="menuitem"
                          disabled={m.published}
                          onClick={() => {
                            setDeleteCandidate(m);
                            setMenuFor(null);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                            m.published
                              ? 'text-on-surface-variant/50 cursor-not-allowed'
                              : 'text-error hover:bg-surface-variant'
                          }`}
                        >
                          Delete
                        </button>
                        {m.published && (
                          <p className="px-3 pt-1 pb-1.5 text-[11px] text-on-surface-variant leading-snug">
                            Unpublish first — a published week may already be on someone's screen.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Entry point + scan panel — what a student scanning would see */}
        <aside className="order-1 lg:order-2 space-y-3">
          <div className="bg-surface border border-outline-variant rounded-2xl p-4">
            <div className="text-xs font-bold tracking-wider uppercase text-on-surface-variant mb-2">
              Entry point
            </div>
            {!entryPoint ? (
              <p className="text-sm text-on-surface-variant">
                No entry point is set up yet. Run <code className="font-mono text-xs">npm run seed:bible-study</code>{' '}
                to create one.
              </p>
            ) : (
              <>
                <div className="text-sm font-semibold text-on-surface">{entryPoint.name}</div>
                <div className="text-[11px] text-on-surface-variant font-mono truncate">
                  /s/{entryPoint.slug}
                </div>
                <div className="mt-2 text-xs text-on-surface-variant">
                  {study ? (
                    <>
                      <span className="font-medium text-on-surface">{study.title} · {study.term}</span>{' '}
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-surface-variant text-[10px] font-semibold">
                        Active
                      </span>
                    </>
                  ) : (
                    'No study is active'
                  )}
                </div>
                <p className="mt-2 text-[11px] text-on-surface-variant">
                  One code, every week — it never changes.
                </p>
                {entryPoint && (
                  <Link
                    to={`/bible-study/present?ep=${entryPoint.slug}`}
                    className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:opacity-90"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect width="5" height="5" x="3" y="3" rx="1" />
                      <rect width="5" height="5" x="16" y="3" rx="1" />
                      <rect width="5" height="5" x="3" y="16" rx="1" />
                      <path d="M21 16h-3v3M21 21h.01M12 7h3M9.5 12H12M16 12h.01M12 16h.01M12 21h.01" />
                    </svg>
                    Show QR
                  </Link>
                )}
              </>
            )}
          </div>

          <div className="bg-surface border border-outline-variant rounded-2xl p-4">
            <div className="text-xs font-bold tracking-wider uppercase text-on-surface-variant mb-2">
              What a scan opens right now
            </div>
            {resolution.kind === 'meeting' ? (
              <>
                <div className="text-sm font-semibold text-on-surface">
                  {resolution.meeting.title}
                </div>
                <div className="text-[11px] text-on-surface-variant">
                  {formatDay(resolution.meeting.date)}
                </div>
              </>
            ) : resolution.kind === 'never-published' ? (
              <p className="text-sm text-on-surface-variant">
                Nothing yet — the study has never published a week.
              </p>
            ) : (
              <p className="text-sm text-on-surface-variant">
                Nothing running right now — no study is active on this code.
              </p>
            )}
            {newestDraftHidesLive && newest && (
              <p className="mt-2 pt-2 border-t border-outline-variant/60 text-[11px] text-on-surface-variant">
                {newest.title || 'The newest week'} is still a draft — publish it and it becomes
                what the code opens.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* Delete is two deliberate steps — the menu click is only the first. */}
      {deleteCandidate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Delete week"
        >
          <div className="bg-surface border border-outline-variant rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center">
            <h2 className="font-serif text-xl font-bold text-on-surface mb-1">
              Delete "{deleteCandidate.title || 'Untitled week'}"?
            </h2>
            <p className="text-sm text-on-surface-variant mb-5">This can't be undone.</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 rounded-full border border-outline-variant bg-surface text-xs font-semibold text-on-surface hover:bg-surface-variant transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={() => void handleDeleteConfirmed()}
                className="px-4 py-2 rounded-full bg-error text-on-error text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Delete week
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
