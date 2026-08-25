// WHAT CHANGED SINCE YOU LAST OPENED THIS (#546).
//
// The in-app half of issue #546: a sheet that appears ONCE, on first launch
// after a version changes, and says what is different FOR YOU. The repo half —
// bumping the version on an EAS build and drafting the notes from git history —
// is an instruction in AGENTS.md plus `scripts/draft-release-notes.ts`.
//
// The notes are AUTHORED, never generated: "fix(queue): guard null persona"
// tells a full-timer nothing at 9am. So RELEASES is written by a person —
// three or four plain sentences about what is different for the person reading
// it. Three rules hold the whole thing together —
//   · it appears ONCE per version. The last-seen version is the only thing
//     stored, and there is no badge, no history to browse, no nav item.
//   · a release with nothing worth a person's morning (`lines: []`) shows no
//     sheet at all, and a release only reaches the roles it changed something
//     for (`roles`) — nobody is told about a screen they don't have.
//   · it never interrupts the on-campus window. The window is a per-surface
//     fact, so it is an argument: `releaseShow(role, inWindow, seenVersion)`
//     holds the sheet back until the window is shut.
//
// The web app deliberately has no @cisa/core dependency, so `src/lib/releases.ts`
// is a standalone mirror of this file (same convention as goal.ts / asks.ts).
import type { AppRole } from './permissions';

export interface Release {
  /** Compared, never used as a headline. */
  version: string;
  /** ISO date, e.g. "2026-08-25". */
  date: string;
  /** Roles this release has something to say to. Omit to reach everyone. */
  roles?: AppRole[];
  /** The sheet's three or four plain sentences. `[]` = show no sheet. */
  lines: string[];
}

export const RELEASE_LS_KEY = 'cisa.release.v1';

// Newest first. The version on a fresh machine is stamped to RELEASES[1]
// (the second-newest), so a clean slate reads the newest release once.
export const RELEASES: Release[] = [
  {
    version: '0.1.0',
    date: '2026-08-25',
    roles: ['admin', 'manager', 'operator', 'viewer'],
    lines: [
      'Ask the team: a question that isn\u2019t about a person now has a home, and the answer comes back to whoever asked.',
      'There is no \u201cyour full-timer\u201d any more \u2014 every full-timer stands over every trainee, and questions go to the whole team.',
      'Pray together walks the people on your heart one at a time, and the prayer list sorts by who has gone quiet.',
      'On an on-campus day, the strip above the queue fills quietly as people are added \u2014 one shared goal the whole team meets.',
    ],
  },
  // A quiet release: a fortnight of repairs that shows nobody anything. The
  // empty `lines` IS the decision — there is nothing to tell, so no sheet.
  { version: '0.0.1', date: '2026-08-12', lines: [] },
];

/** The newest release that has something to say to THIS role. */
export function releaseFor(role: AppRole | null | undefined): Release | null {
  return (
    RELEASES.find(
      (r) => r.lines.length > 0 && (!r.roles || r.roles.includes(role as AppRole)),
    ) ?? null
  );
}

/** The newest release with something to say, if it hasn't been seen yet. */
export function releaseUnseen(
  role: AppRole | null | undefined,
  seenVersion: string | null,
): Release | null {
  const r = releaseFor(role);
  return r && r.version !== seenVersion ? r : null;
}

/** THE ONE GATE: there is a release worth a person's morning, they haven't
 *  seen it, and we are not standing in the middle of the on-campus window. */
export function releaseShow(
  role: AppRole | null | undefined,
  inWindow: boolean,
  seenVersion: string | null,
): Release | null {
  return inWindow ? null : releaseUnseen(role, seenVersion);
}

/** "25 August" — a date-only string doesn't slip a day backwards west of UTC. */
export function releaseDateWords(iso: string): string {
  try {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00' : iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}