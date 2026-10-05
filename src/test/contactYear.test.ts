import { describe, it, expect } from 'vitest';
import { YEARS, yearToForm, yearFromForm } from '../lib/contactYear';

// Edit a contact's Year (#1348): a select over the sign-up list, with free text
// after "Other". A stored value that isn't on the list edits as Other + text.
describe('contactYear', () => {
  it('offers the sign-up list', () => {
    expect(YEARS).toEqual(['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other']);
  });

  it('reads a listed year as itself', () => {
    expect(yearToForm('Junior')).toEqual({ year: 'Junior', yearOther: '' });
  });

  it('reads an empty or missing year as nothing chosen', () => {
    expect(yearToForm(undefined)).toEqual({ year: '', yearOther: '' });
    expect(yearToForm(null)).toEqual({ year: '', yearOther: '' });
    expect(yearToForm('   ')).toEqual({ year: '', yearOther: '' });
  });

  it('reads an off-list value as Other plus its text', () => {
    expect(yearToForm('Taking one class on Thursday F26')).toEqual({
      year: 'Other',
      yearOther: 'Taking one class on Thursday F26',
    });
    expect(yearToForm('.')).toEqual({ year: 'Other', yearOther: '.' });
  });

  it('reads the literal "Other" as Other plus that text', () => {
    expect(yearToForm('Other')).toEqual({ year: 'Other', yearOther: 'Other' });
  });

  it('saves a listed year as itself', () => {
    expect(yearFromForm({ year: 'Senior', yearOther: '' })).toBe('Senior');
  });

  it('saves Other as the typed text, trimmed, exactly as sign-up does', () => {
    expect(yearFromForm({ year: 'Other', yearOther: '  Gap year ' })).toBe('Gap year');
  });

  it('saves nothing chosen, or Other with no text, as empty', () => {
    expect(yearFromForm({ year: '', yearOther: '' })).toBe('');
    expect(yearFromForm({ year: 'Other', yearOther: '  ' })).toBe('');
  });

  it('round-trips an off-list value untouched', () => {
    for (const stored of ['Taking one class on Thursday F26', '.', 'Other', 'Junior']) {
      expect(yearFromForm(yearToForm(stored))).toBe(stored);
    }
  });
});
