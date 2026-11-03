import { describe, it, expect } from 'vitest';
import { computePipelineMetrics } from '../components/pipeline/pipelineLogic';
import type { Stage, Contact } from '../types';
import type { PartnerPairing } from '../lib/partnersModel';

describe('computePipelineMetrics', () => {
  const stages: Stage[] = [
    { id: 's-gospel', label: 'Gospel / Met', color: 'slate', order: 0 },
    { id: 's-1st', label: '1st Appointment', color: 'teal', order: 1 },
    { id: 's-reg', label: 'Regular Appt', color: 'sage', order: 2 },
  ];

  const pairings: PartnerPairing[] = [
    { id: 'p1', members: ['u1', 'u2'], startDate: '2026-09-01' },
    { id: 'p2', members: ['u3', 'u4'], startDate: '2026-09-01' },
  ];

  const userNameMap = { u1: 'David', u2: 'Kevin', u3: 'Sarah', u4: 'Rachel' };

  it('flags needs-first-appt when pair has gospel contacts but zero first appointments', () => {
    const contacts: Partial<Contact>[] = [
      { id: 'c1', founders: ['u1', 'u2'], stage: 's-gospel' },
      { id: 'c2', founders: ['u1', 'u2'], stage: 's-gospel' },
    ];

    const metrics = computePipelineMetrics(pairings, stages, contacts as Contact[], userNameMap);
    const p1 = metrics.find((m) => m.pairingId === 'p1');
    expect(p1?.status).toBe('needs-first-appt');
    expect(p1?.statusLabel).toBe('Needs 1st Appt');
    expect(p1?.stageCounts['s-gospel']).toBe(2);
    expect(p1?.stageCounts['s-1st']).toBe(0);
  });

  it('flags needs-regular-appt when pair has gospel and first appts but zero regular appointments', () => {
    const contacts: Partial<Contact>[] = [
      { id: 'c1', founders: ['u3', 'u4'], stage: 's-gospel' },
      { id: 'c2', founders: ['u3', 'u4'], stage: 's-1st' },
    ];

    const metrics = computePipelineMetrics(pairings, stages, contacts as Contact[], userNameMap);
    const p2 = metrics.find((m) => m.pairingId === 'p2');
    expect(p2?.status).toBe('needs-regular-appt');
    expect(p2?.statusLabel).toBe('Needs Regular Appt');
  });

  it('flags flowing when pair has regular appointments established', () => {
    const contacts: Partial<Contact>[] = [
      { id: 'c1', founders: ['u3', 'u4'], stage: 's-gospel' },
      { id: 'c2', founders: ['u3', 'u4'], stage: 's-1st' },
      { id: 'c3', founders: ['u3', 'u4'], stage: 's-reg' },
    ];

    const metrics = computePipelineMetrics(pairings, stages, contacts as Contact[], userNameMap);
    const p2 = metrics.find((m) => m.pairingId === 'p2');
    expect(p2?.status).toBe('flowing');
    expect(p2?.statusLabel).toBe('Active Flow');
  });
});
