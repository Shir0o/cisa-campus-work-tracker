import { useState, useEffect } from "react";
import { useLanguage } from "../components/LanguageProvider";
import {
  getCachedTranslation,
  setCachedTranslation,
  translateText,
  translateBatch,
  subscribeTranslation,
  computeTranslationHash,
} from "../lib/translator";
import { splitMarkdownByH1, joinMarkdownSections } from "../lib/markdown";
import type { AppLanguage } from "../lib/userPreferences";

export interface UseTranslateOptions {
  targetLang?: AppLanguage;
  enabled?: boolean;
}

export function useTranslate(
  text: string | null | undefined,
  options?: UseTranslateOptions,
) {
  const { language } = useLanguage();
  const targetLang = options?.targetLang ?? language;
  const enabled = options?.enabled ?? true;

  const rawText = text ?? "";
  const isEn = targetLang === "en" || !enabled || !rawText.trim();

  // Initial sync check against L1/L2 cache
  const cached = isEn ? rawText : getCachedTranslation(rawText, targetLang);
  const key = `${targetLang}:${rawText}`;
  const [prevKey, setPrevKey] = useState<string>(key);
  const [translatedText, setTranslatedText] = useState<string>(cached ?? rawText);
  const [isPending, setIsPending] = useState<boolean>(!isEn && cached === null);

  if (key !== prevKey) {
    setPrevKey(key);
    setTranslatedText(cached ?? rawText);
    setIsPending(!isEn && cached === null);
  }

  useEffect(() => {
    if (isEn) {
      setTranslatedText(rawText);
      setIsPending(false);
      return;
    }

    const currentCached = getCachedTranslation(rawText, targetLang);
    if (currentCached !== null) {
      setTranslatedText(currentCached);
      setIsPending(false);
      return;
    }

    setIsPending(true);
    let isMounted = true;

    const hash = computeTranslationHash(targetLang, rawText);
    const unsubscribe = subscribeTranslation(hash, (newTranslation) => {
      if (isMounted) {
        setTranslatedText(newTranslation);
        setIsPending(false);
      }
    });

    translateText(rawText, targetLang)
      .then((res) => {
        if (isMounted) {
          setTranslatedText(res);
          setIsPending(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setTranslatedText(rawText);
          setIsPending(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [rawText, targetLang, isEn]);

  return {
    translatedText,
    isPending,
    isCached: !isPending,
    originalText: rawText,
  };
}

// Markdown-aware variant for long board pages. The doc is split into "# "
// sections and each section is translated independently with its own cache
// hash, so an edit to one section only re-translates that section — unchanged
// sections reuse their cached translation (see translateMarkdown).
export function useTranslateMarkdown(
  text: string | null | undefined,
  options?: UseTranslateOptions,
) {
  const { language } = useLanguage();
  const targetLang = options?.targetLang ?? language;
  const enabled = options?.enabled ?? true;

  const rawText = text ?? "";
  const isEn = targetLang === "en" || !enabled || !rawText.trim();

  const getSections = (t: string) => (isEn ? [t] : splitMarkdownByH1(t));
  const getInitialSections = (t: string, lang: AppLanguage) => {
    if (isEn) return [t];
    const wholeCached = getCachedTranslation(t, lang);
    if (wholeCached !== null) return [wholeCached];
    const secs = getSections(t);
    return secs.map((s) => getCachedTranslation(s, lang) ?? s);
  };

  const key = `${targetLang}:${rawText}`;
  const [prevKey, setPrevKey] = useState<string>(key);
  const [translatedSections, setTranslatedSections] = useState<string[]>(() =>
    getInitialSections(rawText, targetLang),
  );
  const [isPending, setIsPending] = useState<boolean>(() => {
    if (isEn) return false;
    if (getCachedTranslation(rawText, targetLang) !== null) return false;
    return getSections(rawText).some((s) => getCachedTranslation(s, targetLang) === null);
  });

  if (key !== prevKey) {
    setPrevKey(key);
    setTranslatedSections(getInitialSections(rawText, targetLang));
    const pending =
      !isEn &&
      getCachedTranslation(rawText, targetLang) === null &&
      getSections(rawText).some((s) => getCachedTranslation(s, targetLang) === null);
    setIsPending(pending);
  }

  const join = (parts: string[]) => (isEn ? rawText : joinMarkdownSections(parts));

  useEffect(() => {
    if (isEn) {
      setTranslatedSections([rawText]);
      setIsPending(false);
      return;
    }

    const wholeCached = getCachedTranslation(rawText, targetLang);
    if (wholeCached !== null) {
      setTranslatedSections([wholeCached]);
      setIsPending(false);
      return;
    }

    let mounted = true;
    const secs = splitMarkdownByH1(rawText);

    const refresh = () => {
      if (!mounted) return;
      const whole = getCachedTranslation(rawText, targetLang);
      if (whole !== null) {
        setTranslatedSections([whole]);
        setIsPending(false);
        return;
      }
      setTranslatedSections(secs.map((s) => getCachedTranslation(s, targetLang) ?? s));
      setIsPending(secs.some((s) => getCachedTranslation(s, targetLang) === null));
    };

    const unsubscribes = secs
      .filter((s) => getCachedTranslation(s, targetLang) === null)
      .map((s) => subscribeTranslation(computeTranslationHash(targetLang, s), refresh));

    const uncached = secs.filter((s) => getCachedTranslation(s, targetLang) === null);
    if (uncached.length > 0) {
      translateBatch(uncached, targetLang)
        .then((results) => {
          if (!mounted) return;
          uncached.forEach((s, i) => setCachedTranslation(s, results[i], targetLang));
          refresh();
        })
        .catch(() => {
          if (!mounted) return;
          setTranslatedSections(secs.map((s) => getCachedTranslation(s, targetLang) ?? s));
          setIsPending(false);
        });
    }

    refresh();

    return () => {
      mounted = false;
      unsubscribes.forEach((u) => u());
    };
  }, [rawText, targetLang, isEn]);

  return {
    translatedText: join(translatedSections),
    isPending,
    isCached: !isPending,
    originalText: rawText,
  };
}
