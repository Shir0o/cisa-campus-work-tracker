// Contact list reads under the tightened rules (#1024 phase 4).
//
// The rules read `visibleTo` per document. A reader who is scoped to their
// ties (a Trainee) must therefore carry `where('visibleTo', 'array-contains',
// <uid>)` on the query itself, or Firestore rejects the whole list result.
// Everyone who sees the whole roster reads unconstrained. This mirrors
// `seesAllPeople`, the same predicate the rules use, so the client never asks
// for less than it is allowed and never asks for more than the query allows.
import { where, type QueryConstraint } from 'firebase/firestore';
import { seesAllPeople, type AppRole } from './permissions';

export function contactVisibilityConstraints(
  role: AppRole | string | null,
  staffId: string | null | undefined,
): QueryConstraint[] {
  if (seesAllPeople(role) || !staffId) return [];
  return [where('visibleTo', 'array-contains', staffId)];
}
