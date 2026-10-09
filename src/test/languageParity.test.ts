// Reading-translation parity (ADR 0037): the web app (src/lib/translator.ts),
// the shared core copy (packages/core/src/translation.ts, which the mobile app
// imports) and the cron copy (firebase-functions/src/language.ts) must make the
// same as-is/translate decision and produce the same cache hash. The web app
// deliberately takes no @cisa/core dependency and the functions package can't
// import across its build root, so the three copies are the contract, pinned
// here on a shared corpus.
import { describe, it, expect } from 'vitest';
import {
  detectLanguage as webDetect,
  shouldShowAsIs as webShowAsIs,
  computeTranslationHash as webHash,
} from '../lib/translator';
// Direct relative imports into the other projects -- resolved for tests only.
import {
  detectLanguage as coreDetect,
  shouldShowAsIs as coreShowAsIs,
  computeTranslationHash as coreHash,
} from '../../packages/core/src/translation';
import {
  detectLanguage as cronDetect,
  shouldShowAsIs as cronShowAsIs,
} from '../../firebase-functions/src/language';
import { translationHash as cronHash } from '../../firebase-functions/src/translate';

const CORPUS = [
  'Oración por mi familia esta semana',
  'El estudio bíblico fue muy bueno esta mañana',
  '¡Hola! ¿Cómo estás?',
  'Por favor, ora por mí y por mi hermano',
  'muchas gracias a dios',
  'Dios es bueno',
  'Prayer for my family this week',
  'The bible study was really good this morning',
  'Please pray for me and my brother',
  'Meeting with students on campus',
  'Juan',
  'ok 👍',
  'Exam stress',
  'Welcome to Campus',
  'Health for brother',
  'El and the are common words in both',
  'Please pray for mi familia',
  'el',
  '',
  '   ',
];

describe('language judgment parity across web, core and cron', () => {
  it('agrees on the detected signal for every fixture', () => {
    for (const text of CORPUS) {
      const web = webDetect(text);
      expect(coreDetect(text), text).toBe(web);
      expect(cronDetect(text), text).toBe(web);
    }
  });

  it('agrees on the as-is/translate decision for both target languages', () => {
    for (const text of CORPUS) {
      for (const lang of ['en', 'es'] as const) {
        const web = webShowAsIs(text, lang);
        expect(coreShowAsIs(text, lang), `${text} (${lang})`).toBe(web);
        expect(cronShowAsIs(text, lang), `${text} (${lang})`).toBe(web);
      }
    }
  });
});

describe('translation hash parity across web, core and cron', () => {
  it('produces the same cache hash for the same (targetLang, text)', () => {
    for (const text of CORPUS) {
      for (const lang of ['en', 'es'] as const) {
        const web = webHash(lang, text);
        expect(coreHash(lang, text), `${lang}:${text}`).toBe(web);
        expect(cronHash(text, lang), `${lang}:${text}`).toBe(web);
      }
    }
  });
});
