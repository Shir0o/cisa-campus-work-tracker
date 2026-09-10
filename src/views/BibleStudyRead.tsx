import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { db } from '../lib/firebase';
import { subscribeEntryPoints } from '../lib/data/bibleStudy';
import { entryPointUrl } from '../lib/publicUrl';
import type { EntryPoint } from '../lib/bibleStudy';
import StudyReaderView from '../components/bibleStudy/StudyReaderView';
import StudyEmptyState from '../components/bibleStudy/StudyEmptyState';
import { useResolvedStudy } from '../components/bibleStudy/useResolvedStudy';

/**
 * "This week's study" (#946) — the signed-in destination at
 * `/bible-study/read`, for every role.
 *
 * It resolves exactly what a scan resolves, through the same hook, and renders
 * the same reader: a Trainee holding their phone in the room sees what the
 * student beside them sees. What it adds is everything a scan cannot have —
 * the app's own chrome and a way back, Show QR and Copy link so anyone can
 * pass the study on without a Full-timer present, and (for Full-timers only)
 * an Edit chip into that week's editor and straight back.
 *
 * The Weeks index stays Full-timers-only: this is one week, the current one,
 * never an archive (ADR 0011 §6).
 */

/** The entry point this device last read, so the chooser is a once-per-device event. */
const LAST_ENTRY_POINT_KEY = 'cisa.bibleStudy.entryPoint';
/** Where in the week this device left off, so the trip out to the editor returns there. */
const LAST_SECTION_KEY = 'cisa.bibleStudy.section';

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
    // Storage unavailable — the choice applies for this visit only.
  }
};

const QrIcon: React.FC = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM19 19h2M19 14h2v2" />
  </svg>
);

const LinkIcon: React.FC = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const PencilIcon: React.FC = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export default function BibleStudyRead() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [entryPoints, setEntryPoints] = useState<EntryPoint[]>([]);
  const [entryPointsLoaded, setEntryPointsLoaded] = useState(false);
  useEffect(
    () =>
      subscribeEntryPoints(db, (eps) => {
        setEntryPoints(eps);
        setEntryPointsLoaded(true);
      }),
    [],
  );

  // Which entry point. A `?ep=` in the URL wins — that is how the editor's
  // "Open the study" link and the chooser both address one. Otherwise the
  // device's last pick, if it still exists. Otherwise, the only one there is.
  // Two or more with nothing remembered is the one case that needs a person.
  const requested = searchParams.get('ep') ?? '';
  const remembered = readStored(LAST_ENTRY_POINT_KEY) ?? '';
  const slug = (() => {
    if (requested && entryPoints.some((ep) => ep.slug === requested)) return requested;
    if (!entryPointsLoaded) return '';
    if (remembered && entryPoints.some((ep) => ep.slug === remembered)) return remembered;
    if (entryPoints.length === 1) return entryPoints[0].slug;
    return '';
  })();

  useEffect(() => {
    if (slug) writeStored(LAST_ENTRY_POINT_KEY, slug);
  }, [slug]);

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const { loading, entryPoint, resolution, meeting, staleDateLabel } = useResolvedStudy(slug);

  // Restore-on-return (#946): read once, at mount, so it is an opening
  // position rather than an owner of the reader's scroll.
  const [initialSection] = useState(() => {
    const stored = Number(readStored(LAST_SECTION_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : undefined;
  });

  const copyLink = async () => {
    if (!entryPoint) return;
    try {
      await navigator.clipboard.writeText(entryPointUrl(entryPoint.slug));
      setCopied(true);
    } catch {
      // Clipboard denied or unavailable (an insecure origin, a locked-down
      // browser). The URL is on screen in Present mode either way, so this
      // fails quietly rather than throwing an error at someone mid-study.
    }
  };

  if (!entryPointsLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center text-on-surface-variant">
        <div className="animate-pulse text-sm font-medium">Loading Bible Study…</div>
      </div>
    );
  }

  // Nothing has been set up at all. Distinct from the between-terms state:
  // there is no standing invitation here, not even an idle one.
  if (entryPoints.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="font-serif text-2xl mb-2 font-medium">No study set up yet</h1>
        <p className="text-on-surface-variant text-sm max-w-sm">
          Nothing has been set up behind this app's code. Ask a Full-timer to seed the entry
          point.
        </p>
      </div>
    );
  }

  // Two or more standing invitations and no way to tell which room you are
  // in — a week taught in two rooms is two Entry points (ADR 0011 §4), and
  // only the person knows which one they walked into. Asked once per device.
  if (!slug) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-xs font-semibold tracking-wider uppercase text-on-surface-variant mb-3">
          Which study?
        </p>
        <h1 className="font-serif text-2xl mb-6 font-medium">There's more than one</h1>
        <div className="w-full max-w-xs flex flex-col gap-2">
          {entryPoints.map((ep) => (
            <button
              key={ep.slug}
              onClick={() => setSearchParams({ ep: ep.slug }, { replace: true })}
              className="px-4 py-3 rounded-2xl bg-surface border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors"
            >
              {ep.name || ep.slug}
            </button>
          ))}
        </div>
        <p className="text-on-surface-variant text-xs max-w-xs mt-5">
          We'll remember this on this device. You can switch later from the study itself.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-on-surface-variant">
        <div className="animate-pulse text-sm font-medium">Loading Bible Study…</div>
      </div>
    );
  }

  if (resolution.kind !== 'meeting') {
    return (
      <div className="flex-1 flex flex-col">
        <StudyEmptyState kind={resolution.kind} entryPoint={entryPoint} />
      </div>
    );
  }

  const headerActions = (
    <>
      {isAdmin && (
        <Link
          to={`/bible-study/${meeting!.id}`}
          aria-label="Edit this week"
          title="Edit this week"
          className="w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-variant/60 transition-colors"
        >
          <PencilIcon />
        </Link>
      )}
      <button
        type="button"
        onClick={copyLink}
        aria-label={copied ? 'Link copied' : 'Copy link'}
        title={copied ? 'Link copied' : 'Copy link'}
        className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
          copied ? 'text-[var(--t-sage)]' : 'text-on-surface-variant hover:bg-surface-variant/60'
        }`}
      >
        <LinkIcon />
      </button>
      <Link
        to={`/bible-study/present?ep=${entryPoint!.slug}`}
        aria-label="Show QR"
        title="Show QR"
        className="w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-variant/60 transition-colors"
      >
        <QrIcon />
      </Link>
    </>
  );

  // The same phone frame the public route uses on desktop, full-bleed on a
  // phone — but inside the app's shell, so the nav and the way back are the
  // app's own rather than a dead end.
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-[420px] h-full sm:h-[844px] sm:max-h-[92dvh] sm:rounded-3xl sm:border sm:border-outline-variant bg-background text-on-surface relative overflow-hidden flex flex-col sm:shadow-xl">
        <StudyReaderView
          meeting={meeting!}
          staleDateLabel={staleDateLabel}
          initialSectionIndex={initialSection}
          onSectionChange={(index) => writeStored(LAST_SECTION_KEY, String(index))}
          headerActions={headerActions}
        />
      </div>
    </div>
  );
}
