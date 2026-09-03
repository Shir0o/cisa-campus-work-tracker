import { describe, it, expect } from 'vitest';
import { inferGenderFromName, normalizeGender, genderTag, planGenderTagging } from '../lib/gender';

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

describe('planGenderTagging', () => {
  it('plans gender tagging for contact with explicit gender field missing M/F tag', () => {
    const contacts = [
      { id: '1', name: 'John Doe', gender: 'M', tags: ['Student'] },
    ];
    const plan = planGenderTagging(contacts);
    expect(plan).toEqual([
      {
        contactId: '1',
        name: 'John Doe',
        gender: 'M',
        from: ['Student'],
        to: ['Student', 'M'],
      },
    ]);
  });

  it('infers gender from first name when gender field is missing', () => {
    const contacts = [
      { id: '2', name: 'Alice Smith', tags: ['Freshman'] },
    ];
    const plan = planGenderTagging(contacts);
    expect(plan).toEqual([
      {
        contactId: '2',
        name: 'Alice Smith',
        gender: 'F',
        from: ['Freshman'],
        to: ['Freshman', 'F'],
      },
    ]);
  });

  it('skips contacts that already have matching M or F tag', () => {
    const contacts = [
      { id: '3', name: 'John Doe', gender: 'M', tags: ['Student', 'M'] },
      { id: '4', name: 'Alice Smith', tags: ['Freshman', 'F'] },
    ];
    const plan = planGenderTagging(contacts);
    expect(plan).toEqual([]);
  });

  it('skips contacts whose gender cannot be inferred and has no gender field', () => {
    const contacts = [
      { id: '5', name: 'UnknownPerson', tags: ['Student'] },
    ];
    const plan = planGenderTagging(contacts);
    expect(plan).toEqual([]);
  });

  it('replaces conflicting gender tag if explicit gender says otherwise', () => {
    const contacts = [
      { id: '6', name: 'Alice', gender: 'F', tags: ['M', 'Saved'] },
    ];
    const plan = planGenderTagging(contacts);
    expect(plan).toEqual([
      {
        contactId: '6',
        name: 'Alice',
        gender: 'F',
        from: ['M', 'Saved'],
        to: ['Saved', 'F'],
      },
    ]);
  });
});
