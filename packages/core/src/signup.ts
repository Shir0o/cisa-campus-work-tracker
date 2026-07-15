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
export const SIGNUP_HALLS = [
  'Whitman Hall', 'Ridgewood House', 'Oak Commons', 'Eastfield Apts',
  'Briarcliff', 'Stratton Tower', 'off-campus',
];
export const SIGNUP_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
export const SIGNUP_HOW_HEARD = ['Friend', 'Org Fair', 'Welcome BBQ', 'Dorm flyer', 'Instagram', 'Other'];
export const SIGNUP_INTERESTS = ['Friday gathering', 'Small group', 'Worship team', 'Outreach', 'Prayer group', '1:1 mentorship'];
export const SIGNUP_SPIRITUAL_BACKGROUNDS: { value: string; label: string }[] = [
  { value: 'Exploring', label: 'Exploring faith' },
  { value: 'Christian', label: 'Christian' },
  { value: 'Catholic', label: 'Catholic' },
  { value: 'Other', label: 'Other religion / background' },
  { value: 'None', label: 'Prefer not to say' },
];

export interface SignUpFormState {
  name: string;
  pronouns: string;
  year: string;
  major: string;
  phone: string;
  email: string;
  instagram: string;
  hall: string;
  spiritualBackground: string;
  howHeard: string;
  interests: string[];
  prayerRequest: string;
  notes: string;
}

export const emptySignUpForm: SignUpFormState = {
  name: '',
  pronouns: '',
  year: '',
  major: '',
  phone: '',
  email: '',
  instagram: '',
  hall: '',
  spiritualBackground: '',
  howHeard: '',
  interests: [],
  prayerRequest: '',
  notes: '',
};

/** Step-1 required-field checks — ports SignUp.tsx's validateBasics(). */
export function validateSignUpBasics(form: SignUpFormState): string | null {
  if (!form.name.trim()) return 'Please enter your full name.';
  if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) return 'Please enter a valid email address.';
  if (!form.phone.trim()) return 'Please enter your phone number.';
  if (!form.spiritualBackground) return 'Please let us know where you are with faith.';
  return null;
}

/** Anti-abuse math challenge check — ports SignUp.tsx's inline comparison. */
export function checkMathAnswer(challenge: { a: number; b: number }, answer: string): boolean {
  return parseInt(answer, 10) === challenge.a + challenge.b;
}
