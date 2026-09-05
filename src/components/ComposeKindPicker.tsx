import { cn } from "../lib/utils";
import { useLanguage } from "./LanguageProvider";
import type { ThreadKind } from "../lib/threads";

// The three things a person can write on a contact (#813). "Ask a follow-up" is
// the existing `nudge` kind, which until now could only be posted from the
// outreach list and a component that was never mounted — and it is worded as an
// ask, not an assignment: no owner, no due date. Encouragements and plain notes
// are posted from elsewhere and are not offered here.
//
// It lives on its own so the Conversation tab and the worklist card's inline
// composer offer the same three words. Two pickers would drift.
export type ComposeKind = Extract<ThreadKind, "comment" | "question" | "nudge">;

export const COMPOSE_KINDS: Record<ComposeKind, { label: string; placeholder: string }> = {
  comment: { label: "thread.kind_comment", placeholder: "thread.placeholder_comment" },
  question: { label: "thread.kind_question", placeholder: "thread.placeholder_question" },
  nudge: { label: "thread.kind_follow_up", placeholder: "thread.placeholder_follow_up" },
};

export const COMPOSE_ORDER: ComposeKind[] = ["comment", "question", "nudge"];

export function ComposeKindPicker({
  value,
  onChange,
  className,
  dense = false,
}: {
  value: ComposeKind;
  onChange: (k: ComposeKind) => void;
  className?: string;
  /** Narrow columns: the three share the full width rather than scrolling
   *  sideways, so "Ask a follow-up" is never clipped mid-word. */
  dense?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div
      role="group"
      aria-label={t("thread.compose_kind_group")}
      className={cn(
        "mb-2 inline-flex max-w-full gap-0.5 p-0.5 rounded-full bg-surface-variant overflow-x-auto",
        dense && "w-full",
        className,
      )}
    >
      {COMPOSE_ORDER.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "py-1 rounded-full whitespace-nowrap shrink-0 transition-colors cursor-pointer",
            dense ? "flex-1 px-2 text-[11px]" : "px-3 text-[11.5px]",
            value === k
              ? "bg-surface text-on-surface font-semibold shadow-xs"
              : "text-on-surface-variant font-medium hover:text-on-surface",
          )}
        >
          {t(COMPOSE_KINDS[k].label)}
        </button>
      ))}
    </div>
  );
}
