import { describe, expect, it } from 'vitest';
import {
  RELEASE_LS_KEY,
  RELEASES,
  releaseFor,
  releaseShow,
  releaseUnseen,
  releaseDateWords,
} from '../src/releases';
import type { AppRole } from '../src/permissions';

const ROLES: AppRole[] = ['admin', 'manager', 'operator', 'viewer'];

describe('RELEASES', () => {
  it('is newest first with a quiet second entry to stamp fresh machines', () => {
    expect(RELEASES.length).toBeGreaterThanOrEqual(2);
    const [newest, quiet] = RELEASES;
    expect(newest.lines.length).toBeGreaterThan(0);
    expect(quiet.lines).toEqual([]);
  });

  it('uses the shared storage key', () => {
    // The key is the one contract web/mobile mirrors must agree on — asserting
    // it here catches a drift that would otherwise silently split the sheets.
    expect(RELEASE_LS_KEY).toBe('cisa.release.v1');
  });
});

describe('releaseFor', () => {
  it('returns the newest release with lines when the role is not restricted', () => {
    const r = releaseFor('admin');
    expect(r).toBe(RELEASES[0]);
  });

  it('ignores quiet releases (empty lines)', () => {
    // RELEASES[1] is quiet; for a role it isn't restricted to, the newest
    // with lines is still RELEASES[0].
    expect(releaseFor('viewer')).toBe(RELEASES[0]);
  });
});

describe('releaseUnseen', () => {
  it('returns the release when the seen version differs', () => {
    expect(releaseUnseen('admin', '0.0.1')).toBe(RELEASES[0]);
  });

  it('returns null once the newest release has been seen', () => {
    expect(releaseUnseen('admin', RELEASES[0].version)).toBeNull();
  });

  it('returns null when the role has nothing to say', () => {
    // A hypothetical role with no release — the gate still answers null.
    expect(releaseUnseen(null, null)).toBeNull();
  });
});

describe('releaseShow', () => {
  it('holds the sheet back while the on-campus window is open', () => {
    expect(releaseShow('admin', true, '0.0.1')).toBeNull();
  });

  it('shows the sheet when not in the window and unseen', () => {
    expect(releaseShow('admin', false, '0.0.1')).toBe(RELEASES[0]);
  });

  it('never shows after the release is seen', () => {
    expect(releaseShow('admin', false, RELEASES[0].version)).toBeNull();
  });

  ROLES.forEach((role) => {
    it(`answers for ${role} without throwing`, () => {
      expect(releaseShow(role, false, '0.0.1')).toBe(RELEASES[0]);
    });
  });
});

describe('releaseDateWords', () => {
  it('formats a date-only ISO string as "25 August"', () => {
    expect(releaseDateWords('2026-08-25')).toMatch(/25/i);
    expect(releaseDateWords('2026-08-25')).toMatch(/august/i);
  });

  it('returns empty for a bad string instead of throwing', () => {
    expect(releaseDateWords('not-a-date')).toBe('');
  });
});