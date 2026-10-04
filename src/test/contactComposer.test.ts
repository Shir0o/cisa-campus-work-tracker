import { describe, it, expect } from 'vitest';
import {
  emptyComposer,
  formatDateTime,
  timeChipFor,
  timePresets,
} from '../lib/contactComposer';

describe('contactComposer', () => {
  it('starts as an interaction, typed chat, dated now, attributed to me', () => {
    const now = new Date('2026-10-03T14:30:00');
    expect(emptyComposer(now)).toEqual({
      mode: 'interaction',
      text: '',
      context: '',
      type: 'chat',
      dateTime: '2026-10-03T14:30',
      reachedById: '',
    });
  });

  it('reads a recent moment as Now, today by its time, older by date (#1292)', () => {
    const now = new Date('2026-10-03T14:30:00');
    expect(timeChipFor(formatDateTime(new Date('2026-10-03T14:30:30')), now)).toEqual({ kind: 'now' });
    expect(timeChipFor(formatDateTime(new Date('2026-10-03T11:00:00')), now)).toMatchObject({
      kind: 'today',
    });
    expect(timeChipFor(formatDateTime(new Date('2026-10-02T20:15:00')), now)).toMatchObject({
      kind: 'yesterday',
    });
    expect(timeChipFor(formatDateTime(new Date('2026-09-28T09:00:00')), now)).toMatchObject({
      kind: 'older',
    });
  });

  it('offers now and back-dated presets, each earlier than the one before (#1292)', () => {
    const now = new Date('2026-10-03T14:30:00');
    const presets = timePresets(now);
    expect(presets.map((p) => p.key)).toEqual(['now', 'm15', 'h1', 'yesterday', 'd2']);

    const at = (key: (typeof presets)[number]['key']) =>
      new Date(presets.find((p) => p.key === key)!.at).getTime();
    expect(at('now')).toBe(now.getTime());
    expect(Math.abs(now.getTime() - at('m15') - 15 * 60_000)).toBeLessThan(1000);
    expect(Math.abs(now.getTime() - at('h1') - 60 * 60_000)).toBeLessThan(1000);
    expect(at('yesterday')).toBeLessThan(at('h1'));
    expect(at('d2')).toBeLessThan(at('yesterday'));
  });
});
