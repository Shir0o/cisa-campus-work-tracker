// Shared reading-translation primitives (ADR 0037): a single language judgment
// and hash scheme used by the web app, the mobile app, and the background cron.
// The web app mirrors this file (src/lib/translator.ts) and the cron mirrors it
// (firebase-functions/src/language.ts); a parity test keeps the three agreeing.

export type LanguageSignal = 'en' | 'es' | 'mixed' | 'none';

const SPANISH_MARKERS = new Set([
  'el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'es', 'un', 'una',
  'por', 'para', 'con', 'no', 'se', 'su', 'lo', 'al', 'del',
  'más', 'qué', 'cómo', 'está', 'están', 'pero', 'como', 'cuando', 'donde', 'también',
  'mi', 'mí', 'esta', 'este', 'ora', 'oración', 'orar', 'favor',
  'dios', 'iglesia', 'estudio', 'bíblico', 'familia', 'semana',
  'hermano', 'hermana', 'bueno', 'buena', 'gracias', 'señor', 'amor', 'vida',
]);

const ENGLISH_MARKERS = new Set([
  'the', 'and', 'of', 'to', 'a', 'in', 'is', 'that', 'for', 'it', 'on', 'with',
  'this', 'we', 'you', 'are', 'have', 'has', 'was', 'were', 'will', 'would',
  'can', 'could', 'should', 'please', 'pray', 'prayer', 'thanks', 'thank',
  'god', 'church', 'family', 'week', 'brother', 'sister', 'good', 'morning',
  'study', 'bible', 'me', 'and', 'but', 'so', 'not',
]);

/**
 * Judge whether text is confidently English, confidently Spanish, a mix of
 * both, or carries no language signal at all (names, emoji, short neutral
 * phrases). This is the one decision the reader surfaces and the cron share.
 */
export function detectLanguage(text: string): LanguageSignal {
  const trimmed = text.trim();
  if (!trimmed) return 'none';

  const words = trimmed.toLowerCase().match(/[a-zñáéíóúü]+/g) ?? [];
  let spanish = 0;
  let english = 0;
  for (const word of words) {
    if (SPANISH_MARKERS.has(word)) spanish++;
    if (ENGLISH_MARKERS.has(word)) english++;
  }

  // Spanish-only script features are a strong independent signal.
  const accentSignal = /[¿¡]|[áéíóúü]|ñ/.test(trimmed);

  // The es decision is exactly ADR 0027's isAlreadySpanish, so Spanish-mode
  // readers see identical behavior. A Spanish majority wins over a stray
  // English marker ("muchas gracias a dios" is still Spanish).
  const confidentSpanish =
    (spanish > english && spanish >= 2) || (accentSignal && spanish > 0);

  if (spanish === 0 && english === 0) {
    return accentSignal && words.length >= 2 ? 'es' : 'none';
  }
  if (confidentSpanish) return 'es';
  if (spanish > 0 && english > 0) return 'mixed';
  if (english > 0) return english >= 2 ? 'en' : 'none';
  // A lone weak Spanish marker ("el") is no confident signal.
  return 'none';
}

/** True when the text is confidently already Spanish (kept for ADR 0027 callers). */
export function isAlreadySpanish(text: string): boolean {
  return detectLanguage(text) === 'es';
}

/**
 * Whether a reader in `targetLang` should see the text exactly as written with
 * no Gemini call. English-mode readers also get no-signal text as-is, because
 * nearly all content is English and this is where most of the new cost sits;
 * Spanish-mode readers keep the old behavior and have no-signal text translated.
 */
export function shouldShowAsIs(text: string, targetLang: string): boolean {
  const signal = detectLanguage(text);
  if (targetLang === 'en') return signal === 'en' || signal === 'none';
  if (targetLang === 'es') return signal === 'es';
  return false;
}

// ── Pure SHA-256 (synchronous, 0 dependency, matches the server hash) ─────────
function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Encode string to UTF-8 bytes
  const utf8: number[] = [];
  for (let idx = 0; idx < ascii.length; idx++) {
    let charCode = ascii.charCodeAt(idx);
    if (charCode < 0x80) {
      utf8.push(charCode);
    } else if (charCode < 0x800) {
      utf8.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8.push(0xe0 | (charCode >> 12), 0x80 | ((charCode >> 6) & 0x3f), 0x80 | (charCode & 0x3f));
    } else {
      idx++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (ascii.charCodeAt(idx) & 0x3ff));
      utf8.push(
        0xf0 | (charCode >> 18),
        0x80 | ((charCode >> 12) & 0x3f),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f),
      );
    }
  }

  const utf8BitLength = utf8.length * 8;

  for (i = 0; i < utf8.length; i++) {
    words[i >> 2] |= utf8[i] << (24 - (i % 4) * 8);
  }
  words[utf8.length >> 2] |= 0x80 << (24 - (utf8.length % 4) * 8);
  words[(((utf8.length + 8) >> 6) << 4) + 15] = utf8BitLength;

  const w = new Array(64);
  for (i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, h] = hash;

    for (j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + gamma0 + w[j - 7] + gamma1) | 0;
      }

      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (i = 0; i < 8; i++) {
    result += (hash[i] >>> 0).toString(16).padStart(8, '0');
  }

  return result;
}

/** The cache key for a translation. Must agree with the server and the cron. */
export function computeTranslationHash(targetLang: string, text: string): string {
  const normalizedLang = (targetLang || 'es').trim().toLowerCase();
  const trimmedText = text.trim();
  return sha256Sync(`${normalizedLang}:${trimmedText}`);
}
