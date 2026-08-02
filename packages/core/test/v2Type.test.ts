import { describe, it, expect } from 'vitest';
import { V2_DRAWN_BASE, v2FontScale, v2FontSize } from '../src/v2Type';

describe('v2FontScale', () => {
  it('is 13/13.5 on a normal phone — the design’s clamp resting at its top', () => {
    // 1.6vh of an 852pt iPhone is 13.6 → clamped to the 13px maximum.
    expect(v2FontScale(852)).toBeCloseTo(13 / V2_DRAWN_BASE, 5);
    expect(v2FontScale(915)).toBeCloseTo(13 / V2_DRAWN_BASE, 5);
  });

  it('eases down on a short screen, so tall screens scroll less', () => {
    // 1.6vh of a 667pt iPhone SE is 10.7 → clamped up to the 11px floor.
    expect(v2FontScale(667)).toBeCloseTo(11 / V2_DRAWN_BASE, 5);
    expect(v2FontScale(667)).toBeLessThan(v2FontScale(852));
  });

  it('tracks the viewport between the floor and the ceiling', () => {
    // 750 * 0.016 = 12 — inside the clamp, so neither bound applies.
    expect(v2FontScale(750)).toBeCloseTo(12 / V2_DRAWN_BASE, 5);
  });

  it('never returns a nonsense scale for a degenerate height', () => {
    expect(v2FontScale(0)).toBeCloseTo(11 / V2_DRAWN_BASE, 5);
    expect(v2FontScale(Number.NaN)).toBeCloseTo(13 / V2_DRAWN_BASE, 5);
  });
});

describe('v2FontSize', () => {
  it('scales a size drawn at the design’s base', () => {
    // The body size the app was drawn at comes back as the clamp's own value.
    expect(v2FontSize(V2_DRAWN_BASE, 852)).toBeCloseTo(13, 5);
    expect(v2FontSize(V2_DRAWN_BASE, 667)).toBeCloseTo(11, 5);
  });

  it('keeps proportions — a heading stays the same multiple of the body', () => {
    const tall = v2FontSize(28, 852) / v2FontSize(13.5, 852);
    const short = v2FontSize(28, 667) / v2FontSize(13.5, 667);
    expect(tall).toBeCloseTo(short, 5);
  });
});
