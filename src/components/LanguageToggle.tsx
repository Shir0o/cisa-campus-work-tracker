import React from "react";
import { useLanguage } from "./LanguageProvider";
import { cn } from "../lib/utils";

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t('common.language_selector')}
      className={cn(
        "inline-flex items-center p-1 bg-surface-container rounded-xl border border-outline-variant/40",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (language !== "en") setLanguage("en");
        }}
        aria-pressed={language === "en"}
        // 44px hit area on the repo's phone rule (#1779). The negative margin
        // takes the extra height back out of the layout, and the pill lives on
        // the inner span, so the control still looks 24px tall in its 32px tray.
        className="grid min-h-11 min-w-11 -my-2.5 place-items-center px-1 transition-all cursor-pointer"
      >
        <span
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
            language === "en"
              ? "bg-surface text-on-surface shadow-xs"
              : "text-on-surface-variant hover:text-on-surface",
          )}
        >
          EN
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          if (language !== "es") setLanguage("es");
        }}
        aria-pressed={language === "es"}
        className="grid min-h-11 min-w-11 -my-2.5 place-items-center px-1 transition-all cursor-pointer"
      >
        <span
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
            language === "es"
              ? "bg-primary text-on-primary shadow-xs"
              : "text-on-surface-variant hover:text-on-surface",
          )}
        >
          ES
        </span>
      </button>
    </div>
  );
}
