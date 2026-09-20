/**
 * Page URLs are published; record ids inside them are not -- issue #1143 (from #1120/#1121).
 *
 * Every feedback submission is auto-filed as an issue on a PUBLIC tracker, and
 * the body carries the page the reporter was on. For most routes that is just
 * a route name. For `/people/<contactId>` it is a durable, per-person handle:
 * 17 issues already carry one. The id is opaque and Firestore rules still gate
 * the record, so nothing is readable from it -- what it publishes is that a
 * given person exists in this ministry's system, and a stable way to refer to
 * them. ADR 0018 decision 7 already made this call for screenshots (kept on the
 * Firestore doc, never in the issue); this is the same call for the URL.
 *
 * The rule has to keep the diagnostic value: `/bible-study/mark-fall-2026-...`
 * is a readable slug that tells a maintainer which week broke, and stays. A
 * Firestore auto-id -- 20 characters of mixed-case alphanumerics -- goes. Every
 * id in the corpus has both cases; no route slug in it does.
 */
import { describe, it, expect } from 'vitest';
import { isOpaqueRecordId, redactRecordIds } from '../lib/feedbackUrl';

const ORIGIN = 'https://cisa-campus-work-tracker.pages.dev';

describe('isOpaqueRecordId', () => {
  // Every distinct id that reached the public tracker before the guard existed.
  it.each([
    'NduKn2BpBzrRql5Z9mHk',
    'vYofGOfkAYJjrt0MQsoe',
    'K42f75ZRlrwo55FJQgDc',
    'nuhSesIHeu3UiCiVS4NF',
    'GifbddKXsfgejQjJXg49',
    'EmjcTrASeiV11WaNhXCG',
    'SancnngbEviMUNihoggs',
    'WWFgqU0Cc7hIROZ9yvfT',
  ])('treats %s as a record id', (id) => {
    expect(isOpaqueRecordId(id)).toBe(true);
  });

  it.each([
    ['a route name', 'directory'],
    ['a hyphenated route', 'bible-study'],
    ['a readable week slug', 'mark-fall-2026-2026-09-09'],
    ['a short word', 'Mobile'],
    ['an empty segment', ''],
  ])('leaves %s alone', (_label, segment) => {
    expect(isOpaqueRecordId(segment)).toBe(false);
  });
});

describe('redactRecordIds', () => {
  it('replaces a contact id with a placeholder, keeping the route', () => {
    expect(redactRecordIds(`${ORIGIN}/people/EmjcTrASeiV11WaNhXCG`)).toBe(`${ORIGIN}/people/:id`);
  });

  it('keeps a URL that carries no id byte-for-byte', () => {
    expect(redactRecordIds(`${ORIGIN}/visits`)).toBe(`${ORIGIN}/visits`);
    expect(redactRecordIds(`${ORIGIN}/around?team=yp`)).toBe(`${ORIGIN}/around?team=yp`);
  });

  it('keeps a readable slug, which is the whole diagnostic value', () => {
    const url = `${ORIGIN}/bible-study/mark-fall-2026-2026-09-09`;
    expect(redactRecordIds(url)).toBe(url);
  });

  it('redacts an id hiding in a query value or hash', () => {
    expect(redactRecordIds(`${ORIGIN}/directory?contact=NduKn2BpBzrRql5Z9mHk`)).toBe(
      `${ORIGIN}/directory?contact=:id`,
    );
    expect(redactRecordIds(`${ORIGIN}/prayer#vYofGOfkAYJjrt0MQsoe`)).toBe(`${ORIGIN}/prayer#:id`);
  });

  it('redacts every id when a path carries more than one', () => {
    expect(redactRecordIds(`${ORIGIN}/people/EmjcTrASeiV11WaNhXCG/notes/K42f75ZRlrwo55FJQgDc`)).toBe(
      `${ORIGIN}/people/:id/notes/:id`,
    );
  });

  it('still redacts when the string is not a parseable URL', () => {
    expect(redactRecordIds('/people/EmjcTrASeiV11WaNhXCG')).toBe('/people/:id');
  });

  it('passes through what the caller may hand it when there is no page', () => {
    expect(redactRecordIds('')).toBe('');
    expect(redactRecordIds(undefined as unknown as string)).toBe(undefined);
  });
});
