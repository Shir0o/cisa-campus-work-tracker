import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../lib/firebase';
import {
  resolveScan,
  type EntryPoint,
  type Meeting,
  type Study,
} from '../lib/bibleStudy';
import {
  subscribeEntryPoint,
  subscribeEntryPoints,
  subscribePublishedStudyMeetings,
  subscribeStudy,
} from '../lib/data/bibleStudy';
import { entryPointUrl } from '../lib/publicUrl';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';

type WakeLockSentinelLike = { release: () => Promise<void> };

// Present mode is a white screen whatever the app's theme is doing — a dark
// ground behind a QR hurts scan reliability (ADR 0011) — so its two corner
// controls cannot resolve through the theme tokens. They are deliberately
// identical: the back arrow at top-left and the edit pencil at top-right
// mirror each other, and both must stay quieter than the code.
const QUIET_CORNER_BUTTON =
  'absolute top-4 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors'; // colour-token-ignore: fixed white ground, independent of theme, for QR scan reliability

/**
 * Present mode — the code you hold up in the room (ADR 0011, `Present`
 * artboard). Full-screen, white ground regardless of theme, the screen kept
 * awake. Showing the code is not an admin action: the person holding the
 * phone is often not a Full-timer.
 */
export default function BibleStudyPresent() {
  const { isAdmin } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const epSlug = searchParams.get('ep');
  const backMeeting = searchParams.get('meeting');

  const [entryPoint, setEntryPoint] = useState<EntryPoint | null>(null);
  const [entryPointLoaded, setEntryPointLoaded] = useState(false);
  const [study, setStudy] = useState<Study | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);

  useEffect(() => {
    setEntryPoint(null);
    setEntryPointLoaded(false);
    if (epSlug) {
      return subscribeEntryPoint(db, epSlug, (ep) => {
        setEntryPoint(ep);
        setEntryPointLoaded(true);
      }, () => {
        setEntryPoint(null);
        setEntryPointLoaded(true);
      });
    }
    return subscribeEntryPoints(db, (list) => {
      setEntryPoint(list[0] ?? null);
      setEntryPointLoaded(true);
    }, () => {
      setEntryPoint(null);
      setEntryPointLoaded(true);
    });
  }, [epSlug]);

  const studyId = entryPoint?.activeStudyId ?? null;

  useEffect(() => {
    setStudy(null);
    setMeetings([]);
    setMeetingsLoaded(false);
    if (!studyId) return;
    const unsubStudy = subscribeStudy(db, studyId, setStudy, () => {
      setStudy(null);
      setMeetingsLoaded(true);
    });
    const unsubMeetings = subscribePublishedStudyMeetings(db, studyId, (m) => {
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

  // Keep the screen awake while present mode is open; the OS releases the
  // lock when the page hides, so re-acquire on return.
  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null;
    const acquire = async () => {
      try {
        const wakeLock = (
          navigator as Navigator & {
            wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
          }
        ).wakeLock;
        if (!wakeLock) return;
        sentinel = await wakeLock.request('screen');
      } catch {
        // Denied or unsupported — the screen simply sleeps normally.
      }
    };
    const release = () => {
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, []);

  const loading = !entryPointLoaded || (!!studyId && !meetingsLoaded);
  const resolution = resolveScan(
    entryPoint,
    study,
    meetings,
    new Date().toISOString().slice(0, 10),
  );
  const currentWeek = resolution.kind === 'meeting' ? resolution.meeting : null;

  // The code is durable — it still renders between terms, when nothing is
  // published, and when the study changes. Only a missing entry point record
  // leaves nothing to show.
  if (loading) {
    return (
      <div className="min-h-screen bg-white text-neutral-900 flex items-center justify-center">
        <div className="animate-pulse text-sm text-neutral-500">Loading…</div>
      </div>
    );
  }

  if (!entryPoint) {
    return (
      <div className="min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-2xl font-medium mb-2">No entry point yet</h1>
        <p className="text-sm text-neutral-500 max-w-sm">
          Nothing has been set up behind this app's code. Ask a Full-timer to seed the entry
          point.
        </p>
      </div>
    );
  }
  const url = entryPointUrl(entryPoint.slug);

  // Leave returns to whoever showed the code: the week's editor when Show QR
  // was pressed there, the Weeks index otherwise (direct entry, a pasted
  // link, a relaunch). The fallback keeps the documented invariant — leaving
  // never lands on the home page. The target is validated to a plain meeting
  // id so the query string can never steer an authenticated holder anywhere
  // else in the app.
  const backTo = (() => {
    if (backMeeting && /^[A-Za-z0-9-]+$/.test(backMeeting)) return `/bible-study/${backMeeting}`;
    // #946: the Weeks index is Full-timers only, so it is the wrong fallback
    // for the Trainee who can now reach Present mode from This week's study —
    // sending them there bounced them to their dashboard, which is precisely
    // the "leaving never lands on the home page" invariant this exists to
    // uphold. Everyone else goes back to the week they were reading.
    if (!isAdmin) return `/bible-study/read${entryPoint ? `?ep=${entryPoint.slug}` : ''}`;
    return '/bible-study';
  })();

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center p-6 relative">
      <Link
        to={backTo}
        className={`${QUIET_CORNER_BUTTON} left-4`}
        aria-label="Leave present mode"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>

      {/* Fix-it-here (#946), Full-timers only: an error spotted while the code
          is up is one tap from the week's editor and one tap back, instead of
          leaving the room's screen to go find it. An icon at the mirrored
          corner, not a labelled button — the code has to stay the loudest
          thing on this screen. */}
      {isAdmin && currentWeek && (
        <Link
          to={`/bible-study/${currentWeek.id}`}
          className={`${QUIET_CORNER_BUTTON} right-4`}
          aria-label={t('study.edit_week')}
          title={t('study.edit_week')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </Link>
      )}

      {/* The code dominates; everything else is quiet. */}
      <div className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm">
        <QRCodeSVG
          value={url}
          size={288}
          level="M"
          marginSize={2}
          bgColor="#FFFFFF"
          fgColor="#0A0A0B"
          aria-label="QR code"
          className="block w-full h-auto max-w-[288px]"
        />
      </div>

      <div className="mt-8 text-center space-y-1">
        {currentWeek ? (
          <>
            <p className="text-sm text-neutral-500">{currentWeek.title}</p>
            <p className="text-xs text-neutral-400 tracking-wide">
              {study ? `${study.title} · ${study.term}` : ''}
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            No study is active right now — the code still works.
          </p>
        )}
        <p className="text-xs text-neutral-400 font-mono pt-2 break-all">{url}</p>
        <p className="text-[11px] text-neutral-300 pt-3 flex items-center justify-center gap-1.5">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
          Screen stays awake
        </p>
      </div>
    </div>
  );
}
