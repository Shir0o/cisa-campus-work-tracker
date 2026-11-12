import type { Stage, Contact } from '../../types';
import type { PartnerPairing } from '../../lib/partnersModel';
import { dayKey, pairingCovers } from '../../lib/partnersModel';
import { timestampMillis } from '../../lib/combineContactsPlan';
import type { PipelinePairMetrics } from './types';

const sameMemberSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/** The local calendar day a contact was logged, or null when it carries no date. */
export function contactFoundingDay(c: Pick<Contact, 'createdAt'>): string | null {
  const raw: unknown = c.createdAt;
  // A date-only string is already a day key; parsing it as a timestamp would
  // read it as UTC midnight and shift it a day west of Greenwich.
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ms = timestampMillis(raw);
  return ms > 0 ? dayKey(new Date(ms)) : null;
}

/** Whether this contact was founded by exactly this pair, while that pairing
 *  was together. The founding set is written once at creation (#1049), so a
 *  contact logged with a previous partner never moves to the new pair. */
function foundedBy(contact: Contact, pairing: PartnerPairing): boolean {
  const founders = contact.founders || [];
  if (founders.length > 0) {
    if (!sameMemberSet(founders, pairing.members)) return false;
  } else if (!contact.createdBy || !pairing.members.includes(contact.createdBy)) {
    // Legacy rows carry no founding set: fall back to the creator.
    return false;
  }
  const day = contactFoundingDay(contact);
  return day === null || pairingCovers(pairing, day);
}

export function computePipelineMetrics(
  pairings: PartnerPairing[],
  stages: Stage[],
  contacts: Contact[],
  userNameMap: Record<string, string>,
  today: string = dayKey(),
): PipelinePairMetrics[] {
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const lastIndex = sortedStages.length - 1;

  return pairings
    .filter((pairing) => pairingCovers(pairing, today))
    .map((pairing) => {
      const pairContacts = contacts.filter((contact) => foundedBy(contact, pairing));

      const stageCounts: Record<string, number> = {};
      for (const stage of sortedStages) stageCounts[stage.id] = 0;

      // Where the pair's furthest contact stands. The next step after it is the
      // one worth guiding them to, whatever the configured stages are called.
      let placed = 0;
      let furthestIndex = -1;
      for (const contact of pairContacts) {
        const index = sortedStages.findIndex(
          (stage) => stage.id === contact.stage || stage.label === contact.stage,
        );
        if (index < 0) continue;
        stageCounts[sortedStages[index].id] += 1;
        placed += 1;
        if (index > furthestIndex) furthestIndex = index;
      }

      let status: PipelinePairMetrics['status'] = 'neutral';
      let gapStageId: string | null = null;
      let gapStageLabel: string | null = null;
      if (pairContacts.length > 0) {
        if (furthestIndex < 0) {
          // Contacts exist but none stands on a step — never "Active Flow".
          status = 'unplaced';
        } else if (furthestIndex < lastIndex) {
          const gap = sortedStages[furthestIndex + 1];
          status = 'needs-step';
          gapStageId = gap.id;
          gapStageLabel = gap.label;
        } else {
          status = 'flowing';
        }
      }

      return {
        pairingId: pairing.id,
        memberIds: pairing.members,
        memberNames: pairing.members.map((uid) => userNameMap[uid] || 'Unknown'),
        totalFoundedContacts: pairContacts.length,
        unplacedContacts: pairContacts.length - placed,
        stageCounts,
        status,
        gapStageId,
        gapStageLabel,
      };
    });
}
