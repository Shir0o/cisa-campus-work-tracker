// Smoke test for the prayer-clear affordance (#706).
//
// The full integration (Clear button visible, schedulePrayerRemoval wiring,
// Undo snackbar) is exercised manually and via the prayerRemoval registry
// tests in prayerRemoval.test.ts. This test covers the boundary: the i18n
// keys we added render when the locale file is loaded.
import { describe, it, expect } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';

describe('prayer-clear i18n keys (#706)', () => {
  it('en.json declares clear_prayer, clear_prayer_undone, and activity.cleared_a_prayer_for', () => {
    expect(en.prayers.clear_prayer).toBe('Clear this prayer');
    expect(en.prayers.clear_prayer_undone).toBe('Prayer cleared');
    expect(en.activity.cleared_a_prayer_for).toBe('cleared a prayer for');
  });

  it('es.json declares the same keys', () => {
    expect(es.prayers.clear_prayer).toBe('Borrar esta oración');
    expect(es.prayers.clear_prayer_undone).toBe('Oración borrada');
    expect(es.activity.cleared_a_prayer_for).toBe('borró una oración para');
  });
});