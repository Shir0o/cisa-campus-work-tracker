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

  const studyId = isPermalink ? permalink!.studyId : entryPoint?.activeStudyId ?? null;

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
  const staleDateLabel = (() => {
    if (!meeting || !isStale) return null;
    const prefix =
      isPermalink && permalink?.date && meetings.some((m) => m.date === permalink.date)
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

  return { loading, entryPoint, study, resolution, meeting, staleDateLabel };
}
