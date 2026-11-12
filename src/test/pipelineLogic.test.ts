import { describe, it, expect } from 'vitest';
import { computePipelineMetrics } from '../components/pipeline/pipelineLogic';
import type { Stage, Contact } from '../types';
import type { PartnerPairing } from '../lib/partnersModel';

const stages: Stage[] = [
  { id: 's-first', label: 'First Contact', color: 'slate', order: 0 },
  { id: 's-second', label: 'Second Contact', color: 'teal', order: 1 },
  { id: 's-regular', label: 'Regular', color: 'sage', order: 2 },
];

const TODAY = '2026-10-15';

const pairing = (id: string, members: string[], startDate: string, endDate?: string): PartnerPairing => ({
  id,
  members,
  startDate,
  ...(endDate ? { endDate } : {}),
});

const contact = (over: Partial<Contact>): Contact =>
  ({
    id: 'c',
    name: 'Person',
    location: '',
    email: '',
    phone: '',
    stage: 'First Contact',
    lastSeen: '',
    initials: '',
    ...over,
  }) as Contact;

const userNameMap = { u1: 'David', u2: 'Kevin', u3: 'Sarah', u4: 'Rachel', u5: 'Mira' };

describe('computePipelineMetrics', () => {
  it('credits only contacts founded while this exact pair was together', () => {
    // u1 and u2 founded two people in September; u1 now pairs with u5.
    const pairings = [
      pairing('p-old', ['u1', 'u2'], '2026-08-01', '2026-09-30'),
      pairing('p-new', ['u1', 'u5'], '2026-10-01'),
    ];
    const contacts = [
      contact({ id: 'c1', founders: ['u1', 'u2'], createdAt: '2026-09-15T18:00:00.000Z' }),
      contact({ id: 'c2', founders: ['u1', 'u2'], createdAt: '2026-09-20T18:00:00.000Z' }),
      contact({ id: 'c3', founders: ['u1', 'u5'], createdAt: '2026-10-10T18:00:00.000Z' }),
    ];

    const metrics = computePipelineMetrics(pairings, stages, contacts, userNameMap, TODAY);

    expect(metrics.map((m) => m.pairingId)).toEqual(['p-new']);
    expect(metrics[0].totalFoundedContacts).toBe(1);
    expect(metrics[0].stageCounts['s-first']).toBe(1);
  });

  it('does not carry a re-formed pair forward with last term’s contacts', () => {
    // The same two people pair again in October; September’s contacts belong
    // to the closed stretch, not the new one.
    const pairings = [
      pairing('p-fall', ['u1', 'u2'], '2026-08-01', '2026-09-30'),
      pairing('p-winter', ['u1', 'u2'], '2026-10-01'),
    ];
    const contacts = [
      contact({ id: 'c-old', founders: ['u1', 'u2'], createdAt: '2026-09-15T18:00:00.000Z' }),
      contact({ id: 'c-new', founders: ['u1', 'u2'], createdAt: '2026-10-05T18:00:00.000Z' }),
    ];

    const metrics = computePipelineMetrics(pairings, stages, contacts, userNameMap, TODAY);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].pairingId).toBe('p-winter');
    expect(metrics[0].totalFoundedContacts).toBe(1);
  });

  it('falls back to the creator for a legacy row with no founding set', () => {
    const pairings = [pairing('p-new', ['u1', 'u5'], '2026-10-01')];
    const contacts = [
      contact({ id: 'c-old', createdBy: 'u1', createdAt: '2026-09-15T18:00:00.000Z' }),
      contact({ id: 'c-new', createdBy: 'u1', createdAt: '2026-10-05T18:00:00.000Z' }),
      contact({ id: 'c-other', createdBy: 'u3', createdAt: '2026-10-05T18:00:00.000Z' }),
    ];

    const metrics = computePipelineMetrics(pairings, stages, contacts, userNameMap, TODAY);

    expect(metrics[0].totalFoundedContacts).toBe(1);
  });

  it('never reports Active Flow for contacts nobody has placed on a step', () => {
    const pairings = [pairing('p1', ['u1', 'u2'], '2026-10-01')];
    const contacts = [
      contact({ id: 'c1', founders: ['u1', 'u2'], createdAt: '2026-10-05T18:00:00.000Z', stage: 'Unassigned' }),
      contact({ id: 'c2', founders: ['u1', 'u2'], createdAt: '2026-10-06T18:00:00.000Z', stage: '' }),
    ];

    const metrics = computePipelineMetrics(pairings, stages, contacts, userNameMap, TODAY);

    expect(metrics[0].status).toBe('unplaced');
    expect(metrics[0].totalFoundedContacts).toBe(2);
    expect(metrics[0].unplacedContacts).toBe(2);
    expect(metrics[0].gapStageId).toBeNull();
  });

  it('points at the step after the furthest step anyone reached', () => {
    const pairings = [pairing('p1', ['u1', 'u2'], '2026-10-01')];
    const contacts = [
      contact({ id: 'c1', founders: ['u1', 'u2'], createdAt: '2026-10-05T18:00:00.000Z', stage: 'First Contact' }),
      contact({ id: 'c2', founders: ['u1', 'u2'], createdAt: '2026-10-06T18:00:00.000Z', stage: 'Second Contact' }),
      contact({ id: 'c3', founders: ['u1', 'u2'], createdAt: '2026-10-07T18:00:00.000Z', stage: 'Unassigned' }),
    ];

    const metrics = computePipelineMetrics(pairings, stages, contacts, userNameMap, TODAY);

    expect(metrics[0].status).toBe('needs-step');
    expect(metrics[0].gapStageId).toBe('s-regular');
    expect(metrics[0].gapStageLabel).toBe('Regular');
    expect(metrics[0].unplacedContacts).toBe(1);
  });

  it('is flowing once anyone reaches the last step, even if others sit at the first', () => {
    const pairings = [pairing('p1', ['u1', 'u2'], '2026-10-01')];
    const contacts = [
      contact({ id: 'c1', founders: ['u1', 'u2'], createdAt: '2026-10-05T18:00:00.000Z', stage: 'First Contact' }),
      contact({ id: 'c2', founders: ['u1', 'u2'], createdAt: '2026-10-06T18:00:00.000Z', stage: 'Regular' }),
    ];

    const metrics = computePipelineMetrics(pairings, stages, contacts, userNameMap, TODAY);

    expect(metrics[0].status).toBe('flowing');
    expect(metrics[0].gapStageId).toBeNull();
  });

  it('is neutral when the pair has founded nobody', () => {
    const pairings = [pairing('p1', ['u1', 'u2'], '2026-10-01')];

    const metrics = computePipelineMetrics(pairings, stages, [], userNameMap, TODAY);

    expect(metrics[0].status).toBe('neutral');
    expect(metrics[0].totalFoundedContacts).toBe(0);
    expect(metrics[0].unplacedContacts).toBe(0);
  });

  it('does not treat an ended pairing as a current row', () => {
    const pairings = [pairing('p-old', ['u1', 'u2'], '2026-08-01', '2026-09-30')];

    const metrics = computePipelineMetrics(pairings, stages, [], userNameMap, TODAY);

    expect(metrics).toEqual([]);
  });

  it('matches a step stored as an id or as a label', () => {
    const pairings = [pairing('p1', ['u1', 'u2'], '2026-10-01')];
    const contacts = [
      contact({ id: 'c1', founders: ['u1', 'u2'], createdAt: '2026-10-05T18:00:00.000Z', stage: 's-second' }),
      contact({ id: 'c2', founders: ['u1', 'u2'], createdAt: '2026-10-06T18:00:00.000Z', stage: 'Second Contact' }),
    ];

    const metrics = computePipelineMetrics(pairings, stages, contacts, userNameMap, TODAY);

    expect(metrics[0].stageCounts['s-second']).toBe(2);
  });

  it('reads the furthest step from any number of stages, not the first three', () => {
    const fourStages: Stage[] = [
      ...stages,
      { id: 's-church', label: 'Church', color: 'plum', order: 3 },
    ];
    const pairings = [pairing('p1', ['u1', 'u2'], '2026-10-01')];
    const contacts = [
      contact({ id: 'c1', founders: ['u1', 'u2'], createdAt: '2026-10-05T18:00:00.000Z', stage: 'Second Contact' }),
    ];

    const metrics = computePipelineMetrics(pairings, fourStages, contacts, userNameMap, TODAY);

    expect(metrics[0].status).toBe('needs-step');
    expect(metrics[0].gapStageId).toBe('s-regular');
  });
});
