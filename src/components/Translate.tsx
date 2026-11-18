import React, { useState } from "react";
import { useTranslate } from "../hooks/useTranslate";
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

  const isTranslated = Boolean(content && content.trim() && translatedText !== originalText);

  const displayText = showingOriginal ? originalText : translatedText;

  return (
    <Component
      className={cn(
        isPending ? "transition-opacity duration-200 opacity-70 animate-pulse" : "",
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
          {showingOriginal ? "Show translation" : "Show original"}
        </button>
      )}
    </Component>
  );
}

export function OriginalToggle({
  showingOriginal,
  onToggle,
  className,
}: {
  showingOriginal: boolean;
  onToggle: () => void;
  className?: string;
}) {

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
      {showingOriginal ? "Show translation" : "Show original"}
    </button>
  );
}
