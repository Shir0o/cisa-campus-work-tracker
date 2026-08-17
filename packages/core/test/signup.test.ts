import { describe, it, expect, vi } from 'vitest';
import {
  emptySignUpForm,
  validateSignUpBasics,
  validateSignUpInterests,
  SIGNUP_YEARS,
  SIGNUP_GENDERS,
  type SignUpFormState,
} from '../src/signup';
import { getAutoSemesterAndSchoolYearTags } from '../src/seasons';
import { submitSignUp } from '../src/data/signup';

const h = vi.hoisted(() => ({
  mockAddDoc: vi.fn(),
  mockCollection: vi.fn((_db: unknown, path: string) => ({ path })),
  mockGetDocs: vi.fn(),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    addDoc: (...args: any[]) => h.mockAddDoc(...args),
    getDocs: (...args: any[]) => h.mockGetDocs(...args),
    collection: (...args: any[]) => h.mockCollection(...args),
    query: vi.fn(),
    limit: vi.fn(),
    serverTimestamp: () => 'SERVER_TIMESTAMP',
  };
});

const form = (overrides: Partial<SignUpFormState> = {}): SignUpFormState => ({
  ...emptySignUpForm,
  name: 'Naomi Park',
  gender: 'Female',
  year: 'Freshman',
  major: 'Computer Science',
  email: 'naomi@umail.edu',
  phone: '555-0100',
  interests: ['Friday gathering'],
  ...overrides,
});

describe('SIGNUP_YEARS and SIGNUP_GENDERS', () => {
  it('includes Other in year options', () => {
    expect(SIGNUP_YEARS).toContain('Other');
  });

  it('provides Male, Female, Other in gender options', () => {
    expect(SIGNUP_GENDERS).toEqual(['Male', 'Female', 'Other']);
  });
});

describe('validateSignUpBasics', () => {
  it('passes with all mandatory basic fields present', () => {
    expect(validateSignUpBasics(form())).toBeNull();
  });

  it('requires a name', () => {
    expect(validateSignUpBasics(form({ name: '  ' }))).toBe('Please enter your full name.');
  });

  it('requires a gender selection', () => {
    expect(validateSignUpBasics(form({ gender: '' }))).toBe('Please select your gender.');
  });

  it('requires a year selection', () => {
    expect(validateSignUpBasics(form({ year: '' }))).toBe('Please select your year.');
  });

  it('requires a major selection', () => {
    expect(validateSignUpBasics(form({ major: '' }))).toBe('Please select your major.');
  });

  it('requires a valid email', () => {
    expect(validateSignUpBasics(form({ email: '' }))).toBe('Please enter a valid email address.');
    expect(validateSignUpBasics(form({ email: 'not-an-email' }))).toBe('Please enter a valid email address.');
  });

  it('requires a cell number (phone)', () => {
    expect(validateSignUpBasics(form({ phone: '  ' }))).toBe('Please enter your phone number.');
  });
});

describe('validateSignUpInterests', () => {
  it('passes when at least one interest is selected', () => {
    expect(validateSignUpInterests(form({ interests: ['Friday gathering'] }))).toBeNull();
  });

  it('fails when interests array is empty', () => {
    expect(validateSignUpInterests(form({ interests: [] }))).toBe('Please select at least one area you are interested in.');
  });
});

describe('getAutoSemesterAndSchoolYearTags', () => {
  it('generates semester and school year tags for fall 2026', () => {
    const fallDate = new Date('2026-10-15T10:00:00Z');
    expect(getAutoSemesterAndSchoolYearTags(fallDate)).toEqual(['Fall 2026', '2026-27']);
  });

  it('generates semester and school year tags for spring 2027', () => {
    const springDate = new Date('2027-03-20T10:00:00Z');
    expect(getAutoSemesterAndSchoolYearTags(springDate)).toEqual(['Spring 2027', '2026-27']);
  });
});

describe('submitSignUp with actor logging and auto tagging', () => {
  it('writes contact record with logged actor and auto tags', async () => {
    h.mockAddDoc.mockResolvedValue({ id: 'test-doc-id' });
    h.mockCollection.mockImplementation((_db: unknown, path: string) => ({ path }));
    h.mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => ({ label: 'Lead' }) }] });

    const mockDb: any = {};
    const testForm = form();
    const seasonTags = ['Club Rush'];
    const byActor = { uid: 'user123', name: 'Full Timer John' };

    const docId = await submitSignUp(mockDb, testForm, seasonTags, byActor);
    expect(docId).toBe('test-doc-id');

    expect(h.mockAddDoc).toHaveBeenCalled();
    const contactCall = h.mockAddDoc.mock.calls.find((c) => c[0].path === 'contacts');
    expect(contactCall).toBeDefined();
    const data = contactCall[1];

    expect(data.name).toBe('Naomi Park');
    expect(data.gender).toBe('Female');
    expect(data.createdBy).toBe('user123');
    expect(data.createdByName).toBe('Full Timer John');
    expect(data.lastContactedById).toBe('user123');
    expect(data.lastContactedBy).toBe('Full Timer John');
    expect(data.tags).toEqual(expect.arrayContaining(['New Sign Up', 'Club Rush', '2026-27']));
  });
});

