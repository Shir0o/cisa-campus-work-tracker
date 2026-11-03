import type { Stage, Contact } from '../../types';
import type { PartnerPairing } from '../../lib/partnersModel';
import type { PipelinePairMetrics } from './types';

export function computePipelineMetrics(
  pairings: PartnerPairing[],
  stages: Stage[],
  contacts: Contact[],
  userNameMap: Record<string, string>,
  followupThresholdDays: number = 7
): PipelinePairMetrics[] {
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const step0 = sortedStages[0];
  const step1 = sortedStages[1];
  const step2 = sortedStages[2];

  return pairings.map((pairing) => {
    const memberSet = new Set(pairing.members);
    const memberNames = pairing.members.map((uid) => userNameMap[uid] || 'Unknown');

    // Find contacts founded by this pairing
    const pairContacts = contacts.filter((c) => {
      const founders = c.founders || [];
      return pairing.members.some((m) => founders.includes(m));
    });

    const stageCounts: Record<string, number> = {};
    for (const s of stages) {
      stageCounts[s.id] = 0;
    }

    for (const c of pairContacts) {
      if (c.stage && stageCounts[c.stage] !== undefined) {
        stageCounts[c.stage] += 1;
      }
    }

    const countStep0 = step0 ? (stageCounts[step0.id] || 0) : 0;
    const countStep1 = step1 ? (stageCounts[step1.id] || 0) : 0;
    const countStep2 = step2 ? (stageCounts[step2.id] || 0) : 0;

    let status: PipelinePairMetrics['status'] = 'neutral';
    let statusLabel = '—';

    if (countStep0 > 0 && countStep1 === 0) {
      status = 'needs-first-appt';
      statusLabel = 'Needs 1st Appt';
    } else if ((countStep0 > 0 || countStep1 > 0) && countStep2 === 0) {
      status = 'needs-regular-appt';
      statusLabel = 'Needs Regular Appt';
    } else if (pairContacts.length > 0) {
      status = 'flowing';
      statusLabel = 'Active Flow';
    }

    return {
      pairingId: pairing.id,
      memberNames,
      totalFoundedContacts: pairContacts.length,
      stageCounts,
      status,
      statusLabel,
    };
  });
}
