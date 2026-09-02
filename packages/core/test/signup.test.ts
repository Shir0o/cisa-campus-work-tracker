import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  emptySignUpForm,
  signUpYearValue,
  validateSignUpBasics,
  validateSignUpInterests,
  validateSignUp,
  SIGNUP_YEARS,
  SIGNUP_GENDERS,
  SIGNUP_INTERESTS,
  type SignUpFormState,
} from '../src/signup';
import { getAutoSemesterAndSchoolYearTags } from '../src/seasons';
import { submitSignUp } from '../src/data/signup';

const { mockAddDoc, mockCollection, mockGetDocs } = vi.hoisted(() => ({
  mockAddDoc: vi.fn().mockResolvedValue({ id: 'test-doc-id' }),
  mockCollection: vi.fn((_db, path) => ({ path })),
  mockGetDocs: vi.fn().mockResolvedValue({ empty: false, docs: [{ data: () => ({ label: 'Lead' }) }] }),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    addDoc: (...args: any[]) => mockAddDoc(...args),
    getDocs: (...args: any[]) => mockGetDocs(...args),
    collection: (...args: any[]) => mockCollection(...args),
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
  interests: ['Home fellowship'],
  ...overrides,
});

describe('SIGNUP_YEARS, SIGNUP_GENDERS, and SIGNUP_INTERESTS', () => {
  it('includes Other in year options', () => {
    expect(SIGNUP_YEARS).toContain('Other');
  });

  it('provides Male, Female, Other in gender options', () => {
    expect(SIGNUP_GENDERS).toEqual(['Male', 'Female', 'Other']);
  });

  it('includes Home fellowship and Bible study in interests options, and excludes removed options', () => {
    expect(SIGNUP_INTERESTS).toContain('Home fellowship');
    expect(SIGNUP_INTERESTS).toContain('Bible study');
    expect(SIGNUP_INTERESTS).toContain('Outreach/Gospel');
    expect(SIGNUP_INTERESTS).toContain('Group activities/outings');
    expect(SIGNUP_INTERESTS).not.toContain('Outreach');
    expect(SIGNUP_INTERESTS).not.toContain('Gospel');
    expect(SIGNUP_INTERESTS).not.toContain('Friday gathering');
    expect(SIGNUP_INTERESTS).not.toContain('Small group');
    expect(SIGNUP_INTERESTS).not.toContain('Worship team');
  });
});

describe('signUpYearValue', () => {
  it('resolves a normal year to itself', () => {
    expect(signUpYearValue(form({ year: 'Freshman' }))).toBe('Freshman');
  });

  it('resolves the "Other" year to the typed text', () => {
    expect(signUpYearValue(form({ year: 'Other', yearOther: 'Gap year' }))).toBe('Gap year');
    expect(signUpYearValue(form({ year: 'Other', yearOther: '  Post-grad  ' }))).toBe('Post-grad');
  });

  it('falls back to an empty string when "Other" has no text', () => {
    expect(signUpYearValue(form({ year: 'Other' }))).toBe('');
    expect(signUpYearValue(form({ year: 'Other', yearOther: '   ' }))).toBe('');
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

  it('requires the "Other" year to be filled in', () => {
    expect(validateSignUpBasics(form({ year: 'Other', yearOther: '' }))).toBe('Please tell us your year.');
    expect(validateSignUpBasics(form({ year: 'Other', yearOther: '  ' }))).toBe('Please tell us your year.');
    expect(validateSignUpBasics(form({ year: 'Other', yearOther: 'Gap year' }))).toBeNull();
  });

  it('requires a major', () => {
    expect(validateSignUpBasics(form({ major: '' }))).toBe('Please enter your major.');
    expect(validateSignUpBasics(form({ major: '   ' }))).toBe('Please enter your major.');
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
    expect(validateSignUpInterests(form({ interests: ['Home fellowship'] }))).toBeNull();
  });

  it('fails when interests array is empty', () => {
    expect(validateSignUpInterests(form({ interests: [] }))).toBe('Please select at least one area you are interested in.');
  });
});

describe('validateSignUp', () => {
  it('passes when both basics and interests are valid', () => {
    expect(validateSignUp(form())).toBeNull();
  });

  it('fails with basics error if a basic field is missing', () => {
    expect(validateSignUp(form({ name: '' }))).toBe('Please enter your full name.');
  });

  it('fails with interests error if interests is empty', () => {
    expect(validateSignUp(form({ interests: [] }))).toBe('Please select at least one area you are interested in.');
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
  beforeEach(() => {
    mockAddDoc.mockClear();
    mockGetDocs.mockClear();
  });

  it('saves the resolved "Other" year text as the contact year', async () => {
    const mockDb: any = {};
    const testForm = form({ year: 'Other', yearOther: 'Gap year' });

    await submitSignUp(mockDb, testForm, []);

    const contactCall = mockAddDoc.mock.calls.find((c) => c[0].path === 'contacts');
    expect(contactCall).toBeDefined();
    expect(contactCall![1].year).toBe('Gap year');
  });

  it('writes contact record with logged actor and auto tags', async () => {
    const mockDb: any = {};
    const testForm = form();
    const seasonTags = ['Club Rush'];
    const byActor = { uid: 'user123', name: 'Full Timer John' };

    const docId = await submitSignUp(mockDb, testForm, seasonTags, byActor);
    expect(docId).toBe('test-doc-id');

    expect(mockAddDoc).toHaveBeenCalled();
    const contactCall = mockAddDoc.mock.calls.find((c) => c[0].path === 'contacts');
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

  it('does not write metVia on the public sign-up contact (#730)', async () => {
    // #730: the "How we met" surface is gone, so the public sign-up form no
    // longer auto-stamps `metVia: "Sign-up form"` on the new contact doc.
    const mockDb: any = {};
    const testForm = form();

    await submitSignUp(mockDb, testForm, []);

    const contactCall = mockAddDoc.mock.calls.find((c) => c[0].path === 'contacts');
    expect(contactCall).toBeDefined();
    const data = contactCall[1];
    expect(data.metVia).toBeUndefined();
  });

  it('writes the contact stage as "Unassigned" regardless of configured stages (#678)', async () => {
    // #678: sign-up contacts land in the "Unassigned" bucket so the Journey
    // board isn't cluttered with raw form leads. Even when the project has
    // a `stages` collection, sign-ups skip past the first configured stage.
    const mockDb: any = {};
    const testForm = form();

    await submitSignUp(mockDb, testForm, []);

    const contactCall = mockAddDoc.mock.calls.find((c) => c[0].path === 'contacts');
    expect(contactCall).toBeDefined();
    expect(contactCall![1].stage).toBe('Unassigned');
  });
  it('does not read the stages collection when assigning the contact stage (#678)', async () => {
    // #678: the stages collection no longer drives the default — sign-up is
    // "Unassigned" unconditionally. Asserting that `getDocs` is never called
    // guards against a future regression that re-introduces the old
    // "default to first stage" lookup.
    mockGetDocs.mockClear();
    const mockDb: any = {};
    const testForm = form();

    await submitSignUp(mockDb, testForm, []);

    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});


