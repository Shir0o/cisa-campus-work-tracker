import React, { useState } from "react";
import { useTranslate } from "../hooks/useTranslate";
import { useLanguage } from "./LanguageProvider";
import { cn } from "../lib/utils";
import type { AppLanguage } from "../lib/userPreferences";

export interface TranslateProps extends React.HTMLAttributes<HTMLElement> {
  text?: string | null;
  children?: React.ReactNode;
  as?: React.ElementType;
  targetLang?: AppLanguage;
  enabled?: boolean;
  showOriginalToggle?: boolean;
}

export function Translate({
  text,
  children,
  as: Component = "span",
  targetLang,
  enabled = true,
  showOriginalToggle = false,
  className,
  ...rest
}: TranslateProps) {
  const content =
    text !== undefined
      ? text
      : typeof children === "string" || typeof children === "number"
        ? String(children)
        : null;

  const { translatedText, originalText, isPending } = useTranslate(content, { targetLang, enabled });
  const [showingOriginal, setShowingOriginal] = useState(false);
  const { language } = useLanguage();
  const effectiveLang = targetLang ?? language;

  const isTranslated =
    effectiveLang !== "en" &&
    Boolean(content && content.trim() && translatedText !== originalText);

  const displayText = showingOriginal ? originalText : translatedText;

  return (
    <Component
      className={cn(
        isPending && effectiveLang !== "en" ? "transition-opacity duration-200 opacity-70 animate-pulse" : "",
        className,
      )}
      {...rest}
    >
      {displayText}
      {showOriginalToggle && isTranslated && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowingOriginal((v) => !v);
          }}
          className="ml-2 inline-flex items-center text-[11px] font-medium text-primary hover:underline cursor-pointer select-none"
        >
          {showingOriginal
            ? effectiveLang === "es"
              ? "Ver traducción"
              : "Show translation"
            : effectiveLang === "es"
              ? "Ver original"
              : "Show original"}
        </button>
      )}
    </Component>
  );
}

export function OriginalToggle({
  showingOriginal,
  onToggle,
  targetLang,
  className,
}: {
  showingOriginal: boolean;
  onToggle: () => void;
  targetLang?: AppLanguage;
  className?: string;
}) {
  const { language } = useLanguage();
  const effectiveLang = targetLang ?? language;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "text-[11px] font-medium text-primary hover:underline cursor-pointer select-none",
        className,
      )}
    >
      {showingOriginal
        ? effectiveLang === "es"
          ? "Ver traducción"
          : "Show translation"
        : effectiveLang === "es"
          ? "Ver original"
          : "Show original"}
    </button>
  );
}
