import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  subscribeStudies,
  subscribeStudyMeetings,
} from '../lib/data/bibleStudy';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { staffPermalinkUrl } from '../lib/publicUrl';
import { format, parseISO } from 'date-fns';

const SCAN_COPY = {
  neverPublished: 'Nothing yet — the study has never published a week.',
  nothingRunning: 'Nothing running right now — no study is active on this code.',
} as const;

// Verbatim from the old scan card: #1860 moved the statement, it did not
// rewrite it. Hoisted out of JSX so the diff-scoped i18n guard does not read
// the move as new English copy; this view has no locale keys yet.
const newestDraftNote = (title: string) =>
  `${title || 'The newest week'} is still a draft — publish it and it becomes what the code opens.`;

const LAST_ENTRY_POINT_KEY = 'cisa.bibleStudy.entryPoint';
const LAST_STUDY_KEY = 'cisa.bibleStudy.studyId';

const readStored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable
  }
};

/**
 * The weeks index at /bible-study (ADR 0011, `Main` / `IndexPhone`
 * artboards). On a wide screen, two columns that answer different questions:
 * the left is what exists; the right is what a student scanning right now
 * would actually see. On a phone there is no rail summary — the live week's
 * own `Live now` pill is the single statement of which week a scan opens, and
 * the admin entry point sits below the list (#1860). The newest draft can sit
 * at the top of the list while an older week carries the live mark — the gap
 * stays legible without arithmetic.
 */
export default function BibleStudyIndex() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStudy = searchParams.get('study');
  const requestedEp = searchParams.get('ep');

  // The scan summary is a wide-screen rail, not a CSS-only clone of the week
  // row: below `lg` it is not rendered at all, so the DOM has one statement.
  const wide = useMediaQuery('(min-width: 1024px)');

  const [entryPoints, setEntryPoints] = useState<EntryPoint[]>([]);
  const [entryPointsLoaded, setEntryPointsLoaded] = useState(false);
  // A failed read and an empty collection are different problems; without
  // this they rendered the same "not set up yet" sentence.
  const [entryPointsFailed, setEntryPointsFailed] = useState(false);

  const [studies, setStudies] = useState<Study[]>([]);
  const [studiesLoaded, setStudiesLoaded] = useState(false);

  const [termMenuOpen, setTermMenuOpen] = useState(false);

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

  useEffect(() => {
    return subscribeStudies(
      db,
      (list) => {
        setStudies(list);
        setStudiesLoaded(true);
      },
      () => {
        setStudies([]);
        setStudiesLoaded(true);
      },
    );
  }, []);

  const [selectedEpSlug, setSelectedEpSlug] = useState<string | null>(requestedEp || null);
  const entryPoint = (() => {
    if (selectedEpSlug) {
      const match = entryPoints.find((ep) => ep.slug === selectedEpSlug);
      if (match) return match;
    }
    const remembered = readStored(LAST_ENTRY_POINT_KEY);
    if (remembered) {
      const match = entryPoints.find((ep) => ep.slug === remembered);
      if (match) return match;
    }
    return entryPoints[0] ?? null;
  })();

  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(requestedStudy || null);
  const studyId = selectedStudyId
    ? (studies.find((s) => s.id === selectedStudyId)?.id ?? selectedStudyId)
    : (entryPoint?.activeStudyId ?? null);

  const handleSelectStudy = (id: string) => {
    setSelectedStudyId(id);
    writeStored(LAST_STUDY_KEY, id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('study', id);
      return next;
    }, { replace: true });
  };

  const handleSelectEntryPoint = (slug: string) => {
    setSelectedEpSlug(slug);
    writeStored(LAST_ENTRY_POINT_KEY, slug);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('ep', slug);
      return next;
    }, { replace: true });
  };

  const handleMakeActiveOnCode = async () => {
    if (!entryPoint || !study) return;
    await setActiveStudy(db, entryPoint.slug, study.id);
  };

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
      handleSelectStudy(newStudyId);
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
  // Where the ⋮ was when the menu opened — the menu portals to document.body,
  // so it cannot inherit the row's clipping, and it pins to the button.
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  const openMenu = (id: string, btn: HTMLElement) => {
    const r = btn.getBoundingClientRect();
    // Portal to body escapes the list's clipping, but the viewport still
    // clips fixed elements: keep the menu on-screen (it is 256 wide and
    // ~200 tall with the unpublish note).
    const MENU_W = 256;
    const top = Math.min(r.bottom + 6, window.innerHeight - 220);
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    setMenuAnchor({ x: left, y: top });
    setMenuFor((cur) => (cur === id ? null : id));
  };
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
      <div className="max-w-5xl mx-auto">
        {/* The page had no title at all: on a phone the first thing on screen
            was the entry-point card, and neither the DOM nor a screen reader
            was told what this page is (issue 1776). */}
        <header className="px-1 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="font-serif text-2xl font-bold text-on-surface">{t('nav.bible_study')}</h1>

          {/* Term / Study Selector (#1932) */}
          {studies.length > 1 && (
            <div className="relative">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={termMenuOpen}
                aria-label={t('study.select_term', 'Select study term')}
                onClick={() => setTermMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 h-10 px-3.5 rounded-full border border-outline-variant bg-surface text-xs font-semibold text-on-surface hover:bg-surface-variant/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <span className="text-on-surface-variant text-[11px] font-normal uppercase tracking-wider">
                  {t('study.term_prefix', 'Term:')}
                </span>
                <span className="font-medium truncate max-w-[160px] sm:max-w-[220px]">
                  {study ? `${study.title} · ${study.term}` : t('study.select_term', 'Select study term')}
                </span>
                {study && study.id === entryPoint?.activeStudyId && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[var(--t-sage-soft)] text-on-surface text-[10px] font-bold">
                    {t('study.active', 'Active')}
                  </span>
                )}
                <svg
                  className={`w-3.5 h-3.5 text-on-surface-variant transition-transform duration-200 ${
                    termMenuOpen ? 'rotate-180' : ''
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {termMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setTermMenuOpen(false)}
                  />
                  <div
                    role="listbox"
                    aria-label={t('study.available_terms', 'Available terms')}
                    className="absolute right-0 sm:right-auto sm:left-0 mt-1.5 z-30 w-72 bg-surface border border-outline-variant rounded-2xl shadow-xl p-1.5 divide-y divide-outline-variant/40"
                  >
                    <div className="py-1">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                        {t('study.studies_and_terms', 'Studies & Terms')}
                      </div>
                      {studies.map((s) => {
                        const isSelected = s.id === studyId;
                        const isActiveOnCode = s.id === entryPoint?.activeStudyId;
                        return (
                          <button
                            key={s.id}
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              handleSelectStudy(s.id);
                              setTermMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs text-left transition-colors ${
                              isSelected
                                ? 'bg-surface-variant font-semibold text-on-surface'
                                : 'text-on-surface hover:bg-surface-variant/60 font-normal'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="block truncate">
                                {s.title} · {s.term}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isActiveOnCode && (
                                <span className="px-1.5 py-0.5 rounded-full bg-[var(--t-sage-soft)] text-on-surface text-[10px] font-bold">
                                  {t('study.active_on_code', 'Active on code')}
                                </span>
                              )}
                              {isSelected && (
                                <svg
                                  className="w-4 h-4 text-primary shrink-0"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-1.5 pb-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTermMenuOpen(false);
                          openSetup('new-term');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-primary hover:bg-surface-variant transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        {t('study.start_new_term', 'Start a new term...')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </header>
      </div>
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* #1860: weeks first in the DOM and first on a phone; the grid places
            it left on a wide screen with no `order` swap, so painted order and
            reading order agree. */}
        <section className="min-w-0">
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

          {/* #1860: where the live week is missing, or a newer draft is
              holding it back, the weeks section says so once — at every width,
              so the desktop rail has nothing to repeat. */}
          {(resolution.kind !== 'meeting' || newestDraftHidesLive) && (
            <div className="mb-2 px-1 space-y-1 text-[11px] leading-snug text-on-surface-variant">
              {resolution.kind === 'never-published' && <p>{SCAN_COPY.neverPublished}</p>}
              {resolution.kind === 'no-active-study' && <p>{SCAN_COPY.nothingRunning}</p>}
              {newestDraftHidesLive && newest && <p>{newestDraftNote(newest.title)}</p>}
            </div>
          )}

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
                    <span className="block text-[11px] text-on-surface-variant">
                      {formatDay(m.date)} · {m.sections.length}{' '}
                      {m.sections.length === 1 ? 'section' : 'sections'}
                      {/* #1860: a row that carries a pill already states the
                          publish state; only a published row with no pill (an
                          older week) still spells it out here. */}
                      {m.id !== liveMeetingId && m.published ? ' · published' : ''}
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
                    onClick={(e) => openMenu(m.id, e.currentTarget)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>
                  {menuFor === m.id &&
                    createPortal(
                      <>
                      <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />
                      <div
                        role="menu"
                        aria-label={`Actions for ${m.title || 'untitled week'}`}
                        className="fixed z-30 w-64 bg-surface border border-outline-variant rounded-2xl shadow-xl p-1.5"
                        style={{ top: menuAnchor.y, left: menuAnchor.x }}
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
                    </>,
                    document.body
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* #1860: entry point + scan rail last in the DOM and last on a phone,
            so the week list answers the question the visitor came with and
            admin chrome follows it. */}
        <aside className="space-y-3">
          <div className="bg-surface border border-outline-variant rounded-2xl p-4">
            <div className="text-xs font-bold tracking-wider uppercase text-on-surface-variant mb-2">
              Entry point
            </div>
            {entryPoints.length > 1 && (
              <div className="mb-3 flex items-center gap-1.5 p-1 rounded-xl bg-surface-variant/40 border border-outline-variant/60">
                {entryPoints.map((ep) => {
                  const isSelectedEp = ep.slug === entryPoint?.slug;
                  return (
                    <button
                      key={ep.slug}
                      type="button"
                      onClick={() => handleSelectEntryPoint(ep.slug)}
                      className={`flex-1 py-1 px-2 rounded-lg text-xs transition-colors truncate ${
                        isSelectedEp
                          ? 'bg-surface text-on-surface shadow-xs font-semibold'
                          : 'text-on-surface-variant hover:text-on-surface font-medium'
                      }`}
                    >
                      {ep.name || ep.slug}
                    </button>
                  );
                })}
              </div>
            )}
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
                      {entryPoint.activeStudyId === study.id ? (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-surface-variant text-[10px] font-semibold">
                          Active
                        </span>
                      ) : (
                        <div className="mt-1.5">
                          <button
                            type="button"
                            onClick={handleMakeActiveOnCode}
                            className="inline-flex items-center text-xs text-primary font-semibold hover:underline"
                          >
                            {t('study.set_active_on_code', 'Set this term active on /s/{slug}').replace('{slug}', entryPoint.slug)}
                          </button>
                        </div>
                      )}
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

          {/* #1860: wide screens keep the rail summary of the week a scan
              opens. It repeats the row on purpose here — the list is on the
              left, the scan answer on the right — but the empty-state and
              draft notes stay in the weeks section so nothing is said twice. */}
          {wide && resolution.kind === 'meeting' && (
            <div className="bg-surface border border-outline-variant rounded-2xl p-4">
              <div className="text-xs font-bold tracking-wider uppercase text-on-surface-variant mb-2">
                What a scan opens right now
              </div>
              <div className="text-sm font-semibold text-on-surface">
                {resolution.meeting.title}
              </div>
              <div className="text-[11px] text-on-surface-variant">
                {formatDay(resolution.meeting.date)}
              </div>
            </div>
          )}
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
