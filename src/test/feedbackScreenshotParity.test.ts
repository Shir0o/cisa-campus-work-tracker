// Mirror parity (see src/test/bibleStudyMirrorParity.test.ts for the pattern):
// the web app deliberately has no @cisa/core dependency, so the feedback
// screenshot contract exists twice — src/lib/feedbackKinds.ts for web and
// server.ts, packages/core/src/feedback.ts for mobile.
//
// The two must agree. If web downscales to a different ceiling than mobile,
// one platform silently writes screenshots the other's limit would reject —
// and the server, which imports the web copy, would accept documents the
// Firestore rules deny to a client-direct write.
import { describe, it, expect } from 'vitest';
import {
  MAX_SCREENSHOT_CHARS as WEB_MAX_CHARS,
  MAX_SCREENSHOT_DIMENSION as WEB_MAX_DIM,
  SCREENSHOT_QUALITY_LADDER as WEB_LADDER,
  isStorableScreenshot as isStorableWeb,
} from '../lib/feedbackKinds';
// Direct relative import into the workspace package — resolved for tests only.
import {
  MAX_SCREENSHOT_CHARS as CORE_MAX_CHARS,
  MAX_SCREENSHOT_DIMENSION as CORE_MAX_DIM,
  SCREENSHOT_QUALITY_LADDER as CORE_LADDER,
  isStorableScreenshot as isStorableCore,
} from '../../packages/core/src/feedback';

const JPEG = 'data:image/jpeg;base64,';

describe('feedback screenshot contract parity', () => {
  it('agrees on the size ceiling', () => {
    expect(WEB_MAX_CHARS).toBe(CORE_MAX_CHARS);
  });

  it('agrees on the downscale dimension', () => {
    expect(WEB_MAX_DIM).toBe(CORE_MAX_DIM);
  });

  it('agrees on the quality ladder', () => {
    expect([...WEB_LADDER]).toEqual([...CORE_LADDER]);
  });

  it('matches the firestore.rules ceiling', () => {
    // firestore.rules caps `screenshot` at 200000 characters. A mirror that
    // drifts above it writes documents a client-direct write could not.
    expect(CORE_MAX_CHARS).toBe(200000);
  });

  const CASES: Array<[string, unknown]> = [
    ['a jpeg data URL', `${JPEG}abc`],
    ['a png data URL', 'data:image/png;base64,abc'],
    ['an empty string', ''],
    ['a bare base64 string with no data URL prefix', 'abc'],
    ['an svg data URL', 'data:image/svg+xml;base64,abc'],
    ['a non-string', 12345],
    ['null', null],
    ['undefined', undefined],
    ['a capture one character over the ceiling', JPEG + 'x'.repeat(CORE_MAX_CHARS)],
    ['a capture exactly at the ceiling', JPEG + 'x'.repeat(CORE_MAX_CHARS - JPEG.length)],
  ];

  it.each(CASES)('classifies %s identically on both sides', (_label, value) => {
    expect(isStorableWeb(value)).toBe(isStorableCore(value));
  });

  it('accepts a capture at the ceiling and rejects one over it', () => {
    expect(isStorableCore(JPEG + 'x'.repeat(CORE_MAX_CHARS - JPEG.length))).toBe(true);
    expect(isStorableCore(JPEG + 'x'.repeat(CORE_MAX_CHARS))).toBe(false);
  });
});
