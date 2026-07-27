import { describe, it, expect } from 'vitest';
import {
  HOSPITALITY_AVAILABILITY,
  hospitalityLabels,
  hospitalitySummary,
} from '../src/hospitality';
import type { HospitalityOffer } from '../src/types';

const offer = (overrides: Partial<HospitalityOffer> = {}): HospitalityOffer => ({
  uid: 'u1',
  name: 'Grace Okafor',
  availability: ['sunday'],
  seats: '3–4 students',
  note: '',
  updatedAt: '2026-07-15T09:00:00.000Z',
  ...overrides,
});

describe('HOSPITALITY_AVAILABILITY', () => {
  it('is the design\'s four options, in its order', () => {
    expect(HOSPITALITY_AVAILABILITY.map((a) => a.key)).toEqual([
      'weeknight',
      'sunday',
      'weekend',
      'anytime',
    ]);
    expect(HOSPITALITY_AVAILABILITY[3].label).toBe('Anytime — just ask');
  });
});

describe('hospitalityLabels', () => {
  it('returns the labels for the keys the offer selected', () => {
    expect(hospitalityLabels(offer({ availability: ['sunday'] }))).toEqual(['Sunday lunch']);
  });

  it('reads in the canonical order, not the order they were tapped', () => {
    expect(hospitalityLabels(offer({ availability: ['weekend', 'weeknight'] }))).toEqual([
      'A weeknight dinner',
      'A weekend afternoon',
    ]);
  });

  it('drops a key that is no longer offered', () => {
    expect(hospitalityLabels(offer({ availability: ['sunday', 'brunch'] }))).toEqual([
      'Sunday lunch',
    ]);
  });

  it('is empty for no offer at all', () => {
    expect(hospitalityLabels(null)).toEqual([]);
  });
});

describe('hospitalitySummary', () => {
  it('reads as a sentence, with the seats', () => {
    expect(hospitalitySummary(offer())).toBe('sunday lunch — room for about 3–4 students');
  });

  it('joins several times with commas', () => {
    expect(hospitalitySummary(offer({ availability: ['weeknight', 'sunday'], seats: '' }))).toBe(
      'a weeknight dinner, sunday lunch',
    );
  });

  it('leaves the seats clause off when they did not say', () => {
    expect(hospitalitySummary(offer({ seats: '' }))).toBe('sunday lunch');
  });

  it('says so plainly when there is no offer, or nothing left on it', () => {
    expect(hospitalitySummary(null)).toBe('No times given yet');
    expect(hospitalitySummary(offer({ availability: [] }))).toBe('No times given yet');
  });
});
