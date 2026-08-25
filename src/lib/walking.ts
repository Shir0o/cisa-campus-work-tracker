// WHO STANDS WHERE (corrected per issue #549, 24 Aug 2026).
// There is no pairing: every full-timer stands over every trainee. So the only
// two questions the app ever asks are "is this person a full-timer" and "who are
// the trainees" — read them from the roster (the users collection roles), never
// from a trainee↔full-timer map. A word from a full-timer is from a person, so
// the UI names the writer; where no one person is meant it says "the team".
//
// Language rule: never the word "mentor". A full-timer writes as themselves.

// Live roster of who is a full-timer (admin) and who is a trainee (manager),
// fed by applyRoster from a users subscription. Module-level so the pure lib
// functions stay synchronously readable and trivially testable.
let FULL_TIMER_UIDS: ReadonlySet<string> = new Set();
let TRAINEE_UIDS: ReadonlySet<string> = new Set();

/** Replace the roster from a users collection read (role field). */
export function applyRoster(users: Array<{ uid: string; role?: string | null }>): void {
  const fts = new Set<string>();
  const ts = new Set<string>();
  for (const u of users) {
    if (!u.uid) continue;
    if (u.role === "admin") fts.add(u.uid);
    else if (u.role === "manager") ts.add(u.uid);
  }
  FULL_TIMER_UIDS = fts;
  TRAINEE_UIDS = ts;
}

/** True when this uid is a full-timer on the roster. */
export function isFullTimer(uid?: string | null): boolean {
  return !!uid && FULL_TIMER_UIDS.has(uid);
}

/** True when this uid is a trainee on the roster. */
export function isTrainee(uid?: string | null): boolean {
  return !!uid && TRAINEE_UIDS.has(uid);
}

/** Every full-timer's uid. */
export function fullTimerIds(): string[] {
  return [...FULL_TIMER_UIDS];
}

/** Every trainee's uid. */
export function traineeIds(): string[] {
  return [...TRAINEE_UIDS];
}

// ── Archived pairing (issue #549) ──────────────────────────────────────────
// Kept only to feed the archived Settings block; nothing in the app may gate or
// word itself on this pairing. Do not add readers.
const FT_TRAINEES: Record<string, string[]> = {};
const FT_OF: Record<string, string> = {};

export function applyWalkingPairs(pairs: Record<string, string[]>): void {
  for (const key of Object.keys(FT_TRAINEES)) delete FT_TRAINEES[key];
  for (const key of Object.keys(FT_OF)) delete FT_OF[key];
  for (const [ft, trainees] of Object.entries(pairs)) {
    FT_TRAINEES[ft] = [...trainees];
    for (const t of trainees) FT_OF[t] = ft;
  }
}

/** @deprecated archived pairing — a trainee has no single full-timer. */
export function fullTimerOf(uid?: string | null): string | null {
  return uid ? FT_OF[uid] ?? null : null;
}

/** @deprecated archived pairing — a full-timer has no personal trainees. */
export function traineesOf(uid?: string | null): string[] {
  return uid ? FT_TRAINEES[uid] ?? [] : [];
}

/**
 * Who a thread message should ping. Under the no-pairing model there is no
 * single "their full-timer": a full-timer's reply reaches the person who added
 * the contact (a trainee), while a trainee's message has no one recipient —
 * the whole team sees it in the oversight inbox. Returns null when there's no
 * sensible single recipient.
 */
export function walkingRecipient(
  from?: string | null,
  contactCreatedBy?: string | null,
): string | null {
  if (!from) return null;
  if (isFullTimer(from)) {
    return contactCreatedBy && isTrainee(contactCreatedBy) ? contactCreatedBy : null;
  }
  return null;
}
