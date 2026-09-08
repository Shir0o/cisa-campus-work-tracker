import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import {
  resolveScan,
  type Meeting,
  type Study,
  type EntryPoint,
  type ScanResolution,
} from '../lib/bibleStudy';
import StudyReaderView from '../components/bibleStudy/StudyReaderView';
import {
  subscribePublishedStudyMeetings,
  subscribeEntryPoint,
  subscribeStudy,
} from '../lib/data/bibleStudy';
import { format, parseISO } from 'date-fns';

export default function PublicStudyReader() {
  const params = useParams<{ slug?: string; studyId?: string; date?: string }>();
  const slug = params.slug ?? '';
  const permalinkStudyId = params.studyId ?? '';
  const permalinkDate = params.date || undefined;
  const isPermalink = !!permalinkStudyId;

  const [entryPoint, setEntryPoint] = useState<EntryPoint | null>(null);
  const [entryPointLoaded, setEntryPointLoaded] = useState(false);
  const [study, setStudy] = useState<Study | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);

  // Two ways in: a scan resolves through the Entry point's active Study; a
  // staff permalink addresses one week by Study and date directly. Either
  // way the chain ends at the newest published Meeting of a Study.
  useEffect(() => {
    if (isPermalink) {
      setEntryPoint(null);
      setEntryPointLoaded(true);
      return;
    }
    setEntryPoint(null);
    setEntryPointLoaded(false);
    return subscribeEntryPoint(db, slug, (ep) => {
      setEntryPoint(ep);
      setEntryPointLoaded(true);
    }, () => {
      // A snapshot error must not spin forever: resolve as nothing behind
      // this code, which is what the reader would show anyway.
      setEntryPoint(null);
      setEntryPointLoaded(true);
    });
  }, [isPermalink, slug]);

  const studyId = isPermalink ? permalinkStudyId : entryPoint?.activeStudyId ?? null;

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

  // A permalink is public but unlisted (ADR 0011): the Firestore rule already
  // serves any published Meeting to anyone, so a UI gate would present an
  // open door as protected. noindex keeps it out of search engines.
  useEffect(() => {
    if (!isPermalink) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [isPermalink]);

  const loading = !entryPointLoaded || (!!studyId && !meetingsLoaded);
  const resolution: ScanResolution = resolveScan(
    entryPoint,
    study,
    meetings,
    new Date().toISOString().slice(0, 10),
    permalinkDate,
  );
  const meeting = resolution.kind === 'meeting' ? resolution.meeting : null;
  const isStale = resolution.kind === 'meeting' ? resolution.isFallback : false;
  // The stale-week treatment condenses into a date chip inside the sticky
  // header (ADR 0011 §3 — falling back is correct; falling back silently is
  // not), so a reader on any panel can still see the week is old.
  const staleDateLabel = (() => {
    if (!meeting || !isStale) return null;
    const prefix =
      isPermalink && permalinkDate && meetings.some((m) => m.date === permalinkDate)
        ? 'Week of '
        : 'Most recent · ';
    const formatted = meeting.date
      ? (() => {
          try {
            return format(parseISO(meeting.date), 'EEEE, MMMM d');
          } catch {
            return meeting.date;
          }
        })()
      : '';
    return `${prefix}${formatted}`;
  })();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface-variant font-sans">
        <div className="animate-pulse tracking-wide text-sm font-medium">Loading Bible Study...</div>
      </div>
    );
  }

  // Between terms — the Entry point has no active Study (or does not exist).
  // Distinct from "nothing published": the reason differs and so does the
  // message the reader should walk away with.
  if (resolution.kind === 'no-active-study') {
    if (isPermalink) {
      // A staff permalink naming a Study that does not exist — handled
      // rather than rendering an empty page.
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-on-surface text-center">
          <h1 className="font-serif text-2xl mb-2 font-medium">Week not found</h1>
          <p className="text-on-surface-variant text-sm max-w-sm">
            This link doesn't point at a published week.
          </p>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-on-surface text-center">
        <p className="text-xs font-semibold tracking-wider uppercase text-on-surface-variant mb-3">
          Between terms
        </p>
        <h1 className="font-serif text-2xl mb-2 font-medium">Nothing running right now</h1>
        <p className="text-on-surface-variant text-sm max-w-sm">
          {entryPoint?.name
            ? `${entryPoint.name} picks up again when the next study starts. `
            : 'The study picks up again when the next one starts. '}
          Keep this code — it will be the same one.
        </p>
      </div>
    );
  }

  // Nothing ever published — a brand-new study, or a code shown before the
  // first week went up. Not the between-terms screen: there is a Study
  // behind this code, it just has nothing to show yet. No action is offered,
  // because there is none a student can take.
  if (resolution.kind === 'never-published') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-on-surface text-center">
        <p className="text-xs font-semibold tracking-wider uppercase text-on-surface-variant mb-3">
          Nothing yet
        </p>
        <h1 className="font-serif text-2xl mb-2 font-medium">
          The study has never published a week
        </h1>
        <p className="text-on-surface-variant text-sm max-w-sm">
          A brand-new study, or a code shown before the first week went up. There is nothing to
          fall back to.
        </p>
      </div>
    );
  }

  // The route keeps only what is genuinely its job: resolve the scan and own
  // the empty states. Everything a student sees — the deck, the chrome, the
  // Blanks — is the shared StudyReaderView (ADR 0014, one rendering path),
  // which the editor's preview also renders. The parallax washes retired with
  // tap-to-advance: they animated on a section index nothing owns anymore.
  // The phone frame stays (a student's viewport on desktop, full-bleed on
  // mobile), but it is no longer the scroll container.
  return (
    <div className="min-h-screen bg-black/95 sm:bg-background flex items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-[420px] h-[100dvh] sm:h-[844px] sm:max-h-[92dvh] sm:rounded-3xl bg-background text-on-surface relative overflow-hidden flex flex-col shadow-2xl">
        <StudyReaderView meeting={meeting!} staleDateLabel={staleDateLabel} />
      </div>
    </div>
  );
}
