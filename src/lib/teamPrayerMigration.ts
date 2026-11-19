/**
 * §21 one-off migration: lift the old per-prayer team flag onto the person.
 *
 * "On our hearts" used to be the union of every prayer whose own `teamPrayer`
 * flag was not false. Now it is every prayer of a contact whose `teamPrayer`
 * is true. This planner decides what to write so the page looks the same
 * afterwards: a contact goes on when any of their prayers was on it (an absent
 * per-prayer flag counts as the team's, exactly as `isTeamPrayer` reads it).
 *
 * It only ever writes `true`. A contact already on, a contact whose prayers
 * were all private, and a contact the team removed are all left alone — the
 * removal is the team's own decision, and a re-run must never take someone off.
 * `isOnTeamPrayer` is the one place that decision lives (shared with the page),
 * so the fallback on "On our hearts" and this plan cannot disagree.
 *
 * No team prayers means the contact is left alone. The script is dry-run by
 * default; nothing here writes.
 */
import { isOnTeamPrayer } from "./teamPrayer";

export interface MigrationContact {
  id: string;
  teamPrayer?: boolean;
  prayerListRemoved?: unknown;
}

export interface MigrationPrayer {
  contactId?: string | null;
  teamPrayer?: boolean;
}

export interface TeamPrayerWrite {
  id: string;
  teamPrayer: true;
}

export function planTeamPrayerMigration(
  contacts: MigrationContact[],
  prayers: MigrationPrayer[],
): TeamPrayerWrite[] {
  const byContact = new Map<string, MigrationPrayer[]>();
  for (const p of prayers) {
    if (!p.contactId) continue;
    const list = byContact.get(p.contactId);
    if (list) list.push(p);
    else byContact.set(p.contactId, [p]);
  }

  const plan: TeamPrayerWrite[] = [];
  for (const contact of contacts) {
    const theirs = byContact.get(contact.id) ?? [];
    // Already on: nothing to write (idempotent). Off, removed, or no team
    // prayers at all: also nothing to write.
    if (contact.teamPrayer === true) continue;
    if (!isOnTeamPrayer(contact, theirs)) continue;
    plan.push({ id: contact.id, teamPrayer: true });
  }
  return plan;
}
