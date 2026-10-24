import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { db } from '../../lib/firebase';
import {
  resolveScan,
  type Meeting,
  type Study,
  type EntryPoint,
  type ScanResolution,
} from '../../lib/bibleStudy';
import {
  subscribePublishedStudyMeetings,
  subscribeEntryPoint,
  subscribeStudy,
} from '../../lib/data/bibleStudy';

export type ResolvedStudy = {
  loading: boolean;
  entryPoint: EntryPoint | null;
  study: Study | null;
  resolution: ScanResolution;
  meeting: Meeting | null;
  /** The stale-week chip's text, or null when the week is current. */
  staleDateLabel: string | null;
  /**
   * A snapshot failed rather than reporting "nothing here" (a dropped
   * connection, a blocked request, a permissions slip). The resolution then
   * looks exactly like an empty term, so callers that show a "no study"
   * message must check this first — otherwise a student on bad wifi is told
   * the term is over (#1777).
   */
  loadError: boolean;
};

/**
 * The scan chain as a hook: slug → active Study → newest published Meeting,
 * or a staff permalink's Study + date.
 *
 * Extracted from `PublicStudyReader` (#946) when "This week's study" gave the
 * same three hops a second caller. Both routes resolve through this, so a
 * signed-in Trainee and a student who scanned are looking at the same
 * resolution, the same fallback and the same empty states by construction
 * rather than by two implementations agreeing.
 */
export function useResolvedStudy(
  slug: string,
  permalink?: { studyId: string; date?: string },
): ResolvedStudy {
  const isPermalink = !!permalink?.studyId;

  const [entryPoint, setEntryPoint] = useState<EntryPoint | null>(null);
  const [entryPointLoaded, setEntryPointLoaded] = useState(false);
  const [study, setStudy] = useState<Study | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);
  // Which request failed, rather than a boolean: a different slug (or
  // permalink) is a different question, so its answer starts clean without a
  // setState in an effect body.
  const requestKey = isPermalink ? `p:${permalink!.studyId}:${permalink!.date ?? ''}` : `s:${slug}`;
  const [failedFor, setFailedFor] = useState<string | null>(null);

  useEffect(() => {
    if (isPermalink) {
      setEntryPoint(null);
      setEntryPointLoaded(true);
      return;
    }
    setEntryPoint(null);
    setEntryPointLoaded(false);
    if (!slug) {
      // No entry point named yet — the chooser is still deciding. Resolve as
      // loaded-with-nothing rather than leaving the caller spinning.
      setEntryPointLoaded(true);
      return;
    }
    return subscribeEntryPoint(db, slug, (ep, fromCache) => {
      setEntryPoint(ep);
      setEntryPointLoaded(true);
      // An empty answer that never reached the server is a failed load, not a
      // code with nothing behind it (#1777 — measured: with every Firestore
      // request blocked the SDK hands back `exists(): false, fromCache: true`,
      // and the page then said "Between terms").
      if (!ep && fromCache) setFailedFor(requestKey);
    }, () => {
      // A snapshot error must not spin forever: resolve as nothing behind
      // this code — and say that it was a failure, not an empty term.
      setEntryPoint(null);
      setEntryPointLoaded(true);
      setFailedFor(requestKey);
    });
  }, [isPermalink, slug, requestKey]);

  const studyId = isPermalink ? permalink!.studyId : entryPoint?.activeStudyId ?? null;

  useEffect(() => {
    setStudy(null);
    setMeetings([]);
    setMeetingsLoaded(false);
    if (!studyId) return;
    const unsubStudy = subscribeStudy(db, studyId, (s, fromCache) => {
      setStudy(s);
      if (!s && fromCache) setFailedFor(requestKey);
    }, () => {
      setStudy(null);
      setMeetingsLoaded(true);
      setFailedFor(requestKey);
    });
    const unsubMeetings = subscribePublishedStudyMeetings(db, studyId, (m, fromCache) => {
      setMeetings(m);
      setMeetingsLoaded(true);
      if (m.length === 0 && fromCache) setFailedFor(requestKey);
    }, () => {
      setMeetings([]);
      setMeetingsLoaded(true);
      setFailedFor(requestKey);
    });
    return () => {
      unsubStudy();
      unsubMeetings();
    };
  }, [studyId, requestKey]);

  const loading = !entryPointLoaded || (!!studyId && !meetingsLoaded);
  const resolution = resolveScan(
    entryPoint,
    study,
    meetings,
    new Date().toISOString().slice(0, 10),
    permalink?.date,
  );
  const meeting = resolution.kind === 'meeting' ? resolution.meeting : null;
  const isStale = resolution.kind === 'meeting' ? resolution.isFallback : false;

  // The stale-week treatment condenses into a date chip inside the sticky
  // header (ADR 0011 §3 — falling back is correct; falling back silently is
  // not), so a reader on any panel can still see the week is old.
  // Permalinks (#1207) suppress the chip entirely.
  const staleDateLabel = (() => {
    if (isPermalink || !meeting || !isStale) return null;
    const prefix = 'Most recent · ';
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

  // A failure belongs to the request that made it: navigating to another slug
  // or permalink starts clean, and a failure with no Study behind it (the
  // entry point itself never arrived) is still reported rather than looking
  // like an empty term.
  const loadError = failedFor === requestKey;

  return { loading, entryPoint, study, resolution, meeting, staleDateLabel, loadError };
}
