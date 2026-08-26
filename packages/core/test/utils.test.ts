import { describe, it, expect } from 'vitest';
import {
  formatPhoneNumber,
  validatePhoneNumber,
  getUserInitials,
  relTime,
  ntfWhen,
} from '../src/utils';

describe('utils', () => {
  it('formats US phone numbers progressively', () => {
    expect(formatPhoneNumber('12')).toBe('12');
    expect(formatPhoneNumber('12345')).toBe('(123) 45');
    expect(formatPhoneNumber('1234567890')).toBe('(123) 456-7890');
  });

  it('validates a 10-digit phone number', () => {
    expect(validatePhoneNumber('123')).toBe(false);
    expect(validatePhoneNumber('(123) 456-7890')).toBe(true);
  });

  it('builds up-to-two-letter initials', () => {
    expect(getUserInitials('Tony Wang')).toBe('TW');
    expect(getUserInitials('Zion')).toBe('Z');
    expect(getUserInitials('')).toBe('??');
    expect(getUserInitials(null)).toBe('??');
  });

  it('produces warm relative times', () => {
    expect(relTime(new Date().toISOString())).toBe('just now');
    expect(relTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(relTime(new Date(Date.now() - 2 * 3_600_000).toISOString())).toBe('2h ago');
    expect(relTime(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe('3d ago');
  });

  it('handles invalid, empty, or missing inputs in relTime gracefully', () => {
    expect(relTime('')).toBe('');
    expect(relTime(null as any)).toBe('');
    expect(relTime(undefined as any)).toBe('');
    expect(relTime('invalid-date')).toBe('');
    expect(relTime('not a date string')).toBe('');
  });

  it('handles future items for notifications', () => {
    expect(ntfWhen(new Date(Date.now() + 25 * 3_600_000).toISOString())).toBe('tomorrow');
    expect(ntfWhen(new Date(Date.now() + 3 * 86_400_000).toISOString())).toBe('in 3 days');
    expect(ntfWhen(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5m ago');
  });

  it('handles invalid, empty, or missing inputs in ntfWhen gracefully', () => {
    expect(ntfWhen('')).toBe('');
    expect(ntfWhen(null as any)).toBe('');
    expect(ntfWhen(undefined as any)).toBe('');
    expect(ntfWhen('invalid-date')).toBe('');
  });
});
