import { describe, it, expect } from 'vitest';
import {
  applyWalkingPairs,
  FT_OF,
  FT_TRAINEES,
  isTrainee,
  fullTimerOf,
  traineesOf,
  walkingRecipient,
} from '../src/walking';

const FT = 'b5YPihN2cGRESPRgiTd8sMlNGBz2';
const TRAINEE = 'JfcxyTTTFuNUYMLQTisyq2ppoy82';

describe('applyWalkingPairs', () => {
  it('replaces the active walking map with admin-managed pairs', () => {
    const original = Object.fromEntries(
      Object.entries(FT_TRAINEES).map(([ft, trainees]) => [ft, [...trainees]]),
    );
    applyWalkingPairs({ ft1: ['t1', 't2'], ft2: ['t3'] });
    expect(traineesOf('ft1')).toEqual(['t1', 't2']);
    expect(fullTimerOf('t1')).toBe('ft1');
    expect(isTrainee('t3')).toBe(true);
    applyWalkingPairs(original);
  });
});

describe('walking relationships', () => {
  it('derives the reverse trainee → full-timer lookup', () => {
    expect(FT_OF[TRAINEE]).toBe(FT);
  });

  it('classifies trainees and full-timers', () => {
    expect(isTrainee(TRAINEE)).toBe(true);
    expect(isTrainee(FT)).toBe(false);
    expect(isTrainee(null)).toBe(false);
    expect(fullTimerOf(TRAINEE)).toBe(FT);
    expect(fullTimerOf(FT)).toBeNull();
    expect(traineesOf(FT)).toEqual([TRAINEE]);
    expect(traineesOf('nobody')).toEqual([]);
  });

  it('routes thread notifications to the walking counterpart', () => {
    // trainee posts → notify their full-timer
    expect(walkingRecipient(TRAINEE)).toBe(FT);
    // full-timer posts on a contact the trainee added → notify the trainee
    expect(walkingRecipient(FT, TRAINEE)).toBe(TRAINEE);
    // full-timer posts on a contact added by someone they don't walk with → none
    expect(walkingRecipient(FT, 'someone-else')).toBeNull();
    expect(walkingRecipient(null)).toBeNull();
  });
});
