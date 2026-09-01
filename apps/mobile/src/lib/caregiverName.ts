/**
 * Resolve the "Cared for by" name for a contact. Issue #685 binds the
 * contact detail page's "Cared for by" to the mutable `owner` field; the
 * name shown in the mobile aside follows the same rule.
 *
 * If the contact has an `owner`, look it up in the full-timer roster (uid →
 * name). If the owner isn't in the roster (a deleted user, an anon
 * sign-up with no real owner), fall back to the immutable `createdByName`
 * so the row never shows nothing. If both are missing, return `null` and
 * the caller renders nothing (not "?").
 */
export function resolveCaregiverName(
  ownerUid: string | null | undefined,
  createdByName: string | null | undefined,
  fullTimerNames: Record<string, string>,
): string | null {
  if (ownerUid && fullTimerNames[ownerUid]) {
    return fullTimerNames[ownerUid];
  }
  if (createdByName) {
    return createdByName;
  }
  return null;
}