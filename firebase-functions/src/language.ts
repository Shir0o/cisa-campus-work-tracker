// Mirror of the shared language judgment in @cisa/core (packages/core/src/translation.ts).
// The functions package cannot import @cisa/core across the build root, so the
// cron keeps its own copy; the parity test in src/test/languageParity.test.ts
// keeps this in step with the web and core copies (ADR 0037).

export type LanguageSignal = "en" | "es" | "mixed" | "none";

const SPANISH_MARKERS = new Set([
  "el", "la", "los", "las", "de", "que", "y", "en", "es", "un", "una",
  "por", "para", "con", "no", "se", "su", "lo", "al", "del",
  "más", "qué", "cómo", "está", "están", "pero", "como", "cuando", "donde", "también",
  "mi", "mí", "esta", "este", "ora", "oración", "orar", "favor",
  "dios", "iglesia", "estudio", "bíblico", "familia", "semana",
  "hermano", "hermana", "bueno", "buena", "gracias", "señor", "amor", "vida",
]);

const ENGLISH_MARKERS = new Set([
  "the", "and", "of", "to", "a", "in", "is", "that", "for", "it", "on", "with",
  "this", "we", "you", "are", "have", "has", "was", "were", "will", "would",
  "can", "could", "should", "please", "pray", "prayer", "thanks", "thank",
  "god", "church", "family", "week", "brother", "sister", "good", "morning",
  "study", "bible", "me", "and", "but", "so", "not",
]);

export function detectLanguage(text: string): LanguageSignal {
  const trimmed = text.trim();
  if (!trimmed) return "none";

  const words = trimmed.toLowerCase().match(/[a-zñáéíóúü]+/g) ?? [];
  let spanish = 0;
  let english = 0;
  for (const word of words) {
    if (SPANISH_MARKERS.has(word)) spanish++;
    if (ENGLISH_MARKERS.has(word)) english++;
  }

  const accentSignal = /[¿¡]|[áéíóúü]|ñ/.test(trimmed);

  const confidentSpanish =
    (spanish > english && spanish >= 2) || (accentSignal && spanish > 0);

  if (spanish === 0 && english === 0) {
    return accentSignal && words.length >= 2 ? "es" : "none";
  }
  if (confidentSpanish) return "es";
  if (spanish > 0 && english > 0) return "mixed";
  if (english > 0) return english >= 2 ? "en" : "none";
  return "none";
}

export function isAlreadySpanish(text: string): boolean {
  return detectLanguage(text) === "es";
}

export function shouldShowAsIs(text: string, targetLang: string): boolean {
  const signal = detectLanguage(text);
  if (targetLang === "en") return signal === "en" || signal === "none";
  if (targetLang === "es") return signal === "es";
  return false;
}
