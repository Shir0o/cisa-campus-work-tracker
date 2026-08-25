import { describe, it, expect } from 'vitest';
import { inferGenderFromName, normalizeGender, genderTag } from '../lib/gender';

describe('inferGenderFromName', () => {
  it('infers M from male first names', () => {
    expect(inferGenderFromName('Michael Jordan')).toBe('M');
    expect(inferGenderFromName('John Smith')).toBe('M');
    expect(inferGenderFromName('David')).toBe('M');
  });

  it('infers F from female first names', () => {
    expect(inferGenderFromName('Alice Johnson')).toBe('F');
    expect(inferGenderFromName('Sarah')).toBe('F');
    expect(inferGenderFromName('Mary Jane Watson')).toBe('F');
  });

  it('is case-insensitive and ignores the rest of the name', () => {
    expect(inferGenderFromName('  aLiCe Jones ')).toBe('F');
    expect(inferGenderFromName('MICHAEL Jordan')).toBe('M');
  });

  it('returns null for unknown names or empty input', () => {
    expect(inferGenderFromName('')).toBeNull();
    expect(inferGenderFromName(null)).toBeNull();
    expect(inferGenderFromName(undefined)).toBeNull();
    expect(inferGenderFromName('   ')).toBeNull();
    expect(inferGenderFromName('Zxq Unknown')).toBeNull();
  });
});

describe('normalizeGender', () => {
  it('maps male/female synonyms to M/F', () => {
    expect(normalizeGender('Male')).toBe('M');
    expect(normalizeGender('m')).toBe('M');
    expect(normalizeGender('Female')).toBe('F');
    expect(normalizeGender('f')).toBe('F');
  });

  it('returns empty string for unset or unrecognized values', () => {
    expect(normalizeGender('')).toBe('');
    expect(normalizeGender(null)).toBe('');
    expect(normalizeGender('Other')).toBe('');
  });
});

describe('genderTag', () => {
  it('returns the M/F tag for a gender value', () => {
    expect(genderTag('M')).toBe('M');
    expect(genderTag('female')).toBe('F');
    expect(genderTag('')).toBe('');
  });
});
