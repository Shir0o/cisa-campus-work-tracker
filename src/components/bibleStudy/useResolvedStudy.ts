import { useEffect, useState } from 'react';
import { isValid, parseISO } from 'date-fns';
import { db } from '../../lib/firebase';
import type { AppLanguage } from '../../lib/userPreferences';
import { useLanguage } from '../LanguageProvider';
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
   * The week's own date ("Wednesday, October 21"), or null when nothing
   * resolved. Not suppressed on a permalink, which hides the chip but still
   * needs the date for its document title (#1814).
   */
  weekDateLabel: string | null;
  /**
   * A snapshot failed rather than reporting "nothing here" (a dropped
   * connection, a blocked request, a permissions slip), or an answer has not
   * arrived before `STUDY_LOAD_DEADLINE_MS` (#1838). The resolution then looks
   * exactly like an empty term, so callers that show a "no study" message must
   * check this before any empty state — otherwise a student on bad wifi is told
   * the term is over (#1777). It clears if a late snapshot lands.
   */
  loadError: boolean;
};

/**
 * How long a page may sit waiting before it admits the server is not answering
 * (#1838). Measured at 375×812 with the `bible_study_meetings` listen aborted:
 * the SDK's reconnect window settled at ~15s, and until then the page pulsed
 * "Loading Bible Study…" with no way out. Twelve seconds stays patient and
 * still arrives before that window closes. Retuning is this one line.
 */
export const STUDY_LOAD_DEADLINE_MS = 12_000;

/**
 * A Meeting's date as a reader reads it. One `Intl` call, so the weekday, the
 * word order and the comma are the language's rather than a translated
 * concatenation of English parts (#1839, the shape #1905 established). An
 * unparseable date is shown as stored rather than swallowed, the same fallback
 * the stale chip has always used.
 */
function formatWeekDate(date: string, language: AppLanguage): string {
  if (!date) return '';
  const parsed = parseISO(date);
  if (!isValid(parsed)) return date;
  return parsed.toLocaleDateString(language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

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
  // The labels leave this hook already written, so the language has to be
  // read here rather than threaded in from the two routes (#1839). Outside a
  // provider `useLanguage()` answers English, which keeps every suite that
  // renders the reader bare on the English sentence.
  const { language, t } = useLanguage();

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
  // The deadline (#1838): which wait ran out, if any.
  const [expiredWait, setExpiredWait] = useState<string | null>(null);

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

  // What the caller is waiting on, before the deadline is applied.
  const waiting = !entryPointLoaded || (!!studyId && !meetingsLoaded);

  // The deadline (#1838) is per request — a different slug, permalink or Entry
  // point is a different question and starts a fresh one — and it only changes
  // what is shown: the subscriptions above stay mounted, so an answer that
  // arrives late still renders. The token names the wait that ran out, so a
  // later wait is never judged by an earlier one's clock, and a wait that has
  // not started yet has nothing to time out.
  const waitKey = `${requestKey}:${studyId ?? ''}`;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setExpiredWait(waitKey), STUDY_LOAD_DEADLINE_MS);
    return () => window.clearTimeout(timer);
  }, [waitKey, waiting]);

  const deadline = waiting && expiredWait === waitKey;

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
    // The whole sentence is the locale's, separator included: Spanish warns
    // that the week has passed rather than translating "Most recent", which
    // would read as "the week on screen is current" (#1839).
    return t('study.stale_week').replace('{date}', formatWeekDate(meeting.date, language));
  })();

  // The week's date on its own, for the current week's chip and for a
  // permalink's document title (#1814). The permalink suppression above is
  // about the chip, not about knowing the date.
  const weekDateLabel = meeting ? formatWeekDate(meeting.date, language) || null : null;

  // A failure belongs to the request that made it: navigating to another slug
  // or permalink starts clean, and a failure with no Study behind it (the
  // entry point itself never arrived) is still reported rather than looking
  // like an empty term.
  //
  // The deadline joins it (#1838): past it the page says it could not load —
  // never an empty term — but `deadline` is read together with `waiting`, so a
  // snapshot that lands afterwards clears the failure and renders the study.
  const loadError = failedFor === requestKey || deadline;

  return {
    // Past the deadline the caller must be able to choose the failure branch,
    // which every caller checks before its pulsing branch.
    loading: waiting && !deadline,
    entryPoint,
    study,
    resolution,
    meeting,
    staleDateLabel,
    weekDateLabel,
    loadError,
  };
}
