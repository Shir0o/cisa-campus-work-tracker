import React from "react";
import { useLanguage } from "./LanguageProvider";
import { cn } from "../lib/utils";

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language selector"
      className={cn(
        "inline-flex items-center p-1 bg-surface-container rounded-xl border border-outline-variant/40",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
        className={cn(
          "px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
          language === "en"
            ? "bg-surface text-on-surface shadow-xs"
            : "text-on-surface-variant hover:text-on-surface",
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage("es")}
        aria-pressed={language === "es"}
        className={cn(
          "px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
          language === "es"
            ? "bg-primary text-on-primary shadow-xs"
            : "text-on-surface-variant hover:text-on-surface",
        )}
      >
        ES
      </button>
    </div>
  );
}
