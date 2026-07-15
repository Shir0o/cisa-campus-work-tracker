import { describe, it, expect } from 'vitest';
import { checkMathAnswer, emptySignUpForm, validateSignUpBasics, type SignUpFormState } from '../src/signup';

const form = (overrides: Partial<SignUpFormState> = {}): SignUpFormState => ({
  ...emptySignUpForm,
  name: 'Naomi Park',
  email: 'naomi@umail.edu',
  phone: '555-0100',
  spiritualBackground: 'Exploring',
  ...overrides,
});

describe('validateSignUpBasics', () => {
  it('passes with all required fields present', () => {
    expect(validateSignUpBasics(form())).toBeNull();
  });

  it('requires a name', () => {
    expect(validateSignUpBasics(form({ name: '  ' }))).toBe('Please enter your full name.');
  });

  it('requires a valid email', () => {
    expect(validateSignUpBasics(form({ email: '' }))).toBe('Please enter a valid email address.');
    expect(validateSignUpBasics(form({ email: 'not-an-email' }))).toBe('Please enter a valid email address.');
  });

  it('requires a phone number', () => {
    expect(validateSignUpBasics(form({ phone: '  ' }))).toBe('Please enter your phone number.');
  });

  it('requires a spiritual background choice', () => {
    expect(validateSignUpBasics(form({ spiritualBackground: '' }))).toBe(
      'Please let us know where you are with faith.',
    );
  });
});

describe('checkMathAnswer', () => {
  it('accepts the correct sum', () => {
    expect(checkMathAnswer({ a: 3, b: 4 }, '7')).toBe(true);
  });

  it('rejects a wrong or empty answer', () => {
    expect(checkMathAnswer({ a: 3, b: 4 }, '8')).toBe(false);
    expect(checkMathAnswer({ a: 3, b: 4 }, '')).toBe(false);
  });
});
