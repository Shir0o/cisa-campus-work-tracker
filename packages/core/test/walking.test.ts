import { describe, it, expect } from 'vitest';
import {
  applyRoster,
  applyWalkingPairs,
  isFullTimer,
  isTrainee,
  fullTimerIds,
  traineeIds,
  fullTimerOf,
  traineesOf,
  walkingRecipient,
} from '../src/walking';

const FT = 'b5YPihN2cGRESPRgiTd8sMlNGBz2';
const TRAINEE = 'JfcxyTTTFuNUYMLQTisyq2ppoy82';

describe('roster predicates (issue #549 — no pairing)', () => {
  it('isFullTimer / isTrainee / sets read the roster roles', () => {
    applyRoster([
      { uid: FT, role: 'admin' },
      { uid: TRAINEE, role: 'manager' },
      { uid: 'viewer1', role: 'viewer' },
    ]);
    expect(isFullTimer(FT)).toBe(true);
    expect(isFullTimer(TRAINEE)).toBe(false);
    expect(isTrainee(TRAINEE)).toBe(true);
    expect(isTrainee(FT)).toBe(false);
    expect(isFullTimer('viewer1')).toBe(false);
    expect(isTrainee('viewer1')).toBe(false);
    expect(fullTimerIds()).toEqual([FT]);
    expect(traineeIds()).toEqual([TRAINEE]);
  });

  it('treats unknown / nullish uids as neither', () => {
    applyRoster([{ uid: FT, role: 'admin' }]);
    expect(isFullTimer('nobody')).toBe(false);
    expect(isFullTimer(null)).toBe(false);
    expect(isTrainee('nobody')).toBe(false);
    expect(isTrainee(undefined)).toBe(false);
  });
});

describe('applyWalkingPairs (archived pairing)', () => {
  it('replaces the active walking map with admin-managed pairs', () => {
    applyWalkingPairs({ ft1: ['t1', 't2'], ft2: ['t3'] });
    expect(traineesOf('ft1')).toEqual(['t1', 't2']);
    expect(fullTimerOf('t1')).toBe('ft1');
    // isTrainee no longer reflects the archived pairing
    expect(isTrainee('t3')).toBe(false);
    applyWalkingPairs({});
  });
});

describe('walkingRecipient', () => {
  it('a full-timer replies reach the trainee who added the contact', () => {
    applyRoster([
      { uid: FT, role: 'admin' },
      { uid: TRAINEE, role: 'manager' },
    ]);
    expect(walkingRecipient(FT, TRAINEE)).toBe(TRAINEE);
    expect(walkingRecipient(FT, 'someone-else')).toBeNull();
  });

  it('a trainee has no single recipient under the no-pairing model', () => {
    applyRoster([
      { uid: FT, role: 'admin' },
      { uid: TRAINEE, role: 'manager' },
    ]);
    expect(walkingRecipient(TRAINEE)).toBeNull();
    expect(walkingRecipient(null)).toBeNull();
  });
});
