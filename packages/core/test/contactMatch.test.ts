import { describe, it, expect } from 'vitest';
import { matchContact, matchTier, wordPrefixMatch } from '../src/contactMatch';

describe('wordPrefixMatch — word-boundary, not substring', () => {
  it('matches when a whole word starts with the needle', () => {
    expect(wordPrefixMatch('Ian', 'ian')).toBe(true);
    expect(wordPrefixMatch('Ian Smith', 'ian')).toBe(true);
    expect(wordPrefixMatch('Ian Smith', 'smith')).toBe(true);
    expect(wordPrefixMatch('christian@example.com', 'christ')).toBe(true);
  });

  it('does not match mid-word substrings', () => {
    expect(wordPrefixMatch('Christian', 'ian')).toBe(false);
    expect(wordPrefixMatch('christian@example.com', 'ian')).toBe(false);
    expect(wordPrefixMatch('Fall2026', '2026')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(wordPrefixMatch('IAN', 'ian')).toBe(true);
    expect(wordPrefixMatch('christian', 'CHRIST')).toBe(true);
  });

  it('treats empty/whitespace needles as a match (no filtering)', () => {
    expect(wordPrefixMatch('anything', '')).toBe(true);
    expect(wordPrefixMatch('anything', '   ')).toBe(true);
  });

  it('matches multi-word queries token-by-token against word prefixes', () => {
    expect(wordPrefixMatch('Met at the club fair', 'club fair')).toBe(true);
    expect(wordPrefixMatch('Met at the club fair', 'fair club')).toBe(true);
    expect(wordPrefixMatch('Met at the club fair', 'club fai')).toBe(true);
  });

  it('requires every query token to match somewhere', () => {
    expect(wordPrefixMatch('Met at the club fair', 'club soccer')).toBe(false);
  });
});

describe('matchContact — name-first tiering', () => {
  const c = (overrides: Partial<Parameters<typeof matchContact>[0]> = {}) => ({
    name: 'Alex',
    ...overrides,
  });

  it('returns null for an empty query', () => {
    expect(matchContact(c(), '', [])).toBeNull();
  });

  it('ranks a name match as "name" quality', () => {
    expect(matchContact(c({ name: 'Ian' }), 'ian', [])).toEqual({ quality: 'name', matchedExtras: [] });
  });

  it('does not rank a mid-word name substring as a match', () => {
    expect(matchContact(c({ name: 'Christian' }), 'ian', [])).toBeNull();
  });

  it('ranks field matches as "field" quality', () => {
    expect(matchContact(c({ name: 'X' }), 'christ', ['Christian'])).toEqual({ quality: 'field', matchedExtras: [] });
  });

  it('returns null when neither name nor any field matches', () => {
    expect(matchContact(c({ name: 'X' }), 'zzz', ['abc'])).toBeNull();
  });

  it('reports which extras matched, for a "matched by X" caption', () => {
    expect(matchContact(c({ name: 'X' }), 'julia', ['math'], ['Julia Chen'])).toEqual({
      quality: 'field',
      matchedExtras: ['Julia Chen'],
    });
  });

  it('name matches win even when an extra also matches', () => {
    expect(matchContact(c({ name: 'Julia' }), 'julia', [], ['Julia Chen'])).toEqual({
      quality: 'name',
      matchedExtras: [],
    });
  });
});

describe('matchTier — name-first sort key', () => {
  it('ranks name matches (0) above field matches (1) and no-match above both', () => {
    const name = matchContact({ name: 'Ian' }, 'ian', []);
    const field = matchContact({ name: 'X' }, 'christ', ['Christian']);
    expect(matchTier(name)).toBe(0);
    expect(matchTier(field)).toBe(1);
    expect(matchTier(null)).toBe(1);
  });
});