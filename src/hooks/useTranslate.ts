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
  const [translatedText, setTranslatedText] = useState<string>(cached ?? rawText);
  const [isPending, setIsPending] = useState<boolean>(!isEn && cached === null);

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

  const split = () => (isEn ? [rawText] : splitMarkdownByH1(rawText));
  const join = (parts: string[]) => (isEn ? rawText : joinMarkdownSections(parts));

  const initial = split().map((s) => getCachedTranslation(s, targetLang) ?? s);
  const [translatedSections, setTranslatedSections] = useState<string[]>(initial);
  const [isPending, setIsPending] = useState<boolean>(
    !isEn && split().some((s) => getCachedTranslation(s, targetLang) === null),
  );

  useEffect(() => {
    if (isEn) {
      setTranslatedSections([rawText]);
      setIsPending(false);
      return;
    }

    let mounted = true;
    const secs = splitMarkdownByH1(rawText);

    const refresh = () => {
      if (!mounted) return;
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
