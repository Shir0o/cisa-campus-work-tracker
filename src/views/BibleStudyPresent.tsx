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

type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * Present mode — the code you hold up in the room (ADR 0011, `Present`
 * artboard). Full-screen, white ground regardless of theme, the screen kept
 * awake. Showing the code is not an admin action: the person holding the
 * phone is often not a Full-timer.
 */
export default function BibleStudyPresent() {
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
  const backTo =
    backMeeting && /^[A-Za-z0-9-]+$/.test(backMeeting)
      ? `/bible-study/${backMeeting}`
      : '/bible-study';

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center p-6 relative">
      <Link
        to={backTo}
        className="absolute top-4 left-4 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
        aria-label="Leave present mode"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>

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
