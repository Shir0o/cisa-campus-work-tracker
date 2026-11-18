/**
 * A visit logged before Visits became an interaction type (cut-or-keep §5).
 *
 * The old Visits page wrote a `visits` doc (the record) and mirrored an
 * interaction onto each person's own card with the id `visit_<visitId>`,
 * `type: 'visit'` and content "Visited at …". The page is gone and the `visits`
 * doc is no longer read anywhere — those mirror interactions are all a person's
 * story has of it, so they must keep rendering. This is the stored shape of
 * both, kept as one source for the unit tests. Free of vitest and the Firebase
 * SDK, like fixtures/contacts.ts.
 */
import type { Interaction } from '../../types';

/** The `visits` doc as the old page stored it. Nothing reads it any more. */
export const LEGACY_VISIT = {
  id: 'v-legacy',
  date: '2026-09-12',
  contactIds: ['c-ama', 'c-bo'],
  contactNames: ['Ama Osei', 'Bo Chen'],
  went: ['u-mei'],
  wentNames: ['Mei Tanaka'],
  where: 'Whitman Hall',
  purpose: 'Check in after move-in',
  how: 'Sat on the floor and talked about her classes.',
  followUp: '',
  photos: [],
  createdAt: '2026-09-12T20:00:00.000Z',
} as const;

/** The interaction the old writer mirrored onto each visited person's card. The
 *  same doc went to every person; the subcollection path was the only link. */
export function legacyVisitMirror(): Interaction {
  return {
    id: `visit_${LEGACY_VISIT.id}`,
    userId: 'u-mei',
    userName: 'Mei Tanaka',
    userPhoto: '',
    content: `Visited at ${LEGACY_VISIT.where} — ${LEGACY_VISIT.how}`,
    dateTime: LEGACY_VISIT.date,
    type: 'visit',
    createdAt: LEGACY_VISIT.createdAt,
  };
}
