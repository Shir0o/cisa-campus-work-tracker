import { describe, it, expect } from 'vitest';
import {
  emptyComposer,
  formatDateTime,
  interactionEditValue,
  joinPrayerBurden,
  splitPrayerBurden,
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

describe('prayer burden shape (#1674)', () => {
  it('splits a burden into its request and the context after the first blank line', () => {
    expect(splitPrayerBurden('For her interview\n\nShe is nervous.\n\nAnd tired.')).toEqual({
      text: 'For her interview',
      context: 'She is nervous.\n\nAnd tired.',
    });
  });

  it('reads a burden with no blank line as all request', () => {
    expect(splitPrayerBurden('For her interview')).toEqual({ text: 'For her interview', context: '' });
    expect(splitPrayerBurden(undefined)).toEqual({ text: '', context: '' });
  });

  it('joins request and context the way the composer writes them, dropping an empty context', () => {
    expect(joinPrayerBurden('  For her interview ', ' She is nervous. ')).toBe('For her interview\n\nShe is nervous.');
    expect(joinPrayerBurden('For her interview', '   ')).toBe('For her interview');
  });

  it('round-trips a burden through split and join', () => {
    const burden = 'For her interview\n\nShe is nervous.';
    const { text, context } = splitPrayerBurden(burden);
    expect(joinPrayerBurden(text, context)).toBe(burden);
  });
});

describe('interactionEditValue (#1673)', () => {
  it('seeds the composer from a logged interaction', () => {
    expect(
      interactionEditValue({ content: 'Coffee', dateTime: '2026-06-15T08:00', type: 'meeting' }),
    ).toEqual({
      mode: 'interaction',
      text: 'Coffee',
      context: '',
      type: 'meeting',
      dateTime: '2026-06-15T08:00',
      reachedById: '',
    });
  });

  it('reads an ISO timestamp as local wall-clock time for the picker', () => {
    const iso = '2026-08-08T10:00:00.000Z';
    expect(interactionEditValue({ content: 'x', dateTime: iso }).dateTime).toBe(
      formatDateTime(new Date(iso)),
    );
  });

  it('treats a missing or unknown type as Other, and keeps an unparseable time as it is', () => {
    const v = interactionEditValue({ content: 'x', dateTime: 'garbage', type: 'visit' });
    expect(v.type).toBe('interaction');
    expect(v.dateTime).toBe('garbage');
    expect(interactionEditValue({ content: 'x', dateTime: '' }).type).toBe('interaction');
  });
});
