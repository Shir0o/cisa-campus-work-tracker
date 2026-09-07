import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import {
  MEETING_SKELETON_MD,
  nextMeetingDate,
  resolveScan,
  slugFor,
  studyIdFor,
  validateStudySetup,
  type EntryPoint,
  type Meeting,
  type Study,
  type StudySetupError,
  type StudySetupForm,
} from '../lib/bibleStudy';
import {
  createEntryPoint,
  createStudy,
  deleteMeeting,
  saveMeeting,
  setActiveStudy,
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
  // A failed read and an empty collection are different problems; without
  // this they rendered the same "not set up yet" sentence.
  const [entryPointsFailed, setEntryPointsFailed] = useState(false);
  const entryPoint = entryPoints[0] ?? null;

  useEffect(() => {
    return subscribeEntryPoints(
      db,
      (list) => {
        setEntryPoints(list);
        setEntryPointsFailed(false);
        setEntryPointsLoaded(true);
      },
      () => {
        setEntryPoints([]);
        setEntryPointsFailed(true);
        setEntryPointsLoaded(true);
      },
    );
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

  // ── Starting a study or a term (issue #822) ───────────────────────────
  // The Study and the Entry point had no way to exist outside a seed script
  // run with a service-account key, so this screen was inert on a fresh
  // database — the exact state a Full-timer landed in.
  const [setupOpen, setSetupOpen] = useState<'first-run' | 'new-term' | null>(null);
  const [setupForm, setSetupForm] = useState<StudySetupForm>({
    studyTitle: '',
    term: '',
    entryPointName: '',
    slug: '',
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [setupErrors, setSetupErrors] = useState<StudySetupError[]>([]);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupFailed, setSetupFailed] = useState(false);
  const errorFor = (field: keyof StudySetupForm) =>
    setupErrors.find((e) => e.field === field)?.message ?? null;

  const openSetup = (mode: 'first-run' | 'new-term') => {
    setSetupForm({
      studyTitle: '',
      term: '',
      // A new term keeps the Entry point it already has — the slug on the
      // poster never changes (ADR 0011), so these are carried over, not asked
      // for. The first-run defaults are a matching pair: the slug is what the
      // name slugifies to, so the two can never start out disagreeing.
      entryPointName: entryPoint?.name ?? 'CISA Wednesday',
      slug: entryPoint?.slug ?? 'cisa-wednesday',
    });
    setSlugTouched(!!entryPoint);
    setSetupErrors([]);
    setSetupFailed(false);
    setSetupOpen(mode);
  };

  const setSetupField = (field: keyof StudySetupForm, value: string) => {
    setSetupForm((cur) => {
      const next = { ...cur, [field]: value };
      // The slug follows the name until it is edited on its own.
      if (field === 'entryPointName' && !slugTouched) next.slug = slugFor(value);
      return next;
    });
    setSetupErrors((cur) => cur.filter((e) => e.field !== field));
  };

  const handleSetupSubmit = async () => {
    const errors = validateStudySetup(setupForm);
    setSetupErrors(errors);
    if (errors.length > 0) return;

    setSetupBusy(true);
    setSetupFailed(false);
    try {
      const newStudyId = studyIdFor(setupForm.studyTitle, setupForm.term);
      // The Study first: an Entry point pointing at a Study that does not
      // exist yet reads as "no study active" to anyone who scans in between.
      await createStudy(
        db,
        { id: newStudyId, title: setupForm.studyTitle.trim(), term: setupForm.term.trim() },
        user?.uid,
      );
      if (entryPoint) {
        await setActiveStudy(db, entryPoint.slug, newStudyId);
      } else {
        await createEntryPoint(
          db,
          {
            slug: setupForm.slug.trim(),
            name: setupForm.entryPointName.trim(),
            activeStudyId: newStudyId,
          },
          user?.uid,
        );
      }
      setSetupOpen(null);
    } catch {
      // Kept open with the writing still in it — the usual cause is a role
      // that cannot write, and retyping the form would not help.
      setSetupFailed(true);
    } finally {
      setSetupBusy(false);
    }
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
            {entryPointsFailed ? (
              <p className="text-sm text-on-surface-variant">
                Couldn't load the entry point. Reload the page — if it keeps failing, the
                problem is on our side, not yours.
              </p>
            ) : !entryPoint ? (
              <>
                <p className="text-sm text-on-surface-variant">
                  Nothing has been set up yet. A study is the term's arc; the entry point is
                  the code you print once and never change.
                </p>
                <button
                  onClick={() => openSetup('first-run')}
                  className="mt-3 w-full py-2.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:opacity-90"
                >
                  Start a study
                </button>
              </>
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
                <button
                  onClick={() => openSetup('new-term')}
                  className="mt-2 w-full py-2 rounded-full border border-outline-variant bg-surface text-xs font-semibold text-on-surface hover:bg-surface-variant transition-colors"
                >
                  {study ? 'Start a new term' : 'Start a study on this code'}
                </button>
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

      {/* Starting a study — the two records the whole surface hangs off. */}
      {setupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={setupOpen === 'new-term' ? 'Start a new term' : 'Start a study'}
        >
          <div className="bg-surface border border-outline-variant rounded-3xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-serif text-xl font-bold text-on-surface mb-1">
              {setupOpen === 'new-term' ? 'Start a new term' : 'Start a study'}
            </h2>
            <p className="text-sm text-on-surface-variant mb-5">
              {setupOpen === 'new-term'
                ? `The code stays exactly as it is — /s/${entryPoint?.slug ?? ''} starts opening the new study's weeks instead.`
                : 'Two records: the study this term follows, and the code that opens it.'}
            </p>

            <div className="space-y-4">
              <label className="block">
                <span className="block text-xs font-bold tracking-wider uppercase text-on-surface-variant mb-1">
                  Study title
                </span>
                <input
                  value={setupForm.studyTitle}
                  onChange={(e) => setSetupField('studyTitle', e.target.value)}
                  placeholder="Romans"
                  className="w-full px-3 py-2 rounded-xl bg-surface-variant/40 border border-outline-variant text-sm text-on-surface focus:outline-none focus:border-primary"
                />
                {errorFor('studyTitle') && (
                  <span className="block mt-1 text-[11px] text-error">{errorFor('studyTitle')}</span>
                )}
              </label>

              <label className="block">
                <span className="block text-xs font-bold tracking-wider uppercase text-on-surface-variant mb-1">
                  Term
                </span>
                <input
                  value={setupForm.term}
                  onChange={(e) => setSetupField('term', e.target.value)}
                  placeholder="Fall 2026"
                  className="w-full px-3 py-2 rounded-xl bg-surface-variant/40 border border-outline-variant text-sm text-on-surface focus:outline-none focus:border-primary"
                />
                {errorFor('term') && (
                  <span className="block mt-1 text-[11px] text-error">{errorFor('term')}</span>
                )}
              </label>

              {setupOpen === 'first-run' && (
                <>
                  <label className="block">
                    <span className="block text-xs font-bold tracking-wider uppercase text-on-surface-variant mb-1">
                      Entry point name
                    </span>
                    <input
                      value={setupForm.entryPointName}
                      onChange={(e) => setSetupField('entryPointName', e.target.value)}
                      placeholder="CISA Wednesday"
                      className="w-full px-3 py-2 rounded-xl bg-surface-variant/40 border border-outline-variant text-sm text-on-surface focus:outline-none focus:border-primary"
                    />
                    {errorFor('entryPointName') && (
                      <span className="block mt-1 text-[11px] text-error">
                        {errorFor('entryPointName')}
                      </span>
                    )}
                  </label>

                  <label className="block">
                    <span className="block text-xs font-bold tracking-wider uppercase text-on-surface-variant mb-1">
                      Code
                    </span>
                    <div className="flex items-center gap-1 px-3 py-2 rounded-xl bg-surface-variant/40 border border-outline-variant focus-within:border-primary">
                      <span className="text-sm text-on-surface-variant font-mono shrink-0">/s/</span>
                      <input
                        aria-label="Code"
                        value={setupForm.slug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setSetupField('slug', e.target.value);
                        }}
                        placeholder="cisa-wednesday"
                        className="flex-1 min-w-0 bg-transparent text-sm font-mono text-on-surface focus:outline-none"
                      />
                    </div>
                    <span className="block mt-1 text-[11px] text-on-surface-variant">
                      This goes on the poster. It can never be changed afterwards.
                    </span>
                    {errorFor('slug') && (
                      <span className="block mt-1 text-[11px] text-error">{errorFor('slug')}</span>
                    )}
                  </label>
                </>
              )}
            </div>

            {setupFailed && (
              <p className="mt-4 text-[11px] text-error">
                That didn't save. Your writing is still here — only a Full-timer can start a
                study, so check you are signed in as one and try again.
              </p>
            )}

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setSetupOpen(null)}
                disabled={setupBusy}
                className="px-4 py-2 rounded-full border border-outline-variant bg-surface text-xs font-semibold text-on-surface hover:bg-surface-variant transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSetupSubmit()}
                disabled={setupBusy}
                className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {setupBusy
                  ? 'Starting...'
                  : setupOpen === 'new-term'
                    ? 'Start the term'
                    : 'Start the study'}
              </button>
            </div>
          </div>
        </div>
      )}

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
