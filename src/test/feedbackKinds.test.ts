import { describe, it, expect } from 'vitest';
import {
  kindToType,
  typeToKind,
  kindMeta,
  FEEDBACK_KINDS,
  TONE_CLASSES,
  FEEDBACK_OUTCOMES,
  outcomeCopy,
  outcomeLabel,
} from '../lib/feedbackKinds';

describe('feedbackKinds', () => {
  describe('kindToType', () => {
    it('maps "off" to "bug"', () => {
      expect(kindToType('off')).toBe('bug');
    });

    it('maps other kinds to "enhancement"', () => {
      expect(kindToType('thought')).toBe('enhancement');
      expect(kindToType('idea')).toBe('enhancement');
      expect(kindToType('request')).toBe('enhancement');
    });
  });

  describe('typeToKind', () => {
    it('maps "bug" to "off"', () => {
      expect(typeToKind('bug')).toBe('off');
    });

    it('maps "enhancement" to "idea"', () => {
      expect(typeToKind('enhancement')).toBe('idea');
    });
  });

  describe('kindMeta', () => {
    it('returns correct metadata for each kind', () => {
      for (const kind of ['thought', 'idea', 'off', 'request'] as const) {
        const meta = kindMeta(kind);
        expect(meta.id).toBe(kind);
      }
    });

    it('falls back to "thought" for unknown kind', () => {
      const meta = kindMeta('unknown-kind' as any);
      expect(meta.id).toBe('thought');
    });
  });

  describe('FEEDBACK_KINDS & TONE_CLASSES invariants', () => {
    it('defines metadata for all kinds', () => {
      expect(FEEDBACK_KINDS.length).toBe(4);
    });

    it('defines tone classes for all feedback tones', () => {
      expect(TONE_CLASSES.accent).toBeDefined();
      expect(TONE_CLASSES.violet).toBeDefined();
      expect(TONE_CLASSES.amber).toBeDefined();
      expect(TONE_CLASSES.teal).toBeDefined();
    });
  });

  describe('FEEDBACK_OUTCOMES & outcomeCopy & outcomeLabel', () => {
    it('defines the three canonical canned outcomes', () => {
      expect(FEEDBACK_OUTCOMES).toEqual(['shipped', 'not-planned', 'already-there']);
    });

    it('returns the exact canned copy for each outcome', () => {
      expect(outcomeCopy('shipped')).toBe('This shipped! Thank you for helping shape the app.');
      expect(outcomeCopy('not-planned')).toBe("We looked into this and aren't planning to build it right now, but thank you for speaking up.");
      expect(outcomeCopy('already-there')).toBe("This is already in the app! Ask someone on the team and we'll show you where it lives.");
    });

    it('provides a human-readable label for each outcome', () => {
      expect(outcomeLabel('shipped')).toBe('Shipped');
      expect(outcomeLabel('not-planned')).toBe('Not planned');
      expect(outcomeLabel('already-there')).toBe('Already in the app');
    });
  });
});

