// A contact's Year, as the sign-up form and Edit a contact both offer it
// (#1348): a select over this list, with free text after "Other". Mirrors
// SIGNUP_YEARS / signUpYearToForm in @cisa/core (the web app has no @cisa/core
// dependency); the stored value is the typed text, exactly as sign-up stores it.

export const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other'];

export interface YearFormState {
  year: string;
  yearOther: string;
}

/** What the form shows for a stored year. Anything not on the list — including
 * the literal "Other" — shows as Other plus the stored text, so nothing is
 * rewritten unless someone edits it. */
export function yearToForm(stored: string | null | undefined): YearFormState {
  const value = (stored ?? '').trim();
  if (!value) return { year: '', yearOther: '' };
  if (value !== 'Other' && YEARS.includes(value)) return { year: value, yearOther: '' };
  return { year: 'Other', yearOther: value };
}

/** The year that gets saved: "Other" resolves to the typed text, trimmed. */
export function yearFromForm({ year, yearOther }: YearFormState): string {
  return year === 'Other' ? yearOther.trim() : year;
}
