// Public welcome-form (SignUp) — pure form options/validation shared by web
// and mobile, ported from src/views/SignUp.tsx. Values are kept byte-identical
// to that file's own constants (its comment notes Directory / Global Search
// filters depend on these strings matching). The Firestore write lives in
// ./data/signup.ts behind an injected db.

export const SIGNUP_MAJORS = [
  'Computer Science', 'Biology', 'Economics', 'Mech. Engineering', 'Psychology',
  'English Lit', 'Business', 'Architecture', 'Music', 'Math', 'Nursing',
  'Linguistics', 'Civil Eng.', 'Sociology',
];
export const SIGNUP_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other'];
export const SIGNUP_GENDERS = ['Male', 'Female', 'Other'];
export const SIGNUP_HOW_HEARD = ['Friend', 'Org Fair', 'Welcome BBQ', 'Dorm flyer', 'Instagram', 'Other'];
export const SIGNUP_INTERESTS = [
  'Home fellowship',
  'Bible study',
  'Gospel',
  'Prayer group',
  '1:1 mentorship',
];
export const SIGNUP_SPIRITUAL_BACKGROUNDS: { value: string; label: string }[] = [
  { value: 'Exploring', label: 'Exploring faith' },
  { value: 'Christian', label: 'Christian' },
  { value: 'Catholic', label: 'Catholic' },
  { value: 'Other', label: 'Other religion / background' },
  { value: 'None', label: 'Prefer not to say' },
];

export interface SignUpFormState {
  name: string;
  gender: string;
  year: string;
  major: string;
  phone: string;
  email: string;
  spiritualBackground: string;
  howHeard?: string;
  interests: string[];
  prayerRequest: string;
  notes: string;
}

export const emptySignUpForm: SignUpFormState = {
  name: '',
  gender: '',
  year: '',
  major: '',
  phone: '',
  email: '',
  spiritualBackground: '',
  interests: [],
  prayerRequest: '',
  notes: '',
};

/** Required-field checks: name, gender, year, major, email, phone (cell number) are mandatory. */
export function validateSignUpBasics(form: SignUpFormState): string | null {
  if (!form.name.trim()) return 'Please enter your full name.';
  if (!form.gender) return 'Please select your gender.';
  if (!form.year) return 'Please select your year.';
  if (!form.major) return 'Please select your major.';
  if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) return 'Please enter a valid email address.';
  if (!form.phone.trim()) return 'Please enter your phone number.';
  return null;
}

/** Required-field checks: interested in (interests) is mandatory. */
export function validateSignUpInterests(form: SignUpFormState): string | null {
  if (!form.interests || form.interests.length === 0) {
    return 'Please select at least one area you are interested in.';
  }
  return null;
}

/** Full-form validation check combining basics and interests. */
export function validateSignUp(form: SignUpFormState): string | null {
  return validateSignUpBasics(form) || validateSignUpInterests(form);
}

/** Anti-abuse math challenge check — retained for backward compatibility. */
export function checkMathAnswer(challenge: { a: number; b: number }, answer: string): boolean {
  return parseInt(answer, 10) === challenge.a + challenge.b;
}


