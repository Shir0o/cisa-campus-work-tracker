import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  isAlreadySpanish,
  shouldShowAsIs,
  computeTranslationHash,
} from '../src/translation';

describe('detectLanguage', () => {
  it('marks clearly Spanish text as es', () => {
    expect(detectLanguage('Oración por mi familia esta semana')).toBe('es');
    expect(detectLanguage('El estudio bíblico fue muy bueno esta mañana')).toBe('es');
    expect(detectLanguage('¡Hola! ¿Cómo estás?')).toBe('es');
  });

  it('marks clearly English text as en', () => {
    expect(detectLanguage('Prayer for my family this week')).toBe('en');
    expect(detectLanguage('The bible study was really good this morning')).toBe('en');
  });

  it('reports no signal for names, emoji and short neutral phrases', () => {
    expect(detectLanguage('Juan')).toBe('none');
    expect(detectLanguage('ok 👍')).toBe('none');
    expect(detectLanguage('Exam stress')).toBe('none');
    expect(detectLanguage('')).toBe('none');
    expect(detectLanguage('   ')).toBe('none');
  });

  it('reports mixed when both languages are present', () => {
    expect(detectLanguage('El and the are common words in both')).toBe('mixed');
    expect(detectLanguage('Please pray for mi familia')).toBe('mixed');
  });

  it('isAlreadySpanish is exactly the es signal', () => {
    expect(isAlreadySpanish('Oración por mi familia')).toBe(true);
    expect(isAlreadySpanish('Prayer for my family')).toBe(false);
    expect(isAlreadySpanish('Juan')).toBe(false);
  });
});

describe('shouldShowAsIs', () => {
  it('shows confidently-English and no-signal text as-is to an English reader', () => {
    expect(shouldShowAsIs('Prayer for my family', 'en')).toBe(true);
    expect(shouldShowAsIs('Juan', 'en')).toBe(true);
    expect(shouldShowAsIs('ok 👍', 'en')).toBe(true);
  });

  it('translates Spanish and mixed text for an English reader', () => {
    expect(shouldShowAsIs('Oración por mi familia', 'en')).toBe(false);
    expect(shouldShowAsIs('Please pray for mi familia', 'en')).toBe(false);
  });

  it('shows confidently-Spanish text as-is to a Spanish reader', () => {
    expect(shouldShowAsIs('Oración por mi familia', 'es')).toBe(true);
  });

  it('translates English and no-signal text for a Spanish reader', () => {
    expect(shouldShowAsIs('Prayer for my family', 'es')).toBe(false);
    expect(shouldShowAsIs('Juan', 'es')).toBe(false);
  });
});

describe('computeTranslationHash', () => {
  it('is stable, trims, and namespaces by target language', () => {
    const a = computeTranslationHash('es', 'Hello world');
    expect(a).toBe(computeTranslationHash('es', '  Hello world  '));
    expect(a).not.toBe(computeTranslationHash('en', 'Hello world'));
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
