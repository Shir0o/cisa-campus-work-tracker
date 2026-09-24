import { describe, it, expect } from 'vitest';
import { planContactKindSeed, CHURCH_MTG_STAGE } from '../lib/contactKindSeed';

// The one-time seed (#1152, ADR 0030). The Church Mtg step is used ONCE, here,
// and never as a live derivation — a stage is a position people are moved
// through, so deriving the kind from it would make the category flicker.
describe('planContactKindSeed', () => {
  it('marks everyone at the Church Mtg step as being in the church life', () => {
    const rows = planContactKindSeed([{ id: 'a', stage: CHURCH_MTG_STAGE }]);
    expect(rows).toEqual([{ id: 'a', set: { inChurchLife: true } }]);
  });

  it('leaves people at other steps alone', () => {
    expect(planContactKindSeed([{ id: 'b', stage: 'First Contact' }])).toEqual([]);
  });

  it('does not mark a local saint at Church Mtg as a student', () => {
    const rows = planContactKindSeed([{ id: 'c', stage: CHURCH_MTG_STAGE }]);
    expect(rows[0].set.isStudent).toBeUndefined();
  });

  it('migrates a role naming a student, whatever the casing or wording', () => {
    const rows = planContactKindSeed([
      { id: 'd', stage: 'Regular', role: 'Student' },
      { id: 'e', stage: 'Regular', role: 'grad student' },
    ]);
    expect(rows).toEqual([
      { id: 'd', set: { isStudent: true } },
      { id: 'e', set: { isStudent: true } },
    ]);
  });

  it('does not migrate a role that names something else', () => {
    expect(planContactKindSeed([{ id: 'f', stage: 'Regular', role: 'Neighbour' }])).toEqual([]);
  });

  it('sets both when someone is a student at the Church Mtg step', () => {
    const rows = planContactKindSeed([{ id: 'g', stage: CHURCH_MTG_STAGE, role: 'Student' }]);
    expect(rows).toEqual([{ id: 'g', set: { inChurchLife: true, isStudent: true } }]);
  });

  it('never writes a stamp — the seed is not a human decision', () => {
    const rows = planContactKindSeed([{ id: 'h', stage: CHURCH_MTG_STAGE, role: 'Student' }]);
    expect(JSON.stringify(rows)).not.toContain('kindSet');
  });

  it('skips a person somebody has already sorted', () => {
    const rows = planContactKindSeed([
      { id: 'i', stage: CHURCH_MTG_STAGE, role: 'Student', kindSetBy: 'u1', kindSetAt: '2026-09-23' },
    ]);
    expect(rows).toEqual([]);
  });

  it('is idempotent — a second run over seeded data plans nothing', () => {
    const seeded = [{ id: 'j', stage: CHURCH_MTG_STAGE, role: 'Student', inChurchLife: true, isStudent: true }];
    expect(planContactKindSeed(seeded)).toEqual([]);
  });

  it('plans only the half that is missing', () => {
    const rows = planContactKindSeed([
      { id: 'k', stage: CHURCH_MTG_STAGE, role: 'Student', inChurchLife: true },
    ]);
    expect(rows).toEqual([{ id: 'k', set: { isStudent: true } }]);
  });
});
