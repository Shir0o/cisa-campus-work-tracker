import { describe, it, expect } from '@jest/globals';
import { resolveCaregiverName } from './caregiverName';

describe('resolveCaregiverName', () => {
  it('returns the owner’s name when the owner is in the roster', () => {
    expect(
      resolveCaregiverName('staff-1', 'Whoever created them', {
        'staff-1': 'Mei Tanaka',
      }),
    ).toBe('Mei Tanaka');
  });

  it('falls back to createdByName when the owner is not in the roster', () => {
    expect(
      resolveCaregiverName('staff-gone', 'Tony Wang', {
        'staff-1': 'Mei Tanaka',
      }),
    ).toBe('Tony Wang');
  });

  it('falls back to createdByName when there is no owner (legacy contact)', () => {
    expect(
      resolveCaregiverName(null, 'Tony Wang', { 'staff-1': 'Mei Tanaka' }),
    ).toBe('Tony Wang');
  });

  it('returns null when both owner and createdByName are missing', () => {
    expect(resolveCaregiverName(null, null, {})).toBeNull();
    expect(resolveCaregiverName(undefined, undefined, {})).toBeNull();
    expect(resolveCaregiverName(null, '', { 'staff-1': 'Mei' })).toBeNull();
  });

  it('prefers the owner over the creator when both resolve', () => {
    expect(
      resolveCaregiverName('staff-2', 'Tony Wang', {
        'staff-1': 'Mei',
        'staff-2': 'Rio',
      }),
    ).toBe('Rio');
  });

  it('does not treat an empty roster as “not found”', () => {
    // A row with no roster loaded should still fall back to createdByName
    // rather than render an empty name.
    expect(
      resolveCaregiverName('staff-1', 'Tony Wang', {}),
    ).toBe('Tony Wang');
  });
});