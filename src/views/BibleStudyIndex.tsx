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
  saveMeeting,
  subscribeEntryPoints,
  subscribeStudy,
  subscribeStudyMeetings,
} from '../lib/data/bibleStudy';
import { useAuth } from '../components/AuthProvider';
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
    const unsubStudy = subscribeStudy(db, studyId, setStudy);
    const unsubMeetings = subscribeStudyMeetings(db, studyId, (m) => {
      setMeetings(m);
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
    const id = await saveMeeting(
      db,
      {
        studyId: study.id,
        date,
        title: '',
        sections: [],
        published: false,
        md: MEETING_SKELETON_MD,
      },
      user.uid,
    );
    navigate(`/bible-study/${id}`);
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
              <button
                key={m.id}
                onClick={() => navigate(`/bible-study/${m.id}`)}
                className="w-full text-left flex items-center gap-3 px-3 lg:px-4 py-2.5 min-h-[44px] hover:bg-surface-variant/50 transition-colors"
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
    </div>
  );
}
