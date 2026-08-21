// "Walking together" relationships — which full-timer walks alongside which
// trainee(s). A trainee meets students and logs the work; the full-timer walks
// with them: encouraging, asking/answering, nudging a follow-up. This drives the
// full-timer's inbox and the per-contact thread.
//
// Language rule: never the word "mentor". The full-timer is "the one walking
// with you" / "your full-timer".
//
// Keyed by Firebase uid. This is a small, hand-maintained config for the current
// (tiny) team; extend it with real full-timer → trainee uid pairs as the team
// grows. It can later move to a Firestore field on the user doc.

// Demo/seed pair (sac-campus-hub test users):
//   full-timer = cisa-ft@hub.com (admin), trainee = cisa-trainee@hub.com (manager).
// These defaults can be replaced at runtime by the team-wide settings/walking
// doc (admin-managed). `applyWalkingPairs` swaps the active map in place so all
// existing callers keep reading the same module-level constants.
export const FT_TRAINEES: Record<string, string[]> = {
  b5YPihN2cGRESPRgiTd8sMlNGBz2: ["JfcxyTTTFuNUYMLQTisyq2ppoy82"],
};

// Reverse lookup: trainee uid → the full-timer walking with them.
export const FT_OF: Record<string, string> = {};

function rebuildWalkingLookups(): void {
  for (const key of Object.keys(FT_OF)) delete FT_OF[key];
  for (const [ft, trainees] of Object.entries(FT_TRAINEES)) {
    for (const t of trainees) FT_OF[t] = ft;
  }
}

rebuildWalkingLookups();

/** Replace the active full-timer → trainees map (from settings/walking). */
export function applyWalkingPairs(pairs: Record<string, string[]>): void {
  for (const key of Object.keys(FT_TRAINEES)) delete FT_TRAINEES[key];
  for (const [ft, trainees] of Object.entries(pairs)) {
    FT_TRAINEES[ft] = [...trainees];
  }
  rebuildWalkingLookups();
}

/** True when this uid is a trainee someone is walking with. */
export function isTrainee(uid?: string | null): boolean {
  return !!uid && !!FT_OF[uid];
}

/** The full-timer walking with this trainee, or null. */
export function fullTimerOf(uid?: string | null): string | null {
  return uid ? FT_OF[uid] ?? null : null;
}

/** The trainees this full-timer walks with (empty if none). */
export function traineesOf(uid?: string | null): string[] {
  return uid ? FT_TRAINEES[uid] ?? [] : [];
}

/**
 * Who should be notified about a thread message on a contact: the other party in
 * the walk. A trainee's message → their full-timer; a full-timer's message → the
 * trainee who added the contact (only if that trainee is one they walk with).
 * Returns null when there's no walking counterpart to notify.
 */
export function walkingRecipient(
  from?: string | null,
  contactCreatedBy?: string | null,
): string | null {
  if (!from) return null;
  if (isTrainee(from)) return fullTimerOf(from);
  if (contactCreatedBy && traineesOf(from).includes(contactCreatedBy)) {
    return contactCreatedBy;
  }
  return null;
}
