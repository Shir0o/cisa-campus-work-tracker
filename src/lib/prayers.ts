import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { PrayerRecord } from "../types";

// Start carrying something for a contact. Mirrors PrayerList.tsx's
// `handleAddBurden` write, minus the activity entry — callers that already log
// their own action (a visit, say) shouldn't produce two entries for one thing.
// Returns the new prayer's id so the caller can link back to it.
export async function addPrayerBurden(
  contactId: string,
  burden: string,
  by: { uid?: string | null; name?: string | null },
): Promise<string | null> {
  const text = burden.trim();
  if (!contactId || !text) return null;
  try {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, "prayers"), {
      contactId,
      date: now,
      burden: text,
      status: "pending",
      prayerPage: true,
      updatedAt: now,
      updatedBy: by.uid || null,
      updatedByName: by.name || null,
    });
    // Auto-unhide contact from "On our hearts" page (#565)
    unhidePrayerContact(contactId);
    return ref?.id ?? null;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "prayers");
    return null;
  }
}

// Update a shared prayer's status from My Day. Mirrors the bookkeeping stamp the
// Prayer page writes (PrayerList.tsx) so both surfaces stay consistent. The
// merged document keeps its required `contactId`, and the statuses used here are
// all in the Firestore rules' allowed set.
export async function updatePrayerStatus(
  prayerId: string,
  status: PrayerRecord["status"],
  by: { uid?: string | null; name?: string | null },
  answer?: string | null,
  answeredAt?: string | null,
): Promise<void> {
  try {
    const clean: Record<string, any> = {
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: by.uid || null,
      updatedByName: by.name || null,
    };
    if (answer !== undefined) clean.answer = answer;
    if (answeredAt !== undefined) clean.answeredAt = answeredAt;
    await updateDoc(doc(db, "prayers", prayerId), clean);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `prayers/${prayerId}`);
  }
}

/**
 * Whether a burden belongs on the team prayer page ("On our hearts"). Mirrors
 * `isTeamPrayer` in packages/core/src/prayerThread.ts — keep the two in step.
 *
 * An ABSENT flag means team: every prayer written before the phone's "Bring it
 * to team prayer" toggle existed stays exactly where it was, so this page needs
 * no backfill. That is why this is a function and not `p.teamPrayer` at the
 * call site.
 */
export function isTeamPrayer(p: Pick<PrayerRecord, "teamPrayer">): boolean {
  return p.teamPrayer !== false;
}

/**
 * Splits a display name ("First Last" / "First Middle Last") into first and
 * last parts. A single token is treated as both, so it sorts on itself.
 */
function nameParts(name: string): { first: string; last: string } {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/**
 * Resolves a contact's academic year/grade (e.g. Freshman, Sophomore) from
 * their `year` field or from tags.
 */
export function getContactGrade(contact: { year?: string; tags?: string[] }): string | undefined {
  if (contact.year?.trim()) return contact.year.trim();
  const found = contact.tags?.find((t) => {
    const s = t.trim();
    return (
      /^(freshman|sophomore|junior|senior|graduate|grad|1st\s*year|2nd\s*year|3rd\s*year|4th\s*year)$/i.test(s) ||
      s.toLowerCase().includes('year')
    );
  });
  return found?.trim();
}

/**
 * Checks if a contact matches Brother/Male filtering based on gender, pronouns, or tags.
 */
export function isContactBrother(contact: { gender?: string; pronouns?: string; tags?: string[] }): boolean {
  const g = (contact.gender || '').toLowerCase().trim();
  if (['male', 'm', 'brother', 'brothers', 'bro', 'man', 'men', 'boy'].includes(g)) return true;
  if (g.startsWith('male') || g.startsWith('brother') || g === 'm') return true;

  const pronouns = (contact.pronouns || '').toLowerCase();
  if (pronouns.includes('he/him') || pronouns.includes('he/his')) return true;

  if (contact.tags?.some((t) => {
    const tl = t.toLowerCase().trim();
    return tl === 'brother' || tl === 'brothers' || tl === 'male' || tl === 'bro';
  })) return true;

  return false;
}

/**
 * Checks if a contact matches Sister/Female filtering based on gender, pronouns, or tags.
 */
export function isContactSister(contact: { gender?: string; pronouns?: string; tags?: string[] }): boolean {
  const g = (contact.gender || '').toLowerCase().trim();
  if (['female', 'f', 'sister', 'sisters', 'sis', 'woman', 'women', 'girl'].includes(g)) return true;
  if (g.startsWith('female') || g.startsWith('sister') || g === 'f') return true;

  const pronouns = (contact.pronouns || '').toLowerCase();
  if (pronouns.includes('she/her') || pronouns.includes('she/hers')) return true;

  if (contact.tags?.some((t) => {
    const tl = t.toLowerCase().trim();
    return tl === 'sister' || tl === 'sisters' || tl === 'female' || tl === 'sis';
  })) return true;

  return false;
}

/**
 * Sorts prayer list entries alphabetically by last name, then first name
 * (case-insensitive) — so the "People we're holding" list reads like a roster.
 * The previous needs-attention/recent-first ordering is gone: this sort is
 * stable and unaffected by marking a prayer, so no display-order freeze is
 * needed.
 */
export function sortPrayerEntries<
  C extends { name: string },
  P
>(
  entries: { contact: C; prayers: P[] }[]
): { contact: C; prayers: P[] }[] {
  return [...entries].sort((a, b) => {
    const aParts = nameParts(a.contact.name);
    const bParts = nameParts(b.contact.name);
    const byLast = aParts.last.localeCompare(bParts.last, undefined, { sensitivity: "base" });
    if (byLast !== 0) return byLast;
    return aParts.first.localeCompare(bParts.first, undefined, { sensitivity: "base" });
  });
}

/**
 * Remove a contact from the `cisa.prayer.hidden` localStorage set so they
 * reappear on the "On our hearts" page. Safe to call from any surface — the
 * Prayer page will pick it up on next mount, and when the page is already
 * mounted the component also updates its own React state.
 */
export function unhidePrayerContact(contactId: string): void {
  try {
    const raw = localStorage.getItem('cisa.prayer.hidden');
    if (!raw) return;
    const ids: string[] = JSON.parse(raw);
    const filtered = ids.filter((id) => id !== contactId);
    if (filtered.length !== ids.length) {
      localStorage.setItem('cisa.prayer.hidden', JSON.stringify(filtered));
    }
  } catch (e) { /* corrupt storage — ignore */ }
}

/**
 * Default threshold in days after which a contact without logged interaction
 * is considered stale on the prayer list (#554).
 */
export const STALE_INTERACTION_DAYS = 30;

/**
 * Computes the number of days elapsed since a contact's last recorded interaction
 * (`lastContactedDate` or `lastSeen`). Returns `null` if no valid date exists.
 */
export function getDaysSinceLastInteraction(
  contact: { lastContactedDate?: string | null; lastSeen?: string | null },
  now: Date | number = Date.now(),
): number | null {
  const rawDate = contact.lastContactedDate || contact.lastSeen;
  if (!rawDate) return null;
  const ms = typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime();
  if (Number.isNaN(ms)) return null;
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const diff = nowMs - ms;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

/**
 * Determines whether a contact on the prayer list is stale (#554).
 * A contact is considered stale if:
 * 1. They have no recorded interaction date (days === null)
 * 2. Or their last recorded interaction occurred more than `thresholdDays` ago (> 30 days).
 */
export function isContactStale(
  contact: { lastContactedDate?: string | null; lastSeen?: string | null },
  thresholdDays: number = STALE_INTERACTION_DAYS,
  now: Date | number = Date.now(),
): boolean {
  const days = getDaysSinceLastInteraction(contact, now);
  if (days === null) return true;
  return days > thresholdDays;
}

