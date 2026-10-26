import type { Feedback } from '../types';

/**
 * What a collapsed Note card can say about its Follow-ups.
 *
 * The count lives on the Note (`replyCount`) because the page deliberately does
 * not subscribe to a thread until it is opened — up to 50 nested listeners on a
 * phone. A Note written before that field existed has no count, and this says
 * so: unknown is null, never 0.
 */
export interface FollowUpSummary {
  /** How many Follow-ups the Note holds, or null when that is not known. */
  count: number | null;
  /** A team Follow-up landed after the reader's last visit. */
  isNew: boolean;
}

/** localStorage prefix for when this device last opened Your notes, per uid. */
export const FOLLOW_UPS_SEEN_KEY = 'cisa_my_notes_last_visit';

/**
 * Read the count and the "new" state off a Note.
 *
 * `lastVisitMs` is when this reader last had the page open (`null` on a first
 * visit). A first visit has no baseline to be new against, so it claims
 * nothing — the card's ordinary "The team replied" still says there is an
 * answer.
 */
export function followUpSummary(
  note: Pick<Feedback, 'replyCount' | 'lastReplyAt' | 'lastReplyRole'>,
  lastVisitMs: number | null,
): FollowUpSummary {
  const rawCount = note.replyCount;
  const count =
    typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount >= 1
      ? Math.trunc(rawCount)
      : null;

  const lastReplyMs = typeof note.lastReplyAt === 'string' ? Date.parse(note.lastReplyAt) : Number.NaN;

  const isNew =
    count !== null &&
    note.lastReplyRole === 'team' &&
    lastVisitMs !== null &&
    Number.isFinite(lastReplyMs) &&
    lastReplyMs > lastVisitMs;

  return { count, isNew };
}
