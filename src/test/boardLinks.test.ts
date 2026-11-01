import { describe, it, expect } from 'vitest';
import { boardDocHref, boardDocRefFromHref, isStricterAudience } from '../lib/board';

// Page references (#1668): a coordination page points at another one by
// storing the Board's own deep link, so the reference survives export, renders
// on mobile, and lands on the target through the existing `?focusDoc=` jump.

describe('boardDocHref', () => {
  it('builds the Board deep link for a page', () => {
    expect(boardDocHref('doc-2026-10-19')).toBe('/coordination?focusDoc=doc-2026-10-19');
  });

  it('appends the section anchor when one is given', () => {
    expect(boardDocHref('doc-1', 'small-groups')).toBe('/coordination?focusDoc=doc-1&anchor=small-groups');
  });

  it('encodes ids so the query string stays parseable', () => {
    expect(boardDocHref('a b', 'c&d')).toBe('/coordination?focusDoc=a%20b&anchor=c%26d');
  });
});

describe('boardDocRefFromHref', () => {
  it('reads the page id back out of its own deep link', () => {
    expect(boardDocRefFromHref('/coordination?focusDoc=doc-1')).toEqual({ docId: 'doc-1' });
  });

  it('carries the anchor through', () => {
    expect(boardDocRefFromHref('/coordination?focusDoc=doc-1&anchor=agenda')).toEqual({
      docId: 'doc-1',
      anchorId: 'agenda',
    });
  });

  it('accepts an absolute form of the same link', () => {
    expect(boardDocRefFromHref('https://app.test/coordination?focusDoc=doc-9')).toEqual({ docId: 'doc-9' });
  });

  it('round-trips what boardDocHref writes', () => {
    const href = boardDocHref('doc 2', 'a b');
    expect(boardDocRefFromHref(href)).toEqual({ docId: 'doc 2', anchorId: 'a b' });
  });

  it('is null for anything that is not a page reference', () => {
    expect(boardDocRefFromHref('https://example.com')).toBeNull();
    expect(boardDocRefFromHref('/coordination')).toBeNull();
    expect(boardDocRefFromHref('/coordination?anchor=agenda')).toBeNull();
    expect(boardDocRefFromHref('/c/doc-1?key=sec_x')).toBeNull();
    expect(boardDocRefFromHref(null)).toBeNull();
    expect(boardDocRefFromHref(undefined)).toBeNull();
  });
});

describe('isStricterAudience', () => {
  it('flags a Team-only page referenced from an Open page', () => {
    expect(isStricterAudience('team', 'everyone')).toBe(true);
  });

  it('flags a Trainees page referenced from an Open page', () => {
    expect(isStricterAudience('trainees', 'everyone')).toBe(true);
  });

  it('stays quiet when the target is at least as open as the page', () => {
    expect(isStricterAudience('everyone', 'team')).toBe(false);
    expect(isStricterAudience('everyone', 'everyone')).toBe(false);
    expect(isStricterAudience('team', 'team')).toBe(false);
  });
});
