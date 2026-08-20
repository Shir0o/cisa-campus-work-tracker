import React from "react";
import { ArrowRight } from "lucide-react";
import { cn, getUserInitials } from "../../lib/utils";
import { Contact, Stage } from "../../types";
import { stageColor } from "./helpers";

// Round avatar — shows the contact's photo when available, else their initials.
// Landings that need an avatar for a non-contact (e.g. a Full-timer `user`) can
// pass a lightweight `{ name, avatar?, initials? }` cast to Contact.
export function Avatar({ contact, size = "md" }: { contact: Contact; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-11 h-11 text-sm";
  const initials = contact.initials || getUserInitials(contact.name);
  if (contact.avatar) {
    return (
      <img
        src={contact.avatar}
        alt={contact.name}
        className={cn(dim, "rounded-full object-cover shrink-0")}
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        "rounded-full bg-primary-container text-on-primary-container font-semibold flex items-center justify-center shrink-0",
      )}
    >
      {initials}
    </div>
  );
}

// ── Prayer status pills — three-way toggle shared by both prayer rows ──
export type PillTone = "ongoing" | "answered" | "archived";

export function statusPillClass(active: boolean, tone: PillTone) {
  if (!active)
    return "text-on-surface-variant border-outline-variant hover:text-on-surface hover:bg-surface-variant";
  switch (tone) {
    case "ongoing":
      return "text-accent bg-accent-soft border-accent-line";
    case "answered":
      return "text-on-tertiary-container bg-tertiary-container border-tertiary/40";
    case "archived":
      return "text-on-surface-variant bg-surface-variant border-outline-variant";
  }
}

export function StatusPills({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: { val: string; label: string; tone: PillTone }[];
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1 justify-end">
      {options.map((o) => (
        <button
          key={o.val}
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onChange(o.val);
          }}
          className={cn(
            "text-[11px] font-semibold border rounded-full px-2.5 py-[3px] transition-colors whitespace-nowrap",
            disabled
              ? value === o.val
                ? cn(statusPillClass(true, o.tone), "opacity-60 cursor-not-allowed")
                : "text-on-surface-variant/40 border-outline-variant/30 cursor-not-allowed bg-transparent"
              : statusPillClass(value === o.val, o.tone),
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Stage label chip — color resolved from the stage list.
export function StageChip({ stage, stages }: { stage?: string; stages: Stage[] }) {
  return stage ? (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
        stageColor(stages, stage),
      )}
    >
      {stage}
    </span>
  ) : null;
}

// Section heading: serif title, optional sub, optional inline action + "see all" link.
export function SectionHead({
  title,
  sub,
  linkLabel,
  onLink,
  action,
}: {
  title: string;
  sub?: React.ReactNode;
  linkLabel?: string;
  onLink?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-x-3 gap-y-1 mb-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
        <h2 className="font-serif text-2xl text-on-surface shrink-0">{title}</h2>
        {sub && <span className="text-sm text-on-surface-variant">{sub}</span>}
      </div>
      {(action || linkLabel) && (
        <div className="flex items-center gap-3 shrink-0 self-start sm:self-baseline">
          {action}
          {linkLabel && (
            <button
              type="button"
              onClick={onLink}
              className="text-sm font-medium text-accent hover:underline inline-flex items-center gap-1"
            >
              {linkLabel} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Quiet figure: a number + label, used in the footer "noticing people" strip.
export function Figure({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-serif text-2xl text-on-surface leading-none">{n}</span>
      <span className="text-xs text-on-surface-variant">{label}</span>
    </div>
  );
}
